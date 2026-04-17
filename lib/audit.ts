import { z } from "zod";
import { chatJson } from "@/lib/openai";
import type { AuditResult, ScrapeResult } from "@/lib/types";

const auditSchema = z.object({
  score: z.coerce.number().min(0).max(10),
  verdict: z.string(),
  money_leak: z.string(),
  top_issues: z.array(z.string()),
  quick_wins: z.array(z.string()),
  estimated_impact: z.string().optional(),
  inferred_goal: z.string().optional(),
  inferred_audience: z.string().optional(),
  rewrite: z
    .object({
      hero_headline: z.string(),
      cta: z.string()
    })
    .optional(),
  priority_actions: z.array(
    z.object({
      action: z.string(),
      impact: z.enum(["High", "Medium", "Low"]),
      difficulty: z.enum(["Low", "Medium", "High"]),
      why_it_matters: z.string()
    })
  )
});

function parseAiJsonLenient(raw: string): unknown {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      throw new Error("No JSON object found in AI output.");
    }
    return JSON.parse(trimmed.slice(start, end + 1));
  }
}

function inferGoalFromContent(scraped: ScrapeResult): string {
  const text = `${scraped.url} ${scraped.title} ${scraped.metaDescription} ${scraped.bodyText}`.toLowerCase();
  if (/audit|conversion|saas|software|tool|app/.test(text)) return "Increase qualified leads and paid subscriptions";
  if (/book|reservation|villa|hotel|airbnb|stay/.test(text)) return "Increase qualified bookings";
  if (/shop|buy|cart|checkout|product|store/.test(text)) return "Increase product sales";
  if (/agency|service|consult|contact|quote/.test(text)) return "Generate qualified service leads";
  if (/saas|software|demo|trial|signup/.test(text)) return "Increase demo requests and paid signups";
  return "Increase qualified conversions and revenue";
}

function normalizeGoalForCopy(goal: string): string {
  const text = goal.toLowerCase();
  if (/booking|reservation|stay|villa|hotel/.test(text)) return "increase qualified bookings";
  if (/lead|enquiry|inquiry|quote|contact/.test(text)) return "generate more qualified leads";
  if (/sale|revenue|purchase|checkout|order/.test(text)) return "increase sales revenue";
  if (/signup|trial|demo|subscription/.test(text)) return "increase qualified signups";
  return "increase conversions and revenue";
}

function sanitizeAudience(url: string, audience: string, fallbackAudience: string): string {
  const hostAndAudience = `${new URL(url).hostname} ${audience}`.toLowerCase();
  if (/siteaudit|audit|saas|software|tool|app/.test(hostAndAudience) && /leisure travelers|vacation|holiday/.test(hostAndAudience)) {
    return "Founders, marketers, and growth teams improving conversion performance";
  }
  return audience || fallbackAudience;
}

function sanitizeRewriteHeadline(headline: string, audience: string, goal: string): string {
  const normalizedGoal = normalizeGoalForCopy(goal);
  const candidate = headline.trim();
  if (!candidate || /^get\s+improve\b/i.test(candidate) || candidate.length < 24) {
    return `Convert more ${audience.toLowerCase()} by clarifying your offer and reducing conversion friction to ${normalizedGoal}.`;
  }
  return candidate;
}

function inferAudienceFromContent(scraped: ScrapeResult): string {
  const host = new URL(scraped.url).hostname.toLowerCase();
  const text = `${scraped.url} ${scraped.title} ${scraped.metaDescription} ${scraped.bodyText}`.toLowerCase();
  if (/siteaudit|audit|saas|software|app|tool|platform/.test(host + " " + text)) {
    return "Founders, marketers, and growth teams improving conversion performance";
  }
  if (/amazon|shop|store|checkout|cart|product/.test(host + " " + text)) {
    return "Online shoppers comparing price, trust, and delivery confidence";
  }
  if (/villa|travel|holiday|vacation|stay|reservation/.test(text)) {
    return "Leisure travelers comparing accommodation options";
  }
  if (/wedding|event|florist|venue/.test(text)) {
    return "Couples and event planners seeking premium event services";
  }
  if (/b2b|enterprise|team|company|business/.test(text)) {
    return "Business buyers evaluating ROI and trust quickly";
  }
  if (/beauty|spa|salon|clinic/.test(text)) {
    return "Consumers evaluating quality, trust, and booking convenience";
  }
  return "Visitors with high intent but limited attention span";
}

