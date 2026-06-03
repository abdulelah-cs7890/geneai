import path from "node:path";

/**
 * Central, env-driven backend selection. The app keeps two swappable backends —
 * job store and blob storage — each with a zero-config LOCAL impl and a cloud
 * impl, so it runs end-to-end on a laptop with no accounts and promotes to the
 * cloud with a few env vars. Generation runs on Pollinations FLUX (free, no card).
 */
export const config = {
  /**
   * Job store: Upstash Redis if configured, else Supabase Postgres (reuses the
   * storage project — no Redis needed), else a file-backed local store.
   */
  jobStore: process.env.UPSTASH_REDIS_REST_URL
    ? ("redis" as const)
    : process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
      ? ("supabase" as const)
      : ("local" as const),

  /**
   * Blob storage: Supabase (free, no card — the live-demo default) if configured,
   * else Cloudflare R2, else local disk under ./data.
   */
  storage:
    process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
      ? ("supabase" as const)
      : process.env.R2_ACCOUNT_ID && process.env.R2_BUCKET
        ? ("r2" as const)
        : ("local" as const),

  /** Pollinations FLUX image endpoint (free, no card, no signup). */
  pollinationsBase: process.env.POLLINATIONS_BASE ?? "https://image.pollinations.ai",
  /** Optional Pollinations token for higher limits / no watermark (still no card). */
  pollinationsToken: process.env.POLLINATIONS_TOKEN,

  /** Local scratch dir for the file-backed store + disk storage (gitignored). */
  dataDir: path.join(process.cwd(), "data"),

  /** Max prompt length accepted by the API. */
  maxPromptLength: 600,

  /** Global cap on generations per day. */
  dailyCap: Number(process.env.DAILY_GENERATION_CAP ?? 200),

  /** Per-IP request limit per minute for the create endpoint. */
  rateLimitPerMin: Number(process.env.RATE_LIMIT_PER_MIN ?? 12),
};

export type AppConfig = typeof config;
