# GeneAI — AI Image Generator

Type a prompt, get a high-quality AI image in seconds. Built on a real **async job
queue** with swappable serverless backends, powered by **FLUX** (Pollinations) —
**free, no sign-up, no credit card.**

> **Runs on a laptop with zero setup.** With no env configured it uses a
> file-backed job store + on-disk storage, so `npm run dev` is a full working demo.
> Set a couple of env vars to promote storage/job-state to the cloud.

🔗 Live demo: deploy to Vercel (see [DEPLOY.md](DEPLOY.md)).

---

## Quick start

```bash
npm install
npm run dev          # open the printed http://localhost:PORT
```

Type a prompt (or tap an idea chip), pick a style + aspect, hit **Generate**.
A safety filter screens the prompt, the job runs through the queue, and a FLUX
image lands back with a live progress timeline. Try a prompt containing `nsfw` to
see the **safety gate** reject it before generation.

---

## Architecture

```
 Browser ──prompt──▶ Next.js API (Vercel) ──▶ Job Store ◀── poll ── Browser
   │                      │                   (local file / Upstash / Supabase)
   │                      ├── moderate prompt (safety gate)
   │                      └── after(): Compute.dispatch()
   │                                      │
   │                            Pollinations FLUX  (text → image)
   │                                      │
   │                            Blob Storage (local disk / Supabase / R2)
   └──◀ image ◀──────────────────────────┘
```

- **Async job queue + state machine** (`queued → moderating → generating → done`)
  with live polling — see [lib/jobs/](lib/jobs/). Generation runs in the background
  via Next's `after()`, so the API responds instantly.
- **Swappable backends**, env-selected in [lib/config.ts](lib/config.ts):
  job store (file / Upstash / Supabase) and storage (disk / Supabase / R2).
- **Compute**: [lib/compute/pollinations-compute.ts](lib/compute/pollinations-compute.ts)
  calls Pollinations FLUX and stores the result. Swapping in another image model
  is a single new `ComputeBackend`.
- **Guardrails**: per-IP rate limit + a daily cap ([lib/ratelimit.ts](lib/ratelimit.ts)),
  and a prompt safety gate ([lib/moderation.ts](lib/moderation.ts)).

---

## Project layout

```
app/
  api/jobs/            create (prompt) + list + status (polling)
  api/files/           local blob serving (dev only)
  page.tsx             studio UI + examples gallery + how-it-works
components/Studio.tsx  prompt → style/aspect → progress → result image
lib/
  config.ts            env-driven backend selection
  jobs/                Job types, state machine, store (local/Upstash/Supabase)
  storage/             blob storage (local / Supabase / R2)
  compute/             Pollinations FLUX backend
  styles.ts            style presets + aspect sizing
  moderation.ts        prompt safety gate
scripts/
  smoke.mjs            end-to-end test (npm run smoke)
  gen-examples.mjs     regenerate the gallery images
```

---

## Testing

```bash
npm run dev
npm run smoke -- http://localhost:3000   # use the port next dev prints
```
Creates a real job, polls to `done`, asserts the result is an image, and confirms
the NSFW reject path. Point it at the live URL to smoke-test production.

Deploy: see **[DEPLOY.md](DEPLOY.md)** (Supabase + Vercel, both free, no card).
