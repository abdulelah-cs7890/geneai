/* eslint-disable @next/next/no-img-element -- static local gallery images */
import { Studio } from "@/components/Studio";
import EXAMPLES from "@/lib/examples.json";

const REPO = "https://github.com/abdulelah-cs7890/geneai";

export default function Home() {
  return (
    <>
      <TopNav />
      <main className="mx-auto w-full max-w-6xl flex-1 px-5 pt-28 pb-16 sm:px-8">
        <Hero />
        <section id="studio" className="mt-12 scroll-mt-28">
          <Studio />
        </section>
        <Examples />
        <HowItWorks />
      </main>
      <Footer />
    </>
  );
}

function TopNav() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 px-4 pt-4 sm:px-8">
      <div className="glass-panel mx-auto flex max-w-6xl items-center justify-between gap-4 rounded-full px-5 py-2.5 shadow-[0_20px_40px_rgba(0,0,0,0.3)]">
        <a href="#studio" className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">bolt</span>
          <span className="font-display text-lg font-bold tracking-tight text-on-surface">GeneAI</span>
        </a>
        <nav className="hidden items-center gap-7 text-sm text-on-surface/70 md:flex">
          <a href="#studio" className="font-medium text-on-surface">
            Studio
          </a>
          <a href="#examples" className="transition-colors hover:text-on-surface">
            Examples
          </a>
          <a href="#how-it-works" className="transition-colors hover:text-on-surface">
            How it works
          </a>
          <a href={REPO} target="_blank" rel="noreferrer" className="transition-colors hover:text-on-surface">
            GitHub
          </a>
        </nav>
        <a
          href="#studio"
          className="glow-primary rounded-full bg-primary px-5 py-2 text-sm font-bold text-on-primary transition hover:brightness-110 active:scale-95"
        >
          Generate
        </a>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="text-center">
      <span className="inline-flex items-center gap-2 rounded-full border border-secondary-container/30 bg-secondary-container/10 px-4 py-1.5 text-label-sm uppercase text-secondary-container">
        <span className="material-symbols-outlined text-[16px]">auto_awesome</span>
        AI image generator · FLUX
      </span>
      <h1 className="font-display mt-6 text-5xl font-bold tracking-tight sm:text-headline-xl">
        <span className="bg-gradient-to-r from-primary via-primary to-secondary-container bg-clip-text text-transparent">
          GeneAI
        </span>
      </h1>
      <p className="mx-auto mt-5 max-w-2xl text-body-lg text-on-surface/70">
        Type a prompt, get a high-quality AI image in seconds — on a real async job queue with swappable serverless
        backends. Free, no sign-up.
      </p>
    </section>
  );
}

function Examples() {
  return (
    <section id="examples" className="mt-24 scroll-mt-28">
      <h2 className="font-display text-center text-headline-lg">Examples</h2>
      <p className="mx-auto mt-3 max-w-xl text-center text-sm text-outline">
        Generated straight from a text prompt with FLUX — nothing but words in.
      </p>
      <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {EXAMPLES.map((e) => (
          <figure key={e.file} className="glass-card glass-card-hover overflow-hidden rounded-3xl">
            <img src={`/examples/${e.file}`} alt={e.prompt} className="aspect-square w-full object-cover" />
            <figcaption className="p-4 text-xs leading-relaxed text-outline">&ldquo;{e.prompt}&rdquo;</figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    { n: "1", icon: "edit", t: "Prompt", d: "Type what you want. A safety filter screens the prompt before anything runs." },
    { n: "2", icon: "auto_awesome", t: "Generate", d: "A FLUX model (Pollinations) renders your prompt into a high-resolution image." },
    { n: "3", icon: "cloud_done", t: "Store", d: "The result is saved to object storage with a stable, shareable URL." },
    { n: "4", icon: "sync", t: "Async queue", d: "A real job queue tracks each stage live — the same architecture scales to any model." },
  ];
  return (
    <section id="how-it-works" className="mt-24 scroll-mt-28">
      <h2 className="font-display text-center text-headline-lg">How it works</h2>
      <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((s) => (
          <div key={s.n} className="glass-card glass-card-hover relative rounded-3xl p-6 pt-8">
            <span className="glass-panel absolute -top-4 left-5 flex h-11 w-11 items-center justify-center rounded-full font-display font-bold text-primary">
              {s.n}
            </span>
            <span className="material-symbols-outlined text-2xl text-primary">{s.icon}</span>
            <h3 className="mt-3 font-display text-lg font-semibold text-on-surface">{s.t}</h3>
            <p className="mt-2 text-sm leading-relaxed text-outline">{s.d}</p>
          </div>
        ))}
      </div>
      <div className="glass-panel mt-10 rounded-3xl p-6 text-center">
        <p className="font-mono text-sm text-outline">
          <span className="text-primary">Pollinations FLUX</span> · job store{" "}
          <span className="text-secondary-container">Supabase ↔ Upstash</span> · storage{" "}
          <span className="text-secondary-container">disk ↔ Supabase / R2</span>.
        </p>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="glass-panel mt-auto flex flex-col items-center justify-between gap-4 px-6 py-8 sm:flex-row sm:px-12">
      <div className="text-center sm:text-left">
        <div className="font-display text-lg font-bold text-on-surface">GeneAI</div>
        <p className="text-label-sm text-outline">© 2026 GeneAI Image Studio</p>
      </div>
      <div className="flex items-center gap-6 text-sm text-outline">
        <a href={REPO} target="_blank" rel="noreferrer" className="transition-colors hover:text-on-surface">
          GitHub
        </a>
        <a href="#how-it-works" className="transition-colors hover:text-on-surface">
          How it works
        </a>
      </div>
    </footer>
  );
}
