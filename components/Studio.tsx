"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Dropzone } from "./Dropzone";
import { stageIndexIn, stagesFor } from "@/lib/jobs/stage-meta";
import { isTerminal, type Job, type JobMode, type JobOptions, type JobStatus } from "@/lib/jobs/types";

const POLL_MS = 1500;
const MAX_UPLOAD_MB = 60; // keep in sync with config.maxUploadBytes

const STAGE_ICON: Record<JobStatus, string> = {
  queued: "schedule",
  moderating: "shield",
  rejected: "block",
  normalizing: "crop",
  extracting_pose: "directions_run",
  generating: "auto_awesome",
  stitching: "auto_fix_high",
  done: "check_circle",
  failed: "error",
};

async function putFile(url: string, file: File): Promise<void> {
  const res = await fetch(url, { method: "PUT", headers: { "content-type": file.type }, body: file });
  if (!res.ok) throw new Error(`Direct upload failed (${res.status}).`);
}

export function Studio({ backend }: { backend: "mock" | "modal" }) {
  const [mode, setMode] = useState<JobMode>("faceswap");
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

  function switchMode(next: JobMode) {
    if (next === mode) return;
    setMode(next);
    setDriver(null);
    setCharacter(null);
    setError(null);
  }

  async function submit() {
    if (!driver || !character) return;
    setError(null);

    for (const f of [driver, character]) {
      if (f.size > MAX_UPLOAD_MB * 1024 * 1024) {
        setError(`"${f.name}" is over the ${MAX_UPLOAD_MB}MB limit.`);
        return;
      }
    }

    setSubmitting(true);
    try {
      // 1. Ask the server for presigned upload targets.
      const urlRes = await fetch("/api/upload-url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode,
          driverName: driver.name,
          driverType: driver.type,
          characterName: character.name,
          characterType: character.type,
        }),
      });
      const upload = await urlRes.json();
      if (!urlRes.ok) throw new Error(upload.error ?? "Could not start upload.");

      // 2. Upload both files straight to storage (never through the function).
      await Promise.all([putFile(upload.driver.putUrl, driver), putFile(upload.character.putUrl, character)]);

      // 3. Create the job from the uploaded keys.
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jobId: upload.jobId,
          mode,
          driverKey: upload.driver.key,
          characterKey: upload.character.key,
          driverName: driver.name,
          characterName: character.name,
          driverType: driver.type,
          characterType: character.type,
          options,
        }),
      });
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
    return <ResultView job={job} originalUrl={originalUrl} onReset={reset} />;
  }

  // ---- Tracking view -----------------------------------------------------
  if (job && job.status !== "rejected" && !isTerminal(job.status)) {
    return <Tracking job={job} />;
  }

  // ---- Rejected / failed -------------------------------------------------
  if (job && (job.status === "rejected" || job.status === "failed")) {
    const rejected = job.status === "rejected";
    return (
      <div className="glass-card mx-auto max-w-lg rounded-3xl p-10 text-center">
        <span className={`material-symbols-outlined text-5xl ${rejected ? "text-secondary-container" : "text-error"}`}>
          {rejected ? "shield" : "error"}
        </span>
        <h3 className="font-display mt-4 text-xl font-semibold text-on-surface">
          {rejected ? "Blocked by the safety gate" : "Generation failed"}
        </h3>
        <p className="mx-auto mt-2 max-w-md text-sm text-outline">
          {job.moderation?.reason ?? job.error ?? "Something went wrong."}
        </p>
        <button
          onClick={reset}
          className="mt-6 rounded-full bg-white/10 px-6 py-2.5 text-sm font-medium text-on-surface transition hover:bg-white/20"
        >
          Try again
        </button>
      </div>
    );
  }

  // ---- Upload / compose view --------------------------------------------
  const ready = driver && character && !submitting;
  const isFaceswap = mode === "faceswap";
  return (
    <div>
      <ModeTabs mode={mode} onChange={switchMode} />

      {isFaceswap ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-12">
          <div className="glass-card flex flex-col gap-5 rounded-3xl p-6 md:col-span-6">
            <StepHeader n="1" title="Base image" icon="image" accent="primary" />
            <Dropzone key="fs-base" label="Upload base photo" accept="image/*" kind="image" file={driver} onFile={setDriver} />
            <p className="text-xs text-outline">The photo to swap a face into.</p>
          </div>
          <div className="glass-card flex flex-col gap-5 rounded-3xl p-6 md:col-span-6">
            <StepHeader n="2" title="Face to swap in" icon="face" accent="secondary" />
            <Dropzone key="fs-face" label="Upload a face" accept="image/*" kind="image" file={character} onFile={setCharacter} />
            <p className="text-xs text-outline">This face gets placed onto the base photo.</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-12">
          <div className="glass-card flex flex-col gap-5 rounded-3xl p-6 md:col-span-6">
            <StepHeader n="1" title="Driver clip" icon="movie" accent="primary" />
            <Dropzone key="v2v-driver" label="Upload action video" accept="video/*" kind="video" file={driver} onFile={setDriver} />
            <div className="flex gap-4 text-xs text-outline">
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-sm">timer</span> ≤ 15s
              </span>
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-sm">database</span> ≤ 60MB
              </span>
              <span className="text-on-surface/30">· the motion to copy</span>
            </div>
          </div>
          <div className="glass-card flex flex-col gap-5 rounded-3xl p-6 md:col-span-6">
            <StepHeader n="2" title="Character" icon="face" accent="secondary" />
            <Dropzone key="v2v-char" label="Upload target face/body" accept="image/*" kind="image" file={character} onFile={setCharacter} />
            <p className="text-xs text-outline">The character to map the motion onto.</p>
          </div>
          <div className="glass-card rounded-3xl p-6 md:col-span-12">
            <StepHeader n="3" title="Style" icon="tune" accent="tertiary" />
            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
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
              <Toggle label="Watermark" desc="Required on the free tier" on locked required />
            </div>
          </div>
        </div>
      )}

      {error && (
        <p className="mx-auto mt-6 max-w-md rounded-2xl border border-error/30 bg-error/10 px-4 py-2.5 text-center text-sm text-error">
          {error}
        </p>
      )}

      <div className="mt-8 flex flex-col items-center gap-4">
        <button
          onClick={submit}
          disabled={!ready}
          className="glow-primary font-display inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-primary to-secondary-container px-10 py-4 text-lg font-bold text-on-primary transition enabled:hover:scale-[1.03] enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span className="material-symbols-outlined">{isFaceswap ? "swap_horiz" : "bolt"}</span>
          {submitting ? "Working…" : isFaceswap ? "Swap face" : "Generate meme"}
        </button>
        <p className="flex items-center gap-1.5 text-label-sm uppercase text-outline">
          <span className="material-symbols-outlined text-[14px]">{isFaceswap ? "smart_toy" : "terminal"}</span>
          {isFaceswap ? (
            <>Real AI · Hugging Face face-swap</>
          ) : (
            <>
              Compute: in-function FFmpeg <span className="font-mono text-on-surface/50">({backend})</span>
            </>
          )}
        </p>
      </div>
    </div>
  );
}

