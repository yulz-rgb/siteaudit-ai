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
    .slice(0, 20)
    .toArray()
    .map((el) => ({
      src: $(el).attr("src") ?? "",
      alt: $(el).attr("alt") ?? ""
    }));

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
    url,
    title,
    metaDescription,
    bodyText: finalBodyText,
    headings,
    images
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
  const page = await browser.newPage();

  try {
    await withTimeout(page.goto(url, { waitUntil: "domcontentloaded" }), 8000);

    const payload = await page.evaluate(() => {
      const metaDescription =
        document.querySelector('meta[name="description"]')?.getAttribute("content")?.trim() ?? "";

      const getText = (selector: string) =>
        Array.from(document.querySelectorAll(selector))
          .map((node) => node.textContent?.trim() ?? "")
          .filter(Boolean);

      const images = Array.from(document.querySelectorAll("img"))
        .slice(0, 20)
        .map((img) => ({
          src: img.getAttribute("src") ?? "",
          alt: img.getAttribute("alt") ?? ""
        }));

      return {
        title: document.title ?? "",
        metaDescription,
        bodyText: document.body?.innerText?.trim() ?? "",
        headings: {
          h1: getText("h1"),
          h2: getText("h2"),
          h3: getText("h3")
        },
        images
      };
    });

    if (!payload.bodyText || payload.bodyText.length < 30) {
      throw new Error("Could not extract enough page content.");
    }

    return { url, ...payload };
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
