import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the bundled FFmpeg binary external so its `__dirname`-based path resolves
  // to the real node_modules location at runtime instead of being rewritten to a
  // "\ROOT\" placeholder by the bundler.
  serverExternalPackages: ["ffmpeg-static"],

  // Ship the single (current-platform) ffmpeg binary inside the /api/jobs function
  // where the pipeline runs via after(). We include only the binary file — not the
  // whole package, and never ffprobe-static (all-platform bins → 250MB blowup).
  outputFileTracingIncludes: {
    "/api/jobs": ["./node_modules/ffmpeg-static/ffmpeg*"],
  },
};

export default nextConfig;
