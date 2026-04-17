import { InputForm } from "@/components/InputForm";

export default function HomePage() {
  return (
    <main className="space-y-10">
      <section className="space-y-5 text-center">
        <p className="inline-flex rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs text-white/70">
          Villa Booking Optimiser AI
        </p>
        <h1 className="text-4xl font-semibold leading-tight sm:text-5xl">
          Turn villa visitors
          <br />
          into confirmed bookings.
        </h1>
        <p className="mx-auto max-w-3xl text-white/70">
          Diagnose exactly where your website loses guests, revenue, and trust. Get a conversion plan tailored to
          villa owners, managers, and hospitality teams.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <article className="glass rounded-2xl p-5 text-left">
          <p className="text-sm font-medium text-indigo-200">For Villa Owners</p>
          <p className="mt-2 text-sm text-white/70">Increase direct bookings and reduce reliance on marketplaces.</p>
        </article>
        <article className="glass rounded-2xl p-5 text-left">
          <p className="text-sm font-medium text-indigo-200">For Property Managers</p>
          <p className="mt-2 text-sm text-white/70">Identify friction across guest journeys and improve occupancy.</p>
        </article>
        <article className="glass rounded-2xl p-5 text-left">
          <p className="text-sm font-medium text-indigo-200">For Hospitality Marketers</p>
          <p className="mt-2 text-sm text-white/70">Prioritize high-impact conversion improvements backed by strategy.</p>
        </article>
      </section>

      <InputForm />
    </main>
  );
}
