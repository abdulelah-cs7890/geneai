import { NextResponse } from "next/server";
import { z } from "zod";
import { config } from "@/lib/config";
import { getCompute } from "@/lib/compute";
import { getJobStore } from "@/lib/jobs/store";
import type { Job } from "@/lib/jobs/types";
import { moderateUpload } from "@/lib/moderation";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";

const optionsSchema = z.object({
  addSubtitles: z.boolean().default(false),
  addHypeAudio: z.boolean().default(false),
  watermark: z.boolean().default(true),
});

const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** GET /api/jobs — recent jobs feed for the history rail. */
export async function GET() {
  const store = await getJobStore();
  return NextResponse.json({ jobs: await store.list(12) });
}

/** POST /api/jobs — create a job from a driver video + character image. */
export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data." }, { status: 400 });
  }

  const driver = form.get("driver");
  const character = form.get("character");
  if (!(driver instanceof File) || !(character instanceof File)) {
    return NextResponse.json({ error: "Both 'driver' video and 'character' image are required." }, { status: 400 });
  }

  const options = optionsSchema.parse(JSON.parse((form.get("options") as string) || "{}"));

  const checks = [
    [driver, VIDEO_TYPES, "driver video"] as const,
    [character, IMAGE_TYPES, "character image"] as const,
  ];
  for (const [file, types, label] of checks) {
    if (file.size > config.maxUploadBytes) {
      return NextResponse.json({ error: `${label} exceeds ${config.maxUploadBytes / 1024 / 1024}MB limit.` }, { status: 413 });
    }
    if (!types.includes(file.type)) {
      return NextResponse.json({ error: `${label} must be one of: ${types.join(", ")}.` }, { status: 415 });
    }
  }

  const id = crypto.randomUUID();
  const storage = await getStorage();
  const store = await getJobStore();
  const now = Date.now();

  const driverKey = `${id}/driver${extFor(driver, ".mp4")}`;
  const characterKey = `${id}/character${extFor(character, ".jpg")}`;
  const driverUrl = await storage.put(driverKey, Buffer.from(await driver.arrayBuffer()), driver.type);
  const characterUrl = await storage.put(characterKey, Buffer.from(await character.arrayBuffer()), character.type);

  // Safety gate runs BEFORE any compute is dispatched (no GPU spend on rejects).
  const moderation = await moderateUpload([driver.name, character.name]);

  const base: Job = {
    id,
    status: "queued",
    progress: 0,
    createdAt: now,
    updatedAt: now,
    driverVideo: { key: driverKey, url: driverUrl, contentType: driver.type },
    characterImage: { key: characterKey, url: characterUrl, contentType: character.type },
    options,
    backend: config.compute,
    logs: [{ at: now, stage: "moderating", message: "Running safety gate before GPU dispatch…" }],
  };

  if (moderation.flagged) {
    const rejected = await store.create({
      ...base,
      status: "rejected",
      progress: 100,
      moderation,
      logs: [...base.logs, { at: Date.now(), stage: "rejected", message: moderation.reason ?? "Rejected." }],
    });
    return NextResponse.json({ job: rejected }, { status: 200 });
  }

  const job = await store.create({
    ...base,
    moderation,
    logs: [...base.logs, { at: Date.now(), stage: "queued", message: "Passed safety gate. Queued for generation." }],
  });

  const compute = await getCompute();
  await compute.dispatch(id);

  return NextResponse.json({ job: await store.get(id) }, { status: 201 });
}

function extFor(file: File, fallback: string): string {
  const m = /\.[a-z0-9]+$/i.exec(file.name);
  return m ? m[0].toLowerCase() : fallback;
}
