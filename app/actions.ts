"use server";

import { redirect } from "next/navigation";
import { scrapeHomepage } from "@/lib/scrape";
import { generateAudit } from "@/lib/audit";
import { getStripe } from "@/lib/stripe";
import { normalizeUrl } from "@/lib/utils";
import type { ScrapeResult } from "@/lib/types";

export async function runAudit(formData: FormData) {
  const url = String(formData.get("url") || "");
  const goal = String(formData.get("goal") || "");
  const targetAudience = String(formData.get("targetAudience") || "");

  let parsedUrl = "";
  try {
    parsedUrl = normalizeUrl(url);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid URL";
    redirect(`/results?error=${encodeURIComponent(message)}`);
  }

  try {
    let scraped: ScrapeResult;
    try {
      scraped = await scrapeHomepage(parsedUrl);
    } catch {
      // Never hard-fail the user flow on scrape instability.
      const hostname = new URL(parsedUrl).hostname;
      scraped = {
        url: parsedUrl,
        title: hostname,
        metaDescription: "",
        bodyText: `Homepage content could not be scraped for ${hostname}. Generate a best-effort conversion audit from the available context.`,
        headings: { h1: [], h2: [], h3: [] },
        images: []
      };
    }

    const audit = await generateAudit(scraped, goal, targetAudience);

    const payload = encodeURIComponent(
      JSON.stringify({
        url: parsedUrl,
        goal,
        targetAudience,
        audit
      })
    );

    redirect(`/results?data=${payload}`);
  } catch (error) {
    const maybeRedirect = error as { digest?: string };
    if (typeof maybeRedirect?.digest === "string" && maybeRedirect.digest.startsWith("NEXT_REDIRECT")) {
      throw error;
    }
    const message = "Audit failed. Please retry or try a different website.";
    redirect(`/results?error=${encodeURIComponent(message)}`);
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
