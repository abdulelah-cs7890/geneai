/**
 * One-off: generate the landing-page gallery images from lib/examples.json using
 * Pollinations FLUX (free, no auth). Writes public/examples/<file> for each entry.
 *
 *   node scripts/gen-examples.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const examples = JSON.parse(readFileSync("lib/examples.json", "utf8"));
mkdirSync("public/examples", { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let i = 0;
for (const e of examples) {
  i++;
  const url =
    "https://image.pollinations.ai/prompt/" +
    encodeURIComponent(e.prompt) +
    `?width=1024&height=1024&model=flux&nologo=true&enhance=true&seed=${i * 13 + 7}`;
  const r = await fetch(url);
  const ct = r.headers.get("content-type") || "";
  if (!r.ok || !ct.startsWith("image")) {
    console.log(`✗ ${e.file}: ${r.status} ${ct}`);
    continue;
  }
  writeFileSync(`public/examples/${e.file}`, Buffer.from(await r.arrayBuffer()));
  console.log(`✓ ${e.file} — "${e.prompt.slice(0, 50)}…"`);
  await sleep(16000); // respect Pollinations anon rate limit (~1 req / 15s)
}
console.log("done");
