import type { JobStatus } from "./types";

/**
 * Client-safe presentation metadata for the pipeline timeline. Kept separate
 * from the store so it never drags Node-only imports into the browser bundle.
 */
export interface StageMeta {
  status: JobStatus;
  label: string;
  hint: string;
}

export const PIPELINE_STAGES: StageMeta[] = [
  { status: "moderating", label: "Safety gate", hint: "NSFW / content check before any GPU spend" },
  { status: "normalizing", label: "Normalize 9:16", hint: "FFmpeg crop, pad, fps + duration cap" },
  { status: "extracting_pose", label: "Pose extraction", hint: "DWPose skeleton from the driver" },
  { status: "generating", label: "Motion transfer", hint: "V2V diffusion on the GPU worker" },
  { status: "stitching", label: "Re-assemble", hint: "Re-mux audio, burn overlays" },
  { status: "done", label: "Ready", hint: "Download your meme" },
];

/** Shorter pipeline for real image face-swap (HF Space). */
export const FACESWAP_STAGES: StageMeta[] = [
  { status: "moderating", label: "Safety gate", hint: "NSFW check before the model" },
  { status: "generating", label: "Swapping face", hint: "Running the face-swap model on Hugging Face" },
  { status: "done", label: "Ready", hint: "Download your swap" },
];

export function stagesFor(mode: "v2v" | "faceswap" | undefined): StageMeta[] {
  return mode === "faceswap" ? FACESWAP_STAGES : PIPELINE_STAGES;
}

/** Index of a status within a given stage list (−1 if off-track, e.g. failed). */
export function stageIndexIn(stages: StageMeta[], status: JobStatus): number {
  return stages.findIndex((s) => s.status === status);
}

/** Index within the default V2V pipeline (kept for back-compat). */
export function stageIndex(status: JobStatus): number {
  return stageIndexIn(PIPELINE_STAGES, status);
}
