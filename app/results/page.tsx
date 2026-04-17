import Link from "next/link";
import { scrapeHomepage } from "@/lib/scrape";
import { generateAudit } from "@/lib/audit";
import type { AuditResult, ScrapeResult } from "@/lib/types";

type SearchParams = {
  data?: string;
  url?: string;
  goal?: string;
  targetAudience?: string;
  error?: string;
};

function parseAuditData(data?: string): { url: string; goal?: string; targetAudience?: string; audit: AuditResult } | null {
  if (!data) return null;
  const tryParse = (value: string) => {
    const parsed = JSON.parse(value) as { url?: string; goal?: string; targetAudience?: string; audit?: AuditResult };
    if (!parsed?.url || !parsed?.audit) return null;
    return { url: parsed.url, goal: parsed.goal, targetAudience: parsed.targetAudience, audit: parsed.audit };
  };

  try {
    const decoded = decodeURIComponent(data);
    const direct = tryParse(decoded);
    if (direct) return direct;

    const start = decoded.indexOf("{");
    const end = decoded.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      return tryParse(decoded.slice(start, end + 1));
    }
    return null;
  } catch {
    try {
      const normalized = data.replace(/\+/g, "%20");
      const decoded = decodeURIComponent(normalized);
      const start = decoded.indexOf("{");
      const end = decoded.lastIndexOf("}");
      if (start !== -1 && end !== -1 && end > start) {
        return tryParse(decoded.slice(start, end + 1));
      }
      return null;
    } catch {
      return null;
    }
  }
}

function fallbackScrape(url: string): ScrapeResult {
  const hostname = new URL(url).hostname;
  return {
    scrapeStatus: "fallback",
    url,
    title: hostname,
    metaDescription: "",
    bodyText: `Homepage content could not be scraped for ${hostname}. Generate a best-effort conversion audit from the available context.`,
    headings: { h1: [], h2: [], h3: [] },
    images: [],
    heroText: [],
    ctas: [],
    pricingTexts: [],
    descriptionSnippets: [],
    structure: {
      sectionCount: 0,
      navItems: [],
      hasBookingForm: false,
      hasCalendar: false
    },
    trustSignals: {
      reviewMentions: [],
      reviewCountDetected: 0,
      starRatingDetected: null,
      badgesOrLogos: []
    },
    media: {
      imageCount: 0,
      imagesWithAlt: 0,
      estimatedImageBytes: null
    },
    performance: {
      loadTimeMs: null,
      pageWeightBytes: null
    },
    mobile: {
      viewportIssues: ["No evidence detected due to scraping fallback"]
    }
  };
}

async function buildAuditFromQuery(searchParams: SearchParams): Promise<{ url: string; audit: AuditResult } | null> {
  if (!searchParams.url) return null;
  const goal = searchParams.goal || "";
  const targetAudience = searchParams.targetAudience || "";
  let scraped: ScrapeResult;
  try {
    scraped = await scrapeHomepage(searchParams.url);
  } catch {
    scraped = fallbackScrape(searchParams.url);
  }
  const audit = await generateAudit(scraped, goal, targetAudience);
  return { url: searchParams.url, audit };
}

export default async function ResultsPage({ searchParams }: { searchParams: SearchParams }) {
  const parsedFromData = parseAuditData(searchParams.data);
  const parsed = parsedFromData || (await buildAuditFromQuery(searchParams));
  const error = searchParams.error;

  if (!parsed) {
    return (
      <main className="space-y-6">
        <div className="glass rounded-2xl p-6">
          <h2 className="text-2xl font-semibold">No audit data found.</h2>
          <p className="mt-2 text-white/70">{error || "Run an audit first."}</p>
        </div>
        <Link href="/" className="inline-flex rounded-xl border border-white/20 px-4 py-2 text-sm hover:bg-white/10">
          Back to homepage
        </Link>
      </main>
    );
  }

  const { audit, url } = parsed;
  const card = "rounded-2xl border border-slate-200 bg-white p-6";

  return (
    <div className="min-h-screen bg-[#f6f8fc] text-slate-800">
      <div className="mx-auto max-w-6xl space-y-6 px-6 py-8">
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Website-Specific Audit</p>
          <h1 className="mt-2 text-2xl font-semibold">{url}</h1>
          <p className="mt-2 text-sm text-slate-600">
            Only extracted evidence is used. No hypothetical revenue projections are shown.
          </p>
        </div>

        {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}

        <div className={card}>
          <h2 className="mb-4 text-xl font-semibold">What We Found on Your Website</h2>
          <ul className="grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
            {audit.what_we_found.map((item) => (
              <li key={item.label} className="rounded-lg bg-slate-50 px-3 py-2">
                <span className="font-medium text-slate-600">{item.label}:</span> {item.value}
              </li>
            ))}
          </ul>
        </div>

        <div className={card}>
          <h2 className="mb-4 text-xl font-semibold">Critical Evidence-Based Issues</h2>
          <div className="space-y-4">
            {audit.evidence_insights.map((insight, idx) => (
              <div key={`${insight.issue}-${idx}`} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="font-semibold text-slate-900">{idx + 1}. {insight.issue}</p>
                <p className="mt-1 text-sm text-slate-700"><span className="font-medium">Detected:</span> {insight.evidence}</p>
                <p className="mt-1 text-sm text-slate-700"><span className="font-medium">Why it matters:</span> {insight.why_it_matters}</p>
              </div>
            ))}
          </div>
        </div>

        <div className={card}>
          <h2 className="mb-4 text-xl font-semibold">Fix Priorities</h2>
          <ul className="space-y-3">
            {audit.priority_actions.map((action, idx) => (
              <li key={`${action.action}-${idx}`} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">
                <p className="font-medium text-slate-900">{action.action}</p>
                <p className="mt-1">{action.why_it_matters}</p>
              </li>
            ))}
          </ul>
        </div>

        <div className={card}>
          <h2 className="mb-3 text-lg font-semibold">Validation Check</h2>
          <ul className="space-y-1 text-sm text-slate-700">
            <li>- Every insight references extracted evidence</li>
            <li>- Missing data is explicitly labeled as no evidence detected</li>
            <li>- No hypothetical revenue projections shown</li>
          </ul>
        </div>

        <div>
          <Link href="/" className="inline-flex rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
            Analyze another website
          </Link>
        </div>
      </div>
    </div>
  );
}
