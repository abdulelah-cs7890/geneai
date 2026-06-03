/**
 * Domain types for an AI image-generation job.
 *
 * A job moves through an explicit state machine so the UI can show honest,
 * stage-by-stage progress. Generation is a prompt → FLUX image (Pollinations).
 */

export type JobStatus =
  | "queued" // accepted, waiting to dispatch
  | "moderating" // prompt safety gate
  | "rejected" // failed the safety gate
  | "generating" // calling the FLUX model
  | "done"
  | "failed";

/** A stored file (the generated image) plus how to fetch it. */
export interface JobAsset {
  key: string; // storage-backend key
  url: string; // resolvable URL the browser can load
  contentType: string;
}

export type Aspect = "1:1" | "9:16" | "16:9";

export interface JobOptions {
  /** Output aspect ratio. */
  aspect: Aspect;
  /** Style preset id (e.g. "photoreal", "anime"); "" = none. */
  style: string;
}

export interface JobLogEntry {
  at: number;
  stage: JobStatus;
  message: string;
}

export interface ModerationResult {
  flagged: boolean;
  reason?: string;
  score?: number;
}

export interface Job {
  id: string;
  status: JobStatus;
  /** The text prompt that drives generation. */
  prompt: string;
  /** 0..100 across the pipeline, monotonically increasing. */
  progress: number;
  createdAt: number;
  updatedAt: number;

  options: JobOptions;
  /** Which compute backend handled it. */
  backend: "cloudflare" | "browser";

  /** Browser-fallback only: the image URL the client loads directly (its own IP). */
  clientUrl?: string;

  // outputs / diagnostics
  result?: JobAsset;
  moderation?: ModerationResult;
  error?: string;
  logs: JobLogEntry[];
}

/** Coarse percentage milestones per stage, so progress feels truthful. */
export const STAGE_PROGRESS: Record<JobStatus, number> = {
  queued: 4,
  moderating: 12,
  rejected: 100,
  generating: 65,
  done: 100,
  failed: 100,
};

export const TERMINAL_STATUSES: JobStatus[] = ["done", "failed", "rejected"];

export function isTerminal(status: JobStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}
