import type { Aspect } from "./jobs/types";

/** Client-safe style presets + aspect sizing, shared by the UI and the worker. */

export interface StylePreset {
  id: string;
  label: string;
  /** Appended to the user's prompt before generation. */
  suffix: string;
}

export const STYLE_PRESETS: StylePreset[] = [
  { id: "", label: "None", suffix: "" },
  { id: "photoreal", label: "Photoreal", suffix: ", photorealistic, ultra detailed, cinematic lighting, 4k" },
  { id: "3d", label: "3D render", suffix: ", 3d render, octane render, pixar style, soft studio lighting, highly detailed" },
  { id: "anime", label: "Anime", suffix: ", anime style, vibrant colors, clean line art, studio ghibli inspired" },
  { id: "cyberpunk", label: "Cyberpunk", suffix: ", cyberpunk, neon lights, futuristic, moody, cinematic" },
  { id: "oil", label: "Oil paint", suffix: ", oil painting, textured brush strokes, classical fine art" },
  { id: "meme", label: "Meme", suffix: ", funny internet meme, exaggerated, bold, high contrast" },
];

export function styleSuffix(id: string): string {
  return STYLE_PRESETS.find((s) => s.id === id)?.suffix ?? "";
}

export const ASPECTS: Aspect[] = ["1:1", "9:16", "16:9"];

export const ASPECT_SIZE: Record<Aspect, { w: number; h: number }> = {
  "1:1": { w: 1024, h: 1024 },
  "9:16": { w: 768, h: 1344 },
  "16:9": { w: 1344, h: 768 },
};
