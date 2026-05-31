import { NextResponse } from "next/server";
import { getJobStore } from "@/lib/jobs/store";

export const runtime = "nodejs";

/** GET /api/jobs/[id] — current job state for UI polling. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = await getJobStore();
  const job = await store.get(id);
  if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });
  return NextResponse.json({ job });
}
