"use server";

import { redirect } from "next/navigation";
import { getStripe } from "@/lib/stripe";
import { normalizeUrl } from "@/lib/utils";

export async function runAudit(formData: FormData) {
  const url = String(formData.get("url") || "");
  const goal = String(formData.get("goal") || "").trim();
  const targetAudience = String(formData.get("targetAudience") || "");

  let parsedUrl = "";
  if (!goal) {
    redirect(`/results?error=${encodeURIComponent("Please provide your goal so the audit can be tailored.")}`);
  }
  try {
    parsedUrl = normalizeUrl(url);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid URL";
    redirect(`/results?error=${encodeURIComponent(message)}`);
  }

  try {
    // Keep URL params small and stable; compute heavy audit server-side on results page.
    const query = new URLSearchParams({
      url: parsedUrl,
      goal,
      targetAudience
    });
    redirect(`/results?${query.toString()}`);
  } catch (error) {
    const maybeRedirect = error as { digest?: string };
    if (typeof maybeRedirect?.digest === "string" && maybeRedirect.digest.startsWith("NEXT_REDIRECT")) {
      throw error;
    }
    redirect(`/results?error=${encodeURIComponent("Audit failed. Please retry in a moment.")}`);
  }
}

export async function createCheckoutSession(formData: FormData) {
  const data = String(formData.get("data") || "");
  const stripe = getStripe();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const priceId = process.env.STRIPE_PRICE_ID;

  if (!priceId) {
    redirect(`/results?data=${encodeURIComponent(data)}&error=${encodeURIComponent("STRIPE_PRICE_ID missing.")}`);
  }

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appUrl}/results?data=${encodeURIComponent(data)}&paid=1`,
    cancel_url: `${appUrl}/results?data=${encodeURIComponent(data)}`
  });

  if (session.url) redirect(session.url);
  redirect(`/results?data=${encodeURIComponent(data)}&error=${encodeURIComponent("Unable to create checkout session.")}`);
}
