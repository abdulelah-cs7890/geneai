import { config } from "@/lib/config";
import { advance, getJobStore } from "@/lib/jobs/store";
import { getStorage } from "@/lib/storage";
import { ASPECT_SIZE, styleSuffix } from "@/lib/styles";
import type { ComputeBackend } from "./index";

/**
 * Text → image via Pollinations FLUX (free, no card, no signup). Builds the
 * Pollinations URL from the job's prompt + options, fetches the FLUX image, and
 * stores it. Fast (~2–10s), well inside Vercel's 60s function.
 */
export class PollinationsCompute implements ComputeBackend {
  readonly name = "pollinations" as const;

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

    await advance(store, jobId, "generating", "Rendering your image with FLUX…");

    const { w, h } = ASPECT_SIZE[job.options.aspect] ?? ASPECT_SIZE["1:1"];
    const fullPrompt = job.prompt + styleSuffix(job.options.style);
    const params = new URLSearchParams({
      width: String(w),
      height: String(h),
      model: "flux",
      nologo: "true",
      enhance: "true",
      seed: String(Math.floor(Math.random() * 1_000_000)),
    });
    if (config.pollinationsToken) params.set("token", config.pollinationsToken);

    const url = `${config.pollinationsBase}/prompt/${encodeURIComponent(fullPrompt)}?${params.toString()}`;
    const headers: Record<string, string> = {};
    if (config.pollinationsToken) headers.authorization = `Bearer ${config.pollinationsToken}`;

    const { buf, contentType } = await this.fetchWithRetry(url, headers);
    const ext = contentType.includes("png") ? ".png" : ".jpg";
    const outKey = `${jobId}/output${ext}`;
    const outUrl = await storage.put(outKey, buf, contentType);
    await advance(store, jobId, "done", "Image ready.", {
      result: { key: outKey, url: outUrl, contentType },
    });
  }

  /**
   * Pollinations anon allows only 1 queued request per IP and Vercel egress IPs
   * are shared, so a cold call can 402 ("queue full") or 429. Retry with backoff;
   * a free POLLINATIONS_TOKEN authenticates per-user and avoids this entirely.
   */
  private async fetchWithRetry(
    url: string,
    headers: Record<string, string>,
  ): Promise<{ buf: Buffer; contentType: string }> {
    let last = "";
    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await fetch(url, { headers });
      const contentType = (res.headers.get("content-type") || "").split(";")[0];
      if (res.ok && contentType.startsWith("image")) {
        return { buf: Buffer.from(await res.arrayBuffer()), contentType };
      }
      const body = await res.text().catch(() => "");
      last = `${res.status} ${contentType} ${body.slice(0, 100)}`;
      // Retry on queue-full / rate-limit / transient server errors.
      if (res.status === 402 || res.status === 429 || res.status >= 500) {
        await new Promise((r) => setTimeout(r, 3000 + attempt * 4000));
        continue;
      }
      throw new Error(`Pollinations failed: ${last}`);
    }
    throw new Error(`Pollinations failed after retries: ${last}`);
  }
}
