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
  const euro = (n: number) => `€${Math.round(n).toLocaleString()}`;
  const lossPct = audit.booking_loss_percent || audit.total_penalty_percent || 0;
  const revenueLow = audit.revenue_loss_yearly?.low || 0;
  const revenueHigh = audit.revenue_loss_yearly?.high || 0;
  const top3 = audit.impact_simulator?.top3_fixes_gain_yearly;
  const top5 = audit.impact_simulator?.top5_fixes_gain_yearly;

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
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Estimated Revenue Loss</p>
          <p className="mt-2 text-3xl font-bold text-rose-700">
            {euro(revenueLow)} - {euro(revenueHigh)} / year
          </p>
          <p className="mt-2 text-lg font-semibold text-slate-900">
            You are losing ~{lossPct}% of potential bookings
          </p>
          <ul className="mt-3 space-y-1 text-sm text-slate-700">
            {(audit.root_causes || []).slice(0, 3).map((cause) => (
              <li key={cause}>- Root cause: {cause}</li>
            ))}
          </ul>
        </div>

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
          <h2 className="mb-4 text-xl font-semibold">Top 5 Revenue Leaks</h2>
          <div className="space-y-4">
            {audit.evidence_insights.map((insight, idx) => (
              <div key={`${insight.issue}-${idx}`} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="font-semibold text-slate-900">{idx + 1}. {insight.issue}</p>
                <p className="mt-1 text-sm text-slate-700">- Evidence: {insight.evidence}</p>
                <p className="mt-1 text-sm text-rose-700">- Impact: -{insight.impact_percent}% conversion</p>
                <p className="mt-1 text-sm text-slate-700">- Why drop-off happens: {insight.why_it_matters}</p>
              </div>
            ))}
          </div>
        </div>

        <div className={card}>
          <h2 className="mb-4 text-xl font-semibold">Quick Wins (Money-First)</h2>
          <ul className="space-y-2 text-sm text-slate-700">
            {audit.quick_wins.map((win, idx) => (
              <li key={`${win}-${idx}`} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                {win}
              </li>
            ))}
          </ul>
        </div>

        <div className={card}>
          <h2 className="mb-4 text-xl font-semibold">Impact Simulator</h2>
          <div className="space-y-2 text-sm text-slate-700">
            <p>Fix top 3 issues {"->"} {top3 ? `${euro(top3.low)} - ${euro(top3.high)} / year` : "No evidence detected"}</p>
            <p>Fix top 5 issues {"->"} {top5 ? `${euro(top5.low)} - ${euro(top5.high)} / year` : "No evidence detected"}</p>
            <p className="font-medium">{audit.impact_simulator.summary}</p>
          </div>
        </div>

        <div className={card}>
          <h2 className="mb-4 text-xl font-semibold">Why You&apos;re Losing Bookings</h2>
          <ul className="space-y-2 text-sm text-slate-700">
            {(audit.why_losing_bookings || []).slice(0, 3).map((item) => (
              <li key={item}>- {item}</li>
            ))}
          </ul>
        </div>

        <div className={card}>
          <h2 className="mb-4 text-xl font-semibold">AI Recommendations (Cause {"->"} Effect {"->"} Fix)</h2>
          <ul className="space-y-2 text-sm text-slate-700">
            {audit.ai_recommendations.slice(0, 3).map((item) => (
              <li key={item} className="rounded-lg bg-slate-50 px-3 py-2">
                {item}
              </li>
            ))}
          </ul>
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
            {(audit.validation_checks || []).map((check) => (
              <li key={check}>- {check}</li>
            ))}
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
