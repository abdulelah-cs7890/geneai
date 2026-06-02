import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Storage } from "./index";

/**
 * Supabase Storage backend — the free, no-credit-card storage for the live demo.
 * Fits the existing presign → direct PUT flow: `presignPut` returns a Supabase
 * signed upload URL the browser PUTs straight to, so big video never passes
 * through the serverless function. Objects live in a PUBLIC bucket so both the
 * in-function FFmpeg worker and the browser can read them by URL.
 *
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (server-only), SUPABASE_BUCKET.
 */
export class SupabaseStorage implements Storage {
  private client: SupabaseClient;
  private base = process.env.SUPABASE_URL!;
  private bucket = process.env.SUPABASE_BUCKET ?? "geneai-media";

  constructor() {
    this.client = createClient(this.base, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    });
  }

  async put(key: string, data: Buffer | Uint8Array, contentType: string): Promise<string> {
    const { error } = await this.client.storage.from(this.bucket).upload(key, data, {
      contentType,
      upsert: true,
    });
    if (error) throw new Error(`Supabase upload failed: ${error.message}`);
    return this.url(key);
  }

  async get(key: string): Promise<Buffer> {
    const res = await fetch(this.url(key));
    if (!res.ok) throw new Error(`Supabase get failed: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }

  url(key: string): string {
    return `${this.base}/storage/v1/object/public/${this.bucket}/${key}`;
  }

  // Signed upload URL the browser PUTs the file to directly (uuid keys are fresh,
  // so no upsert collision). Content-Type is set by the client on the PUT.
  async presignPut(key: string): Promise<string> {
    const { data, error } = await this.client.storage.from(this.bucket).createSignedUploadUrl(key);
    if (error || !data) throw new Error(`Supabase sign failed: ${error?.message ?? "no data"}`);
    return data.signedUrl;
  }
}
