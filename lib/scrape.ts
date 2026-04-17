import { normalizeUrl, withTimeout } from "@/lib/utils";
import type { ScrapeResult } from "@/lib/types";

const SCRAPE_ERROR_MESSAGE = "Website scraping failed. The website may block automated access.";
const DEFAULT_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

async function launchBrowser() {
  const { chromium } = await import("playwright");
  const isVercel = Boolean(process.env.VERCEL);

  if (isVercel) {
    const chromiumBinary = (await import("@sparticuz/chromium")).default;

    return chromium.launch({
      args: chromiumBinary.args,
      executablePath: await chromiumBinary.executablePath(),
      headless: true
    });
  }

  return chromium.launch({ headless: true });
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values.map(cleanText).filter(Boolean)));
}

function firstSnippets(text: string, limit = 3): string[] {
  return dedupe(
    text
      .split(/[\n\.!?]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 40 && s.length < 220)
      .slice(0, limit)
  );
}

export async function extractFromHtml(url: string, html: string): Promise<ScrapeResult> {
  const { load } = await import("cheerio");
  const $ = load(html);

  const headings = {
    h1: $("h1")
      .slice(0, 10)
      .toArray()
      .map((el) => cleanText($(el).text()))
      .filter(Boolean),
    h2: $("h2")
      .slice(0, 20)
      .toArray()
      .map((el) => cleanText($(el).text()))
      .filter(Boolean),
    h3: $("h3")
      .slice(0, 20)
      .toArray()
      .map((el) => cleanText($(el).text()))
      .filter(Boolean)
  };

  const images = $("img")
    .slice(0, 40)
    .toArray()
    .map((el) => ({
      src: $(el).attr("src") ?? "",
      alt: $(el).attr("alt") ?? ""
    }));

  const ctaSelectors = "a, button, input[type='submit'], [role='button']";
  const ctas = $(ctaSelectors)
    .slice(0, 50)
    .toArray()
    .map((el) => cleanText($(el).text() || $(el).attr("value") || ""))
    .filter((txt) => /book|reserve|availability|contact|inquire|enquire|check|call|get started/i.test(txt))
    .slice(0, 20)
    .map((text) => ({ text, selector: "unknown", aboveFold: false }));

  const pricingTexts = dedupe(
    $("body")
      .text()
      .match(/(€\s?\d[\d,\.]*|\$\s?\d[\d,\.]*|\bfrom\s+€?\$?\s?\d[\d,\.]*|\bper night\b|\bnightly\b)/gi) || []
  ).slice(0, 15);

  const navItems = $("nav a")
    .slice(0, 20)
    .toArray()
    .map((el) => cleanText($(el).text()))
    .filter(Boolean);

  const reviewMentions = dedupe(
    ($("body")
      .text()
      .match(/\b(review|reviews|testimonial|testimonials|guest rating|rated)\b/gi) || []).slice(0, 20)
  );
  const starMatch = $("body")
    .text()
    .match(/([0-5](?:\.\d)?)\s*\/\s*5|([0-5](?:\.\d)?)\s*stars?/i);
  const starRatingDetected = starMatch ? Number((starMatch[1] || starMatch[2] || "").trim()) : null;
  const badgeLike = dedupe(
    $("img,svg,[class*='badge'],[class*='logo']")
      .slice(0, 40)
      .toArray()
      .map((el) => cleanText($(el).attr("alt") || $(el).attr("aria-label") || $(el).attr("class") || ""))
      .filter((txt) => /badge|logo|award|verified|trusted|tripadvisor|booking\.com|airbnb|superhost/i.test(txt))
  ).slice(0, 12);

  const title = cleanText($("title").first().text());
  const metaDescription = cleanText($('meta[name="description"]').attr("content") ?? "");
  const bodyText = cleanText($("body").text());
  const synthesizedBody = [title, metaDescription, ...headings.h1, ...headings.h2, ...headings.h3]
    .map(cleanText)
    .filter(Boolean)
    .join(" ");
  const finalBodyText = bodyText.length >= 30 ? bodyText : synthesizedBody;

  if (!finalBodyText) {
    throw new Error("Could not extract enough page content.");
  }

  return {
    scrapeStatus: "html",
    url,
    title,
    metaDescription,
    bodyText: finalBodyText,
    headings,
    images,
    heroText: dedupe([headings.h1[0] || "", $("main p").first().text(), $("header p").first().text()]).slice(0, 3),
    ctas,
    pricingTexts,
    descriptionSnippets: firstSnippets(finalBodyText, 4),
    structure: {
      sectionCount: $("section").length || $("main > div").length || 0,
      navItems,
      hasBookingForm:
        $("form").toArray().some((el) => /book|reserve|arrival|departure|check[- ]?in|check[- ]?out|guest/i.test($(el).text())) ||
        /check[- ]?in|check[- ]?out|book now|reserve/i.test(finalBodyText),
      hasCalendar: /calendar|availability|check[- ]?in|check[- ]?out/i.test(finalBodyText)
    },
    trustSignals: {
      reviewMentions,
      reviewCountDetected:
        Number(
          (
            $("body")
              .text()
              .match(/(\d+)\s*(reviews?|testimonials?)/i)?.[1] || "0"
          ).trim()
        ) || reviewMentions.length,
      starRatingDetected,
      badgesOrLogos: badgeLike
    },
    media: {
      imageCount: images.length,
      imagesWithAlt: images.filter((img) => cleanText(img.alt).length > 0).length,
      estimatedImageBytes: null
    },
    performance: {
      loadTimeMs: null,
      pageWeightBytes: Buffer.byteLength(html, "utf8")
    },
    mobile: {
      viewportIssues: $('meta[name="viewport"]').length ? [] : ["No viewport meta tag detected"]
    }
  };
}

