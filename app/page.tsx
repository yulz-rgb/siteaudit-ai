import { runAudit } from "@/app/actions";

export default function HomePage() {
  return (
    <main className="-mx-4 -my-8 min-h-screen bg-[#f6f8fc] text-[#1f334f] sm:-mx-6 sm:-my-10">
      <header className="border-b border-[#e7ebf3] bg-white/80">
        <div className="mx-auto max-w-6xl px-6 py-6">
          <p className="text-3xl font-serif text-[#2f4461]">Villa Website Analyzer</p>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-10 px-6 py-16 lg:grid-cols-[1fr_0.95fr] lg:items-center">
        <div className="space-y-6">
          <h1 className="text-5xl font-bold leading-tight tracking-tight text-[#26456b] sm:text-6xl">
            Optimize Your Villa Website
          </h1>
          <p className="max-w-xl text-3xl leading-relaxed text-[#4e617b]">
            Get a comprehensive analysis of your villa rental website and improve your performance.
          </p>

          <form action={runAudit} className="max-w-xl">
            <input type="hidden" name="goal" value="Increase direct bookings and occupancy" />
            <input type="hidden" name="targetAudience" value="Families, couples, and groups planning premium villa stays" />
            <div className="flex overflow-hidden rounded-xl border border-[#d8dfeb] bg-white shadow-sm">
              <input
                id="url"
                name="url"
                type="text"
                placeholder="Paste your villa website URL"
                className="h-16 flex-1 px-5 text-2xl text-[#344863] placeholder:text-[#9aa7ba] focus:outline-none"
                required
              />
              <button
                type="submit"
                className="h-16 min-w-[230px] bg-gradient-to-r from-[#5b8ff0] to-[#3f7ee8] px-6 text-xl font-medium text-white transition hover:opacity-95"
              >
                Analyze Website
              </button>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <input name="nightlyPrice" type="number" min="0" step="1" placeholder="Nightly price (€)" className="h-12 rounded-lg border border-[#d8dfeb] px-3 text-sm text-[#344863] placeholder:text-[#9aa7ba]" />
              <input name="occupancyPercent" type="number" min="0" max="100" step="1" placeholder="Occupancy %" className="h-12 rounded-lg border border-[#d8dfeb] px-3 text-sm text-[#344863] placeholder:text-[#9aa7ba]" />
              <select name="platform" className="h-12 rounded-lg border border-[#d8dfeb] px-3 text-sm text-[#344863]">
                <option value="both">Direct + OTA</option>
                <option value="direct">Direct only</option>
                <option value="ota">OTA heavy</option>
              </select>
            </div>
          </form>
          <p className="text-xl text-[#6a7b93]">Instant, automated, and free analysis of your villa rental website.</p>
        </div>

        <div className="relative h-[380px] rounded-[42px] bg-gradient-to-br from-[#eef4ff] via-[#f6f9ff] to-[#eaf2ff] p-8 shadow-[0_25px_60px_rgba(60,94,152,0.18)]">
          <div className="absolute -left-10 top-10 h-24 w-24 rounded-full bg-[#8aa8e9]/30 blur-2xl" />
          <div className="absolute right-6 top-6 h-14 w-14 rounded-full bg-[#ffd98a]/50 blur-lg" />
          <div className="relative mx-auto mt-10 max-w-[520px] rounded-2xl border border-[#d6e2f8] bg-white shadow-[0_22px_50px_rgba(71,103,155,0.25)]">
            <div className="flex items-center gap-2 border-b border-[#eef3fb] px-4 py-3">
              <span className="h-2.5 w-2.5 rounded-full bg-[#ff8e8e]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#ffc97e]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#87d296]" />
            </div>
            <div className="space-y-4 p-5">
              <div className="h-6 w-1/2 rounded bg-[#edf3ff]" />
              <div className="h-40 rounded-xl bg-gradient-to-r from-[#dfeeff] to-[#c8dcff]" />
              <div className="grid grid-cols-3 gap-3">
                <div className="h-10 rounded bg-[#eef4ff]" />
                <div className="h-10 rounded bg-[#eef4ff]" />
                <div className="h-10 rounded bg-[#d9e7ff]" />
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
