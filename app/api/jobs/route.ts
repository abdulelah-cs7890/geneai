import { after, NextResponse } from "next/server";
import { z } from "zod";
import { config } from "@/lib/config";
import { getCompute } from "@/lib/compute";
import { advance, getJobStore } from "@/lib/jobs/store";
import type { Job } from "@/lib/jobs/types";
import { moderatePrompt } from "@/lib/moderation";
import { consumeDailyQuota, rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";
// The FLUX call runs in the background via after(); give it room on Vercel.
export const maxDuration = 60;

const optionsSchema = z.object({
  aspect: z.enum(["1:1", "9:16", "16:9"]).default("1:1"),
  style: z.string().max(40).default(""),
});

const schema = z.object({
  prompt: z.string().trim().min(1).max(config.maxPromptLength),
  options: optionsSchema.default({ aspect: "1:1", style: "" }),
});

/** GET /api/jobs — recent jobs feed for the gallery/history. */
export async function GET() {
  const store = await getJobStore();
  return NextResponse.json({ jobs: await store.list(12) });
}

/** POST /api/jobs — create an image-generation job from a prompt. */
export async function POST(req: Request) {
  const limited = await rateLimit(req);
  if (limited) return limited;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a prompt (1–600 characters)." }, { status: 400 });
  }
  const { prompt, options } = parsed.data;

  const overQuota = await consumeDailyQuota();
  if (overQuota) return overQuota;

  const store = await getJobStore();
  const now = Date.now();
  const jobId = crypto.randomUUID();
  const moderation = await moderatePrompt(prompt);

  const base: Job = {
    id: jobId,
    status: "queued",
    prompt,
    progress: 0,
    createdAt: now,
    updatedAt: now,
    options,
    backend: "pollinations",
    logs: [{ at: now, stage: "moderating", message: "Screening the prompt…" }],
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
    logs: [...base.logs, { at: Date.now(), stage: "queued", message: "Prompt cleared. Queued for generation." }],
  });

  // Background the FLUX call so the API responds immediately and the UI polls.
  const compute = await getCompute();
  after(async () => {
    try {
      await compute.dispatch(jobId);
    } catch (err) {
      await advance(store, jobId, "failed", `Generation error: ${(err as Error).message}`, {
        error: (err as Error).message,
      });
    }
  });

  return NextResponse.json({ job: await store.get(jobId) }, { status: 201 });
}
