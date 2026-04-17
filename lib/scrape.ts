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

export async function scrapeHomepage(rawUrl: string): Promise<ScrapeResult> {
  const url = normalizeUrl(rawUrl);
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
  } catch {
    throw new Error("Website scraping failed. The website may block automated access.");
  } finally {
    await page.close();
    await browser.close();
  }
}
