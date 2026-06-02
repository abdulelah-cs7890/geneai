import { after, NextResponse } from "next/server";
import { z } from "zod";
import { config } from "@/lib/config";
import { getCompute } from "@/lib/compute";
import { advance, getJobStore } from "@/lib/jobs/store";
import type { Job } from "@/lib/jobs/types";
import { moderateUpload } from "@/lib/moderation";
import { consumeDailyQuota, rateLimit } from "@/lib/ratelimit";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";
// Allow the in-function FFmpeg render (run via after()) up to a minute on Vercel.
export const maxDuration = 60;

const optionsSchema = z.object({
  addSubtitles: z.boolean().default(false),
  addHypeAudio: z.boolean().default(false),
  watermark: z.boolean().default(true),
});

/**
 * Body posted after the browser has already uploaded both files directly to
 * storage via the presigned URLs from /api/upload-url. We never receive the
 * bytes here — only the keys + metadata.
 */
const schema = z.object({
  jobId: z.string().uuid(),
  driverKey: z.string().min(1),
  characterKey: z.string().min(1),
  driverName: z.string().default("driver"),
  characterName: z.string().default("character"),
  driverType: z.string().default("video/mp4"),
  characterType: z.string().default("image/jpeg"),
  options: optionsSchema.default({ addSubtitles: false, addHypeAudio: false, watermark: true }),
});

/** GET /api/jobs — recent jobs feed for the history rail. */
export async function GET() {
  const store = await getJobStore();
  return NextResponse.json({ jobs: await store.list(12) });
}

/** POST /api/jobs — create a job from already-uploaded driver + character keys. */
export async function POST(req: Request) {
  const limited = await rateLimit(req);
  if (limited) return limited;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const { jobId, driverKey, characterKey, driverName, characterName, driverType, characterType, options } =
    parsed.data;

  // Keys must belong to this jobId — stops a client pointing the job at someone
  // else's objects.
  if (!driverKey.startsWith(`${jobId}/`) || !characterKey.startsWith(`${jobId}/`)) {
    return NextResponse.json({ error: "Keys do not match jobId." }, { status: 400 });
  }

  // Consume one unit of the daily generation quota (the expensive action).
  const overQuota = await consumeDailyQuota();
  if (overQuota) return overQuota;

  const storage = await getStorage();
  const store = await getJobStore();
  const now = Date.now();

  // Safety gate runs BEFORE any compute is dispatched (no GPU spend on rejects).
  const moderation = await moderateUpload([driverName, characterName]);

  const base: Job = {
    id: jobId,
    status: "queued",
    progress: 0,
    createdAt: now,
    updatedAt: now,
    driverVideo: { key: driverKey, url: storage.url(driverKey), contentType: driverType },
    characterImage: { key: characterKey, url: storage.url(characterKey), contentType: characterType },
    options,
    backend: config.compute,
    logs: [{ at: now, stage: "moderating", message: "Running safety gate before GPU dispatch…" }],
  };

  if (moderation.flagged) {
    const rejected = await store.create({
      ...base,
      status: "rejected",
      progress: 100,
      moderation,
      logs: [...base.logs, { at: Date.now(), stage: "rejected", message: moderation.reason ?? "Rejected." }],
    });
    return NextResponse.json({ job: rejected }, { status: 200 });
  }

  await store.create({
    ...base,
    moderation,
    logs: [...base.logs, { at: Date.now(), stage: "queued", message: "Passed safety gate. Queued for generation." }],
  });

  // Process in the background so the API responds immediately and the UI polls
  // for progress. `after()` keeps the function alive on Vercel until it finishes.
  const compute = await getCompute();
  after(async () => {
    try {
      await compute.dispatch(jobId);
    } catch (err) {
      await advance(store, jobId, "failed", `Pipeline error: ${(err as Error).message}`, {
        error: (err as Error).message,
      });
    }
  });

  return NextResponse.json({ job: await store.get(jobId) }, { status: 201 });
}