async function scrapeWithHtmlFetch(url: string): Promise<ScrapeResult> {
  const variants = Array.from(
    new Set([url, url.replace(/^https:\/\//i, "http://"), url.replace(/^http:\/\//i, "https://")])
  );

  for (const variant of variants) {
    try {
      const response = await withTimeout(
        fetch(variant, {
          headers: { "user-agent": DEFAULT_UA },
          redirect: "follow"
        }),
        9000
      );

      if (!response.ok) continue;
      const html = await response.text();
      return extractFromHtml(variant, html);
    } catch {
      continue;
    }
  }

  throw new Error(SCRAPE_ERROR_MESSAGE);
}

async function scrapeWithPlaywright(url: string): Promise<ScrapeResult> {
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  try {
    await withTimeout(page.goto(url, { waitUntil: "domcontentloaded" }), 8000);
    await page.waitForTimeout(1200);

    const payload = await page.evaluate(() => {
      const metaDescription =
        document.querySelector('meta[name="description"]')?.getAttribute("content")?.trim() ?? "";

      const getText = (selector: string) =>
        Array.from(document.querySelectorAll(selector))
          .map((node) => node.textContent?.trim() ?? "")
          .filter(Boolean);

      const images = Array.from(document.querySelectorAll("img"))
        .slice(0, 60)
        .map((img) => ({
          src: img.getAttribute("src") ?? "",
          alt: img.getAttribute("alt") ?? ""
        }));

      const ctaCandidates = Array.from(document.querySelectorAll("a, button, input[type='submit'], [role='button']"))
        .map((el) => {
          const text = (el.textContent || (el as HTMLInputElement).value || "").replace(/\s+/g, " ").trim();
          const rect = (el as HTMLElement).getBoundingClientRect();
          const selector = (el as HTMLElement).tagName.toLowerCase();
          return { text, selector, aboveFold: rect.top < window.innerHeight };
        })
        .filter((cta) => /book|reserve|availability|contact|inquire|enquire|call|check|start/i.test(cta.text))
        .slice(0, 25);

      const pageText = document.body?.innerText || "";
      const pricingTexts = Array.from(
        new Set(pageText.match(/(€\s?\d[\d,\.]*|\$\s?\d[\d,\.]*|\bfrom\s+€?\$?\s?\d[\d,\.]*|\bper night\b|\bnightly\b)/gi) || [])
      ).slice(0, 15);

      const heroText = Array.from(document.querySelectorAll("header h1, main h1, [class*='hero'] h1, [class*='hero'] p"))
        .map((el) => el.textContent?.replace(/\s+/g, " ").trim() || "")
        .filter(Boolean)
        .slice(0, 5);

      const navItems = Array.from(document.querySelectorAll("nav a"))
        .map((el) => el.textContent?.replace(/\s+/g, " ").trim() || "")
        .filter(Boolean)
        .slice(0, 25);

      const reviewMentions = Array.from(
        new Set((pageText.match(/\b(review|reviews|testimonial|testimonials|guest rating|rated)\b/gi) || []).slice(0, 20))
      );
      const reviewCountMatch = pageText.match(/(\d+)\s*(reviews?|testimonials?)/i);
      const starMatch = pageText.match(/([0-5](?:\.\d)?)\s*\/\s*5|([0-5](?:\.\d)?)\s*stars?/i);
      const starRatingDetected = starMatch ? Number((starMatch[1] || starMatch[2] || "").trim()) : null;

      const badgesOrLogos = Array.from(document.querySelectorAll("img,svg,[class*='badge'],[class*='logo']"))
        .map((el) => {
          const alt = el.getAttribute("alt") || "";
          const aria = el.getAttribute("aria-label") || "";
          const cls = el.getAttribute("class") || "";
          return `${alt} ${aria} ${cls}`.replace(/\s+/g, " ").trim();
        })
        .filter((txt) => /badge|logo|award|verified|trusted|tripadvisor|booking\.com|airbnb|superhost/i.test(txt))
        .slice(0, 20);

      const forms = Array.from(document.querySelectorAll("form")).map((f) => f.innerText.toLowerCase());
      const hasBookingForm = forms.some((f) => /book|reserve|arrival|departure|check[- ]?in|check[- ]?out|guest/.test(f));
      const hasCalendar = /calendar|availability|check[- ]?in|check[- ]?out/.test(pageText.toLowerCase());

      const sections = document.querySelectorAll("section").length;
      const snippets = (pageText.split(/[\n\.!?]/).map((s) => s.trim()).filter((s) => s.length > 40 && s.length < 220)).slice(0, 6);
      const viewportMeta = document.querySelector('meta[name="viewport"]');
      const mobileIssues: string[] = [];
      if (!viewportMeta) mobileIssues.push("No viewport meta tag detected");
      const tooWide = Array.from(document.querySelectorAll<HTMLElement>("body *")).some((el) => el.scrollWidth > window.innerWidth + 20);
      if (tooWide) mobileIssues.push("Detected horizontal overflow risk on mobile width");

      return {
        title: document.title ?? "",
        metaDescription,
        bodyText: document.body?.innerText?.trim() ?? "",
        headings: {
          h1: getText("h1"),
          h2: getText("h2"),
          h3: getText("h3")
        },
        images,
        heroText,
        ctas: ctaCandidates,
        pricingTexts,
        descriptionSnippets: snippets,
        structure: {
          sectionCount: sections,
          navItems,
          hasBookingForm,
          hasCalendar
        },
        trustSignals: {
          reviewMentions,
          reviewCountDetected: reviewCountMatch ? Number(reviewCountMatch[1]) : reviewMentions.length,
          starRatingDetected,
          badgesOrLogos
        },
        media: {
          imageCount: images.length,
          imagesWithAlt: images.filter((img) => (img.alt || "").trim().length > 0).length,
          estimatedImageBytes: null
        },
        mobile: {
          viewportIssues: mobileIssues
        }
      };
    });

    const perf = await page.evaluate(() => {
      const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      const resources = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
      const pageWeightBytes = resources.reduce((sum, r) => sum + (r.transferSize || r.encodedBodySize || 0), 0);
      return {
        loadTimeMs: nav ? Math.round(nav.loadEventEnd || nav.domComplete || 0) : null,
        pageWeightBytes: pageWeightBytes || null,
        estimatedImageBytes: resources
          .filter((r) => r.initiatorType === "img")
          .reduce((sum, r) => sum + (r.transferSize || r.encodedBodySize || 0), 0) || null
      };
    });

    if (!payload.bodyText || payload.bodyText.length < 30) {
      throw new Error("Could not extract enough page content.");
    }

    return {
      scrapeStatus: "rendered",
      url,
      ...payload,
      performance: {
        loadTimeMs: perf.loadTimeMs,
        pageWeightBytes: perf.pageWeightBytes
      },
      media: {
        ...payload.media,
        estimatedImageBytes: perf.estimatedImageBytes
      }
    };
  } finally {
    await page.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}

export async function scrapeHomepage(rawUrl: string): Promise<ScrapeResult> {
  const url = normalizeUrl(rawUrl);

  try {
    // On Vercel, try fetch parsing first for speed/reliability, then fallback to Playwright.
    if (process.env.VERCEL && process.env.FORCE_PLAYWRIGHT !== "1") {
      try {
        return await scrapeWithHtmlFetch(url);
      } catch {
        return await scrapeWithPlaywright(url);
      }
    }
    return await scrapeWithPlaywright(url);
  } catch {
    return scrapeWithHtmlFetch(url);
  }
}
