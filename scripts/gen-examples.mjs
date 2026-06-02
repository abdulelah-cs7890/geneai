/**
 * One-off: generate before/after face-swap examples for the landing-page gallery.
 * Uses AI-generated faces (thispersondoesnotexist — no real-person likeness) run
 * through the SAME pipeline as the app: felixrosberg swap → CodeFormer restore.
 * Writes public/examples/ex{N}-base.jpg + ex{N}-after.webp.
 *
 *   node scripts/gen-examples.mjs [count]
 */
import { Client } from "@gradio/client";
import { mkdirSync, writeFileSync } from "node:fs";

const OUT = "public/examples";
const N = Number(process.argv[2] || 3);
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const blob = (buf, type = "image/jpeg") => new Blob([new Uint8Array(buf)], { type });

async function face() {
  const r = await fetch("https://thispersondoesnotexist.com/", { headers: { "user-agent": "Mozilla/5.0" } });
  if (!r.ok) throw new Error(`face fetch ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}
function* walk(node) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) { for (const v of node) yield* walk(v); return; }
  if (typeof node.url === "string") yield node.url;
  for (const v of Object.values(node)) yield* walk(v);
}
const grab = async (url) => Buffer.from(await (await fetch(url)).arrayBuffer());

const swap = await Client.connect("felixrosberg/face-swap");
const restore = await Client.connect("leonelhs/CodeFormer");
console.log("connected to swap + restore spaces");

for (let i = 1; i <= N; i++) {
  const base = await face();
  await sleep(2000);
  const src = await face();
  await sleep(1000);

  const s = await swap.predict("/run_inference", [blob(base), blob(src), 100, 0, "Target"]);
  const swapped = await grab([...walk(s.data)][0]);

  const r = await restore.predict("/predict", [blob(swapped, "image/webp")]);
  const urls = [...walk(r.data)];
  const after = await grab(urls[urls.length - 1]);

  writeFileSync(`${OUT}/ex${i}-face.jpg`, src);
  writeFileSync(`${OUT}/ex${i}-base.jpg`, base);
  writeFileSync(`${OUT}/ex${i}-after.webp`, after);
  console.log(`✓ example ${i}: face+base → after ${after.length}b`);
}
console.log("done");
process.exit(0);
