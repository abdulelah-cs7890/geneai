/**
 * Domain types for a V2V (video-to-video) meme generation job.
 *
 * A job moves through an explicit state machine so the UI can show honest,
 * stage-by-stage progress instead of a fake spinner. Full-body motion transfer
 * is slow (minutes on free GPU), so surfacing each stage is the whole UX.
 */

export type JobStatus =
  | "queued" // accepted, waiting for a worker
  | "moderating" // running the NSFW / safety gate before spending GPU
  | "rejected" // failed the safety gate; never reached the model
  | "normalizing" // FFmpeg crop/pad to 9:16, fps + duration cap
  | "extracting_pose" // DWPose/OpenPose skeleton extraction from the driver
  | "generating" // the heavy V2V diffusion step on the GPU worker
  | "stitching" // FFmpeg re-mux audio, burn watermark/subtitles
  | "done"
  | "failed";

/** A stored file (input or output) plus how to fetch it. */
export interface JobAsset {
  key: string; // storage-backend key (disk path fragment or R2 object key)
  url: string; // resolvable URL the browser can load
  contentType: string;
}

export interface JobOptions {
  /** Burn CapCut-style one-word subtitles into the output. */
  addSubtitles: boolean;
  /** Mix a hype audio drop under the original track. */
  addHypeAudio: boolean;
  /** Burn the "made with GeneAI" watermark (forced on for the free tier). */
  watermark: boolean;
}

export interface JobLogEntry {
  at: number;
  stage: JobStatus;
  message: string;
}

export interface ModerationResult {
  flagged: boolean;
  reason?: string;
  /** Highest unsafe-class score returned by the classifier, 0..1. */
  score?: number;
}

/**
 * What kind of generation a job runs:
 * - "v2v": driver video + character image → meme clip (mock/Modal pipeline).
 * - "faceswap": base image + source-face image → swapped image (real HF model).
 */
export type JobMode = "v2v" | "faceswap";

export interface Job {
  id: string;
  status: JobStatus;
  mode: JobMode;
  /** 0..100 across the whole pipeline, monotonically increasing. */
  progress: number;
  createdAt: number;
  updatedAt: number;

  // inputs (for faceswap: driverVideo = base image, characterImage = source face)
  driverVideo: JobAsset;
  characterImage: JobAsset;
  options: JobOptions;

  // which compute backend handled it (for the demo "how it works" panel)
  backend: "mock" | "modal" | "hfswap";

  // outputs / diagnostics
  result?: JobAsset;
  moderation?: ModerationResult;
  error?: string;
  logs: JobLogEntry[];
}

/** Coarse percentage milestones per stage, so progress feels truthful. */
export const STAGE_PROGRESS: Record<JobStatus, number> = {
  queued: 2,
  moderating: 8,
  rejected: 100,
  normalizing: 20,
  extracting_pose: 35,
  generating: 80,
  stitching: 95,
  done: 100,
  failed: 100,
};

export const TERMINAL_STATUSES: JobStatus[] = ["done", "failed", "rejected"];

export function isTerminal(status: JobStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}