function buildFallbackAudit(scraped: ScrapeResult, goal?: string, targetAudience?: string): AuditResult {
  const resolvedGoal = goal || inferGoalFromContent(scraped);
  const normalizedGoalForCopy = normalizeGoalForCopy(resolvedGoal);
  const resolvedAudience = targetAudience || inferAudienceFromContent(scraped);
  const text = `${scraped.title} ${scraped.metaDescription} ${scraped.bodyText}`.toLowerCase();
  const ctaKeywords = ["book", "buy", "start", "get started", "contact", "call", "shop", "subscribe"];
  const trustKeywords = ["testimonial", "review", "trusted", "clients", "case study", "award", "years"];
  const clarityKeywords = ["for ", "help", "solution", "service", "benefit", "we help", "designed for", "results", "book"];
  const urgencyKeywords = ["today", "now", "limited", "offer", "save", "book now", "request"];
  const frictionKeywords = ["learn more", "click here", "submit", "read more"];

  const hasMeta = scraped.metaDescription.length > 30;
  const hasH1 = scraped.headings.h1.length > 0;
  const hasCta = ctaKeywords.some((word) => text.includes(word));
  const hasTrust = trustKeywords.some((word) => text.includes(word));
  const hasClarity = clarityKeywords.some((word) => text.includes(word));
  const hasUrgency = urgencyKeywords.some((word) => text.includes(word));
  const hasHighFrictionCta = frictionKeywords.filter((word) => text.includes(word)).length >= 2;
  const h2Count = scraped.headings.h2.length;
  const imageAltCoverage =
    scraped.images.length === 0 ? 1 : scraped.images.filter((img) => img.alt.trim().length > 3).length / scraped.images.length;

  let score = 3.6;
  if (hasMeta) score += 1.2;
  if (hasH1) score += 0.9;
  if (hasCta) score += 1.1;
  if (hasTrust) score += 0.8;
  if (hasClarity) score += 0.8;
  if (h2Count >= 3) score += 0.4;
  if (hasUrgency) score += 0.3;
  if (hasHighFrictionCta) score -= 0.6;
  if (imageAltCoverage > 0.6) score += 0.6;
  score = Math.max(1.8, Math.min(7.6, Number(score.toFixed(1))));

  const topIssues: string[] = [];
  if (!hasCta) topIssues.push("Primary call-to-action is not clearly visible in the homepage copy.");
  if (!hasTrust) topIssues.push("Trust signals (proof, testimonials, or authority markers) are weak or missing.");
  if (!hasMeta) topIssues.push("Meta description is weak, reducing click-through quality from search/social.");
  if (!hasH1) topIssues.push("No clear H1 hierarchy, which hurts message clarity and user orientation.");
  if (h2Count < 2) topIssues.push("Section structure is shallow, making the page harder to scan and convert from.");
  if (!hasUrgency) topIssues.push("CTA copy lacks urgency, lowering immediate conversion intent.");
  if (hasHighFrictionCta) topIssues.push("CTA language is generic and high-friction; use action-specific outcome wording.");
  if (imageAltCoverage < 0.4) topIssues.push("Image alt text coverage is low, reducing accessibility and context.");
  const defaultIssues = [
    "Value proposition is not tied tightly enough to buyer intent at first glance.",
    "Offer differentiation is not explicit enough in above-the-fold copy.",
    "Conversion path can be simplified to reduce decision friction."
  ];
  while (topIssues.length < 3) {
    topIssues.push(defaultIssues[topIssues.length % defaultIssues.length]);
  }

  const quickWins = [
    `Add one clear above-the-fold CTA aligned to "${normalizedGoalForCopy}".`,
    `Rewrite hero copy for one audience: ${resolvedAudience}.`,
    "Place a trust block (reviews/logos/results) beside the primary CTA.",
    "Use an urgency-focused CTA variant (for example: 'Book your consultation today').",
    "Show a concrete offer or package outcome before users scroll."
  ];

  const estimatedImpactLow = Math.max(8, Math.round((10 - score) * 2));
  const estimatedImpactHigh = estimatedImpactLow + 12;

  return {
    score,
    verdict:
      "This site is underperforming because the conversion intent is weaker than the attention required to trust and act.",
    money_leak:
      "Revenue is leaking in the first-screen experience where visitors do not get enough proof and urgency to commit.",
    estimated_impact: `Fixing these issues could increase conversions by ${estimatedImpactLow}-${estimatedImpactHigh}%.`,
    top_issues: topIssues.slice(0, 5),
    quick_wins: quickWins,
    inferred_goal: resolvedGoal,
    inferred_audience: resolvedAudience,
    rewrite: {
      hero_headline: `Get better results faster with a clearer offer and stronger trust signals for ${resolvedAudience.toLowerCase()}.`,
      cta: "Get Your Conversion Plan"
    },
    priority_actions: [
      {
        action: "Clarify hero value proposition in one sentence with concrete outcome",
        impact: "High",
        difficulty: "Low",
        why_it_matters: "Visitors decide in seconds whether your offer is relevant and worth attention."
      },
      {
        action: "Introduce a single primary CTA and remove competing action paths",
        impact: "High",
        difficulty: "Medium",
        why_it_matters: "Reducing choice friction increases click-through into revenue-driving steps."
      },
      {
        action: "Add trust proof directly next to CTA (reviews, case results, guarantees)",
        impact: "Medium",
        difficulty: "Low",
        why_it_matters: "Trust proof at decision points reduces hesitation and improves conversion intent."
      }
    ],
    error: "fallback-analysis-used"
  };
}

