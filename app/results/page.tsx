import Link from "next/link";
import { scrapeHomepage } from "@/lib/scrape";
import { generateAudit } from "@/lib/audit";
import type { AuditResult, ScrapeResult } from "@/lib/types";

type SearchParams = {
  data?: string;
  url?: string;
  goal?: string;
  targetAudience?: string;
  nightlyPrice?: string;
  occupancyPercent?: string;
  platform?: string;
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
  const nightlyPrice = Number(searchParams.nightlyPrice || "");
  const occupancyPercent = Number(searchParams.occupancyPercent || "");
  const platform = searchParams.platform || "both";
  let scraped: ScrapeResult;
  try {
    scraped = await scrapeHomepage(searchParams.url);
  } catch {
    scraped = fallbackScrape(searchParams.url);
  }
  const audit = await generateAudit(
    scraped,
    goal,
    targetAudience,
    Number.isFinite(nightlyPrice) ? nightlyPrice : undefined,
    Number.isFinite(occupancyPercent) ? occupancyPercent : undefined,
    platform
  );
  return { url: searchParams.url, audit };
}

function formatEur(value: number): string {
  return `€${Math.round(value).toLocaleString()}`;
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
  const penaltyPct = audit.total_penalty_percent || 0;
  const lossRatio = Math.min(100, Math.max(0, penaltyPct));
  const lossLow = audit.revenue_loss_yearly?.low || 0;
  const lossHigh = audit.revenue_loss_yearly?.high || 0;
  const currLow = audit.revenue_current_yearly?.low || 0;
  const currHigh = audit.revenue_current_yearly?.high || 0;
  const potLow = audit.revenue_potential_yearly?.low || 0;
  const potHigh = audit.revenue_potential_yearly?.high || 0;

  const top3Gain = audit.impact_simulator?.top3_fixes_gain_yearly?.high || 0;
  const top5Gain = Math.round((lossHigh * 0.75));
  const fullGain = lossHigh;
  const card = "bg-[#121821] rounded-2xl p-6 border border-[#1F2A37]";

  return (
    <div className="min-h-screen bg-[#0B0F14] text-white">
      <div className="mx-auto max-w-7xl space-y-8 px-6 py-8">
        <div className="flex items-center justify-between rounded-2xl border border-[#1F2A37] bg-[#121821] p-6">
          <div className="flex flex-col">
            <span className="text-sm text-gray-400">VillaAudit Score</span>
            <div className="flex items-baseline gap-3">
              <span className="text-4xl font-bold text-red-500">{audit.score_100}</span>
              <span className="text-xl text-gray-400">/ 100</span>
              <span className="text-sm text-red-500">↓ {audit.severity}</span>
            </div>
          </div>

          <div className="text-center">
            <div className="text-sm text-gray-400">Estimated Revenue Loss</div>
            <div className="text-3xl font-bold text-red-400">
              {formatEur(lossLow)} - {formatEur(lossHigh)} / year
            </div>
          </div>

          <a
            href={`/api/pdf?url=${encodeURIComponent(url)}&goal=${encodeURIComponent(goalForExport)}&targetAudience=${encodeURIComponent(audienceForExport)}`}
            className="rounded-xl bg-blue-600 px-6 py-3 font-semibold hover:bg-blue-700"
          >
            Fix My Website →
          </a>
        </div>

        {error && <p className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</p>}

        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-12 space-y-6 xl:col-span-8">
            <div className={card}>
              <h1 className="mb-3 text-2xl font-semibold">You are losing ~{lossRatio}% of potential bookings</h1>
              <ul className="space-y-2 text-gray-300">
                {audit.top_revenue_leaks.slice(0, 3).map((leak, i) => (
                  <li key={`${leak.issue}-${i}`}>• {leak.issue}</li>
                ))}
              </ul>
            </div>

            <div className={card}>
              <div className="mb-2 text-sm text-gray-400">Conversion Potential</div>
              <div className="flex h-4 w-full overflow-hidden rounded-full bg-gray-800">
                <div className="bg-blue-500" style={{ width: `${Math.max(1, 100 - lossRatio)}%` }} />
                <div className="bg-red-500" style={{ width: `${Math.max(1, lossRatio)}%` }} />
              </div>
              <div className="mt-2 flex justify-between text-sm text-gray-400">
                <span>Current: {Math.max(0, 100 - lossRatio)}%</span>
                <span>Lost: {lossRatio}%</span>
              </div>
            </div>

            <div className={card}>
              <h2 className="mb-4 text-xl font-semibold">Top 5 Revenue Leaks</h2>
              <div className="space-y-4">
                {audit.top_revenue_leaks.map((leak, i) => (
                  <div key={`${leak.issue}-${i}`} className="flex items-center justify-between border-b border-[#1F2A37] pb-3">
                    <div>
                      <div className="font-medium">{i + 1}. {leak.issue}</div>
                      <div className="text-sm text-gray-400">{leak.explanation}</div>
                    </div>
                    <div className="font-semibold text-red-400">-{leak.impact_percent}%</div>
                  </div>
                ))}
              </div>
            </div>

            <div className={card}>
              <h2 className="mb-4 text-xl font-semibold">Category Breakdown</h2>
              <div className="grid grid-cols-2 gap-4 text-center sm:grid-cols-5">
                {audit.category_breakdown.slice(0, 5).map((row) => (
                  <div key={row.category} className="rounded-xl bg-[#0B0F14] p-4">
                    <div className="text-sm text-gray-400">{row.category}</div>
                    <div className="text-xl font-semibold">{Math.round(row.percent)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="col-span-12 space-y-6 xl:col-span-4">
            <div className={card}>
              <h3 className="mb-4 text-lg font-semibold">Fastest Revenue Gains</h3>
              <ul className="space-y-3 text-sm">
                {audit.top_revenue_leaks.slice(0, 3).map((leak, i) => {
                  const gain = Math.round((lossHigh * leak.impact_percent) / Math.max(1, penaltyPct));
                  return (
                    <li key={`${leak.issue}-${i}`} className="flex justify-between">
                      <span>{leak.issue}</span>
                      <span className="text-green-400">+{formatEur(gain)}</span>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className={card}>
              <h3 className="mb-4 text-lg font-semibold">Impact Simulator</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span>Fix top 3 issues</span>
                  <span>+{formatEur(top3Gain)} / year</span>
                </div>
                <div className="flex justify-between">
                  <span>Fix top 5 issues</span>
                  <span>+{formatEur(top5Gain)} / year</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span>Full optimisation</span>
                  <span>+{formatEur(fullGain)} / year</span>
                </div>
              </div>
            </div>

            <div className={card}>
              <h3 className="mb-4 text-lg font-semibold">AI Recommendations</h3>
              <p className="text-sm text-gray-300">
                {(audit.ai_recommendations && audit.ai_recommendations[0]) || "Booking CTA visibility is too low across early scroll depth."}
                <br />
                <br />
                Fix: {(audit.ai_recommendations && audit.ai_recommendations[1]) || "Add a sticky “Check Availability” CTA on mobile and desktop."}
              </p>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <Link href="/" className="inline-flex rounded-xl border border-white/20 px-4 py-2 text-sm hover:bg-white/10">
            Analyze another website
          </Link>
        </div>
      </div>
    </div>
  );
}
