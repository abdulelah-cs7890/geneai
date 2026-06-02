import { config } from "@/lib/config";

/**
 * Blob storage abstraction. Inputs (driver video, character image) and outputs
 * (final meme) all flow through this. Local dev writes to ./data; production
 * writes to Cloudflare R2. Callers only ever see opaque keys + resolvable URLs.
 */
export interface Storage {
  /** Persist bytes under `key`, returning a URL the browser can fetch. */
  put(key: string, data: Buffer | Uint8Array, contentType: string): Promise<string>;
  /** Read bytes back (used by the worker/mock to process inputs). */
  get(key: string): Promise<Buffer>;
  /** Resolve the public/served URL for a key without fetching it. */
  url(key: string): string;
  /**
   * Return a URL the browser can `PUT` bytes to directly, so large video never
   * passes through the (size-limited) serverless function. R2 returns a SigV4
   * presigned URL; local returns the /api/files route (which accepts PUT).
   */
  presignPut(key: string, contentType: string): Promise<string>;
}

let cached: Storage | null = null;

export async function getStorage(): Promise<Storage> {
  if (cached) return cached;
  if (config.storage === "r2") {
    const { R2Storage } = await import("./r2-storage");
    cached = new R2Storage();
  } else {
    const { LocalStorage } = await import("./local-storage");
    cached = new LocalStorage();
  }
  return cached;
}
