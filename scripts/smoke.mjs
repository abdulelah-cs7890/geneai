/**
 * End-to-end smoke test for the GeneAI image generator.
 *
 *   npm run smoke -- http://localhost:3000     # or your dev port / live URL
 *
 * Drives the real flow against a running server: create a generation job from a
 * prompt, poll to `done`, confirm the result is a real image, and confirm the
 * NSFW prompt is rejected before generation. Exits non-zero on failure (CI-ready).
 */
const BASE = process.argv[2] || process.env.SMOKE_BASE || "http://localhost:3000";

async function generate(prompt) {
  const jr = await fetch(`${BASE}/api/jobs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt, options: { aspect: "1:1", style: "" } }),
  });
  const data = await jr.json();
  if (!jr.ok) throw new Error(`jobs ${jr.status}: ${JSON.stringify(data)}`);
  let job = data.job;
  for (let i = 0; i < 60 && !["done", "failed", "rejected"].includes(job.status); i++) {
    await new Promise((r) => setTimeout(r, 1000));
    job = (await (await fetch(`${BASE}/api/jobs/${job.id}`, { cache: "no-store" })).json()).job;
  }
  return job;
}

async function main() {
  console.log(`▶ smoke test against ${BASE}`);

  // happy path
  let job = await generate("a cute robot mascot logo, minimal vector, flat design");
  if (job.status !== "done") throw new Error(`expected done, got ${job.status}: ${job.error ?? ""}`);
  const res = await fetch(job.result.url);
  if (!res.ok || !res.headers.get("content-type")?.startsWith("image")) {
    throw new Error(`result not an image: ${res.status} ${res.headers.get("content-type")}`);
  }
  console.log(`  ✓ happy path → done, image ${res.headers.get("content-length")} bytes`);

  // reject path
  const rej = await generate("an explicit nsfw image");
  if (rej.status !== "rejected") throw new Error(`expected rejected, got ${rej.status}`);
  console.log("  ✓ reject path → blocked by safety filter");

  console.log("✅ SMOKE PASS");
}

main().catch((e) => {
  console.error("❌ SMOKE FAIL:", e.message);
  process.exit(1);
});
