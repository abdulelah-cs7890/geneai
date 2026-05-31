import type { ModerationResult } from "@/lib/jobs/types";

/**
 * Safety gate that runs BEFORE any GPU spend. In production the real check is
 * NudeNet (an open-source NSFW image classifier) sampling frames inside the
 * Modal worker; its verdict flows back through this same ModerationResult shape.
 *
 * Locally we can't run the model, so this is a cheap, demonstrable heuristic:
 * filenames hinting at disallowed content trip the gate, which lets you show the
 * "rejected before the model" path in the UI without any ML. Replace/augment,
 * never rely on filename checks in production.
 */
const BLOCKLIST = ["nsfw", "explicit", "nude", "porn", "gore"];

export async function moderateUpload(filenames: string[]): Promise<ModerationResult> {
  const haystack = filenames.join(" ").toLowerCase();
  const hit = BLOCKLIST.find((term) => haystack.includes(term));
  if (hit) {
    return {
      flagged: true,
      reason: `Upload blocked by safety filter (matched "${hit}"). NSFW and harmful content is not allowed.`,
      score: 0.99,
    };
  }
  return { flagged: false, score: 0 };
}
