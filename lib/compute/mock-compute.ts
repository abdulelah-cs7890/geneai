import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { config } from "@/lib/config";
import { normalizeAndComposite } from "@/lib/ffmpeg";
import { advance, getJobStore } from "@/lib/jobs/store";
import { getStorage } from "@/lib/storage";
import type { ComputeBackend } from "./index";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Local, GPU-free compute backend. It walks the job through the SAME state
 * machine the real GPU worker uses, with brief pauses so the staged progress is
 * visible, and produces a real rendered 9:16 clip via FFmpeg (driver normalized
 * + character image composited). It's an honest stand-in: same pipeline shape,
 * same outputs, minus the diffusion model that only the Modal backend can run.
 */
export class MockCompute implements ComputeBackend {
  readonly name = "mock" as const;

  async dispatch(jobId: string): Promise<void> {
    // Fire-and-forget: return immediately so the API responds fast and the UI
    // polls for progress, exactly like the async Modal path.
    void this.process(jobId).catch(async (err) => {
      const store = await getJobStore();
      await advance(store, jobId, "failed", `Pipeline error: ${(err as Error).message}`, {
        error: (err as Error).message,
      });
    });
  }

  private async process(jobId: string): Promise<void> {
    const store = await getJobStore();
    const storage = await getStorage();
    const job = await store.get(jobId);
    if (!job) throw new Error("job vanished before processing");

    const work = path.join(os.tmpdir(), "geneai", jobId);
    await fs.mkdir(work, { recursive: true });

    const driverIn = path.join(work, "driver" + extOf(job.driverVideo.key));
    const charIn = path.join(work, "character" + extOf(job.characterImage.key));
    const outFile = path.join(work, "output.mp4");
    await fs.writeFile(driverIn, await storage.get(job.driverVideo.key));
    await fs.writeFile(charIn, await storage.get(job.characterImage.key));

    await advance(store, jobId, "normalizing", "Cropping to 9:16 and capping duration…");
    await sleep(700);

    await advance(store, jobId, "extracting_pose", "Extracting driver pose skeleton…");
    await sleep(900);

    await advance(store, jobId, "generating", "Rendering motion transfer (mock backend)…");
    await normalizeAndComposite(driverIn, charIn, outFile, {
      maxDurationSec: config.maxDurationSec,
      fps: 30,
      watermark: job.options.watermark,
    });

    await advance(store, jobId, "stitching", "Re-muxing audio and burning overlays…");
    await sleep(500);

    const outKey = `${jobId}/output.mp4`;
    const url = await storage.put(outKey, await fs.readFile(outFile), "video/mp4");
    await advance(store, jobId, "done", "Meme ready.", {
      result: { key: outKey, url, contentType: "video/mp4" },
    });

    await fs.rm(work, { recursive: true, force: true }).catch(() => {});
  }
}

function extOf(key: string): string {
  const ext = path.extname(key);
  return ext || "";
}
