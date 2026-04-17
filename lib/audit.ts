import type { AuditResult, CategoryScore, RevenueLeak, ScrapeResult } from "@/lib/types";
import { chatJson } from "@/lib/openai";

type Factor = {
  name: string;
  category: CategoryScore["category"];
  detector: (ctx: EvalCtx) => 0 | 0.5 | 1;
};

type EvalCtx = {
  text: string;
  title: string;
  meta: string;
  h1: string[];
  h2: string[];
  h3: string[];
  images: ScrapeResult["images"];
  links: number;
  words: number;
  url: string;
};

const CATEGORY_WEIGHTS: Record<CategoryScore["category"], number> = {
  Conversion: 30,
  Trust: 20,
  "First Impression": 15,
  UX: 10,
  "Offer Clarity": 10,
  Visuals: 5,
  Performance: 5,
  SEO: 3,
  Analytics: 1,
  Retention: 1
};

const PENALTIES = {
  noReviews: 15,
  weakHero: 10,
  noUrgency: 8,
  hiddenPricing: 12,
  poorMobile: 15,
  slowLoad: 7,
  weakCta: 10,
  noTrustStack: 9,
  noPolicy: 6,
  brokenFlow: 8
};

function hasAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text));
}

function makeContext(scraped: ScrapeResult): EvalCtx {
  const text = `${scraped.title} ${scraped.metaDescription} ${scraped.bodyText}`.toLowerCase();
  const linkMatches = scraped.bodyText.match(/https?:\/\//g);
  const words = scraped.bodyText.split(/\s+/).filter(Boolean).length;
  return {
    text,
    title: scraped.title.toLowerCase(),
    meta: scraped.metaDescription.toLowerCase(),
    h1: scraped.headings.h1.map((h) => h.toLowerCase()),
    h2: scraped.headings.h2.map((h) => h.toLowerCase()),
    h3: scraped.headings.h3.map((h) => h.toLowerCase()),
    images: scraped.images,
    links: linkMatches?.length || 0,
    words,
    url: scraped.url
  };
}

function scoreSignal(value: boolean, weak = false): 0 | 0.5 | 1 {
  if (value && weak) return 0.5;
  return value ? 1 : 0;
}

const FACTORS: Factor[] = [
  { name: "Primary CTA present", category: "Conversion", detector: (c) => scoreSignal(hasAny(c.text, [/\bbook now\b/, /\bcheck availability\b/, /\breserve\b/, /\bstart booking\b/])) },
  { name: "CTA above fold cues", category: "Conversion", detector: (c) => scoreSignal(c.h1.length > 0 && hasAny(`${c.title} ${c.h1[0] || ""}`, [/\bbook\b/, /\bvilla\b/, /\bstay\b/]), true) },
  { name: "Calendar language", category: "Conversion", detector: (c) => scoreSignal(hasAny(c.text, [/\bcalendar\b/, /\bavailability\b/, /\bdates\b/])) },
  { name: "Pricing visibility", category: "Conversion", detector: (c) => scoreSignal(hasAny(c.text, [/€\s?\d+/, /\bper night\b/, /\bnightly\b/, /\bprice\b/])) },
  { name: "Low-friction booking wording", category: "Conversion", detector: (c) => scoreSignal(!hasAny(c.text, [/\bsubmit\b/, /\blearn more\b/, /\bclick here\b/]), true) },
  { name: "Strong value proposition", category: "Conversion", detector: (c) => scoreSignal(c.h1.some((h) => h.length > 25 && h.length < 120), true) },

  { name: "Reviews/testimonials", category: "Trust", detector: (c) => scoreSignal(hasAny(c.text, [/\breviews?\b/, /\bguest reviews?\b/, /\btestimonial\b/])) },
  { name: "Review quantity cues", category: "Trust", detector: (c) => scoreSignal(hasAny(c.text, [/\b\d+\+?\s+reviews\b/, /\bgoogle reviews\b/, /\btripadvisor\b/]), true) },
  { name: "Contact details", category: "Trust", detector: (c) => scoreSignal(hasAny(c.text, [/\+?\d{6,}/, /@/, /\bwhatsapp\b/])) },
  { name: "Policy information", category: "Trust", detector: (c) => scoreSignal(hasAny(c.text, [/\bcancellation\b/, /\bterms\b/, /\bpolicy\b/, /\brefund\b/])) },
  { name: "Location confidence", category: "Trust", detector: (c) => scoreSignal(hasAny(c.text, [/\blocation\b/, /\bmap\b/, /\baddress\b/]), true) },
  { name: "Awards or press", category: "Trust", detector: (c) => scoreSignal(hasAny(c.text, [/\bfeatured in\b/, /\baward\b/, /\btrusted by\b/]), true) },

  { name: "Clear headline", category: "First Impression", detector: (c) => scoreSignal(c.h1.length > 0) },
  { name: "Meta description quality", category: "First Impression", detector: (c) => scoreSignal(c.meta.length > 60, c.meta.length > 20) },
  { name: "Brand + offer in title", category: "First Impression", detector: (c) => scoreSignal(c.title.length > 20, c.title.length > 10) },
  { name: "Luxury positioning cues", category: "First Impression", detector: (c) => scoreSignal(hasAny(c.text, [/\bluxury\b/, /\bpremium\b/, /\bprivate\b/, /\bexclusive\b/]), true) },
  { name: "Emotional pull", category: "First Impression", detector: (c) => scoreSignal(hasAny(c.text, [/\bescape\b/, /\brelax\b/, /\bunforgettable\b/, /\bdream\b/]), true) },
  { name: "Hero clarity", category: "First Impression", detector: (c) => scoreSignal(c.h1.some((h) => /\bvilla|stay|book|holiday|retreat/.test(h)), true) },

  { name: "Navigation depth", category: "UX", detector: (c) => scoreSignal(c.h2.length >= 3, c.h2.length >= 1) },
  { name: "Scan-friendly content", category: "UX", detector: (c) => scoreSignal(c.words > 220, c.words > 120) },
  { name: "Broken-link risk (heuristic)", category: "UX", detector: (c) => scoreSignal(c.links >= 1, true) },
  { name: "Mobile hints in content", category: "UX", detector: (c) => scoreSignal(hasAny(c.text, [/\bcall\b/, /\bwhatsapp\b/, /\btap\b/]), true) },
  { name: "Clear sectioning", category: "UX", detector: (c) => scoreSignal(c.h2.length + c.h3.length >= 6, c.h2.length + c.h3.length >= 3) },
  { name: "Booking path clarity", category: "UX", detector: (c) => scoreSignal(hasAny(c.text, [/\b1\b.*\b2\b.*\b3\b/, /\bhow it works\b/]), true) },

  { name: "Offer explicitness", category: "Offer Clarity", detector: (c) => scoreSignal(hasAny(c.text, [/\bbedrooms?\b/, /\bguests?\b/, /\bamenities\b/])) },
  { name: "Price anchor", category: "Offer Clarity", detector: (c) => scoreSignal(hasAny(c.text, [/€\s?\d+/, /\bfrom €?\d+/])) },
  { name: "Availability cue", category: "Offer Clarity", detector: (c) => scoreSignal(hasAny(c.text, [/\bavailable\b/, /\bcalendar\b/, /\bdates\b/])) },
  { name: "Stay policy clarity", category: "Offer Clarity", detector: (c) => scoreSignal(hasAny(c.text, [/\bminimum stay\b/, /\bcheck-in\b/, /\bcheck-out\b/]), true) },
  { name: "Inclusion clarity", category: "Offer Clarity", detector: (c) => scoreSignal(hasAny(c.text, [/\bincluded\b/, /\bcleaning\b/, /\btaxes\b/]), true) },
  { name: "Differentiation", category: "Offer Clarity", detector: (c) => scoreSignal(hasAny(c.text, [/\bwhy choose\b/, /\bunique\b/, /\bcompared\b/]), true) },

  { name: "Image presence", category: "Visuals", detector: (c) => scoreSignal(c.images.length >= 6, c.images.length >= 3) },
  { name: "Image alt coverage", category: "Visuals", detector: (c) => {
    if (!c.images.length) return 0;
    const coverage = c.images.filter((i) => i.alt.trim().length > 4).length / c.images.length;
    return coverage > 0.7 ? 1 : coverage > 0.35 ? 0.5 : 0;
  }},
  { name: "Lifestyle image cues", category: "Visuals", detector: (c) => scoreSignal(c.images.some((i) => /pool|view|bedroom|terrace|villa|living/i.test(i.alt)), true) },
  { name: "Visual trust badges", category: "Visuals", detector: (c) => scoreSignal(hasAny(c.text, [/\bbadge\b/, /\bverified\b/, /\bsuperhost\b/]), true) },
  { name: "Visual consistency proxy", category: "Visuals", detector: (c) => scoreSignal(c.images.length >= 4 && c.h2.length >= 2, true) },
  { name: "Visual storytelling", category: "Visuals", detector: (c) => scoreSignal(c.h2.some((h) => /gallery|experience|inside/.test(h)), true) },

  { name: "Performance hint scripts low", category: "Performance", detector: (c) => scoreSignal(c.words < 3500, c.words < 5000) },
  { name: "Image payload proxy", category: "Performance", detector: (c) => scoreSignal(c.images.length <= 25, c.images.length <= 40) },
  { name: "Critical content early", category: "Performance", detector: (c) => scoreSignal(c.h1.length > 0 && c.meta.length > 0) },
  { name: "No bloated copy", category: "Performance", detector: (c) => scoreSignal(c.words < 1800, c.words < 2800) },
  { name: "Text-to-media balance", category: "Performance", detector: (c) => scoreSignal(c.images.length > 0 && c.words / Math.max(1, c.images.length) < 180, true) },

  { name: "Title tag", category: "SEO", detector: (c) => scoreSignal(c.title.length > 10) },
  { name: "Meta description", category: "SEO", detector: (c) => scoreSignal(c.meta.length > 30) },
  { name: "H1 presence", category: "SEO", detector: (c) => scoreSignal(c.h1.length > 0) },
  { name: "Heading depth", category: "SEO", detector: (c) => scoreSignal(c.h2.length >= 3, c.h2.length >= 1) },
  { name: "Image alt text", category: "SEO", detector: (c) => scoreSignal(c.images.some((i) => i.alt.trim().length > 0), true) },

  { name: "Analytics signals", category: "Analytics", detector: (c) => scoreSignal(hasAny(c.text, [/\bgtag\b/, /\bgoogle analytics\b/, /\bpixel\b/, /\bhotjar\b/]), true) },
  { name: "Conversion tracking mention", category: "Analytics", detector: (c) => scoreSignal(hasAny(c.text, [/\btrack\b/, /\bmeasure\b/, /\battribution\b/]), true) },

  { name: "Email capture", category: "Retention", detector: (c) => scoreSignal(hasAny(c.text, [/\bnewsletter\b/, /\bsubscribe\b/, /\bemail\b/]), true) },
  { name: "Return incentive", category: "Retention", detector: (c) => scoreSignal(hasAny(c.text, [/\breturn\b/, /\bloyalty\b/, /\bmember\b/, /\brepeat\b/]), true) }
];

function computeCategoryBreakdown(ctx: EvalCtx): { category_breakdown: CategoryScore[]; score_100: number } {
  const byCategory = new Map<CategoryScore["category"], number[]>();
  for (const factor of FACTORS) {
    const signal = factor.detector(ctx);
    const list = byCategory.get(factor.category) || [];
    list.push(signal);
    byCategory.set(factor.category, list);
  }

  const category_breakdown: CategoryScore[] = (Object.keys(CATEGORY_WEIGHTS) as CategoryScore["category"][]).map((category) => {
    const values = byCategory.get(category) || [];
    const raw = values.reduce((sum, v) => sum + v, 0);
    const max = Math.max(1, values.length);
    const weight = CATEGORY_WEIGHTS[category];
    const weighted = (raw / max) * weight;
    return {
      category,
      weighted_score: Number(weighted.toFixed(2)),
      max_weight: weight,
      percent: Number(((raw / max) * 100).toFixed(1))
    };
  });

  const score_100 = Number(category_breakdown.reduce((sum, c) => sum + c.weighted_score, 0).toFixed(1));
  return { category_breakdown, score_100 };
}

function computePenalties(ctx: EvalCtx): { total: number; leaks: RevenueLeak[] } {
  const triggers: RevenueLeak[] = [];
  if (!hasAny(ctx.text, [/\breviews?\b/, /\btestimonial\b/, /\bguest rating\b/])) {
    triggers.push({ issue: "No reviews or testimonial proof", impact_percent: PENALTIES.noReviews, explanation: "Guests cannot validate quality before booking." });
  }
  if (!ctx.h1.length || !/\bvilla|book|stay|holiday|retreat/.test(ctx.h1[0])) {
    triggers.push({ issue: "Weak hero message", impact_percent: PENALTIES.weakHero, explanation: "First screen does not sell the stay outcome fast enough." });
  }
  if (!hasAny(ctx.text, [/\bbook now\b/, /\blimited\b/, /\bthis season\b/, /\bavailability\b/])) {
    triggers.push({ issue: "No urgency cues", impact_percent: PENALTIES.noUrgency, explanation: "Users delay decisions without a timing trigger." });
  }
  if (!hasAny(ctx.text, [/€\s?\d+/, /\bper night\b/, /\bprice\b/])) {
    triggers.push({ issue: "Pricing hidden or unclear", impact_percent: PENALTIES.hiddenPricing, explanation: "High-intent guests bounce when price framing is missing." });
  }
  if (!hasAny(ctx.text, [/\bmobile\b/, /\bwhatsapp\b/, /\bcall\b/, /\btap\b/])) {
    triggers.push({ issue: "Poor mobile conversion cues", impact_percent: PENALTIES.poorMobile, explanation: "Most leisure traffic is mobile-first and needs direct action paths." });
  }
  if (ctx.words > 2600 || ctx.images.length > 28) {
    triggers.push({ issue: "Slow load risk", impact_percent: PENALTIES.slowLoad, explanation: "Heavy pages reduce completed booking sessions." });
  }
  if (!hasAny(ctx.text, [/\bbook now\b/, /\bcheck availability\b/, /\breserve\b/])) {
    triggers.push({ issue: "Weak booking CTA", impact_percent: PENALTIES.weakCta, explanation: "Visitors are not pushed into the booking flow." });
  }
  if (!hasAny(ctx.text, [/\bcancellation\b/, /\bpolicy\b/, /\bterms\b/])) {
    triggers.push({ issue: "Missing trust stack policies", impact_percent: PENALTIES.noPolicy, explanation: "Risk objections stay unresolved at checkout time." });
  }
  if (!hasAny(ctx.text, [/\bhow it works\b/, /\bstep\b/, /\bavailability\b/, /\bcalendar\b/])) {
    triggers.push({ issue: "Broken booking flow communication", impact_percent: PENALTIES.brokenFlow, explanation: "Guests do not understand the next step to secure dates." });
  }

  const sorted = triggers.sort((a, b) => b.impact_percent - a.impact_percent);
  const total = Math.min(70, sorted.reduce((sum, leak) => sum + leak.impact_percent, 0));
  return { total, leaks: sorted.slice(0, 5) };
}

function inferTraffic(ctx: EvalCtx, score_100: number): { low: number; high: number } {
  const seoSignal = hasAny(ctx.text, [/\blocation\b/, /\bvilla\b/, /\bholiday\b/, /\bbeach\b/, /\bpool\b/]) ? 1.2 : 1;
  const contentSignal = Math.min(1.6, Math.max(0.7, ctx.words / 900));
  const authoritySignal = hasAny(ctx.text, [/\breviews?\b/, /\bfeatured\b/, /\baward\b/]) ? 1.15 : 0.95;
  const scoreSignal = Math.max(0.8, score_100 / 100);
  const baseline = 1200 * seoSignal * contentSignal * authoritySignal * scoreSignal;
  const low = Math.max(350, Math.round(baseline * 0.7));
  const high = Math.max(low + 150, Math.round(baseline * 1.45));
  return { low, high };
}

function parseAvgBookingValue(nightlyPrice?: number): { low: number; high: number } {
  if (nightlyPrice && nightlyPrice > 30) {
    const low = Math.round(nightlyPrice * 4);
    const high = Math.round(nightlyPrice * 8);
    return { low, high };
  }
  return { low: 3000, high: 15000 };
}

function asEurRange(range: { low: number; high: number }): string {
  return `€${range.low.toLocaleString()}–€${range.high.toLocaleString()}`;
}

async function buildAiRecommendations(leaks: RevenueLeak[], goal: string): Promise<string[]> {
  const leakSummary = leaks.map((l) => `${l.issue} (${l.impact_percent}%)`).join(", ");
  const prompt = `You explain CRO actions for villa booking sites.
Return strict JSON: {"recommendations": ["...", "...", "..."]}.
Goal: ${goal}
Top detected leaks: ${leakSummary}
Rules: practical, specific, 1 sentence each, no fluff.`;
  try {
    const res = await chatJson(prompt);
    const parsed = JSON.parse(res.text) as { recommendations?: string[] };
    if (Array.isArray(parsed.recommendations) && parsed.recommendations.length) {
      return parsed.recommendations.slice(0, 4);
    }
  } catch {
    // deterministic fallback below
  }
  return leaks.slice(0, 4).map((leak) => `Fix "${leak.issue.toLowerCase()}" first to recover high-intent booking demand faster.`);
}

export async function generateAudit(
  scraped: ScrapeResult,
  goal?: string,
  targetAudience?: string,
  nightlyPrice?: number,
  occupancyPercent?: number,
  platform?: string
): Promise<AuditResult> {
  const ctx = makeContext(scraped);
  const { category_breakdown, score_100 } = computeCategoryBreakdown(ctx);
  const { total, leaks } = computePenalties(ctx);
  const benchmarkLow = 0.015;
  const benchmarkHigh = 0.03;
  const adjustedLow = Number((benchmarkLow * (1 - total / 100)).toFixed(4));
  const adjustedHigh = Number((benchmarkHigh * (1 - total / 100)).toFixed(4));

  const traffic = inferTraffic(ctx, score_100);
  const avgBookingValue = parseAvgBookingValue(nightlyPrice);
  const currentYearly = {
    low: Math.round(traffic.low * adjustedLow * avgBookingValue.low * 12),
    high: Math.round(traffic.high * adjustedHigh * avgBookingValue.high * 12)
  };
  const potentialYearly = {
    low: Math.round(traffic.low * benchmarkLow * avgBookingValue.low * 12),
    high: Math.round(traffic.high * benchmarkHigh * avgBookingValue.high * 12)
  };
  const lossYearly = {
    low: Math.max(0, potentialYearly.low - currentYearly.low),
    high: Math.max(0, potentialYearly.high - currentYearly.high)
  };

  const severity: AuditResult["severity"] = total >= 45 || score_100 < 45 ? "HIGH" : total >= 25 || score_100 < 65 ? "MEDIUM" : "LOW";
  const resolvedGoal = goal?.trim() || "Increase direct bookings and occupancy";
  const resolvedAudience = targetAudience?.trim() || "Families, couples, and groups planning premium stays";
  const resolvedPlatform = platform?.trim() || "both";
  const occupancy = typeof occupancyPercent === "number" && occupancyPercent > 0 ? occupancyPercent : undefined;

  const quickWins = leaks.slice(0, 3).map((l) => `Fix ${l.issue.toLowerCase()} to recover up to ${l.impact_percent}% conversion drag.`);
  const aiRecommendations = await buildAiRecommendations(leaks, resolvedGoal);
  const topIssueStrings = leaks.map((l) => `${l.issue} (${l.impact_percent}% impact)`);
  const top3Impact = Math.min(35, leaks.slice(0, 3).reduce((s, l) => s + l.impact_percent, 0));
  const top3Gain = {
    low: Math.round((potentialYearly.low * top3Impact) / 100),
    high: Math.round((potentialYearly.high * top3Impact) / 100)
  };

  return {
    score: Number((score_100 / 10).toFixed(1)),
    score_100,
    severity,
    total_penalty_percent: total,
    booking_loss_percent: total,
    revenue_loss_yearly: lossYearly,
    revenue_current_yearly: currentYearly,
    revenue_potential_yearly: potentialYearly,
    traffic_estimate_monthly: traffic,
    avg_booking_value: avgBookingValue,
    conversion_rate: {
      benchmark_low: benchmarkLow,
      benchmark_high: benchmarkHigh,
      adjusted_low: adjustedLow,
      adjusted_high: adjustedHigh
    },
    top_revenue_leaks: leaks,
    category_breakdown,
    impact_simulator: {
      top3_fixes_gain_yearly: top3Gain,
      summary: `If you fix the top 3 leaks, projected upside is ${asEurRange(top3Gain)} / year.`
    },
    ai_recommendations: aiRecommendations,
    verdict: `You are losing ~${total}% of bookings because high-intent visitors are meeting friction before confidence.`,
    money_leak: leaks[0]?.issue || "Booking confidence is weaker than booking intent.",
    top_issues: topIssueStrings,
    quick_wins: quickWins,
    priority_actions: leaks.slice(0, 5).map((l, idx) => ({
      action: `Resolve: ${l.issue}`,
      impact: idx < 2 ? "High" : "Medium",
      difficulty: idx < 2 ? "Medium" : "Low",
      why_it_matters: l.explanation
    })),
    rewrite: {
      hero_headline: "Book your villa with transparent pricing, trusted guest proof, and instant availability.",
      cta: "Check Dates & Book Securely"
    },
    estimated_impact: `Recover ${Math.min(45, total)}% of lost conversions with focused fixes.`,
    inferred_goal: `${resolvedGoal} (${resolvedPlatform}${occupancy ? `, current occupancy ${occupancy}%` : ""})`,
    inferred_audience: resolvedAudience
  };
}
