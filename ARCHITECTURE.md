# Architecture & decisions

This documents *why* the system looks the way it does — the part worth talking
through in an interview.

## 1. The core problem: V2V is slow, so the request can't be

Full-body motion transfer takes **minutes** on a GPU. A synchronous HTTP request
would time out and a single render would pin a server. So the whole design is
**async job-oriented**:

1. `POST /api/jobs` accepts the upload, runs the safety gate, persists a `queued`
   job, **dispatches** compute, and returns immediately.
2. Compute advances the job through an explicit **state machine**
   (`moderating → normalizing → extracting_pose → generating → stitching → done`)
   — see [`lib/jobs/types.ts`](lib/jobs/types.ts).
3. The browser **polls** `GET /api/jobs/[id]` and renders a live, honest
   stage-by-stage timeline. (Polling over SSE/WebSockets keeps it serverless- and
   Vercel-friendly; the state machine is transport-agnostic, so swapping to SSE is
   a UI change, not a backend one.)

The slowness isn't hidden — it's the feature that justifies the architecture.

## 2. Swappable backends (the key idea)

Every external dependency sits behind a small interface with **two
implementations**, selected from env in one place ([`lib/config.ts`](lib/config.ts)):

| Concern  | Interface                        | Local            | Cloud           |
| -------- | -------------------------------- | ---------------- | --------------- |
| Job store| [`JobStore`](lib/jobs/store.ts)  | file `./data`    | Upstash Redis   |
| Storage  | [`Storage`](lib/storage/index.ts)| disk             | Cloudflare R2   |
| Compute  | [`ComputeBackend`](lib/compute/index.ts) | FFmpeg mock | Modal GPU |

Payoff:

- **Develops with zero setup** — no GPU, no Redis, no S3, no API keys. `npm run
  dev` is a full working demo.
- **Promotes incrementally** — turn on Redis, then R2, then Modal, one env var at
  a time, de-risking the path to a live demo.
- **Same state machine everywhere** — the mock walks the identical stages the GPU
  worker does, so the local demo faithfully represents production.

## 3. Why these specific services

- **Modal** for GPU: serverless, bills **only while a job runs** (idle = $0), so a
  free credit budget covers a demo. The app dispatches via one HTTP call; Modal
  runs the job detached and reports back via webhook.
- **Cloudflare R2** for blobs: **zero egress fees** — decisive for high-bandwidth
  video delivery on a tight budget. Signed via tiny `aws4fetch`, no aws-sdk bloat.
- **Upstash Redis** for job state: serverless + HTTP, so it works from Vercel
  functions with no connection pooling, and the free tier is plenty.
- **Vercel** for the frontend: free, and Next.js API routes co-locate the
  orchestration with the UI.

## 4. Cost & safety controls (built in, on purpose)

- **Safety gate before GPU** — moderation runs at upload time; a rejected job
  never reaches the model, so junk can't burn GPU credits. NudeNet in prod, a
  filename heuristic locally so the reject path is demoable.
- **Hard duration cap** — enforced at the FFmpeg normalize step (`-t 15`), the
  cheapest possible stage, so a 60s upload can't become a 60s GPU bill.
- **Fail-safe webhook** — worker callbacks are authenticated with a shared secret;
  the worker never lets a webhook failure crash the GPU job.

## 5. What's real vs stubbed

**Real and running:** the async queue, state machine, live progress UI, safety
gate, both storage backends, both job stores, FFmpeg normalization/compositing,
webhook protocol, and the Modal app scaffold.

**Stubbed (clearly marked):** the two ML stages in
[`worker/pipeline.py`](worker/pipeline.py) — `_extract_pose` (DWPose) and
`_motion_transfer` (the diffusion model). They have exact integration points and
currently pass through / composite so a real mp4 still flows end-to-end.

## 6. Known limitations / next steps

- **Polling → SSE** for lower-latency progress on long jobs.
- **Local store concurrency**: the file store serializes writes in-process; it's a
  dev convenience, not for multi-instance use (that's what the Redis store is for).
- **Refund/retry policy**: V2V fails often; a production build needs credit refunds
  on `failed` and a bounded auto-retry.
- **Lip-sync**: swapping the character desyncs the original voice; a real product
  would add Wav2Lip or lean into the mismatch as a style.
- **Likeness/consent**: default the character library to licensed or own-likeness
  images before any public launch.
