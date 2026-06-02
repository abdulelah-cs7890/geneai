# Deploying the live demo (free tier)

The app auto-selects cloud backends from env vars (see [lib/config.ts](lib/config.ts)).
Set them up in this order. Everything here is free-tier.

> The browser uploads driver/character files **directly to R2** via presigned
> URLs, then calls the API with just the keys — so big videos never hit Vercel's
> ~4.5 MB function body limit. The Modal worker fetches inputs from R2's public
> URL, renders, uploads the result to R2, and calls `/api/webhook` per stage.

---

## 1. Cloudflare R2 (storage)

1. Create a bucket (e.g. `geneai-media`).
2. **Enable public access** (R2 → Settings → Public access → r2.dev), or attach a
   custom domain. Copy the public base URL → `R2_PUBLIC_BASE_URL`
   (e.g. `https://pub-xxxx.r2.dev`). Inputs + results are served from here.
3. Create an **R2 API token** (Object Read & Write) → gives Access Key ID +
   Secret + your Account ID.
4. Add **CORS** to the bucket so the browser can PUT directly:

   ```json
   [
     {
       "AllowedOrigins": ["https://YOUR-APP.vercel.app", "http://localhost:3000", "http://localhost:3001"],
       "AllowedMethods": ["PUT", "GET"],
       "AllowedHeaders": ["content-type"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

Values produced: `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY`, `R2_PUBLIC_BASE_URL`.

## 2. Upstash Redis (job store + guardrails)

1. Create a Redis database (free tier).
2. Copy the **REST** URL + token → `UPSTASH_REDIS_REST_URL`,
   `UPSTASH_REDIS_REST_TOKEN`. (This also activates the rate-limit + daily-cap
   guards, which are no-ops without it.)

## 3. Modal (serverless GPU worker)

```bash
pip install modal
modal token new

# R2 creds the worker uses to upload results (names must match pipeline.py):
modal secret create geneai-r2 \
  R2_ACCOUNT_ID=... R2_BUCKET=... R2_ACCESS_KEY_ID=... \
  R2_SECRET_ACCESS_KEY=... R2_PUBLIC_BASE_URL=...

modal deploy worker/modal_app.py
# -> copy the printed web URL into MODAL_ENDPOINT_URL
```

## 4. Vercel (frontend + API)

1. Import the repo, framework auto-detected (Next.js).
2. Set env vars (below). For `NEXT_PUBLIC_BASE_URL`: deploy once to learn your
   `*.vercel.app` domain, set it, then redeploy (the worker calls back to
   `${NEXT_PUBLIC_BASE_URL}/api/webhook`).
3. Add that same domain to the R2 CORS `AllowedOrigins` (step 1.4).

### Vercel env vars

| Var | From |
| --- | --- |
| `NEXT_PUBLIC_BASE_URL` | your `https://your-app.vercel.app` |
| `WORKER_WEBHOOK_SECRET` | any long random string |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | step 2 |
| `R2_ACCOUNT_ID` / `R2_BUCKET` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_PUBLIC_BASE_URL` | step 1 |
| `MODAL_ENDPOINT_URL` | step 3 |
| `DAILY_GENERATION_CAP` | optional, default 100 |
| `RATE_LIMIT_PER_MIN` | optional, default 10 |

---

## 5. Verify live

- Open the Vercel URL, upload a ~10–30 MB clip + a portrait, hit Generate.
- Watch the stage timeline advance `queued → … → done`; the result should play
  from the R2 public URL.
- Check **Modal logs**: a GPU container spins up only per job (idle = $0).
- Trip a guard: spam Generate to hit the per-IP/daily `429`; upload a file named
  `nsfw-test.mp4` to confirm `rejected` before any Modal dispatch.

At this point the demo is live with the **FFmpeg stub** as the "model" — the full
distributed architecture is real. Phase 2 swaps in LivePortrait inside
[worker/pipeline.py](worker/pipeline.py); no infra changes needed.
