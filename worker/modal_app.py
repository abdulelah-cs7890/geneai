"""
Modal serverless-GPU worker for GeneAI.

This is the production compute backend. The Next.js app POSTs a job payload to
this web endpoint; Modal cold-starts a GPU container ONLY for the duration of the
job (so it costs $0 when idle and fits a free credit budget), runs the V2V
pipeline, and POSTs progress + the final result back to the app's /api/webhook.

Deploy:
    pip install modal
    modal token new
    modal deploy worker/modal_app.py
    # -> copy the printed web URL into the app's MODAL_ENDPOINT_URL env var

The heavy model load + inference in `pipeline.run` is intentionally a clearly
marked stub: it produces a real normalized 9:16 clip via FFmpeg so the end-to-end
contract (webhook stages, result upload) is exercised, with TODOs marking exactly
where DWPose + the motion-transfer diffusion model slot in.
"""

from __future__ import annotations

import modal

app = modal.App("geneai-worker")

# Container image: CUDA-capable torch + ffmpeg + the CV deps the real models need.
image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg")
    .pip_install(
        "torch",
        "torchvision",
        "opencv-python-headless",
        "numpy",
        "pillow",
        "requests",
        "boto3",  # R2 upload of the finished clip
        # Real pipeline would add: "diffusers", "transformers", "onnxruntime-gpu"
        # plus the chosen V2V model (MimicMotion / MusePose / AnimateAnyone).
    )
    # Make worker/pipeline.py importable inside the container.
    .add_local_python_source("pipeline")
)

# Persisted cache so model weights are downloaded once, not per cold-start.
weights = modal.Volume.from_name("geneai-weights", create_if_missing=True)


@app.function(
    image=image,
    gpu="A10G",  # plenty for LivePortrait/MimicMotion; bump to A100 for big batches
    timeout=600,
    volumes={"/weights": weights},
    # R2 creds for uploading the result (create with: modal secret create geneai-r2 ...)
    secrets=[modal.Secret.from_name("geneai-r2")],
)
def generate(payload: dict) -> None:
    """Run the V2V pipeline for one job and report progress via webhook."""
    from pipeline import run

    run(payload)


@app.function(image=image)
@modal.fastapi_endpoint(method="POST")
def submit(payload: dict) -> dict:
    """Public HTTP entrypoint the Next.js app dispatches to. Returns immediately;
    the GPU function runs detached and the app learns the outcome via webhook."""
    generate.spawn(payload)
    return {"accepted": True, "jobId": payload.get("jobId")}
