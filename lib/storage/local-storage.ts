import fs from "node:fs/promises";
import path from "node:path";
import { config } from "@/lib/config";
import type { Storage } from "./index";

/**
 * Disk-backed storage for local dev. Files live under ./data/blobs and are
 * served back through the /api/files/[...key] route (mirroring how R2 would
 * hand out object URLs), so no file ever has to live in /public.
 */
export class LocalStorage implements Storage {
  private root = path.join(config.dataDir, "blobs");

  private resolve(key: string): string {
    // Prevent path traversal: keys are flat-ish slugs we generate ourselves.
    const safe = key.replace(/\.\./g, "").replace(/^[/\\]+/, "");
    return path.join(this.root, safe);
  }

  async put(key: string, data: Buffer | Uint8Array, _contentType: string): Promise<string> {
    const file = this.resolve(key);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, data);
    return this.url(key);
  }

  async get(key: string): Promise<Buffer> {
    return fs.readFile(this.resolve(key));
  }

  url(key: string): string {
    return `/api/files/${key.split("/").map(encodeURIComponent).join("/")}`;
  }
}
