"""
The V2V pipeline that runs inside the Modal GPU container.

Each stage posts progress back to the Next.js app's /api/webhook, so the browser
timeline updates live. The FFmpeg stages are real; the two model stages
(`extract_pose`, `motion_transfer`) are clearly marked stubs with the exact
integration points for DWPose + a motion-transfer diffusion model.
"""

from __future__ import annotations

import os
import subprocess
import tempfile
from typing import Any, Optional

import requests


# --------------------------------------------------------------------------- #
# Webhook helper                                                              #
# --------------------------------------------------------------------------- #
def _post(
    callback_url: str,
    secret: str,
    job_id: str,
    status: str,
    message: str = "",
    result: Optional[dict] = None,
    error: Optional[str] = None,
    moderation: Optional[dict] = None,
) -> None:
    body: dict[str, Any] = {"jobId": job_id, "secret": secret, "status": status, "message": message}
    if result:
        body["result"] = result
    if error:
        body["error"] = error
    if moderation:
        body["moderation"] = moderation
    try:
        requests.post(callback_url, json=body, timeout=15)
    except Exception as exc:  # never let a webhook failure crash the GPU job
        print(f"[webhook] post failed: {exc}")


def _download(url: str, dest: str) -> str:
    resp = requests.get(url, timeout=60)
    resp.raise_for_status()
    with open(dest, "wb") as fh:
        fh.write(resp.content)
    return dest


def _ffmpeg(args: list[str]) -> None:
    subprocess.run(["ffmpeg", "-y", *args], check=True, capture_output=True)


# --------------------------------------------------------------------------- #
# Pipeline stages                                                            #
# --------------------------------------------------------------------------- #
def _normalize(driver: str, out: str, max_dur: float, fps: int = 30) -> str:
    """Cover-fit to 1080x1920, fix fps, hard-cap duration to bound GPU cost."""
    _ffmpeg([
        "-t", str(max_dur),
        "-i", driver,
        "-vf", f"scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps={fps}",
        "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
        "-c:a", "aac", out,
    ])
    return out


def _moderate(video: str) -> dict:
    """NSFW safety gate — sample frames and classify, BEFORE the expensive model.

    TODO: load NudeNet (open-source) once from the weights volume and classify a
    handful of sampled frames; flag if any unsafe class crosses a threshold.
    Stubbed to 'safe' so the local→cloud contract is identical.
    """
    return {"flagged": False, "score": 0.0}


def _extract_pose(video: str, out_dir: str) -> str:
    """Extract a driving pose sequence from the normalized driver clip.

    TODO: run DWPose / OpenPose to produce per-frame skeletons that condition the
    motion-transfer model. Stub returns the source clip path unchanged.
    """
    return video


def _motion_transfer(pose_ref: str, character_img: str, out: str) -> str:
    """The heavy V2V step: render the character performing the driver's motion.

    TODO: load the chosen diffusion model (MimicMotion / MusePose / AnimateAnyone)
    from /weights and run inference conditioned on the pose sequence + character
    reference image. Stub composites the character onto the clip so a real,
    inspectable mp4 still comes out end-to-end.
    """
    _ffmpeg([
        "-i", pose_ref,
        "-i", character_img,
        "-filter_complex",
        "[1:v]scale=320:-1[ov];[0:v][ov]overlay=W-w-40:40",
        "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
        "-c:a", "copy", "-shortest", out,
    ])
    return out


def _stitch(video: str, options: dict, out: str) -> str:
    """Burn the watermark bar (and, TODO, subtitles/hype audio) into the final."""
    vf = "null"
    if options.get("watermark", True):
        vf = "drawbox=x=0:y=ih-110:w=iw:h=110:color=black@0.45:t=fill"
    # TODO: addSubtitles -> transcribe + burn CapCut-style captions
    # TODO: addHypeAudio -> amix a bass-drop bed under the original track
    _ffmpeg(["-i", video, "-vf", vf, "-c:v", "libx264", "-preset", "veryfast",
             "-pix_fmt", "yuv420p", "-c:a", "copy", "-movflags", "+faststart", out])
    return out


def _upload_r2(path: str, key: str) -> str:
    """Upload the final mp4 to Cloudflare R2 and return its public URL.

    Uses boto3 against the R2 S3 endpoint; creds come from Modal secrets.
    """
    import boto3

    s3 = boto3.client(
        "s3",
        endpoint_url=f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com",
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )
    s3.upload_file(path, os.environ["R2_BUCKET"], key, ExtraArgs={"ContentType": "video/mp4"})
    return f"{os.environ['R2_PUBLIC_BASE_URL']}/{key}"


# --------------------------------------------------------------------------- #
# Orchestration                                                              #
# --------------------------------------------------------------------------- #
def run(payload: dict) -> None:
    cb = payload["callbackUrl"]
    secret = payload["secret"]
    job = payload["jobId"]
    opts = payload.get("options", {})
    max_dur = float(payload.get("maxDurationSec", 15))

    def post(**kw: Any) -> None:
        _post(cb, secret, job, **kw)

    work = tempfile.mkdtemp(prefix=f"geneai-{job}-")
    try:
        driver = _download(payload["driverUrl"], os.path.join(work, "driver.mp4"))
        character = _download(payload["characterUrl"], os.path.join(work, "char.jpg"))

        post(status="moderating", message="Sampling frames for safety check…")
        verdict = _moderate(driver)
        if verdict["flagged"]:
            post(status="rejected", message="Blocked by safety gate.", moderation=verdict)
            return

        post(status="normalizing", message="Cropping to 9:16, capping duration…")
        norm = _normalize(driver, os.path.join(work, "norm.mp4"), max_dur)

        post(status="extracting_pose", message="Extracting driver pose skeleton…")
        pose = _extract_pose(norm, work)

        post(status="generating", message="Running motion transfer on GPU…")
        raw = _motion_transfer(pose, character, os.path.join(work, "raw.mp4"))

        post(status="stitching", message="Re-muxing audio and burning overlays…")
        final = _stitch(raw, opts, os.path.join(work, "final.mp4"))

        key = f"{job}/output.mp4"
        url = _upload_r2(final, key)
        post(status="done", message="Meme ready.",
             result={"key": key, "url": url, "contentType": "video/mp4"})
    except Exception as exc:
        post(status="failed", message="Pipeline error.", error=str(exc))
        raise
