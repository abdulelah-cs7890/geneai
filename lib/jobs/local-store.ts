import fs from "node:fs/promises";
import path from "node:path";
import { config } from "@/lib/config";
import type { JobStore } from "./store";
import type { Job } from "./types";

/**
 * File-backed job store for local dev: one JSON file per job under ./data/jobs.
 * Good enough for a single-process `next dev` where the API route that kicks off
 * the mock compute and the polling GET requests share the same filesystem.
 *
 * A tiny in-process mutex serializes writes so concurrent stage updates from the
 * background compute task don't clobber each other's log arrays.
 */
export class LocalJobStore implements JobStore {
  private dir = path.join(config.dataDir, "jobs");
  private chain: Promise<unknown> = Promise.resolve();

  private file(id: string): string {
    return path.join(this.dir, `${id}.json`);
  }

  private serialize<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(fn, fn);
    this.chain = run.catch(() => {});
    return run;
  }

  async create(job: Job): Promise<Job> {
    await fs.mkdir(this.dir, { recursive: true });
    await fs.writeFile(this.file(job.id), JSON.stringify(job, null, 2));
    return job;
  }

  async get(id: string): Promise<Job | null> {
    try {
      return JSON.parse(await fs.readFile(this.file(id), "utf8")) as Job;
    } catch {
      return null;
    }
  }

  async list(limit = 20): Promise<Job[]> {
    let names: string[];
    try {
      names = await fs.readdir(this.dir);
    } catch {
      return [];
    }
    const jobs = await Promise.all(
      names.filter((n) => n.endsWith(".json")).map((n) => this.get(n.replace(/\.json$/, ""))),
    );
    return jobs
      .filter((j): j is Job => j !== null)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }

  async update(id: string, patch: Partial<Job>): Promise<Job> {
    return this.serialize(async () => {
      const current = await this.get(id);
      if (!current) throw new Error(`job not found: ${id}`);
      const next: Job = { ...current, ...patch, updatedAt: Date.now() };
      await fs.writeFile(this.file(id), JSON.stringify(next, null, 2));
      return next;
    });
  }
}
