import { config } from "@/lib/config";
import { advance, getJobStore } from "@/lib/jobs/store";
import { getStorage } from "@/lib/storage";
import { styleSuffix } from "@/lib/styles";
import type { ComputeBackend } from "./index";

/**
 * Text → image via Cloudflare Workers AI FLUX (@cf/black-forest-labs/flux-1-schnell).
 * Free tier (no card), per-account token so there's no shared-IP rate limit —
 * reliable from Vercel. Returns a base64 image we decode and store. (FLUX-schnell
 * on CF is square; the aspect option is honored by the browser-fallback engine.)
 *
 * Requires CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN.
 */
export class CloudflareCompute implements ComputeBackend {
  readonly name = "cloudflare" as const;

  async dispatch(jobId: string): Promise<void> {
    await this.process(jobId);
  }

  private async process(jobId: string): Promise<void> {
    const store = await getJobStore();
    const storage = await getStorage();
    const job = await store.get(jobId);
    if (!job) throw new Error("job vanished before processing");

    await advance(store, jobId, "generating", "Rendering with FLUX (Cloudflare)…");

    const prompt = job.prompt + styleSuffix(job.options.style);
    const url = `https://api.cloudflare.com/client/v4/accounts/${config.cloudflareAccountId}/ai/run/@cf/black-forest-labs/flux-1-schnell`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.cloudflareApiToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ prompt, steps: 6, seed: Math.floor(Math.random() * 1_000_000) }),
    });
    if (!res.ok) {
      throw new Error(`Cloudflare failed: ${res.status} ${(await res.text()).slice(0, 150)}`);
    }
    const json = (await res.json()) as { result?: { image?: string }; success?: boolean };
    const b64 = json?.result?.image;
    if (!b64) throw new Error("Cloudflare returned no image");

    const buf = Buffer.from(b64, "base64");
    const outKey = `${jobId}/output.jpg`;
    const outUrl = await storage.put(outKey, buf, "image/jpeg");
    await advance(store, jobId, "done", "Image ready.", {
      result: { key: outKey, url: outUrl, contentType: "image/jpeg" },
    });
  }
}
