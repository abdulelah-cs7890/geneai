"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Dropzone } from "./Dropzone";
import { PIPELINE_STAGES, stageIndex } from "@/lib/jobs/stage-meta";
import { isTerminal, type Job, type JobOptions } from "@/lib/jobs/types";

const POLL_MS = 1500;

export function Studio({ backend }: { backend: "mock" | "modal" }) {
  const [driver, setDriver] = useState<File | null>(null);
  const [character, setCharacter] = useState<File | null>(null);
  const [options, setOptions] = useState<JobOptions>({
    addSubtitles: false,
    addHypeAudio: false,
    watermark: true,
  });
  const [job, setJob] = useState<Job | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  async function submit() {
    if (!driver || !character) return;
    setError(null);
    setSubmitting(true);
    try {
      const body = new FormData();
      body.append("driver", driver);
      body.append("character", character);
      body.append("options", JSON.stringify(options));
      const res = await fetch("/api/jobs", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed.");

      setOriginalUrl(URL.createObjectURL(driver));
      setJob(data.job);
      if (!isTerminal(data.job.status)) startPolling(data.job.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  function startPolling(id: string) {
    stopPolling();
    pollRef.current = setInterval(async () => {
      const res = await fetch(`/api/jobs/${id}`, { cache: "no-store" });
      if (!res.ok) return;
      const { job: next } = await res.json();
      setJob(next);
      if (isTerminal(next.status)) stopPolling();
    }, POLL_MS);
  }

  function reset() {
    stopPolling();
    if (originalUrl) URL.revokeObjectURL(originalUrl);
    setOriginalUrl(null);
    setJob(null);
    setDriver(null);
    setCharacter(null);
    setError(null);
  }

  // ---- Result view -------------------------------------------------------
  if (job && job.status === "done" && job.result) {
    return (
      <ResultView job={job} originalUrl={originalUrl} onReset={reset} />
    );
  }

  // ---- Tracking view -----------------------------------------------------
  if (job && job.status !== "rejected" && !isTerminal(job.status)) {
    return <Tracking job={job} backend={backend} />;
  }

  // ---- Rejected / failed -------------------------------------------------
  if (job && (job.status === "rejected" || job.status === "failed")) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-8 text-center">
        <div className="text-4xl">{job.status === "rejected" ? "🛡️" : "⚠️"}</div>
        <h3 className="mt-3 text-lg font-semibold text-red-200">
          {job.status === "rejected" ? "Blocked by the safety gate" : "Generation failed"}
        </h3>
        <p className="mx-auto mt-2 max-w-md text-sm text-white/60">
          {job.moderation?.reason ?? job.error ?? "Something went wrong."}
        </p>
        <button onClick={reset} className="mt-5 rounded-lg bg-white/10 px-5 py-2 text-sm font-medium hover:bg-white/20">
          Try another clip
        </button>
      </div>
    );
  }

  // ---- Upload / compose view --------------------------------------------
  const ready = driver && character && !submitting;
  return (
    <div className="grid gap-6 md:grid-cols-[1fr_1fr_1.1fr]">
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-white/80">1 · Driver clip</h3>
        <Dropzone label="Upload action video" accept="video/*" kind="video" file={driver} onFile={setDriver} />
        <p className="text-xs text-white/40">≤ 15s, ≤ 60MB. The motion to copy.</p>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-white/80">2 · Character</h3>
        <Dropzone label="Upload target face/body" accept="image/*" kind="image" file={character} onFile={setCharacter} />
        <p className="text-xs text-white/40">The character to map the motion onto.</p>
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-white/80">3 · Style</h3>
        <div className="space-y-2">
          <Toggle
            label="Flashing subtitles"
            desc="CapCut-style one-word bursts"
            on={options.addSubtitles}
            onClick={() => setOptions((o) => ({ ...o, addSubtitles: !o.addSubtitles }))}
          />
          <Toggle
            label="Hype audio drop"
            desc="Mix a bass drop under the clip"
            on={options.addHypeAudio}
            onClick={() => setOptions((o) => ({ ...o, addHypeAudio: !o.addHypeAudio }))}
          />
          <Toggle label="Watermark" desc="Required on the free tier" on locked />
        </div>

        {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>}

        <button
          onClick={submit}
          disabled={!ready}
          className="w-full rounded-xl bg-gradient-to-r from-fuchsia-500 to-violet-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-fuchsia-500/20 transition enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? "Uploading…" : "⚡ Generate meme"}
        </button>
        <p className="text-center text-xs text-white/40">
          Compute backend: <span className="font-mono text-white/70">{backend}</span>
          {backend === "mock" && " (set MODAL_ENDPOINT_URL for real V2V)"}
        </p>
      </div>
    </div>
  );
}

function Toggle({
  label,
  desc,
  on,
  locked,
  onClick,
}: {
  label: string;
  desc: string;
  on: boolean;
  locked?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={locked}
      className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition ${
        on ? "border-fuchsia-400/50 bg-fuchsia-500/10" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
      } ${locked ? "cursor-not-allowed opacity-70" : ""}`}
    >
      <span>
        <span className="block text-sm font-medium text-white">{label}</span>
        <span className="block text-xs text-white/40">{desc}</span>
      </span>
      <span
        className={`relative h-5 w-9 rounded-full transition ${on ? "bg-fuchsia-500" : "bg-white/20"}`}
        aria-hidden
      >
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${on ? "left-4" : "left-0.5"}`} />
      </span>
    </button>
  );
}

function Tracking({ job, backend }: { job: Job; backend: "mock" | "modal" }) {
  const current = stageIndex(job.status);
  const lastLog = job.logs[job.logs.length - 1];
  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-6">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-medium text-white">Generating your meme…</span>
          <span className="font-mono text-white/60">{job.progress}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full bg-gradient-to-r from-fuchsia-500 to-violet-500 transition-all duration-500"
            style={{ width: `${job.progress}%` }}
          />
        </div>
      </div>

      <ol className="space-y-3">
        {PIPELINE_STAGES.filter((s) => s.status !== "done").map((stage, i) => {
          const state = i < current ? "done" : i === current ? "active" : "todo";
          return (
            <li key={stage.status} className="flex items-start gap-3">
              <span
                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${
                  state === "done"
                    ? "bg-emerald-500/20 text-emerald-300"
                    : state === "active"
                      ? "bg-fuchsia-500/20 text-fuchsia-200"
                      : "bg-white/5 text-white/30"
                }`}
              >
                {state === "done" ? "✓" : state === "active" ? "●" : i + 1}
              </span>
              <div>
                <div className={`text-sm ${state === "todo" ? "text-white/40" : "text-white"}`}>{stage.label}</div>
                <div className="text-xs text-white/40">{stage.hint}</div>
              </div>
            </li>
          );
        })}
      </ol>

      <p className="mt-6 rounded-lg bg-white/5 px-3 py-2 font-mono text-xs text-white/50">
        {lastLog ? `› ${lastLog.message}` : "› working…"}
        {backend === "mock" && <span className="text-white/30"> (mock backend — instant-ish)</span>}
      </p>
    </div>
  );
}

function ResultView({ job, originalUrl, onReset }: { job: Job; originalUrl: string | null; onReset: () => void }) {
  return (
    <div>
      <div className="grid gap-6 sm:grid-cols-2">
        <figure className="space-y-2">
          <figcaption className="text-xs font-medium uppercase tracking-wide text-white/40">Original</figcaption>
          {originalUrl && (
            <video src={originalUrl} controls loop className="aspect-[9/16] w-full rounded-xl bg-black object-cover" />
          )}
        </figure>
        <figure className="space-y-2">
          <figcaption className="text-xs font-medium uppercase tracking-wide text-fuchsia-300">Meme</figcaption>
          <video
            src={job.result!.url}
            controls
            autoPlay
            loop
            className="aspect-[9/16] w-full rounded-xl bg-black object-cover ring-2 ring-fuchsia-500/40"
          />
        </figure>
      </div>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <a
          href={job.result!.url}
          download={`geneai-${job.id}.mp4`}
          className="rounded-xl bg-gradient-to-r from-fuchsia-500 to-violet-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-fuchsia-500/20 hover:brightness-110"
        >
          ⬇ Download
        </a>
        <button onClick={onReset} className="rounded-xl bg-white/10 px-6 py-3 text-sm font-medium hover:bg-white/20">
          Make another
        </button>
      </div>
    </div>
  );
}
