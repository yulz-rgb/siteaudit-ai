import { InputForm } from "@/components/InputForm";

export default function HomePage() {
  return (
    <main className="space-y-8">
      <section className="space-y-4 text-center">
        <p className="inline-flex rounded-full border border-white/20 px-3 py-1 text-xs text-white/70">
          Conversion Intelligence for founders
        </p>
        <h1 className="text-4xl font-semibold leading-tight sm:text-5xl">
          Fix your website.
          <br />
          Increase conversions instantly.
        </h1>
        <p className="mx-auto max-w-2xl text-white/70">
          Get an AI-powered homepage conversion audit in seconds, with clear revenue-focused actions you can ship
          immediately.
        </p>
        <p className="text-sm text-emerald-300/90">Full report currently free during beta.</p>
      </section>

      <InputForm />
    </main>
  );
}
