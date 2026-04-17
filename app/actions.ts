"use server";

import { redirect } from "next/navigation";
import { scrapeHomepage } from "@/lib/scrape";
import { generateAudit } from "@/lib/audit";
import { getStripe } from "@/lib/stripe";
import { normalizeUrl } from "@/lib/utils";
import type { ScrapeResult } from "@/lib/types";

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
    const safeUrl = parsedUrl || url || "unknown-site";
    const fallbackPayload = encodeURIComponent(
      JSON.stringify({
        url: safeUrl,
        goal,
        targetAudience,
        audit: {
          score: 3.4,
          verdict: "This site is underperforming because the conversion path is unclear from the first screen.",
          money_leak: "Revenue is leaking when visitors cannot quickly connect offer value to a clear next action.",
          estimated_impact: "Fixing these could increase conversions by 12-26%.",
          top_issues: [
            "Automated crawl did not return full homepage content.",
            "Core messaging and CTA hierarchy could not be fully verified.",
            "Trust and clarity signals may need manual review."
          ],
          quick_wins: [
            "Add one clear above-the-fold CTA tied to your primary goal.",
            "Tighten headline and subheadline to one audience and one promise.",
            "Add trust proof near CTA (logos, metrics, testimonials)."
          ],
          rewrite: {
            hero_headline: "Turn more visitors into customers with a clear, specific value promise.",
            cta: "Get My Conversion Plan"
          },
          priority_actions: [
            {
              action: "Clarify value proposition in hero section",
              impact: "High",
              difficulty: "Low",
              why_it_matters: "Users decide in seconds whether your offer is relevant."
            },
            {
              action: "Improve CTA contrast and placement",
              impact: "High",
              difficulty: "Low",
              why_it_matters: "More users will enter the conversion flow instead of bouncing."
            },
            {
              action: "Add social proof near conversion points",
              impact: "Medium",
              difficulty: "Low",
              why_it_matters: "Trust signals reduce hesitation before action."
            }
          ],
          inferred_goal: goal,
          inferred_audience: targetAudience || "High-intent visitors evaluating alternatives"
        }
      })
    );
    redirect(`/results?data=${fallbackPayload}&error=${encodeURIComponent("Limited data mode: fallback report generated.")}`);
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
