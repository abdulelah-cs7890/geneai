import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";

/**
 * Thin FFmpeg wrapper around the bundled static binary, so local dev needs no
 * system install and the Vercel function carries only the (linux) ffmpeg binary.
 */

function run(bin: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args);
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve(stderr);
      else reject(new Error(`${bin} exited ${code}\n${stderr.slice(-2000)}`));
    });
  });
}

export interface ComposeOptions {
  maxDurationSec: number;
  fps: number;
  watermark: boolean;
}

/**
 * Normalize the driver video to a clean vertical 9:16 (1080x1920) clip and, for
 * the local mock backend, composite the chosen character image into the frame so
 * the demo visibly proves "two inputs in, one rendered clip out" without a GPU.
 *
 * The real V2V model (on Modal) replaces this composite with actual motion
 * transfer; the surrounding normalize/cap/watermark steps are identical.
 */
export async function normalizeAndComposite(
  driverPath: string,
  characterImagePath: string,
  outputPath: string,
  opts: ComposeOptions,
): Promise<void> {
  const filters = [
    // Cover-fit the driver to exactly 1080x1920.
    "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=" +
      opts.fps +
      "[bg]",
    // Character image as a labelled thumbnail (stands in for the swapped subject).
    "[1:v]scale=320:-1[ov]",
    "[bg][ov]overlay=W-w-40:40[comp]",
  ];
  // Watermark = a translucent bar (no font dependency, robust on Windows).
  const last = opts.watermark
    ? "[comp]drawbox=x=0:y=ih-110:w=iw:h=110:color=black@0.45:t=fill[outv]"
    : "[comp]null[outv]";
  filters.push(last);

  await run(ffmpegPath as string, [
    "-y",
    "-t",
    String(opts.maxDurationSec), // hard cost cap
    "-i",
    driverPath,
    "-i",
    characterImagePath,
    "-filter_complex",
    filters.join(";"),
    "-map",
    "[outv]",
    "-map",
    "0:a?", // keep original audio if present
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-shortest",
    "-movflags",
    "+faststart",
    outputPath,
  ]);
}
