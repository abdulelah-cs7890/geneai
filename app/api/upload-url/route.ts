import { NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit } from "@/lib/ratelimit";
import { getStorage } from "@/lib/storage";
import { IMAGE_TYPES, VIDEO_TYPES, extFromName } from "@/lib/uploads";

export const runtime = "nodejs";

/**
 * POST /api/upload-url — mint a jobId + storage keys and return presigned PUT
 * URLs so the browser uploads the driver video + character image directly to
 * storage (never through the size-limited serverless function). The client then
 * calls POST /api/jobs with the returned keys.
 */
const schema = z.object({
  mode: z.enum(["v2v", "faceswap"]).default("v2v"),
  driverName: z.string().min(1),
  driverType: z.string(),
  characterName: z.string().min(1),
  characterType: z.string(),
});

export async function POST(req: Request) {
  const limited = await rateLimit(req);
  if (limited) return limited;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const { mode, driverName, driverType, characterName, characterType } = parsed.data;

  // In faceswap mode the "driver" slot is the base image; in v2v it's the video.
  const driverAllowed = mode === "faceswap" ? IMAGE_TYPES : VIDEO_TYPES;
  if (!driverAllowed.includes(driverType)) {
    const label = mode === "faceswap" ? "Base image" : "Driver video";
    return NextResponse.json({ error: `${label} must be one of: ${driverAllowed.join(", ")}.` }, { status: 415 });
  }
  if (!IMAGE_TYPES.includes(characterType)) {
    const label = mode === "faceswap" ? "Face image" : "Character image";
    return NextResponse.json({ error: `${label} must be one of: ${IMAGE_TYPES.join(", ")}.` }, { status: 415 });
  }

  const jobId = crypto.randomUUID();
  const driverKey = `${jobId}/driver${extFromName(driverName, mode === "faceswap" ? ".jpg" : ".mp4")}`;
  const characterKey = `${jobId}/character${extFromName(characterName, ".jpg")}`;

  const storage = await getStorage();
  const [driverPut, characterPut] = await Promise.all([
    storage.presignPut(driverKey, driverType),
    storage.presignPut(characterKey, characterType),
  ]);

  return NextResponse.json({
    jobId,
    driver: { key: driverKey, putUrl: driverPut },
    character: { key: characterKey, putUrl: characterPut },
  });
}
