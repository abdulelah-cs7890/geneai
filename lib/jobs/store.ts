import { config } from "@/lib/config";
import type { Job, JobLogEntry, JobStatus } from "./types";
import { STAGE_PROGRESS } from "./types";

/**
 * Job store abstraction: the source of truth for job state that both the API
 * routes and the compute backend read/write. Local dev uses a file-backed
 * store; production uses Upstash Redis (serverless, HTTP, free tier).
 */
export interface JobStore {
  create(job: Job): Promise<Job>;
  get(id: string): Promise<Job | null>;
  list(limit?: number): Promise<Job[]>;
  /** Shallow-merge a partial update; bumps updatedAt. */
  update(id: string, patch: Partial<Job>): Promise<Job>;
}

let cached: JobStore | null = null;

export async function getJobStore(): Promise<JobStore> {
  if (cached) return cached;
  if (config.jobStore === "redis") {
    const { RedisJobStore } = await import("./redis-store");
    cached = new RedisJobStore();
  } else if (config.jobStore === "supabase") {
    const { SupabaseJobStore } = await import("./supabase-store");
    cached = new SupabaseJobStore();
  } else {
    const { LocalJobStore } = await import("./local-store");
    cached = new LocalJobStore();
  }
  return cached;
}

/**
 * Advance a job to a new stage: sets status, derives progress from the stage,
 * appends a log line, and persists. The single choke point for state changes,
 * so progress can never go backwards and every transition is logged.
 */
export async function advance(
  store: JobStore,
  id: string,
  status: JobStatus,
  message: string,
  extra: Partial<Job> = {},
): Promise<Job> {
  const current = await store.get(id);
  const log: JobLogEntry = { at: Date.now(), stage: status, message };
  const progress = Math.max(current?.progress ?? 0, STAGE_PROGRESS[status]);
  return store.update(id, {
    status,
    progress,
    logs: [...(current?.logs ?? []), log],
    ...extra,
  });
}
