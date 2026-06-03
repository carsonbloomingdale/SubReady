from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from llama_cpp import Llama
from pydantic import BaseModel, Field
import json
import os

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"])

MODEL_PATH = os.environ.get("MODEL_PATH", "./model/Qwen3-4B-Q4_K_M.gguf")
# Default llama.cpp n_ctx is 512 — too small for OCR text + prompt.
N_CTX = int(os.environ.get("N_CTX", "8192"))
MAX_OCR_CHARS = int(os.environ.get("MAX_OCR_CHARS", "12000"))

llm = Llama(
    model_path=MODEL_PATH,
    n_ctx=N_CTX,
    n_gpu_layers=-1,  # offload all layers to Metal on Apple Silicon
    verbose=False,
)


class TriageRequest(BaseModel):
    ocrText: str = Field(default="")


class TriageResponse(BaseModel):
    status: str
    reason: str
    nextStep: str


TRIAGE_PROMPT = """You are reviewing a subcontractor compliance document.
Return ONLY valid JSON with exactly these keys:
- status: "green" (looks compliant), "amber" (needs human review), or "red" (clear issue)
- reason: one short sentence explaining the status
- nextStep: one short sentence telling the contractor what to do next

Document text:
"""


def truncate_ocr(text: str) -> str:
    text = text.strip()
    if len(text) <= MAX_OCR_CHARS:
        return text
    return text[:MAX_OCR_CHARS] + "\n\n[truncated]"


def parse_triage_response(raw: str) -> dict:
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=502, detail=f"Model returned invalid JSON: {exc}") from exc

    status = str(data.get("status", "")).lower()
    if status not in {"green", "amber", "red"}:
        raise HTTPException(status_code=502, detail="Model returned invalid status value")

    reason = str(data.get("reason", "")).strip()
    next_step = str(data.get("nextStep", "")).strip()
    if not reason or not next_step:
        raise HTTPException(status_code=502, detail="Model response missing reason or nextStep")

    return {"status": status, "reason": reason, "nextStep": next_step}


@app.get("/health")
async def health():
    return {"status": "ok", "n_ctx": N_CTX}


@app.post("/triage", response_model=TriageResponse)
async def triage(body: TriageRequest):
    ocr_text = truncate_ocr(body.ocrText)
    if not ocr_text:
        raise HTTPException(status_code=400, detail="ocrText is required")

    try:
        result = llm.create_chat_completion(
            messages=[{"role": "user", "content": TRIAGE_PROMPT + ocr_text}],
            response_format={"type": "json_object"},
            max_tokens=256,
            temperature=0.2,
        )
    except ValueError as exc:
        raise HTTPException(status_code=413, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Triage failed: {exc}") from exc

    content = result["choices"][0]["message"]["content"]
    return parse_triage_response(content)
