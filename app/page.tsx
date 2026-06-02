import { Studio } from "@/components/Studio";
import { config } from "@/lib/config";

const REPO = "https://github.com/abdulelah-cs7890/geneai";

export default function Home() {
  return (
    <>
      <TopNav />
      <main className="mx-auto w-full max-w-6xl flex-1 px-5 pt-28 pb-16 sm:px-8">
        <Hero />
        <section id="studio" className="mt-12 scroll-mt-28">
          <Studio backend={config.compute} />
        </section>
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
        <span className="material-symbols-outlined text-[16px]">graphic_eq</span>
        V2V meme studio · async pipeline
      </span>
      <h1 className="font-display mt-6 text-5xl font-bold tracking-tight sm:text-headline-xl">
        <span className="bg-gradient-to-r from-primary via-primary to-secondary-container bg-clip-text text-transparent">
          GeneAI
        </span>
      </h1>
      <p className="mx-auto mt-5 max-w-2xl text-body-lg text-on-surface/70">
        Upload a driver clip, pick a character, and map the motion onto them — one click. Built on a real async job
        queue with swappable serverless backends.
      </p>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    {
      n: "1",
      icon: "cloud_upload",
      t: "Ingest & gate",
      d: "Upload straight to blob storage, then an NSFW safety check runs before any compute is touched.",
    },
    {
      n: "2",
      icon: "crop",
      t: "Normalize",
      d: "FFmpeg crops to 9:16, fixes fps, and hard-caps duration to bound cost.",
    },
    {
      n: "3",
      icon: "auto_awesome",
      t: "Pose + V2V",
      d: "Driver motion is extracted and transferred onto the chosen character.",
    },
    {
      n: "4",
      icon: "movie",
      t: "Re-assemble",
      d: "Audio is re-muxed and overlays burned in; the final mp4 lands back in storage.",
    },
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
          Backends are env-swappable:{" "}
          <span className="text-primary">in-function FFmpeg ↔ Modal GPU</span> ·{" "}
          <span className="text-secondary-container">Supabase ↔ Upstash / R2</span>.
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
        <p className="text-label-sm text-outline">© 2026 GeneAI Meme Studio</p>
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
