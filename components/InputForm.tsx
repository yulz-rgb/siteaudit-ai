import { runAudit } from "@/app/actions";

export function InputForm() {
  return (
    <form action={runAudit} className="glass space-y-5 rounded-3xl p-5 sm:p-7">
      <div>
        <label htmlFor="url" className="mb-2 block text-sm font-medium text-white/85">
          Villa website URL
        </label>
        <input
          id="url"
          name="url"
          type="text"
          placeholder="https://your-villa-site.com"
          className="w-full rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-white placeholder:text-white/40 focus:border-indigo-400 focus:outline-none"
          required
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="goal" className="mb-2 block text-sm font-medium text-white/85">
            What is your goal?
          </label>
          <input
            id="goal"
            name="goal"
            type="text"
            placeholder="Increase direct bookings this season"
            className="w-full rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-white placeholder:text-white/40 focus:border-indigo-400 focus:outline-none"
            required
          />
        </div>
        <div>
          <label htmlFor="targetAudience" className="mb-2 block text-sm font-medium text-white/85">
            Target audience (optional)
          </label>
          <input
            id="targetAudience"
            name="targetAudience"
            type="text"
            placeholder="Families, couples, or group retreats"
            className="w-full rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-white placeholder:text-white/40 focus:border-indigo-400 focus:outline-none"
          />
        </div>
      </div>

      <button
        type="submit"
        className="w-full rounded-xl bg-gradient-to-r from-indigo-500 via-violet-500 to-emerald-500 px-4 py-3 font-semibold text-white transition hover:opacity-90"
      >
        Diagnose My Booking Funnel
      </button>
    </form>
  );
}
