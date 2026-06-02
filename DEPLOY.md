# Deploying the live demo (free, no credit card)

Three free no-card services: **Vercel** (app + API + compute), **Supabase**
(storage), **Upstash** (job state). The app auto-selects backends from env vars
(see [lib/config.ts](lib/config.ts)), so this is all configuration — no code.

> **How it runs:** the browser uploads the driver clip + character image straight
> to Supabase via signed URLs (bypassing Vercel's ~4.5 MB function-body limit),
> then the API renders the 9:16 clip with FFmpeg **inside the Vercel function**
> (backgrounded via `after()`) and writes the result back to Supabase. No GPU
> service, no card. (The effect is the FFmpeg composite; swapping in a real model
> later is a worker change, not an infra change.)

Set them up in this order.

## 1. Supabase (storage)

1. Create a project at **supabase.com** (free, no card).
2. **Storage → New bucket** → name `geneai-media` → toggle **Public bucket: on** →
   create. (Public = the in-function worker and the browser can read results by URL.)
3. **Project Settings → API**, copy:
   - **Project URL** → `SUPABASE_URL` (e.g. `https://abcd.supabase.co`)
   - **service_role** secret key → `SUPABASE_SERVICE_ROLE_KEY` (server-only!)
   - `SUPABASE_BUCKET` = `geneai-media`

## 2. Upstash (job store + guardrails)

1. Create a Redis database at **upstash.com** (free, no card).
2. From the database page, copy the **REST** credentials:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`

   (This also activates the per-IP rate limit + daily cap, which are no-ops without it.)

## 3. Vercel (app + API + compute)

1. Push the repo to GitHub, then **Import Project** at **vercel.com** (free, no card).
   Framework auto-detects as Next.js.
2. Add the env vars below, then deploy.
3. After the first deploy you'll have a `*.vercel.app` URL — set it as
   `NEXT_PUBLIC_BASE_URL` and **redeploy** (used to build absolute URLs).

### Vercel env vars

| Var | From |
| --- | --- |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_BUCKET` | step 1 |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | step 2 |
| `NEXT_PUBLIC_BASE_URL` | your `https://your-app.vercel.app` (set after first deploy) |
| `WORKER_WEBHOOK_SECRET` | any long random string (only needed if you later add a GPU worker) |
| `DAILY_GENERATION_CAP` / `RATE_LIMIT_PER_MIN` | optional (defaults 100 / 10) |

> Vercel free functions allow `maxDuration` up to 60s (already set on `/api/jobs`),
> which is plenty for an FFmpeg render of a ≤15s clip.

## 4. Verify live

- Open the Vercel URL, upload a short clip + a portrait, hit **Generate**.
- Watch the stage timeline advance `queued → … → done`; the result plays from the
  Supabase public URL and downloads.
- Upload a file named `nsfw-test.mp4` → confirm it's `rejected` before any render.
- Spam Generate to confirm the per-IP / daily `429` guard (needs Upstash).

---

## Optional upgrades (later)

- **Real AI model** — move compute to a GPU worker: deploy
  [worker/modal_app.py](worker/modal_app.py) to Modal (or call a free Hugging Face
  Space) and set `MODAL_ENDPOINT_URL`. The app + storage stay exactly the same.
- **Cloudflare R2** instead of Supabase (needs a card) — set the `R2_*` vars; the
  storage layer switches automatically.
