import { NextResponse } from "next/server";
import { z } from "zod";
import { config } from "@/lib/config";
import { advance, getJobStore } from "@/lib/jobs/store";
import type { Job, JobStatus } from "@/lib/jobs/types";

export const runtime = "nodejs";

/**
 * POST /api/webhook — progress + completion callbacks from the Modal GPU worker.
 * The worker calls this repeatedly as it advances through stages, and finally
 * with status "done" (plus the result asset) or "failed". Authenticated with a
 * shared secret so randoms can't poison job state.
 */
const schema = z.object({
  jobId: z.string().min(1),
  secret: z.string(),
  status: z.enum([
    "moderating",
    "rejected",
    "normalizing",
    "extracting_pose",
    "generating",
    "stitching",
    "done",
    "failed",
  ]),
  message: z.string().default(""),
  result: z
    .object({ key: z.string(), url: z.string(), contentType: z.string() })
    .optional(),
  error: z.string().optional(),
  moderation: z
    .object({ flagged: z.boolean(), reason: z.string().optional(), score: z.number().optional() })
    .optional(),
});

export async function POST(req: Request) {
  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }
  const { jobId, secret, status, message, result, error, moderation } = body.data;

  if (secret !== config.webhookSecret) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const store = await getJobStore();
  if (!(await store.get(jobId))) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }

  const extra: Partial<Job> = {};
  if (result) extra.result = result;
  if (error) extra.error = error;
  if (moderation) extra.moderation = moderation;

  const job = await advance(store, jobId, status as JobStatus, message || status, extra);
  return NextResponse.json({ ok: true, job });
}
