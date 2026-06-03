/**
 * One-off: generate before/after face-swap examples for the landing-page gallery.
 * Base = an AI-generated humanoid android (Pollinations, free/no-auth t2i); face =
 * an AI-generated real face (thispersondoesnotexist). Runs the SAME pipeline as the
 * app: felixrosberg swap → CodeFormer restore. No real people involved.
 * Writes public/examples/ex{N}-base.jpg (robot) + ex{N}-face.jpg + ex{N}-after.webp.
 *
 *   node scripts/gen-examples.mjs
 */
import { Client } from "@gradio/client";
import { mkdirSync, writeFileSync } from "node:fs";

const OUT = "public/examples";
mkdirSync(OUT, { recursive: true });

const ROBOTS = [
  "photorealistic portrait of a humanoid android robot, sleek white and chrome plating, glowing cyan eyes, human-shaped face, front facing, dark studio background, sharp focus",
  "photorealistic portrait of a futuristic black and gold humanoid robot, human-shaped face, glowing amber eyes, intricate mechanical details, front facing, dark background",
  "photorealistic portrait of a silver chrome android with a human-shaped face, glowing blue eyes, cyberpunk style, front facing, studio lighting, highly detailed",
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const blob = (buf, type = "image/jpeg") => new Blob([new Uint8Array(buf)], { type });
const grab = async (u) => Buffer.from(await (await fetch(u)).arrayBuffer());
function* walk(n) {
  if (!n || typeof n !== "object") return;
  if (Array.isArray(n)) { for (const v of n) yield* walk(v); return; }
  if (typeof n.url === "string") yield n.url;
  for (const v of Object.values(n)) yield* walk(v);
}
async function robot(prompt, seed) {
  const u = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=768&height=768&nologo=true&model=flux&seed=${seed}`;
  const r = await fetch(u);
  if (!r.ok || !(r.headers.get("content-type") || "").startsWith("image")) throw new Error(`pollinations ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}
async function realFace() {
  const r = await fetch("https://thispersondoesnotexist.com/", { headers: { "user-agent": "Mozilla/5.0" } });
  return Buffer.from(await r.arrayBuffer());
}

const swap = await Client.connect("felixrosberg/face-swap");
const restore = await Client.connect("leonelhs/CodeFormer");
console.log("connected to swap + restore");

for (let i = 0; i < ROBOTS.length; i++) {
  const n = i + 1;
  const base = await robot(ROBOTS[i], 40 + i);
  const face = await realFace();
  await sleep(1000);

  const s = await swap.predict("/run_inference", [blob(base), blob(face), 100, 0, "Target"]);
  const swapped = await grab([...walk(s.data)][0]);

  const r = await restore.predict("/predict", [blob(swapped, "image/webp")]);
  const urls = [...walk(r.data)];
  const after = await grab(urls[urls.length - 1]);

  writeFileSync(`${OUT}/ex${n}-face.jpg`, face);
  writeFileSync(`${OUT}/ex${n}-base.jpg`, base);
  writeFileSync(`${OUT}/ex${n}-after.webp`, after);
  console.log(`✓ example ${n}: robot + real face → cyborg (${after.length}b)`);
}
console.log("done");
process.exit(0);
