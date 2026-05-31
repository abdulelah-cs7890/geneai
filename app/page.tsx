import { Studio } from "@/components/Studio";
import { config } from "@/lib/config";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-10">
      <header className="mb-10 text-center">
        <span className="inline-block rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/60">
          V2V meme studio · async GPU pipeline
        </span>
        <h1 className="mt-4 bg-gradient-to-r from-white to-white/60 bg-clip-text text-4xl font-bold tracking-tight text-transparent sm:text-5xl">
          GeneAI
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-white/50">
          Upload a driver clip, pick a character, and map the motion onto them — one click. Built on a real async job
          queue with a swappable serverless-GPU backend.
        </p>
      </header>

      <section className="rounded-3xl border border-white/10 bg-white/[0.02] p-6 sm:p-8">
        <Studio backend={config.compute} />
      </section>

      <HowItWorks />
    </main>
  );
}

function HowItWorks() {
  const steps = [
    { n: "1", t: "Ingest & gate", d: "Upload to blob storage, then an NSFW safety check runs before any GPU is touched." },
    { n: "2", t: "Normalize", d: "FFmpeg crops to 9:16, fixes fps, and hard-caps duration to bound GPU cost." },
    { n: "3", t: "Pose + V2V", d: "DWPose extracts the driver skeleton; a diffusion model transfers it to the character." },
    { n: "4", t: "Re-assemble", d: "Audio is re-muxed and overlays burned in; the final mp4 lands back in storage." },
  ];
  return (
    <section className="mt-12">
      <h2 className="text-center text-sm font-semibold uppercase tracking-widest text-white/40">How it works</h2>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((s) => (
          <div key={s.n} className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-fuchsia-500/15 text-sm font-bold text-fuchsia-300">
              {s.n}
            </div>
            <h3 className="mt-3 text-sm font-semibold text-white">{s.t}</h3>
            <p className="mt-1 text-xs leading-relaxed text-white/50">{s.d}</p>
          </div>
        ))}
      </div>
      <p className="mt-6 text-center text-xs text-white/30">
        Backends are env-swappable: local FFmpeg mock ↔ Modal GPU · file store ↔ Upstash Redis · disk ↔ Cloudflare R2.
      </p>
    </section>
  );
}
