import { config } from "@/lib/config";

/**
 * Compute backend abstraction — the swap point between "runs on my laptop with
 * no GPU" and "runs full-body motion transfer on a Modal GPU".
 *
 * `dispatch` starts processing an already-queued job and returns immediately;
 * the job advances asynchronously and the UI polls /api/jobs/[id] for progress.
 * The mock advances it in-process; Modal advances it via a webhook callback.
 */
export interface ComputeBackend {
  readonly name: "mock" | "modal";
  dispatch(jobId: string): Promise<void>;
}

let cached: ComputeBackend | null = null;

export async function getCompute(): Promise<ComputeBackend> {
  if (cached) return cached;
  if (config.compute === "modal") {
    const { ModalCompute } = await import("./modal-compute");
    cached = new ModalCompute();
  } else {
    const { MockCompute } = await import("./mock-compute");
    cached = new MockCompute();
  }
  return cached;
}
