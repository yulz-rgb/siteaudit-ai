import { InputForm } from "@/components/InputForm";

export default function HomePage() {
  return (
    <main className="space-y-10">
      <section className="grid gap-8 lg:grid-cols-[1.1fr_1fr] lg:items-start">
        <div className="space-y-6">
          <p className="inline-flex rounded-full border border-emerald-300/25 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-200">
            Villa Booking Optimiser AI
          </p>
          <h1 className="text-4xl font-semibold leading-tight sm:text-5xl">
            Book more nights.
            <br />
            Lose fewer guests.
          </h1>
          <p className="max-w-2xl text-white/70">
            A booking-focused diagnostics engine for villa businesses. It pinpoints trust gaps, pricing confusion, and
            friction points that stop guests from completing reservations.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="glass rounded-2xl p-4">
              <p className="text-xs uppercase tracking-wide text-white/50">Primary user</p>
              <p className="mt-2 text-sm text-white/90">Villa owner</p>
            </div>
            <div className="glass rounded-2xl p-4">
              <p className="text-xs uppercase tracking-wide text-white/50">Secondary user</p>
              <p className="mt-2 text-sm text-white/90">Property manager</p>
            </div>
            <div className="glass rounded-2xl p-4">
              <p className="text-xs uppercase tracking-wide text-white/50">Outcome</p>
              <p className="mt-2 text-sm text-white/90">Higher occupancy</p>
            </div>
          </div>
        </div>
        <div>
          <InputForm />
        </div>
      </section>
    </main>
  );
}
