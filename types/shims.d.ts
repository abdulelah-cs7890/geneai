// Minimal module declarations for packages that ship without their own types.
declare module "ffmpeg-static" {
  const path: string;
  export default path;
}

declare module "ffprobe-static" {
  export const path: string;
}