export async function generateAudit(
  scraped: ScrapeResult,
  goal?: string,
  targetAudience?: string
): Promise<AuditResult> {
  const resolvedGoal = goal || inferGoalFromContent(scraped);
  const resolvedAudience = targetAudience || inferAudienceFromContent(scraped);
  const prompt = `
SYSTEM:
You are a senior conversion strategist.

You do NOT give generic advice.

You diagnose websites like a revenue operator.

INPUT:
- website content
- optional goal

TASK:
1. Identify:
   - what this site is selling
   - who it targets
   - what action user should take
2. Detect:
   - where money is being lost
   - what is unclear or weak
   - what blocks conversion
3. Assign REAL score:
   - based on clarity, trust, friction, offer strength
   - DO NOT inflate scores
4. Think like you are responsible for revenue.

OUTPUT FORMAT (STRICT JSON):
{
  "score": number,
  "verdict": "Why this site is underperforming",
  "money_leak": "Where revenue is being lost",
  "top_issues": [ "specific, concrete problems only" ],
  "quick_wins": [ "high ROI, actionable fixes" ],
  "priority_actions": [
    {
      "action": "...",
      "impact": "High" | "Medium" | "Low",
      "difficulty": "Low" | "Medium" | "High",
      "why_it_matters": "tie to conversion"
    }
  ],
  "rewrite": {
    "hero_headline": "...",
    "cta": "..."
  },
  "estimated_impact": "Fixing these could increase conversions by X-Y%",
  "inferred_goal": "...",
  "inferred_audience": "..."
}

RULES:
- No vague language
- No generic advice
- Every point must be specific
- Keep score realistic and strict

Website URL: ${scraped.url}
Goal: ${resolvedGoal}
Audience Hint: ${resolvedAudience}
Title: ${scraped.title}
Meta description: ${scraped.metaDescription}
Headings: ${JSON.stringify(scraped.headings)}
Images: ${JSON.stringify(scraped.images.slice(0, 10))}
Body text:
${scraped.bodyText.slice(0, 7000)}
`;

  try {
    const ai = await chatJson(prompt);
    const parsed = auditSchema.safeParse(parseAiJsonLenient(ai.text));
    if (!parsed.success) throw new Error("Invalid AI JSON");
    const clampedScore = Math.max(0, Math.min(8.5, Number(parsed.data.score.toFixed(1))));
    const safeAudience = sanitizeAudience(scraped.url, parsed.data.inferred_audience || resolvedAudience, resolvedAudience);
    const safeGoal = parsed.data.inferred_goal || resolvedGoal;
    const safeHeadline = sanitizeRewriteHeadline(parsed.data.rewrite?.hero_headline || "", safeAudience, safeGoal);
    return {
      ...parsed.data,
      score: clampedScore,
      estimated_impact: parsed.data.estimated_impact || `Fixing these could increase conversions by ${Math.round((10 - clampedScore) * 2)}-${Math.round((10 - clampedScore) * 3.2)}%.`,
      inferred_goal: safeGoal,
      inferred_audience: safeAudience,
      rewrite: {
        hero_headline: safeHeadline,
        cta: parsed.data.rewrite?.cta || "Start Converting Better"
      },
      quick_wins:
        parsed.data.quick_wins.length > 0
          ? parsed.data.quick_wins.map((win) => win.replace(/"[^"]{40,}"/g, `"${normalizeGoalForCopy(safeGoal)}"`))
          : [
              `Add one clear above-the-fold CTA aligned to "${normalizeGoalForCopy(safeGoal)}".`,
              `Rewrite hero copy for one audience: ${safeAudience}.`,
              "Add proof and trust near the main CTA."
            ],
      top_issues: parsed.data.top_issues.length > 0 ? parsed.data.top_issues : ["Offer clarity and CTA positioning are reducing conversion intent."],
      priority_actions: parsed.data.priority_actions.length > 0 ? parsed.data.priority_actions : [
        {
          action: "Clarify hero value proposition in one sentence with concrete outcome",
          impact: "High",
          difficulty: "Low",
          why_it_matters: "Visitors decide in seconds whether your offer is relevant and worth attention."
        }
      ],
      money_leak: parsed.data.money_leak || "Revenue leaks when users do not get trust + action clarity in the first screen.",
      verdict: parsed.data.verdict || "This site is underperforming due to weak conversion clarity in key decision moments.",
      // keep provider diagnostic without leaking to UI
      error: ai.provider === "openai" ? undefined : "openai-fallback-provider-used"
    };
  } catch (error) {
    console.error("[audit] AI generation failed, using deterministic fallback:", error);
    return buildFallbackAudit(scraped, goal, targetAudience);
  }
}
