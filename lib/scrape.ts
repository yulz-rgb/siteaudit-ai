import { normalizeUrl, withTimeout } from "@/lib/utils";
import type { ScrapeResult } from "@/lib/types";

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

async function scrapeWithHtmlFetch(url: string): Promise<ScrapeResult> {
  const response = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    }
  });

  if (!response.ok) {
    throw new Error("Website scraping failed. The website may block automated access.");
  }

  const html = await response.text();
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

  const bodyText = cleanText($("body").text());
  if (bodyText.length < 30) {
    throw new Error("Could not extract enough page content.");
  }

  return {
    url,
    title: cleanText($("title").first().text()),
    metaDescription: cleanText($('meta[name="description"]').attr("content") ?? ""),
    bodyText,
    headings,
    images
  };
}

export async function scrapeHomepage(rawUrl: string): Promise<ScrapeResult> {
  const url = normalizeUrl(rawUrl);
  try {
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
      await page.close();
      await browser.close();
    }
  } catch {
    return scrapeWithHtmlFetch(url);
  }
}
