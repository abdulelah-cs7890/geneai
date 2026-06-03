/**
 * Server compute backend (used when imageEngine === "cloudflare"). `dispatch`
 * runs a queued job to completion; the route backgrounds it via `after()` and the
 * UI polls /api/jobs/[id]. In browser-fallback mode the route sets a clientUrl
 * instead and the browser generates on its own IP — no server backend involved.
 */
export interface ComputeBackend {
  readonly name: "cloudflare";
  dispatch(jobId: string): Promise<void>;
}

let cached: ComputeBackend | null = null;

export async function getCompute(): Promise<ComputeBackend> {
  if (cached) return cached;
  const { CloudflareCompute } = await import("./cloudflare-compute");
  cached = new CloudflareCompute();
  return cached;
}
