/**
 * End-to-end smoke test for the GeneAI pipeline.
 *
 *   npm run smoke -- http://localhost:3000     # or your dev port / live URL
 *
 * Self-contained: synthesizes a tiny driver clip + character image with the
 * bundled ffmpeg, then exercises the real flow against a running server —
 * presign upload URLs, PUT both files straight to storage, create the job, poll
 * to `done`, fetch the result, and confirm the NSFW reject path fires. Exits 0
 * on pass, 1 on failure (CI-friendly).
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";

const BASE = process.argv[2] || process.env.SMOKE_BASE || "http://localhost:3000";
const abs = (u) => (u.startsWith("http") ? u : BASE + u);

// --- synthesize test inputs ------------------------------------------------
const dir = mkdtempSync(path.join(os.tmpdir(), "geneai-smoke-"));
const driver = path.join(dir, "driver.mp4");
const character = path.join(dir, "character.png");
const ff = (args) => {
  const r = spawnSync(ffmpegPath, ["-y", ...args], { stdio: "ignore" });
  if (r.status !== 0) throw new Error("ffmpeg failed: " + args.join(" "));
};
ff(["-f", "lavfi", "-i", "testsrc=duration=2:size=480x270:rate=30", "-f", "lavfi",
  "-i", "sine=frequency=440:duration=2", "-c:v", "libx264", "-pix_fmt", "yuv420p",
  "-c:a", "aac", "-shortest", driver]);
ff(["-f", "lavfi", "-i", "color=c=teal:size=400x400:duration=1", "-frames:v", "1", character]);

// --- run one full job ------------------------------------------------------
async function runFlow(driverName) {
  const ur = await fetch(`${BASE}/api/upload-url`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ driverName, driverType: "video/mp4", characterName: "c.png", characterType: "image/png" }),
  });
  const up = await ur.json();
  if (!ur.ok) throw new Error(`upload-url ${ur.status}: ${JSON.stringify(up)}`);
  for (const [u, file, type] of [[up.driver.putUrl, driver, "video/mp4"], [up.character.putUrl, character, "image/png"]]) {
    const pr = await fetch(abs(u), { method: "PUT", headers: { "content-type": type }, body: readFileSync(file) });
    if (!pr.ok) throw new Error(`PUT ${pr.status}`);
  }
  const jr = await fetch(`${BASE}/api/jobs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jobId: up.jobId, driverKey: up.driver.key, characterKey: up.character.key,
      driverName, characterName: "c.png", driverType: "video/mp4", characterType: "image/png",
      options: { watermark: true, addSubtitles: false, addHypeAudio: false },
    }),
  });
  const created = await jr.json();
  if (!jr.ok) throw new Error(`jobs ${jr.status}: ${JSON.stringify(created)}`);
  return created.job;
}

async function main() {
  console.log(`▶ smoke test against ${BASE}`);

  // happy path
  let job = await runFlow("driver.mp4");
  process.stdout.write(`  generating: ${job.status}`);
  for (let i = 0; i < 60 && !["done", "failed", "rejected"].includes(job.status); i++) {
    await new Promise((r) => setTimeout(r, 800));
    job = (await (await fetch(`${BASE}/api/jobs/${job.id}`)).json()).job;
    process.stdout.write(` → ${job.status}`);
  }
  process.stdout.write("\n");
  if (job.status !== "done") throw new Error(`expected done, got ${job.status}: ${job.error ?? ""}`);
  const res = await fetch(job.result.url);
  if (!res.ok || !res.headers.get("content-type")?.startsWith("video/")) {
    throw new Error(`result not a playable video: ${res.status} ${res.headers.get("content-type")}`);
  }
  console.log(`  ✓ happy path → done, result ${res.headers.get("content-length")} bytes`);

  // reject path
  const rej = await runFlow("nsfw-clip.mp4");
  if (rej.status !== "rejected") throw new Error(`expected rejected, got ${rej.status}`);
  console.log("  ✓ reject path → blocked by safety gate");

  console.log("✅ SMOKE PASS");
}

main().catch((e) => {
  console.error("❌ SMOKE FAIL:", e.message);
  process.exit(1);
});
