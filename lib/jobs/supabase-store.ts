import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { JobStore } from "./store";
import type { Job } from "./types";

/**
 * Postgres-backed job store using the SAME Supabase project as storage — so the
 * whole live demo needs just Supabase + Vercel, no Redis. Each job is one row:
 * `id text primary key, data jsonb, created_at bigint` (see DEPLOY.md for the
 * one-line table SQL). The service-role key bypasses RLS, so no policies needed.
 *
 * `update` is read-modify-write, which is safe here because a single job is only
 * ever advanced by one in-function task at a time (no per-job concurrency).
 */
const TABLE = "jobs";

export class SupabaseJobStore implements JobStore {
  private client: SupabaseClient;

  constructor() {
    this.client = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    });
  }

  async create(job: Job): Promise<Job> {
    const { error } = await this.client.from(TABLE).insert({ id: job.id, data: job, created_at: job.createdAt });
    if (error) throw new Error(`job create failed: ${error.message}`);
    return job;
  }

  async get(id: string): Promise<Job | null> {
    const { data, error } = await this.client.from(TABLE).select("data").eq("id", id).maybeSingle();
    if (error) throw new Error(`job get failed: ${error.message}`);
    return (data?.data as Job) ?? null;
  }

  async list(limit = 20): Promise<Job[]> {
    const { data, error } = await this.client
      .from(TABLE)
      .select("data")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(`job list failed: ${error.message}`);
    return (data ?? []).map((row) => row.data as Job);
  }

  async update(id: string, patch: Partial<Job>): Promise<Job> {
    const current = await this.get(id);
    if (!current) throw new Error(`job not found: ${id}`);
    const next: Job = { ...current, ...patch, updatedAt: Date.now() };
    const { error } = await this.client.from(TABLE).update({ data: next }).eq("id", id);
    if (error) throw new Error(`job update failed: ${error.message}`);
    return next;
  }
}
