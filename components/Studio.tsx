"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GENERATE_STAGES, stageIndexIn } from "@/lib/jobs/stage-meta";
import { isTerminal, type Aspect, type Job, type JobOptions, type JobStatus } from "@/lib/jobs/types";
import { ASPECTS, STYLE_PRESETS } from "@/lib/styles";

const POLL_MS = 1500;

const STAGE_ICON: Record<JobStatus, string> = {
  queued: "schedule",
  moderating: "shield",
  rejected: "block",
  generating: "auto_awesome",
  done: "check_circle",
  failed: "error",
};

const IDEAS = [
  "a grumpy orange cat wearing a tiny crown on a royal throne",
  "a shiba inu astronaut floating above earth, cinematic",
  "a frog DJ at a neon nightclub, 3d render",
  "a medieval knight riding a giant snail into battle",
];

export function Studio() {
  const [prompt, setPrompt] = useState("");
  const [options, setOptions] = useState<JobOptions>({ aspect: "1:1", style: "" });
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  async function submit() {
    if (!prompt.trim() || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim(), options }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Generation failed.");
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
    setJob(null);
    setError(null);
  }

  // ---- Result ------------------------------------------------------------
  if (job && job.status === "done" && job.result) {
    return <ResultView job={job} onReset={reset} />;
  }

  // ---- Tracking ----------------------------------------------------------
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
          {rejected ? "Blocked by the safety filter" : "Generation failed"}
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

  // ---- Compose -----------------------------------------------------------
  const ready = prompt.trim().length > 0 && !submitting;
  return (
    <div className="mx-auto max-w-3xl">
      <div className="glass-card rounded-3xl p-6 sm:p-8">
        <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-on-surface/80">
          <span className="material-symbols-outlined text-[18px] text-primary">edit</span>
          Describe your image
        </label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit();
          }}
          rows={3}
          maxLength={600}
          placeholder="a grumpy orange cat wearing a tiny crown on a royal throne…"
          className="w-full resize-none rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-on-surface placeholder:text-on-surface/30 focus:border-primary/50 focus:ring-0 focus:outline-none"
        />

        <div className="mt-3 flex flex-wrap gap-2">
          {IDEAS.map((idea) => (
            <button
              key={idea}
              onClick={() => setPrompt(idea)}
              className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-outline transition hover:border-primary/40 hover:text-on-surface"
            >
              {idea.length > 38 ? idea.slice(0, 38) + "…" : idea}
            </button>
          ))}
        </div>

        {/* Style presets */}
        <div className="mt-6">
          <div className="mb-2 text-label-sm uppercase text-outline">Style</div>
          <div className="flex flex-wrap gap-2">
            {STYLE_PRESETS.map((s) => {
              const active = options.style === s.id;
              return (
                <button
                  key={s.id || "none"}
                  onClick={() => setOptions((o) => ({ ...o, style: s.id }))}
                  className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                    active ? "bg-primary text-on-primary" : "border border-white/10 bg-white/[0.03] text-on-surface/70 hover:text-on-surface"
                  }`}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Aspect */}
        <div className="mt-5">
          <div className="mb-2 text-label-sm uppercase text-outline">Aspect</div>
          <div className="flex gap-2">
            {ASPECTS.map((a) => (
              <button
                key={a}
                onClick={() => setOptions((o) => ({ ...o, aspect: a as Aspect }))}
                className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition ${
                  options.aspect === a
                    ? "bg-secondary-container/20 text-secondary-container ring-1 ring-secondary-container/40"
                    : "border border-white/10 bg-white/[0.03] text-on-surface/70 hover:text-on-surface"
                }`}
              >
                <span
                  className={`inline-block rounded-[3px] border border-current ${
                    a === "1:1" ? "h-3 w-3" : a === "9:16" ? "h-3.5 w-2" : "h-2 w-3.5"
                  }`}
                />
                {a}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <p className="mx-auto mt-5 max-w-md rounded-2xl border border-error/30 bg-error/10 px-4 py-2.5 text-center text-sm text-error">
          {error}
        </p>
      )}

      <div className="mt-6 flex flex-col items-center gap-3">
        <button
          onClick={submit}
          disabled={!ready}
          className="glow-primary font-display inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-primary to-secondary-container px-10 py-4 text-lg font-bold text-on-primary transition enabled:hover:scale-[1.03] enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span className="material-symbols-outlined">auto_awesome</span>
          {submitting ? "Sending…" : "Generate"}
        </button>
        <p className="flex items-center gap-1.5 text-label-sm uppercase text-outline">
          <span className="material-symbols-outlined text-[14px]">bolt</span>
          FLUX · free, no sign-up
        </p>
      </div>
    </div>
  );
}

function Tracking({ job }: { job: Job }) {
  const current = stageIndexIn(GENERATE_STAGES, job.status);
  const lastLog = job.logs[job.logs.length - 1];
  return (
    <div className="glass-panel mx-auto max-w-xl rounded-3xl p-8">
      <div className="mb-8">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-display font-semibold text-on-surface">Generating…</span>
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
        {GENERATE_STAGES.filter((s) => s.status !== "done").map((stage, i) => {
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

      <p className="mt-6 truncate rounded-2xl bg-white/5 px-4 py-2.5 font-mono text-xs text-on-surface/50">
        {lastLog ? `› ${lastLog.message}` : "› working…"}
      </p>
    </div>
  );
}

function ResultView({ job, onReset }: { job: Job; onReset: () => void }) {
  return (
    <div className="glass-card mx-auto max-w-xl rounded-3xl p-6 sm:p-8">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={job.result!.url}
        alt={job.prompt}
        className="w-full rounded-2xl bg-black object-contain ring-2 ring-primary/50"
      />
      <p className="mt-4 text-center text-sm text-outline">&ldquo;{job.prompt}&rdquo;</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <a
          href={job.result!.url}
          download={`geneai-${job.id}.jpg`}
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
          New image
        </button>
      </div>
    </div>
  );
}
