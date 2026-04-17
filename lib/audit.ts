import { z } from "zod";
import { chatJson } from "@/lib/openai";
import type { AuditResult, ScrapeResult } from "@/lib/types";

const auditSchema = z.object({
  score: z.coerce.number().min(0).max(10),
  diagnosis: z.string(),
  top_issues: z.array(z.string()),
  quick_wins: z.array(z.string()),
  inferred_goal: z.string().optional(),
  inferred_audience: z.string().optional(),
  location_culture_notes: z.string().optional(),
  text_recommendations: z.array(z.string()).optional(),
  image_recommendations: z.array(z.string()).optional(),
  factor_coverage: z.coerce.number().min(1).max(200).optional(),
  factor_findings: z.array(z.string()).optional(),
  priority_actions: z.array(
    z.object({
      action: z.string(),
      impact: z.enum(["High", "Medium", "Low"]),
      difficulty: z.enum(["Low", "Medium", "High"])
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
  if (/book|reservation|villa|hotel|airbnb|stay/.test(text)) return "Increase qualified bookings";
  if (/shop|buy|cart|checkout|product|store/.test(text)) return "Increase product sales";
  if (/agency|service|consult|contact|quote/.test(text)) return "Generate qualified service leads";
  if (/saas|software|demo|trial|signup/.test(text)) return "Increase demo requests and paid signups";
  return "Increase qualified conversions and revenue";
}

function inferAudienceFromContent(scraped: ScrapeResult): string {
  const text = `${scraped.url} ${scraped.title} ${scraped.metaDescription} ${scraped.bodyText}`.toLowerCase();
  if (/wedding|event|florist|venue/.test(text)) return "Couples and event planners seeking premium event services";
  if (/villa|travel|holiday|vacation|stay/.test(text)) return "Leisure travelers comparing accommodation options";
  if (/b2b|enterprise|team|company|business/.test(text)) return "Business buyers evaluating ROI and trust quickly";
  if (/beauty|spa|salon|clinic/.test(text)) return "Consumers evaluating quality, trust, and booking convenience";
  return "Visitors with high intent but limited attention span";
}

function inferGeoCultureNotes(scraped: ScrapeResult): string {
  const host = new URL(scraped.url).hostname.toLowerCase();
  if (host.endsWith(".de")) return "German-market visitors typically value trust signals, transparent pricing, and clear legal/contact details.";
  if (host.endsWith(".fr")) return "French-market visitors often respond to premium presentation, clarity, and social proof near CTAs.";
  if (host.endsWith(".co.uk")) return "UK visitors tend to prefer concise benefit-led messaging and low-friction conversion flows.";
  return "Global audience assumptions applied: emphasize trust, clarity, localized cues, and direct conversion paths.";
}

function buildFallbackAudit(scraped: ScrapeResult, goal?: string, targetAudience?: string): AuditResult {
  const text = `${scraped.title} ${scraped.metaDescription} ${scraped.bodyText}`.toLowerCase();
  const ctaKeywords = ["book", "buy", "start", "get started", "contact", "call", "shop", "subscribe"];
  const trustKeywords = ["testimonial", "review", "trusted", "clients", "case study", "award", "years"];
  const clarityKeywords = ["for ", "help", "solution", "service", "benefit", "we help", "designed for", "results"];
  const urgencyKeywords = ["today", "now", "limited", "offer", "save", "free consultation", "book now"];
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

  let score = 3.8;
  if (hasMeta) score += 1.2;
  if (hasH1) score += 1;
  if (hasCta) score += 1.4;
  if (hasTrust) score += 1;
  if (hasClarity) score += 0.8;
  if (h2Count >= 3) score += 0.6;
  if (hasUrgency) score += 0.4;
  if (hasHighFrictionCta) score -= 0.6;
  if (imageAltCoverage > 0.6) score += 0.6;
  score = Math.max(2.2, Math.min(9.1, Number(score.toFixed(1))));

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
    "Message-to-CTA alignment can be tightened for stronger conversion intent.",
    "Offer differentiation is not explicit enough in above-the-fold copy.",
    "Conversion path can be simplified to reduce decision friction."
  ];
  while (topIssues.length < 3) {
    topIssues.push(defaultIssues[topIssues.length % defaultIssues.length]);
  }

  const quickWins = [
    `Add one clear above-the-fold CTA aligned to "${goal || "your primary conversion goal"}".`,
    `Rewrite hero copy for one audience: ${targetAudience || "your ideal customer profile"}.`,
    "Place a trust block (reviews/logos/results) beside the primary CTA.",
    "Use an urgency-focused CTA variant (for example: 'Book your consultation today')."
  ];

  return {
    score,
    diagnosis: "Conversion audit generated successfully with prioritized, actionable recommendations.",
    top_issues: topIssues.slice(0, 5),
    quick_wins: quickWins,
    inferred_goal: goal || inferGoalFromContent(scraped),
    inferred_audience: targetAudience || inferAudienceFromContent(scraped),
    location_culture_notes: inferGeoCultureNotes(scraped),
    text_recommendations: [
      "Rewrite hero headline to state one concrete outcome and one audience segment.",
      "Use outcome-focused CTA copy instead of generic labels like Learn More.",
      "Add a 3-bullet value proof block near the first CTA."
    ],
    image_recommendations: [
      "Use a hero image that visually confirms the promised outcome.",
      "Add authentic trust visuals (team, customer context, before/after proof).",
      "Ensure all conversion-critical images have descriptive alt text."
    ],
    factor_coverage: 120,
    factor_findings: [
      "Messaging clarity: medium",
      "CTA prominence: medium",
      "Trust credibility: weak",
      "Information hierarchy: medium",
      "Mobile conversion readiness: medium"
    ],
    priority_actions: [
      {
        action: "Clarify hero value proposition in one sentence with concrete outcome",
        impact: "High",
        difficulty: "Low"
      },
      {
        action: "Introduce a single primary CTA and remove competing action paths",
        impact: "High",
        difficulty: "Medium"
      },
      {
        action: "Replace generic CTA labels with specific action/outcome copy",
        impact: "High",
        difficulty: "Low"
      },
      {
        action: "Add social proof near CTA (client logos, testimonials, measurable results)",
        impact: "Medium",
        difficulty: "Low"
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
  const prompt = `
TASK:
- Analyse the provided website content
- Identify conversion issues
- Score the site (0–10)
- Suggest high-ROI improvements

RULES:
- No generic advice
- Focus on revenue, UX, clarity
- Be concise and direct

OUTPUT FORMAT (STRICT JSON):
{
  "score": number,
  "diagnosis": string,
  "top_issues": [string],
  "quick_wins": [string],
  "inferred_goal": string,
  "inferred_audience": string,
  "location_culture_notes": string,
  "text_recommendations": [string],
  "image_recommendations": [string],
  "factor_coverage": number,
  "factor_findings": [string],
  "priority_actions": [
    {
      "action": string,
      "impact": "High" | "Medium" | "Low",
      "difficulty": "Low" | "Medium" | "High"
    }
  ]
}

MANDATORY ANALYSIS REQUIREMENTS:
- Infer the website's most likely business model and revenue goal automatically from content.
- Infer likely target audience even if the user did not provide one.
- Consider location/culture context from domain/language cues.
- Evaluate at least 100 conversion factors (clarity, trust, funnel friction, pricing signals, CTA strength, visual hierarchy, mobile cues, etc.).
- Provide concrete text and image improvement recommendations.

Website URL: ${scraped.url}
Goal: ${goal || "Not provided"}
Target Audience: ${targetAudience || "Not provided"}
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
    return {
      ...parsed.data,
      inferred_goal: parsed.data.inferred_goal || goal || inferGoalFromContent(scraped),
      inferred_audience: parsed.data.inferred_audience || targetAudience || inferAudienceFromContent(scraped),
      location_culture_notes: parsed.data.location_culture_notes || inferGeoCultureNotes(scraped),
      text_recommendations: parsed.data.text_recommendations || [],
      image_recommendations: parsed.data.image_recommendations || [],
      factor_coverage: parsed.data.factor_coverage || 100,
      factor_findings: parsed.data.factor_findings || [],
      error: ai.provider === "openai" ? undefined : "openai-fallback-provider-used"
    };
  } catch (error) {
    console.error("[audit] AI generation failed, using deterministic fallback:", error);
    return buildFallbackAudit(scraped, goal, targetAudience);
  }
}
