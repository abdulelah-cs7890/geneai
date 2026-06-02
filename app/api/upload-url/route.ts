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
  const { driverName, driverType, characterName, characterType } = parsed.data;

  if (!VIDEO_TYPES.includes(driverType)) {
    return NextResponse.json({ error: `Driver video must be one of: ${VIDEO_TYPES.join(", ")}.` }, { status: 415 });
  }
  if (!IMAGE_TYPES.includes(characterType)) {
    return NextResponse.json({ error: `Character image must be one of: ${IMAGE_TYPES.join(", ")}.` }, { status: 415 });
  }

  const jobId = crypto.randomUUID();
  const driverKey = `${jobId}/driver${extFromName(driverName, ".mp4")}`;
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
