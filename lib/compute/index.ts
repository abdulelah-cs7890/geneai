/**
 * Compute backend abstraction. `dispatch` runs a queued job to completion; the
 * route backgrounds it via `after()` and the UI polls /api/jobs/[id] for progress.
 */
export interface ComputeBackend {
  readonly name: "pollinations";
  dispatch(jobId: string): Promise<void>;
}

let cached: ComputeBackend | null = null;

export async function getCompute(): Promise<ComputeBackend> {
  if (cached) return cached;
  const { PollinationsCompute } = await import("./pollinations-compute");
  cached = new PollinationsCompute();
  return cached;
}
