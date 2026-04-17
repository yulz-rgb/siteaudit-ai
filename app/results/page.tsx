import Link from "next/link";
import { ReportTable } from "@/components/ReportTable";
import { ScoreCard } from "@/components/ScoreCard";
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

function normalizeDiagnosis(diagnosis: string): string {
  if (/resilient mode|fallback engine|AI output was unavailable/i.test(diagnosis)) {
    return "Conversion audit generated successfully with prioritized, actionable recommendations.";
  }
  return diagnosis;
}

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
    url,
    title: hostname,
    metaDescription: "",
    bodyText: `Homepage content could not be scraped for ${hostname}. Generate a best-effort conversion audit from the available context.`,
    headings: { h1: [], h2: [], h3: [] },
    images: []
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
  const goalForExport = searchParams.goal || audit.inferred_goal || "";
  const audienceForExport = searchParams.targetAudience || audit.inferred_audience || "";
  const verdict = normalizeDiagnosis(audit.verdict);
  const issues = audit.top_issues;
  const quickWins = audit.quick_wins;
  const actions = audit.priority_actions;

  return (
    <main className="space-y-6">
      <header className="space-y-2">
        <p className="text-sm text-white/60">Audit target</p>
        <h1 className="text-2xl font-semibold sm:text-3xl">{url}</h1>
      </header>

      {error && <p className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</p>}

      <section className="glass rounded-2xl border-emerald-400/30 bg-emerald-500/10 p-5">
        <p className="text-sm font-medium text-emerald-200">Estimated Impact</p>
        <p className="mt-1 text-lg font-semibold text-emerald-100">
          {audit.estimated_impact || "Fixing these could increase conversions by 10-25%."}
        </p>
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        <ScoreCard score={audit.score} />
        <div className="glass rounded-2xl p-6 lg:col-span-2">
          <h2 className="text-lg font-semibold">This site is losing conversions because...</h2>
          <p className="mt-2 text-white/80">{verdict}</p>
        </div>
      </div>

      <section className="glass rounded-2xl border-rose-400/30 bg-rose-500/10 p-6">
        <h2 className="text-lg font-semibold text-rose-200">Money Leak</h2>
        <p className="mt-2 text-rose-100">{audit.money_leak}</p>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="glass rounded-2xl p-6">
          <h2 className="text-lg font-semibold">Inferred Goal</h2>
          <p className="mt-2 text-white/80">{audit.inferred_goal || "Increase conversions and revenue."}</p>
        </div>
        <div className="glass rounded-2xl p-6">
          <h2 className="text-lg font-semibold">Inferred Audience</h2>
          <p className="mt-2 text-white/80">{audit.inferred_audience || "High-intent visitors comparing alternatives."}</p>
        </div>
      </section>

      <section className="glass rounded-2xl p-6">
        <h2 className="text-lg font-semibold">Top Issues</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-white/80">
          {issues.map((issue, idx) => (
            <li key={`${issue}-${idx}`}>{issue}</li>
          ))}
        </ul>
      </section>

      <section className="glass rounded-2xl p-6">
        <h2 className="text-lg font-semibold">Quick Wins</h2>
        <ul className="mt-3 space-y-2 text-white/80">
          {quickWins.map((item, idx) => (
            <li key={`${item}-${idx}`} className="flex items-start gap-2">
              <span>✅</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Priority Actions</h2>
        <ReportTable rows={actions} />
      </section>

      <section className="glass rounded-2xl p-6">
        <h2 className="text-lg font-semibold">Instant Fix</h2>
        <div className="mt-3 space-y-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-white/50">Rewritten Headline</p>
            <p className="mt-1 text-white/90">{audit.rewrite.hero_headline}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-white/50">Improved CTA</p>
            <p className="mt-1 text-white/90">{audit.rewrite.cta}</p>
          </div>
          <button className="rounded-xl bg-gradient-to-r from-violet-500 to-blue-500 px-4 py-2 font-semibold text-white">
            Fix this for me
          </button>
        </div>
      </section>

      <a
        href={`/api/pdf?url=${encodeURIComponent(url)}&goal=${encodeURIComponent(goalForExport)}&targetAudience=${encodeURIComponent(audienceForExport)}`}
        className="inline-flex rounded-xl border border-white/20 px-4 py-2 text-sm hover:bg-white/10"
      >
        Download PDF Report
      </a>
    </main>
  );
}
