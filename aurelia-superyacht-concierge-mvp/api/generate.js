const MODEL = "anthropic/claude-sonnet-4.6";

function fallback(input) {
  return {
    mode: "setup",
    executiveRecommendation: `Live research for ${input.destination || "this destination"} on ${input.date || "the selected date"} is not enabled. Do not present weather, events, venue availability or logistics as verified.`,
    requiredSetup: ["Enable Vercel AI Gateway on the Vercel project", "Or set AI_GATEWAY_API_KEY", "Regenerate before using with guests"],
    safeNextSteps: ["Confirm yacht position and tender landing", "Confirm guest dietary and cultural restrictions", "Call venues or yacht agent before presenting bookings"],
    guestFacingMessage: "Today’s programme is being finalised and will be shared once all live arrangements are confirmed."
  };
}

function buildPrompt(input) {
  return `Act as the world's top superyacht concierge and yacht agent. Create a live-researched UHNW charter day brief. Do not invent current facts. Verify weather, sea temperature, events, closures, restaurants, logistics and dress codes using web search. Apply the three decisive filters: operational feasibility, privacy/safety/discretion, and contingency recovery.

Destination: ${input.destination || "not supplied"}
Yacht location: ${input.yachtLocation || "not supplied"}
Date: ${input.date || "not supplied"}
Timing: ${input.timing || "not supplied"}
Guest profile: ${input.guests || "not supplied"}
Diet/health/privacy: ${input.needs || "not supplied"}
Existing itinerary: ${input.itinerary || "not supplied"}
Interests/dislikes: ${input.interests || "not supplied"}
Uploaded text: ${input.uploadedText || "none"}

Return JSON with: executiveRecommendation, guestFit, liveConditions, three itineraryOptions, restaurants, logistics, packing, risks, contingencies, confirmationChecklist, guestFacingMessage, sources, assumptions.`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const input = req.body || {};
  const token = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN;
  if (!token) return res.status(200).json(fallback(input));

  try {
    const response = await fetch("https://ai-gateway.vercel.sh/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 5000,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages: [{ role: "user", content: buildPrompt(input) }]
      })
    });
    if (!response.ok) return res.status(200).json({ ...fallback(input), gatewayError: await response.text() });
    const data = await response.json();
    const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
    res.status(200).json({ mode: "ai", text, raw: data });
  } catch (error) {
    res.status(200).json({ ...fallback(input), error: error.message });
  }
}
