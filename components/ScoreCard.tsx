export function ScoreCard({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(10, score));
  const ring = clamped >= 7 ? "border-emerald-400" : clamped >= 4 ? "border-yellow-400" : "border-rose-400";

  return (
    <div className="glass rounded-2xl p-6">
      <p className="text-sm uppercase tracking-wide text-white/60">Conversion Score</p>
      <div className={`mt-4 inline-flex h-28 w-28 items-center justify-center rounded-full border-4 ${ring}`}>
        <span className="text-4xl font-bold">{clamped.toFixed(1)}</span>
      </div>
      <p className="mt-4 text-sm text-white/70">Score out of 10 based on clarity, trust, and conversion readiness.</p>
    </div>
  );
}
