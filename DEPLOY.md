# Deploying the live demo (free, no credit card)

Two free no-card services: **Supabase** (stores generated images + job state) and
**Vercel** (app + API). Generation runs on **Pollinations FLUX** (free, no key).
Backends are auto-selected from env vars (see [lib/config.ts](lib/config.ts)).

> **How it runs:** the browser sends a prompt → the API screens it, then (via
> `after()`) calls Pollinations FLUX, stores the image in Supabase, and the UI
> polls to completion. No GPU, no uploads, no card.

## 1. Supabase (storage + job store)

1. Create a project at **supabase.com** (free, no card).
2. **Storage → New bucket** → name it (e.g. `geneai-media`) → **Public bucket: ON**
   → create.
3. **SQL Editor → New query**, run once:
   ```sql
   create table if not exists jobs (
     id text primary key,
     data jsonb not null,
     created_at bigint not null
   );
   ```
4. **Project Settings → API**, copy:
   - **Project URL** → `SUPABASE_URL`
   - **service_role** key → `SUPABASE_SERVICE_ROLE_KEY` (server-only!)
   - `SUPABASE_BUCKET` = the exact bucket name

## 2. Vercel (app + API)

1. Push to GitHub, then **Import Project** at **vercel.com** (free, no card).
2. Add the env vars below, then deploy.

### Vercel env vars

| Var | From |
| --- | --- |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_BUCKET` | step 1 |
| `POLLINATIONS_TOKEN` | optional — free token for higher limits / no watermark |
| `DAILY_GENERATION_CAP` / `RATE_LIMIT_PER_MIN` | optional (defaults 200 / 12) |

## 3. Verify live

- Open the Vercel URL, type a prompt, hit **Generate** → watch
  `queued → generating → done`; the image is served from Supabase and downloads.
- Type a prompt containing `nsfw` → confirm it's **rejected** before generation.
- `npm run smoke -- https://your-app.vercel.app` for an automated check.

---

## Optional add-ons (later)
- **Guardrails** (per-IP rate limit + daily cap): create a free **Upstash Redis**
  DB and set `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` (dormant without it).
- **Cloudflare R2** instead of Supabase Storage (needs a card) — set the `R2_*` vars.
