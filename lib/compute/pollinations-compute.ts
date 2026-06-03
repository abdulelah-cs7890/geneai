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

    const res = await fetch(url, { headers });
    const contentType = (res.headers.get("content-type") || "").split(";")[0];
    if (!res.ok || !contentType.startsWith("image")) {
      const body = await res.text().catch(() => "");
      throw new Error(`Pollinations failed: ${res.status} ${contentType} ${body.slice(0, 120)}`);
    }

    const buf = Buffer.from(await res.arrayBuffer());
    const ext = contentType.includes("png") ? ".png" : ".jpg";
    const outKey = `${jobId}/output${ext}`;
    const outUrl = await storage.put(outKey, buf, contentType);
    await advance(store, jobId, "done", "Image ready.", {
      result: { key: outKey, url: outUrl, contentType },
    });
  }
}
