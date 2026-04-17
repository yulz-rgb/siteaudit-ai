import { describe, expect, it } from "vitest";
import { extractFromHtml } from "@/lib/scrape";

describe("extractFromHtml", () => {
  it("extracts key homepage fields", async () => {
    const result = await extractFromHtml(
      "https://example.com",
      `
      <html>
        <head>
          <title>Example Site</title>
          <meta name="description" content="Demo description" />
        </head>
        <body>
          <h1>Main Promise</h1>
          <h2>Feature One</h2>
          <h3>Detail</h3>
          <img src="/hero.png" alt="Hero image" />
          <p>Useful body content with enough words for extraction.</p>
        </body>
      </html>
      `
    );

    expect(result.title).toBe("Example Site");
    expect(result.metaDescription).toBe("Demo description");
    expect(result.headings.h1).toEqual(["Main Promise"]);
    expect(result.images[0]).toEqual({ src: "/hero.png", alt: "Hero image" });
    expect(result.structure.sectionCount).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(result.ctas)).toBe(true);
    expect(result.trustSignals.reviewCountDetected).toBeGreaterThanOrEqual(0);
    expect(result.media.imageCount).toBe(1);
    expect(result.bodyText.length).toBeGreaterThan(30);
  });
});
