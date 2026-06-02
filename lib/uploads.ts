/** Shared upload validation constants + helpers used by the upload routes. */

export const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** Lowercased file extension from a name, or a fallback. */
export function extFromName(name: string, fallback: string): string {
  const m = /\.[a-z0-9]+$/i.exec(name);
  return m ? m[0].toLowerCase() : fallback;
}
