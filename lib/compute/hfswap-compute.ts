import { config } from "@/lib/config";
import { advance, getJobStore } from "@/lib/jobs/store";
import { getStorage } from "@/lib/storage";
import type { ComputeBackend } from "./index";

/**
 * Real image face-swap via a Hugging Face Space (free, no card), with an optional
 * best-effort face-restoration pass to sharpen the result. Both fit inside the
 * Vercel 60s function. For faceswap jobs, driverVideo holds the base/target image
 * and characterImage holds the source face.
 *
 * - Swap:    felixrosberg/face-swap  /run_inference [Target, Source, anon%, adv%, mode]
 * - Restore: leonelhs/CodeFormer     /predict [image] → [before, enhanced]
 *
 * Restoration is wrapped in a timeout + try/catch: if it's slow or fails, the job
 * still completes with the raw swap. Set HF_RESTORE_SPACE="" to skip it.
 */

function connectOpts() {
  return config.hfToken ? { token: config.hfToken as `hf_${string}` } : undefined;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("restore timed out")), ms)),
  ]);
}

interface Img {
  buf: Buffer;
  contentType: string;
}

export class HfSwapCompute implements ComputeBackend {
  readonly name = "hfswap" as const;

  async dispatch(jobId: string): Promise<void> {
    await this.process(jobId);
  }

  private async process(jobId: string): Promise<void> {
    const store = await getJobStore();
    const storage = await getStorage();
    const job = await store.get(jobId);
    if (!job) throw new Error("job vanished before processing");

    await advance(store, jobId, "generating", "Swapping face on Hugging Face…");
    const swapped = await this.swap(job.driverVideo, job.characterImage);

    // Best-effort enhancement; on slowness/failure we keep the raw swap.
    let final = swapped;
    if (config.hfRestoreSpace) {
      await advance(store, jobId, "stitching", "Enhancing face detail…");
      try {
        final = await withTimeout(this.restore(swapped), 28_000);
      } catch (err) {
        console.log(`[hfswap] restoration skipped: ${(err as Error).message}`);
      }
    }

    const ext = final.contentType.includes("png") ? ".png" : final.contentType.includes("jpeg") ? ".jpg" : ".webp";
    const outKey = `${jobId}/output${ext}`;
    const outUrl = await storage.put(outKey, final.buf, final.contentType);
    await advance(store, jobId, "done", "Face swap ready.", {
      result: { key: outKey, url: outUrl, contentType: final.contentType },
    });
  }

  /** felixrosberg face-swap → swapped image bytes. */
  private async swap(base: { key: string; contentType: string }, face: { key: string; contentType: string }): Promise<Img> {
    const storage = await getStorage();
    const [baseBytes, faceBytes] = await Promise.all([storage.get(base.key), storage.get(face.key)]);
    const target = new Blob([new Uint8Array(baseBytes)], { type: base.contentType || "image/jpeg" });
    const source = new Blob([new Uint8Array(faceBytes)], { type: face.contentType || "image/jpeg" });

    const { Client } = await import("@gradio/client");
    const app = await Client.connect(config.hfSpace, connectOpts());
    const r = await app.predict("/run_inference", [target, source, 100, 0, "Target"]);
    return fetchImage(firstUrl(r.data), "face-swap");
  }

  /** leonelhs/CodeFormer face restoration → enhanced image bytes. */
  private async restore(input: Img): Promise<Img> {
    const { Client } = await import("@gradio/client");
    const app = await Client.connect(config.hfRestoreSpace, connectOpts());
    const r = await app.predict("/predict", [new Blob([new Uint8Array(input.buf)], { type: input.contentType })]);
    // Output is a [before, enhanced] tuple — take the last (enhanced) image.
    return fetchImage(lastUrl(r.data), "restoration");
  }
}

// --- helpers ---------------------------------------------------------------
function* walkUrls(node: unknown): Generator<string> {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const v of node) yield* walkUrls(v);
    return;
  }
  const o = node as Record<string, unknown>;
  if (typeof o.url === "string") yield o.url;
  for (const v of Object.values(o)) yield* walkUrls(v);
}

function firstUrl(data: unknown): string {
  const [u] = [...walkUrls(data)];
  if (!u) throw new Error("model returned no image");
  return u;
}

function lastUrl(data: unknown): string {
  const all = [...walkUrls(data)];
  if (!all.length) throw new Error("model returned no image");
  return all[all.length - 1];
}

async function fetchImage(url: string, what: string): Promise<Img> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`failed to fetch ${what} result: ${res.status}`);
  return {
    buf: Buffer.from(await res.arrayBuffer()),
    contentType: res.headers.get("content-type") || "image/webp",
  };
}
