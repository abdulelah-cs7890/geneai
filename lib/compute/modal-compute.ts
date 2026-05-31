import { config } from "@/lib/config";
import { advance, getJobStore } from "@/lib/jobs/store";
import { getStorage } from "@/lib/storage";
import type { ComputeBackend } from "./index";

/**
 * Production compute backend: hands the job off to a Modal serverless-GPU worker
 * and returns immediately. Modal spins a GPU up only while the job runs (so it
 * costs $0 when idle and fits a free credit budget), runs DWPose + the V2V
 * diffusion model, then POSTs progress + the final result to /api/webhook.
 *
 * We send the worker resolvable input URLs and an absolute callback URL; the
 * worker authenticates its callbacks with WORKER_WEBHOOK_SECRET.
 */
export class ModalCompute implements ComputeBackend {
  readonly name = "modal" as const;

  async dispatch(jobId: string): Promise<void> {
    const store = await getJobStore();
    const storage = await getStorage();
    const job = await store.get(jobId);
    if (!job) throw new Error("job vanished before dispatch");

    const payload = {
      jobId,
      driverUrl: absolute(storage.url(job.driverVideo.key)),
      characterUrl: absolute(storage.url(job.characterImage.key)),
      options: job.options,
      maxDurationSec: config.maxDurationSec,
      callbackUrl: `${config.baseUrl}/api/webhook`,
      secret: config.webhookSecret,
    };

    const res = await fetch(process.env.MODAL_ENDPOINT_URL!, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error(`Modal dispatch failed: ${res.status} ${await res.text()}`);
    }
    await advance(store, jobId, "moderating", "Dispatched to GPU worker…");
  }
}

function absolute(url: string): string {
  return url.startsWith("http") ? url : `${config.baseUrl}${url}`;
}
