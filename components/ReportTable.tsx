import type { PriorityAction } from "@/lib/types";

export function ReportTable({ rows }: { rows: PriorityAction[] }) {
  return (
    <div className="glass overflow-hidden rounded-3xl">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-white/10 bg-white/5 text-white/75">
          <tr>
            <th className="px-4 py-3 font-medium">Priority Action</th>
            <th className="px-4 py-3 font-medium">Impact</th>
            <th className="px-4 py-3 font-medium">Difficulty</th>
            <th className="px-4 py-3 font-medium">Why</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={`${row.action}-${idx}`} className="border-b border-white/8 transition hover:bg-white/[0.03] last:border-b-0">
              <td className="px-4 py-3 text-white/90">{row.action}</td>
              <td className="px-4 py-3 text-white/70">{row.impact}</td>
              <td className="px-4 py-3 text-white/70">{row.difficulty}</td>
              <td className="px-4 py-3 text-white/70">{row.why_it_matters}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
