import { Redis } from "@upstash/redis";
import type { JobStore } from "./store";
import type { Job } from "./types";

/**
 * Upstash Redis job store for production. Serverless + HTTP, so it works from
 * Vercel edge/serverless functions with no connection pooling headaches, and
 * the free tier comfortably covers a demo. Each job is a JSON value keyed by
 * id; a capped sorted set keeps the recent-jobs feed.
 *
 * Requires: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN.
 */
export class RedisJobStore implements JobStore {
  private redis = Redis.fromEnv();
  private key(id: string) {
    return `job:${id}`;
  }
  private feed = "jobs:recent";

  async create(job: Job): Promise<Job> {
    await this.redis.set(this.key(job.id), job);
    await this.redis.zadd(this.feed, { score: job.createdAt, member: job.id });
    return job;
  }

  async get(id: string): Promise<Job | null> {
    return (await this.redis.get<Job>(this.key(id))) ?? null;
  }

  async list(limit = 20): Promise<Job[]> {
    const ids = await this.redis.zrange<string[]>(this.feed, 0, limit - 1, { rev: true });
    if (!ids.length) return [];
    const jobs = await Promise.all(ids.map((id) => this.get(id)));
    return jobs.filter((j): j is Job => j !== null);
  }

  async update(id: string, patch: Partial<Job>): Promise<Job> {
    // Upstash is atomic per-command; for a demo this read-modify-write is fine.
    // A production hardening would use a Lua script or optimistic versioning.
    const current = await this.get(id);
    if (!current) throw new Error(`job not found: ${id}`);
    const next: Job = { ...current, ...patch, updatedAt: Date.now() };
    await this.redis.set(this.key(id), next);
    return next;
  }
}
