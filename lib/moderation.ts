import type { ModerationResult } from "@/lib/jobs/types";

/**
 * Prompt safety gate that runs BEFORE generation (no model spend on rejects).
 * This is a cheap keyword heuristic — enough to block obvious NSFW/harmful
 * prompts and to demo the "rejected before the model" path. A production build
 * would add a real text-moderation model. Note: Pollinations also enforces its
 * own content policy server-side.
 */
const BLOCKLIST = ["nsfw", "explicit", "nude", "naked", "porn", "sex", "gore", "child", "cp ", "underage"];

export async function moderatePrompt(prompt: string): Promise<ModerationResult> {
  const text = ` ${prompt.toLowerCase()} `;
  const hit = BLOCKLIST.find((term) => text.includes(term));
  if (hit) {
    return {
      flagged: true,
      reason: `Prompt blocked by the safety filter (matched "${hit.trim()}"). NSFW and harmful content isn't allowed.`,
      score: 0.99,
    };
  }
  return { flagged: false, score: 0 };
}
