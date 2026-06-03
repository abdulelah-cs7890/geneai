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

export const GENERATE_STAGES: StageMeta[] = [
  { status: "moderating", label: "Safety check", hint: "Screening the prompt before generation" },
  { status: "generating", label: "Generating", hint: "Rendering your image with FLUX" },
  { status: "done", label: "Ready", hint: "Download your image" },
];

/** Index of a status within a stage list (−1 if off-track, e.g. failed). */
export function stageIndexIn(stages: StageMeta[], status: JobStatus): number {
  return stages.findIndex((s) => s.status === status);
}
