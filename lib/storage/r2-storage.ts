import { AwsClient } from "aws4fetch";
import type { Storage } from "./index";

/**
 * Cloudflare R2 storage via the S3 API, using the tiny `aws4fetch` signer
 * (no aws-sdk bloat in the serverless bundle). R2 has zero egress fees, which
 * matters for high-bandwidth video delivery on a free/cheap budget.
 *
 * Requires: R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
 * and R2_PUBLIC_BASE_URL (a public bucket domain or a worker that proxies it).
 */
export class R2Storage implements Storage {
  private client = new AwsClient({
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    region: "auto",
    service: "s3",
  });
  private endpoint = `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${process.env.R2_BUCKET}`;
  private publicBase = process.env.R2_PUBLIC_BASE_URL!;

  async put(key: string, data: Buffer | Uint8Array, contentType: string): Promise<string> {
    const body = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
    const res = await this.client.fetch(`${this.endpoint}/${key}`, {
      method: "PUT",
      body,
      headers: { "content-type": contentType },
    });
    if (!res.ok) throw new Error(`R2 put failed: ${res.status} ${await res.text()}`);
    return this.url(key);
  }

  async get(key: string): Promise<Buffer> {
    const res = await this.client.fetch(`${this.endpoint}/${key}`);
    if (!res.ok) throw new Error(`R2 get failed: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }

  url(key: string): string {
    return `${this.publicBase}/${key}`;
  }
}
