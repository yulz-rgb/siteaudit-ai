import { z } from "zod";
import { chatJson } from "@/lib/openai";
import type { AuditResult, ScrapeResult } from "@/lib/types";

const auditSchema = z.object({
  score: z.number().min(0).max(10),
  diagnosis: z.string(),
  top_issues: z.array(z.string()),
  quick_wins: z.array(z.string()),
  priority_actions: z.array(
    z.object({
      action: z.string(),
      impact: z.enum(["High", "Medium", "Low"]),
      difficulty: z.enum(["Low", "Medium", "High"])
    })
  )
});

function buildFallbackAudit(scraped: ScrapeResult, goal?: string, targetAudience?: string): AuditResult {
  const text = `${scraped.title} ${scraped.metaDescription} ${scraped.bodyText}`.toLowerCase();
  const ctaKeywords = ["book", "buy", "start", "get started", "contact", "call", "shop", "subscribe"];
  const trustKeywords = ["testimonial", "review", "trusted", "clients", "case study", "award", "years"];
  const clarityKeywords = ["for ", "help", "solution", "service", "benefit"];

  const hasMeta = scraped.metaDescription.length > 30;
  const hasH1 = scraped.headings.h1.length > 0;
  const hasCta = ctaKeywords.some((word) => text.includes(word));
  const hasTrust = trustKeywords.some((word) => text.includes(word));
  const hasClarity = clarityKeywords.some((word) => text.includes(word));
  const imageAltCoverage =
    scraped.images.length === 0 ? 1 : scraped.images.filter((img) => img.alt.trim().length > 3).length / scraped.images.length;

  let score = 4;
  if (hasMeta) score += 1.2;
  if (hasH1) score += 1;
  if (hasCta) score += 1.4;
  if (hasTrust) score += 1;
  if (hasClarity) score += 0.8;
  if (imageAltCoverage > 0.6) score += 0.6;
  score = Math.max(2.5, Math.min(8.8, Number(score.toFixed(1))));

  const topIssues: string[] = [];
  if (!hasCta) topIssues.push("Primary call-to-action is not clearly visible in the homepage copy.");
  if (!hasTrust) topIssues.push("Trust signals (proof, testimonials, or authority markers) are weak or missing.");
  if (!hasMeta) topIssues.push("Meta description is weak, reducing click-through quality from search/social.");
  if (!hasH1) topIssues.push("No clear H1 hierarchy, which hurts message clarity and user orientation.");
  if (imageAltCoverage < 0.4) topIssues.push("Image alt text coverage is low, reducing accessibility and context.");
  if (topIssues.length === 0) topIssues.push("Message-to-CTA alignment can be tightened for stronger conversion intent.");

  const quickWins = [
    `Add one clear above-the-fold CTA aligned to "${goal || "your primary conversion goal"}".`,
    `Rewrite hero copy for one audience: ${targetAudience || "your ideal customer profile"}.`,
    "Place a trust block (reviews/logos/results) beside the primary CTA."
  ];

  return {
    score,
    diagnosis:
      "Automated conversion analysis generated successfully in resilient mode. Recommendations remain actionable and prioritized.",
    top_issues: topIssues.slice(0, 5),
    quick_wins: quickWins,
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
  "priority_actions": [
    {
      "action": string,
      "impact": "High" | "Medium" | "Low",
      "difficulty": "Low" | "Medium" | "High"
    }
  ]
}

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
    const parsed = auditSchema.safeParse(JSON.parse(ai.text));
    if (!parsed.success) throw new Error("Invalid AI JSON");
    return {
      ...parsed.data,
      error: ai.provider === "openai" ? undefined : "openai-fallback-provider-used"
    };
  } catch (error) {
    console.error("[audit] AI generation failed, using deterministic fallback:", error);
    return buildFallbackAudit(scraped, goal, targetAudience);
  }
}
