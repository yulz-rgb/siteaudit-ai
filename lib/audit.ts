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
    const raw = await chatJson(prompt);
    const parsed = auditSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) throw new Error("Invalid AI JSON");
    return parsed.data;
  } catch {
    return {
      score: 0,
      diagnosis: "Audit failed due to an AI processing error.",
      top_issues: ["Could not generate full audit."],
      quick_wins: ["Retry in a moment."],
      priority_actions: [
        {
          action: "Retry audit request",
          impact: "Medium",
          difficulty: "Low"
        }
      ],
      error: "AI processing failed"
    };
  }
}
