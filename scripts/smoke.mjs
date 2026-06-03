/**
 * End-to-end smoke test for the GeneAI image generator.
 *
 *   npm run smoke -- http://localhost:3000     # or your dev port / live URL
 *
 * Handles both engines: browser-fallback (server returns a clientUrl the browser
 * loads) and Cloudflare (server generates + stores, client polls to `done`).
 * Also confirms the NSFW prompt is rejected. Exits non-zero on failure.
 */
const BASE = process.argv[2] || process.env.SMOKE_BASE || "http://localhost:3000";

async function create(prompt) {
  const jr = await fetch(`${BASE}/api/jobs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt, options: { aspect: "1:1", style: "" } }),
  });
  const data = await jr.json();
  if (!jr.ok) throw new Error(`jobs ${jr.status}: ${JSON.stringify(data)}`);
  return data.job;
}

async function poll(job) {
  for (let i = 0; i < 60 && !["done", "failed", "rejected"].includes(job.status); i++) {
    await new Promise((r) => setTimeout(r, 1000));
    job = (await (await fetch(`${BASE}/api/jobs/${job.id}`, { cache: "no-store" })).json()).job;
  }
  return job;
}

async function main() {
  console.log(`▶ smoke test against ${BASE}`);

  const job = await create("a cute robot mascot logo, minimal vector, flat design");

  if (job.clientUrl) {
    // browser-fallback: server's job is to hand back a valid Pollinations URL.
    if (!/^https:\/\/image\.pollinations\.ai\/prompt\//.test(job.clientUrl)) {
      throw new Error(`bad clientUrl: ${job.clientUrl}`);
    }
    console.log("  ✓ browser engine → server returned a valid Pollinations URL");
  } else {
    const done = await poll(job);
    if (done.status !== "done") throw new Error(`expected done, got ${done.status}: ${done.error ?? ""}`);
    const res = await fetch(done.result.url);
    if (!res.ok || !res.headers.get("content-type")?.startsWith("image")) {
      throw new Error(`result not an image: ${res.status} ${res.headers.get("content-type")}`);
    }
    console.log(`  ✓ cloudflare engine → done, image ${res.headers.get("content-length")} bytes`);
  }

  // reject path (both engines)
  const rej = await create("an explicit nsfw image");
  if (rej.status !== "rejected") throw new Error(`expected rejected, got ${rej.status}`);
  console.log("  ✓ reject path → blocked by safety filter");

  console.log("✅ SMOKE PASS");
}

main().catch((e) => {
  console.error("❌ SMOKE FAIL:", e.message);
  process.exit(1);
});
