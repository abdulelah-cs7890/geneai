# Architecture & decisions

Why the system looks the way it does — the part worth talking through in an
interview.

## 1. Async job queue (even though generation is fast)

A `POST /api/jobs` accepts a prompt, runs the safety gate, persists a `queued`
job, **backgrounds** the work via Next's `after()`, and returns immediately. The
browser **polls** `GET /api/jobs/[id]` and renders a live state machine
(`queued → moderating → generating → done`) — see [lib/jobs/types.ts](lib/jobs/types.ts).

FLUX generation is only a few seconds, so this could be synchronous — but the
queue keeps the API instant, gives honest progress UI, gracefully absorbs the
image provider's latency/rate-limits, and means the exact same shape scales to a
slower model later without touching the frontend.

## 2. Swappable backends (the key idea)

Every external dependency sits behind a small interface with multiple
implementations, selected from env in one place ([lib/config.ts](lib/config.ts)):

| Concern  | Interface                          | Local        | Cloud                 |
| -------- | ---------------------------------- | ------------ | --------------------- |
| Job store| [`JobStore`](lib/jobs/store.ts)    | file `./data`| Upstash / Supabase    |
| Storage  | [`Storage`](lib/storage/index.ts)  | disk         | Supabase / R2         |
| Compute  | [`ComputeBackend`](lib/compute/index.ts) | Pollinations FLUX | (add any image model) |

Payoff: **zero-setup local dev** (no accounts, no keys), **incremental promotion**
to the cloud one env var at a time, and a compute layer where swapping the image
model is a single new class.

## 3. Why these specific services (all free, no card)

- **Pollinations FLUX** for generation: FLUX-grade quality, free, no signup, simple
  HTTP. Called server-side from the job's `after()` callback, well inside Vercel's
  60s function budget.
- **Supabase** for storage **and** job state: one free project (Postgres + public
  Storage bucket), no credit card.
- **Vercel** for the app: free, co-locates the API with the UI.
- **Upstash Redis** (optional) for the rate-limit + daily-cap guards.

## 4. Safety & cost controls

- **Prompt safety gate** runs before generation; a rejected prompt never hits the
  model ([lib/moderation.ts](lib/moderation.ts)).
- **Per-IP rate limit + global daily cap** ([lib/ratelimit.ts](lib/ratelimit.ts)),
  dormant without Upstash.

## 5. History / honest scope

This started as a video-to-video / face-swap meme tool. Free face-swap quality was
the dead-end (low-res, uncanny on stylized inputs), so it was pivoted to **prompt →
FLUX image** — where free quality is genuinely excellent. The async queue, swappable
backends, storage, guardrails, and glass UI all carried over unchanged; only the
input (prompt instead of uploads) and the compute backend changed.

## 6. Next steps
- **Identity mode** (PuLID/InstantID via a free HF token) to put a specific face
  into a generated scene — a far higher-quality successor to face-swap.
- **SSE** instead of polling for lower-latency progress.
- **Image-to-image** (Pollinations `kontext`) to transform an uploaded photo.
