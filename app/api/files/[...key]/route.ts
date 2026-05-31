import fs from "node:fs/promises";
import path from "node:path";
import { config } from "@/lib/config";

export const runtime = "nodejs";

/**
 * GET /api/files/[...key] — serve blobs from local disk storage with HTTP Range
 * support (so the <video> element can seek/scrub). In production R2 serves these
 * directly; this route only exists for the local storage backend.
 */
const CONTENT_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export async function GET(req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const { key } = await params;
  const rel = key.map(decodeURIComponent).join("/");
  const root = path.join(config.dataDir, "blobs");
  const file = path.join(root, rel);

  // Path-traversal guard: resolved path must stay under the blobs root.
  if (!file.startsWith(root + path.sep)) {
    return new Response("Forbidden", { status: 403 });
  }

  let data: Buffer;
  try {
    data = await fs.readFile(file);
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const type = CONTENT_TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream";
  const range = req.headers.get("range");

  if (range) {
    const match = /bytes=(\d+)-(\d*)/.exec(range);
    if (match) {
      const start = Number(match[1]);
      const end = match[2] ? Number(match[2]) : data.length - 1;
      const chunk = data.subarray(start, end + 1);
      return new Response(toArrayBuffer(chunk), {
        status: 206,
        headers: {
          "content-type": type,
          "content-range": `bytes ${start}-${end}/${data.length}`,
          "accept-ranges": "bytes",
          "content-length": String(chunk.length),
        },
      });
    }
  }

  return new Response(toArrayBuffer(data), {
    headers: {
      "content-type": type,
      "accept-ranges": "bytes",
      "content-length": String(data.length),
      "cache-control": "private, max-age=3600",
    },
  });
}

function toArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}
