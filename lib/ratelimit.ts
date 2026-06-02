import type { Ratelimit } from "@upstash/ratelimit";
import type { Redis } from "@upstash/redis";
import { config } from "./config";

/**
 * Abuse + cost guardrails for the public demo. Two layers:
 *   1. per-IP sliding-window rate limit (stops request spam)
 *   2. a global daily generation cap (stops anyone draining GPU credits)
 *
 * Both are backed by Upstash Redis and are NO-OPs when Upstash isn't configured
 * (i.e. local dev), so the laptop experience stays zero-setup. Each guard returns
 * a 429 `Response` to short-circuit the route, or `null` to allow it.
 */

let limiter: Ratelimit | null = null;
let redis: Redis | null = null;

async function getRedis(): Promise<Redis | null> {
  if (config.jobStore !== "redis") return null; // Upstash not configured
  if (!redis) {
    const { Redis } = await import("@upstash/redis");
    redis = Redis.fromEnv();
  }
  return redis;
}

async function getLimiter(): Promise<Ratelimit | null> {
  const r = await getRedis();
  if (!r) return null;
  if (!limiter) {
    const { Ratelimit } = await import("@upstash/ratelimit");
    limiter = new Ratelimit({
      redis: r,
      limiter: Ratelimit.slidingWindow(config.rateLimitPerMin, "60 s"),
      prefix: "geneai:rl",
    });
  }
  return limiter;
}

function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  return xff?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "anon";
}

/** Per-IP rate limit. Returns a 429 Response when exceeded, else null. */
export async function rateLimit(req: Request): Promise<Response | null> {
  const l = await getLimiter();
  if (!l) return null;
  const { success } = await l.limit(clientIp(req));
  if (success) return null;
  return Response.json({ error: "Too many requests — give it a moment and try again." }, { status: 429 });
}

/**
 * Consume one unit of the global daily generation quota. Call this only at the
 * real generation point (job create), not on every presign. Returns 429 when the
 * day's cap is hit, else null.
 */
export async function consumeDailyQuota(): Promise<Response | null> {
  const r = await getRedis();
  if (!r) return null;
  const key = `geneai:quota:${new Date().toISOString().slice(0, 10)}`;
  const count = await r.incr(key);
  if (count === 1) await r.expire(key, 86_400);
  if (count > config.dailyCap) {
    return Response.json(
      { error: "The daily demo limit has been reached 🙏 Try again tomorrow." },
      { status: 429 },
    );
  }
  return null;
}
