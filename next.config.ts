import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the bundled FFmpeg/FFprobe binaries external so their `__dirname`-based
  // paths resolve to the real node_modules location at runtime instead of being
  // rewritten to a "\ROOT\" placeholder by the bundler.
  serverExternalPackages: ["ffmpeg-static", "ffprobe-static"],
};

export default nextConfig;
