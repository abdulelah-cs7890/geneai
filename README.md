# GeneAI — V2V Meme Studio

One-click **video-to-video meme generator**: upload a *driver* clip, pick a
*character*, and the system maps the motion onto that character and returns a
vertical 9:16 meme. Built as a portfolio piece to show a **real async,
serverless-GPU pipeline** — not a synchronous API wrapper.

> **Runs on a laptop with no GPU and no accounts.** Every external dependency has
> a zero-config local fallback, so `npm run dev` gives you a working end-to-end
> demo immediately. Flip env vars to promote each piece to the cloud.

---

## Quick start

```bash
npm install
npm run dev
# open http://localhost:3000
```

Drop in a short video + a face/character image and hit **Generate**. With no env
configured you're on the **mock** backend: it walks the exact same job state
machine as the GPU worker and renders a real normalized 9:16 clip via FFmpeg
(bundled — no system install needed), compositing your character in so you can
see two-inputs-in / one-clip-out without a GPU.

Try a file named `nsfw-test.mp4` to watch the **safety gate** reject it *before*
any compute is dispatched.

---

## Testing

**Automated end-to-end** — with the dev server running, in another terminal:

```bash
npm run smoke -- http://localhost:3000   # use the port next dev prints
```

It synthesizes a test clip with the bundled ffmpeg, then drives the real flow
(presign upload URLs → PUT to storage → create job → poll to `done` → fetch the
result) and asserts the NSFW reject path fires. Exits non-zero on failure, so it
works in CI. Point it at the live URL to smoke-test production:
`npm run smoke -- https://your-app.vercel.app`.

**Manual** — open the app, upload a short clip + a portrait, hit Generate, watch
the stage timeline, and download the result. Resize the window to check the
responsive bento/nav.

---

## Architecture in one diagram

```
 Browser ──upload──▶ Next.js API (Vercel) ──▶ Job Store ◀── poll ── Browser
   │                      │                   (local file / Upstash Redis)
   │                      ├──▶ Blob Storage (local disk / Cloudflare R2)
   │                      └──▶ Compute.dispatch()
   │                              │
   │              ┌───────────────┴───────────────┐
   │          mock (local)                   modal (cloud)
   │          FFmpeg in-process          serverless GPU worker
   │              │                          │ DWPose → V2V diffusion
   └──◀ result ◀──┴────── webhook ◀──────────┘ (Python, Modal)
```

Three swappable backends, each chosen automatically from env (see
[`lib/config.ts`](lib/config.ts)):

| Concern   | Local (default)     | Cloud (set env)      |
| --------- | ------------------- | -------------------- |
| Job store | file-backed `./data`| Upstash Redis        |
| Storage   | disk `./data/blobs` | Cloudflare R2        |
| Compute   | FFmpeg **mock**     | **Modal** GPU worker |

See [ARCHITECTURE.md](ARCHITECTURE.md) for the why behind each choice.

---

## Going live (free-tier path)

1. **Frontend** → deploy to **Vercel** (free).
2. **Job store** → create an **Upstash Redis** DB, set `UPSTASH_REDIS_REST_URL` /
   `UPSTASH_REDIS_REST_TOKEN`.
3. **Storage** → create a **Cloudflare R2** bucket, set the `R2_*` vars.
4. **GPU worker** → `modal deploy worker/modal_app.py`, then set
   `MODAL_ENDPOINT_URL` to the printed URL. Modal only bills GPU while a job
   runs, so idle cost is $0 and free credits cover demo traffic.

Full env reference: [.env.example](.env.example).

---

## Project layout

```
app/
  api/jobs/            create + list + status (polling)
  api/webhook/         progress/result callbacks from the GPU worker
  api/files/           local blob serving with HTTP Range
  page.tsx             studio UI + "how it works"
components/            Studio (upload → progress → result), Dropzone
lib/
  config.ts            env-driven backend selection
  jobs/                Job types, state machine, store (local + Upstash)
  storage/             blob storage (local + R2)
  compute/             backends (mock + Modal dispatcher)
  ffmpeg.ts            bundled-binary FFmpeg helpers
  moderation.ts        safety gate (NudeNet in prod, heuristic locally)
worker/
  modal_app.py         Modal app + GPU function + HTTP entrypoint
  pipeline.py          normalize → pose → V2V → stitch → upload
```

---

## Honest scope

The two model stages in `worker/pipeline.py` (`_extract_pose`,
`_motion_transfer`) are **marked stubs** with exact integration points for
DWPose + a motion-transfer model (MimicMotion / MusePose / AnimateAnyone). The
surrounding system — async queue, state machine, live progress, safety gate,
storage, webhooks, env-swappable backends — is fully built and runs today.

This is a demo/portfolio project. Generating likenesses of real people has real
legal and platform-policy constraints; default the character library to licensed
or own-likeness images for any public use.
