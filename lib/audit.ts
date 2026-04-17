import type { AuditResult, CategoryScore, EvidenceInsight, RevenueLeak, ScrapeResult, WebsiteEvidenceItem } from "@/lib/types";
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
  scraped: ScrapeResult;
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
    url: scraped.url,
    scraped
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

function pushLeak(leaks: RevenueLeak[], insights: EvidenceInsight[], issue: string, impact_percent: number, evidence: string, why: string): void {
  leaks.push({
    issue,
    impact_percent,
    explanation: `${evidence} -> ${why}`
  });
  insights.push({
    issue,
    evidence,
    why_it_matters: why,
    impact_percent
  });
}

function computePenalties(ctx: EvalCtx): { total: number; leaks: RevenueLeak[]; insights: EvidenceInsight[] } {
  const leaks: RevenueLeak[] = [];
  const insights: EvidenceInsight[] = [];
  const s = ctx.scraped;

  if (s.scrapeStatus === "fallback") {
    pushLeak(
      leaks,
      insights,
      "Limited crawl evidence",
      12,
      "Crawler could not extract rendered DOM data; using fallback text-only context",
      "Without reliable page evidence, diagnostics are conservative and should be re-run with crawl access"
    );
    return { total: 12, leaks: leaks.slice(0, 5), insights };
  }

  if (s.trustSignals.reviewCountDetected <= 0 && s.trustSignals.reviewMentions.length === 0) {
    pushLeak(
      leaks,
      insights,
      "No guest reviews detected",
      PENALTIES.noReviews,
      "No evidence of 'review', 'testimonial', or numeric review count detected on page",
      "Without social proof, visitors cannot validate stay quality and trust drops before booking"
    );
  }
  if (!s.heroText.length || !s.headings.h1.length) {
    pushLeak(
      leaks,
      insights,
      "Hero section lacks a strong value headline",
      PENALTIES.weakHero,
      `H1 detected: ${s.headings.h1[0] ? `"${s.headings.h1[0]}"` : "NONE detected"}`,
      "The first screen must communicate differentiated value in seconds"
    );
  }
  if (s.pricingTexts.length === 0) {
    pushLeak(
      leaks,
      insights,
      "No clear pricing anchor on page",
      PENALTIES.hiddenPricing,
      "No evidence of pricing text such as currency values, 'from', or 'per night'",
      "Guests abandon when they cannot quickly assess budget fit"
    );
  }
  if (!s.structure.hasBookingForm && !s.structure.hasCalendar) {
    pushLeak(
      leaks,
      insights,
      "No booking form or calendar detected",
      PENALTIES.brokenFlow,
      "Booking form: NOT detected; Calendar: NOT detected",
      "Users cannot see the booking path and defer conversion"
    );
  }
  const aboveFoldCtaCount = s.ctas.filter((cta) => cta.aboveFold).length;
  if (s.ctas.length === 0 || aboveFoldCtaCount === 0) {
    pushLeak(
      leaks,
      insights,
      "Primary CTA is weak or below fold",
      PENALTIES.weakCta,
      `CTA count detected: ${s.ctas.length}; Above fold CTAs: ${aboveFoldCtaCount}`,
      "If users cannot immediately act, intent decays before they enter booking"
    );
  }
  const urgencyCtas = s.ctas.filter((cta) => /now|today|instant|availability|reserve/i.test(cta.text)).length;
  if (urgencyCtas === 0) {
    pushLeak(
      leaks,
      insights,
      "No urgency in CTA wording",
      PENALTIES.noUrgency,
      `Detected CTA texts: ${s.ctas.slice(0, 4).map((c) => `"${c.text}"`).join(", ") || "NONE"}`,
      "Urgency framing increases decision speed and booking completion"
    );
  }
  if (s.mobile.viewportIssues.length > 0) {
    pushLeak(
      leaks,
      insights,
      "Mobile layout risks detected",
      PENALTIES.poorMobile,
      `Mobile checks: ${s.mobile.viewportIssues.join("; ")}`,
      "Most villa traffic is mobile-first, so layout friction directly hurts conversion"
    );
  }
  if ((s.performance.loadTimeMs || 0) > 3500 || (s.performance.pageWeightBytes || 0) > 4_500_000) {
    pushLeak(
      leaks,
      insights,
      "Slow page performance",
      PENALTIES.slowLoad,
      `Load time: ${s.performance.loadTimeMs ? `${s.performance.loadTimeMs}ms` : "No evidence detected"}; Page weight: ${s.performance.pageWeightBytes ? `${Math.round(s.performance.pageWeightBytes / 1024)}KB` : "No evidence detected"}`,
      "Slow interactions increase abandonment before trust and offer are evaluated"
    );
  }
  if (s.trustSignals.badgesOrLogos.length === 0) {
    pushLeak(
      leaks,
      insights,
      "No trust badges or partner logos detected",
      PENALTIES.noTrustStack,
      "No evidence of badge/logo markers such as verified, award, partner, or OTA trust marks",
      "Visual trust markers reduce perceived risk at decision time"
    );
  }
  if (!hasAny(ctx.text, [/\bcancellation\b/, /\brefund\b/, /\bterms\b/, /\bpolicy\b/])) {
    pushLeak(
      leaks,
      insights,
      "No cancellation/policy confidence cues",
      PENALTIES.noPolicy,
      "No evidence of cancellation/refund/policy text detected",
      "Risk objections stay unresolved and suppress booking intent"
    );
  }

  const sorted = leaks.sort((a, b) => b.impact_percent - a.impact_percent);
  const total = Math.min(70, sorted.reduce((sum, leak) => sum + leak.impact_percent, 0));
  return { total, leaks: sorted.slice(0, 5), insights: insights.slice(0, 8) };
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

async function buildAiRecommendations(leaks: RevenueLeak[], goal: string, evidence: WebsiteEvidenceItem[]): Promise<string[]> {
  const leakSummary = leaks.map((l) => `${l.issue} (${l.impact_percent}%) - ${l.explanation}`).join("\n");
  const evidenceSummary = evidence.map((e) => `${e.label}: ${e.value}`).join("\n");
  const prompt = `You explain CRO actions for villa booking sites.
Return strict JSON: {"recommendations": ["...", "...", "..."]}.
Goal: ${goal}
Top detected leaks:
${leakSummary}
Extracted evidence:
${evidenceSummary}
Rules: practical, specific, 1 sentence each, no fluff. Never invent new facts; only reference evidence above.`;
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

function buildWhatWeFound(scraped: ScrapeResult): WebsiteEvidenceItem[] {
  const firstCta = scraped.ctas[0];
  const firstPricing = scraped.pricingTexts[0] || "No evidence detected";
  return [
    { label: "H1", value: scraped.headings.h1[0] || "No evidence detected" },
    { label: "Hero text", value: scraped.heroText[0] || "No evidence detected" },
    { label: "Primary CTA", value: firstCta ? `"${firstCta.text}" (${firstCta.aboveFold ? "above fold" : "below fold"})` : "No evidence detected" },
    { label: "CTA count", value: `${scraped.ctas.length}` },
    { label: "Pricing text", value: firstPricing },
    { label: "Booking form", value: scraped.structure.hasBookingForm ? "Detected" : "Not detected" },
    { label: "Calendar", value: scraped.structure.hasCalendar ? "Detected" : "Not detected" },
    { label: "Reviews", value: scraped.trustSignals.reviewCountDetected > 0 ? `${scraped.trustSignals.reviewCountDetected} references detected` : "No evidence detected" },
    { label: "Star rating", value: scraped.trustSignals.starRatingDetected ? `${scraped.trustSignals.starRatingDetected}/5 detected` : "No evidence detected" },
    { label: "Trust badges/logos", value: scraped.trustSignals.badgesOrLogos.length ? scraped.trustSignals.badgesOrLogos.slice(0, 2).join("; ") : "No evidence detected" },
    { label: "Images", value: `${scraped.media.imageCount} total, ${scraped.media.imagesWithAlt} with alt` },
    { label: "Load time", value: scraped.performance.loadTimeMs ? `${scraped.performance.loadTimeMs}ms` : "No evidence detected" },
    { label: "Page weight", value: scraped.performance.pageWeightBytes ? `${Math.round(scraped.performance.pageWeightBytes / 1024)} KB` : "No evidence detected" },
    { label: "Mobile check", value: scraped.mobile.viewportIssues.length ? scraped.mobile.viewportIssues.join("; ") : "No obvious viewport issues detected" }
  ];
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
  const { total, leaks, insights } = computePenalties(ctx);
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
  const whatWeFound = buildWhatWeFound(scraped);

  const quickWins = leaks.slice(0, 3).map((l) => `${l.issue}: ${l.explanation}`);
  const aiRecommendations = await buildAiRecommendations(leaks, resolvedGoal, whatWeFound);
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
    what_we_found: [{ label: "Crawl mode", value: scraped.scrapeStatus }, ...whatWeFound],
    evidence_insights: insights,
    verdict: `Evidence-based diagnosis: ${leaks[0]?.explanation || "No major leaks detected from current evidence."}`,
    money_leak: leaks[0]?.explanation || "No evidence of a major leak detected.",
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