function ModeTabs({ mode, onChange }: { mode: JobMode; onChange: (m: JobMode) => void }) {
  const tabs: { id: JobMode; label: string; icon: string; sub: string }[] = [
    { id: "faceswap", label: "Face swap", icon: "swap_horiz", sub: "real AI" },
    { id: "v2v", label: "Motion", icon: "animation", sub: "preview" },
  ];
  return (
    <div className="mb-8 flex justify-center">
      <div className="glass-panel inline-flex gap-1 rounded-full p-1">
        {tabs.map((t) => {
          const active = mode === t.id;
          return (
            <button
              key={t.id}
              onClick={() => onChange(t.id)}
              className={`flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold transition ${
                active ? "bg-primary text-on-primary" : "text-on-surface/60 hover:text-on-surface"
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">{t.icon}</span>
              {t.label}
              <span className={`text-[10px] uppercase ${active ? "text-on-primary/70" : "text-outline"}`}>{t.sub}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StepHeader({
  n,
  title,
  icon,
  accent,
}: {
  n: string;
  title: string;
  icon: string;
  accent: "primary" | "secondary" | "tertiary";
}) {
  const badge =
    accent === "primary"
      ? "bg-primary/20 text-primary"
      : accent === "secondary"
        ? "bg-secondary-container/20 text-secondary-container"
        : "bg-tertiary/20 text-tertiary";
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <span className={`flex h-8 w-8 items-center justify-center rounded-full font-display font-bold ${badge}`}>
          {n}
        </span>
        <h3 className="font-display text-headline-md text-on-surface">{title}</h3>
      </div>
      <span className="material-symbols-outlined text-on-surface/30">{icon}</span>
    </div>
  );
}

function Toggle({
  label,
  desc,
  on,
  locked,
  required,
  onClick,
}: {
  label: string;
  desc: string;
  on: boolean;
  locked?: boolean;
  required?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={locked}
      className={`flex items-start gap-4 rounded-2xl border p-4 text-left transition ${
        on ? "border-primary/40 bg-primary/10" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
      } ${locked ? "cursor-not-allowed" : ""}`}
    >
      <span
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition ${
          on ? "border-primary bg-primary text-on-primary" : "border-white/30"
        }`}
      >
        {on && <span className="material-symbols-outlined text-[16px]">check</span>}
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-2">
          <span className="font-semibold text-on-surface">{label}</span>
          {required && (
            <span className="rounded-full bg-secondary-container/20 px-2 py-0.5 text-[10px] font-bold uppercase text-secondary-container">
              Required
            </span>
          )}
        </span>
        <span className="mt-0.5 block text-sm text-outline">{desc}</span>
      </span>
    </button>
  );
}

function Tracking({ job }: { job: Job }) {
  const stages = stagesFor(job.mode);
  const current = stageIndexIn(stages, job.status);
  const lastLog = job.logs[job.logs.length - 1];
  return (
    <div className="glass-panel mx-auto max-w-xl rounded-3xl p-8">
      <div className="mb-8">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-display font-semibold text-on-surface">
            {job.mode === "faceswap" ? "Swapping the face…" : "Generating your meme…"}
          </span>
          <span className="font-mono text-primary">{job.progress}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary to-secondary-container transition-all duration-500"
            style={{ width: `${job.progress}%` }}
          />
        </div>
      </div>

      <ol className="space-y-3">
        {stages
          .filter((s) => s.status !== "done")
          .map((stage, i) => {
            const state = i < current ? "done" : i === current ? "active" : "todo";
            return (
              <li key={stage.status} className="flex items-start gap-3">
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition ${
                    state === "done"
                      ? "bg-primary/20 text-primary"
                      : state === "active"
                        ? "bg-secondary-container/20 text-secondary-container"
                        : "bg-white/5 text-on-surface/30"
                  }`}
                >
                  <span className="material-symbols-outlined text-[18px]">
                    {state === "done" ? "check" : STAGE_ICON[stage.status]}
                  </span>
                </span>
                <div>
                  <div className={`text-sm font-medium ${state === "todo" ? "text-on-surface/40" : "text-on-surface"}`}>
                    {stage.label}
                  </div>
                  <div className="text-xs text-outline">{stage.hint}</div>
                </div>
              </li>
            );
          })}
      </ol>

      <p className="mt-6 rounded-2xl bg-white/5 px-4 py-2.5 font-mono text-xs text-on-surface/50">
        {lastLog ? `› ${lastLog.message}` : "› working…"}
      </p>
    </div>
  );
}

function ResultView({ job, originalUrl, onReset }: { job: Job; originalUrl: string | null; onReset: () => void }) {
  const isImage = (job.result?.contentType ?? "").startsWith("image");
  const aspect = isImage ? "aspect-square" : "aspect-[9/16]";
  return (
    <div className="glass-card mx-auto max-w-3xl rounded-3xl p-6 sm:p-8">
      <div className="grid gap-6 sm:grid-cols-2">
        <figure className="space-y-2">
          <figcaption className="text-label-sm uppercase text-outline">{isImage ? "Base" : "Original"}</figcaption>
          {originalUrl &&
            (isImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={originalUrl} alt="base" className={`${aspect} w-full rounded-2xl bg-black object-cover`} />
            ) : (
              <video src={originalUrl} controls loop className={`${aspect} w-full rounded-2xl bg-black object-cover`} />
            ))}
        </figure>
        <figure className="space-y-2">
          <figcaption className="text-label-sm uppercase text-primary">{isImage ? "Swapped" : "Meme"}</figcaption>
          {isImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={job.result!.url}
              alt="result"
              className={`${aspect} w-full rounded-2xl bg-black object-cover ring-2 ring-primary/50`}
            />
          ) : (
            <video
              src={job.result!.url}
              controls
              autoPlay
              loop
              className={`${aspect} w-full rounded-2xl bg-black object-cover ring-2 ring-primary/50`}
            />
          )}
        </figure>
      </div>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <a
          href={job.result!.url}
          download={`geneai-${job.id}${isImage ? "" : ".mp4"}`}
          className="glow-primary inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-primary to-secondary-container px-6 py-3 text-sm font-bold text-on-primary transition hover:brightness-110"
        >
          <span className="material-symbols-outlined text-[18px]">download</span>
          Download
        </a>
        <button
          onClick={onReset}
          className="inline-flex items-center gap-2 rounded-full bg-white/10 px-6 py-3 text-sm font-medium text-on-surface transition hover:bg-white/20"
        >
          <span className="material-symbols-outlined text-[18px]">refresh</span>
          Make another
        </button>
      </div>
    </div>
  );
}
