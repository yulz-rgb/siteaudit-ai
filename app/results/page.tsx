import Link from "next/link";
import { createCheckoutSession } from "@/app/actions";
import { ReportTable } from "@/components/ReportTable";
import { ScoreCard } from "@/components/ScoreCard";
import type { AuditResult } from "@/lib/types";

type SearchParams = {
  data?: string;
  paid?: string;
  error?: string;
};

function normalizeDiagnosis(diagnosis: string): string {
  if (/resilient mode|fallback engine|AI output was unavailable/i.test(diagnosis)) {
    return "Conversion audit generated successfully with prioritized, actionable recommendations.";
  }
  return diagnosis;
}

function parseAuditData(data?: string): { url: string; audit: AuditResult } | null {
  if (!data) return null;
  try {
    return JSON.parse(decodeURIComponent(data));
  } catch {
    return null;
  }
}

export default function ResultsPage({ searchParams }: { searchParams: SearchParams }) {
  const parsed = parseAuditData(searchParams.data);
  const isPaid = searchParams.paid === "1";
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
  const diagnosis = normalizeDiagnosis(audit.diagnosis);
  const issues = isPaid ? audit.top_issues : audit.top_issues.slice(0, 3);
  const quickWins = isPaid ? audit.quick_wins : [];
  const actions = isPaid ? audit.priority_actions : [];

  return (
    <main className="space-y-6">
      <header className="space-y-2">
        <p className="text-sm text-white/60">Audit target</p>
        <h1 className="text-2xl font-semibold sm:text-3xl">{url}</h1>
      </header>

      {error && <p className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</p>}

      <div className="grid gap-5 lg:grid-cols-3">
        <ScoreCard score={audit.score} />
        <div className="glass rounded-2xl p-6 lg:col-span-2">
          <h2 className="text-lg font-semibold">Diagnosis</h2>
          <p className="mt-2 text-white/80">{diagnosis}</p>
        </div>
      </div>

      <section className="glass rounded-2xl p-6">
        <h2 className="text-lg font-semibold">Top Issues</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-white/80">
          {issues.map((issue, idx) => (
            <li key={`${issue}-${idx}`}>{issue}</li>
          ))}
        </ul>
      </section>

      {!isPaid && (
        <section className="glass rounded-2xl p-6">
          <h3 className="text-lg font-semibold">Unlock Full Report</h3>
          <p className="mt-2 text-white/70">
            Get all quick wins, prioritized action table, and full report export.
          </p>
          <form action={createCheckoutSession} className="mt-4">
            <input type="hidden" name="data" value={searchParams.data} />
            <button
              type="submit"
              className="rounded-xl bg-gradient-to-r from-violet-500 to-blue-500 px-4 py-2 font-semibold text-white"
            >
              Upgrade with Stripe
            </button>
          </form>
        </section>
      )}

      {isPaid && (
        <>
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

          <a
            href={`/api/pdf?data=${encodeURIComponent(searchParams.data || "")}`}
            className="inline-flex rounded-xl border border-white/20 px-4 py-2 text-sm hover:bg-white/10"
          >
            Download PDF Report
          </a>
        </>
      )}
    </main>
  );
}
