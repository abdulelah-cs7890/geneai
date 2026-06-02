import path from "node:path";

/**
 * Central, env-driven backend selection.
 *
 * The whole app is built around three swappable backends — job store, blob
 * storage, and compute — each with a zero-config LOCAL implementation and a
 * cloud implementation. Locally you get a working end-to-end demo with no
 * accounts and no GPU; in production you set a few env vars and the exact same
 * code talks to Upstash + R2 + a Modal GPU worker.
 */
export const config = {
  /** Upstash Redis if configured, else a file-backed local store. */
  jobStore: process.env.UPSTASH_REDIS_REST_URL ? ("redis" as const) : ("local" as const),

  /**
   * Blob storage: Supabase (free, no card — the live-demo default) if configured,
   * else Cloudflare R2 (needs a card), else local disk under ./data.
   */
  storage:
    process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
      ? ("supabase" as const)
      : process.env.R2_ACCOUNT_ID && process.env.R2_BUCKET
        ? ("r2" as const)
        : ("local" as const),

  /** Modal serverless GPU worker if configured, else the local FFmpeg mock. */
  compute: process.env.MODAL_ENDPOINT_URL ? ("modal" as const) : ("mock" as const),

  /** Local scratch dir for the file-backed store + disk storage (gitignored). */
  dataDir: path.join(process.cwd(), "data"),

  /** Hard duration cap enforced at FFmpeg time to bound GPU cost. */
  maxDurationSec: 15,

  /** Max upload size accepted by the API (bytes). */
  maxUploadBytes: 60 * 1024 * 1024, // 60 MB

  /** Global cap on generations per day (protects finite GPU credits). */
  dailyCap: Number(process.env.DAILY_GENERATION_CAP ?? 100),

  /** Per-IP request limit per minute for the upload/create endpoints. */
  rateLimitPerMin: Number(process.env.RATE_LIMIT_PER_MIN ?? 10),

  /** Shared secret the Modal worker uses to authenticate webhook callbacks. */
  webhookSecret: process.env.WORKER_WEBHOOK_SECRET ?? "dev-secret",

  /** Public base URL (used to build absolute webhook URLs for the worker). */
  baseUrl: process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000",
};

export type AppConfig = typeof config;
