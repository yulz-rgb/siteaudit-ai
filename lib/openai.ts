import OpenAI from "openai";

export type AiProvider = "openai" | "anthropic";

function stripJsonMarkdown(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

export function getOpenAIClient() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }
  return new OpenAI({ apiKey: key });
}

export async function chatJson(prompt: string): Promise<{ text: string; provider: AiProvider }> {
  try {
    const client = getOpenAIClient();
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "You are a website conversion audit engine."
        },
        { role: "user", content: prompt }
      ]
    });
    return {
      text: stripJsonMarkdown(response.choices[0]?.message?.content ?? "{}"),
      provider: "openai"
    };
  } catch (openAiError) {
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) {
      throw new Error(
        `Primary AI provider failed (${openAiError instanceof Error ? openAiError.message : "unknown error"}) and Claude fallback is not configured.`
      );
    }

    const fallback = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1200,
        system: "You are a website conversion audit engine. Return strict JSON only.",
        messages: [{ role: "user", content: prompt }]
      })
    });

    if (!fallback.ok) {
      throw new Error(`Claude fallback failed with status ${fallback.status}.`);
    }

    const json = (await fallback.json()) as { content?: { type: string; text: string }[] };
    const text = json.content?.find((item) => item.type === "text")?.text ?? "{}";
    return { text: stripJsonMarkdown(text), provider: "anthropic" };
  }
}
