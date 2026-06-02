import { config } from "@/lib/config";
import { advance, getJobStore } from "@/lib/jobs/store";
import { getStorage } from "@/lib/storage";
import type { ComputeBackend } from "./index";

/**
 * Real image face-swap via a Hugging Face Space (free, no card). Calls the
 * Space's Gradio API with the base image + the source face and stores the
 * swapped image back. Fast enough (~8–30s) to run inside the Vercel function.
 *
 * Wired against `felixrosberg/face-swap` (`/run_inference`: Target, Source,
 * anonymization %, adversarial %, mode) — set HF_FACESWAP_SPACE to point
 * elsewhere. For faceswap jobs, driverVideo holds the base/target image and
 * characterImage holds the source face.
 */
export class HfSwapCompute implements ComputeBackend {
  readonly name = "hfswap" as const;

  async dispatch(jobId: string): Promise<void> {
    // Runs to completion; the route backgrounds this via after() and marks the
    // job failed if it throws.
    await this.process(jobId);
  }

  private async process(jobId: string): Promise<void> {
    const store = await getJobStore();
    const storage = await getStorage();
    const job = await store.get(jobId);
    if (!job) throw new Error("job vanished before processing");

    await advance(store, jobId, "generating", "Swapping face on Hugging Face…");

    const [baseBytes, faceBytes] = await Promise.all([
      storage.get(job.driverVideo.key),
      storage.get(job.characterImage.key),
    ]);
    const target = new Blob([new Uint8Array(baseBytes)], { type: job.driverVideo.contentType || "image/jpeg" });
    const source = new Blob([new Uint8Array(faceBytes)], { type: job.characterImage.contentType || "image/jpeg" });

    const { Client } = await import("@gradio/client");
    const app = await Client.connect(
      config.hfSpace,
      config.hfToken ? { token: config.hfToken as `hf_${string}` } : undefined,
    );
    // felixrosberg/face-swap: [Target, Source, anonymization%, adversarial%, mode]
    const r = await app.predict("/run_inference", [target, source, 100, 0, "Target"]);

    const out = Array.isArray(r.data) ? r.data[0] : r.data;
    const url =
      (out && typeof out === "object" && "url" in out ? (out as { url?: string }).url : undefined) ??
      (typeof out === "string" && out.startsWith("http") ? out : undefined);
    if (!url) throw new Error("Face-swap model returned no image.");

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch swap result: ${res.status}`);
    const contentType = res.headers.get("content-type") || "image/webp";
    const ext = contentType.includes("png") ? ".png" : contentType.includes("jpeg") ? ".jpg" : ".webp";
    const buf = Buffer.from(await res.arrayBuffer());

    const outKey = `${jobId}/output${ext}`;
    const outUrl = await storage.put(outKey, buf, contentType);
    await advance(store, jobId, "done", "Face swap ready.", {
      result: { key: outKey, url: outUrl, contentType },
    });
  }
}
