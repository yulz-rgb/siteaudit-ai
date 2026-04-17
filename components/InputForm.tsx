import { runAudit } from "@/app/actions";

export function InputForm() {
  return (
    <form action={runAudit} className="glass space-y-4 rounded-2xl p-5 sm:p-6">
      <div>
        <label htmlFor="url" className="mb-2 block text-sm text-white/80">
          Enter website URL
        </label>
        <input
          id="url"
          name="url"
          type="text"
          placeholder="https://example.com"
          className="w-full rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-white placeholder:text-white/40 focus:border-violet-400 focus:outline-none"
          required
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="goal" className="mb-2 block text-sm text-white/80">
            Goal (optional)
          </label>
          <input
            id="goal"
            name="goal"
            type="text"
            placeholder="Generate more demo bookings"
            className="w-full rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-white placeholder:text-white/40 focus:border-violet-400 focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="targetAudience" className="mb-2 block text-sm text-white/80">
            Target audience (optional)
          </label>
          <input
            id="targetAudience"
            name="targetAudience"
            type="text"
            placeholder="B2B SaaS founders"
            className="w-full rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-white placeholder:text-white/40 focus:border-violet-400 focus:outline-none"
          />
        </div>
      </div>

      <button
        type="submit"
        className="w-full rounded-xl bg-gradient-to-r from-violet-500 to-blue-500 px-4 py-3 font-semibold text-white transition hover:opacity-90"
      >
        Audit My Site
      </button>
    </form>
  );
}
