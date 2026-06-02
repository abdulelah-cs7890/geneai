# Deploying the live demo (free, no credit card)

Just **two** free no-card services: **Supabase** (storage **and** job state) and
**Vercel** (app + API + compute). The app auto-selects backends from env vars
(see [lib/config.ts](lib/config.ts)) — this is all configuration, no code.

> **How it runs:** the browser uploads the driver clip + character image straight
> to Supabase via signed URLs (bypassing Vercel's ~4.5 MB function-body limit),
> the API renders the 9:16 clip with FFmpeg **inside the Vercel function**
> (backgrounded via `after()`), writes the result back to Supabase, and tracks job
> state in a Supabase Postgres table. No GPU service, no Redis, no card. (The
> effect is the FFmpeg composite; swapping in a real model later is a worker
> change, not an infra change.)

## 1. Supabase (storage + job store)

1. Create a project at **supabase.com** (free, no card).
2. **Storage → New bucket** → name it (e.g. `geneai-media`) → **Public bucket: ON**
   → create. (Public = the in-function renderer and the browser can read by URL.)
3. **SQL Editor → New query**, run this once to create the job table:
   ```sql
   create table if not exists jobs (
     id text primary key,
     data jsonb not null,
     created_at bigint not null
   );
   ```
4. **Project Settings → API**, copy:
   - **Project URL** → `SUPABASE_URL`
   - **service_role** secret key → `SUPABASE_SERVICE_ROLE_KEY` (server-only!)
   - `SUPABASE_BUCKET` = the exact bucket name from step 2

## 2. Vercel (app + API + compute)

1. Push the repo to GitHub, then **Import Project** at **vercel.com** (free, no card).
   Framework auto-detects as Next.js.
2. Add the env vars below, then deploy.
3. After the first deploy you'll have a `*.vercel.app` URL — set it as
   `NEXT_PUBLIC_BASE_URL` and **redeploy**.

### Vercel env vars

| Var | From |
| --- | --- |
| `SUPABASE_URL` | step 1 |
| `SUPABASE_SERVICE_ROLE_KEY` | step 1 (secret) |
| `SUPABASE_BUCKET` | step 1 (must match the bucket name exactly) |
| `NEXT_PUBLIC_BASE_URL` | your `https://your-app.vercel.app` (set after first deploy) |
| `WORKER_WEBHOOK_SECRET` | any long random string (only used if you add a GPU worker later) |

> Vercel free functions allow `maxDuration` up to 60s (already set on `/api/jobs`),
> plenty for an FFmpeg render of a ≤15s clip.

## 3. Verify live

- Open the Vercel URL, upload a short clip + a portrait, hit **Generate**.
- Watch the stage timeline advance `queued → … → done`; the result plays from the
  Supabase public URL and downloads.
- Upload a file named `nsfw-test.mp4` → confirm it's `rejected` before any render.

---

## Optional add-ons (later)

- **Guardrails (rate limit + daily cap)** — set `UPSTASH_REDIS_REST_URL` /
  `UPSTASH_REDIS_REST_TOKEN` (free Upstash DB, no card). They're dormant without it.
- **Real AI model** — move compute to a GPU worker: deploy
  [worker/modal_app.py](worker/modal_app.py) to Modal (or call a free Hugging Face
  Space) and set `MODAL_ENDPOINT_URL`. App + storage stay the same.
- **Cloudflare R2** instead of Supabase Storage (needs a card) — set the `R2_*` vars.
