from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from logic import triage_ocr_text, triage_upload
from parser import MAX_UPLOAD_BYTES, SUPPORTED_UPLOAD_EXTENSIONS

app = FastAPI(title="SubReady Triage API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class TriageRequest(BaseModel):
    ocrText: str = Field(..., min_length=1)


@app.post("/triage")
@app.post("/api/triage")
async def triage(body: TriageRequest):
    try:
        return triage_ocr_text(body.ocrText)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Qwen model not found: {exc}. Place the GGUF under ./model/",
        ) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/upload")
@app.post("/api/upload")
async def upload_document(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename is required.")

    suffix = Path(file.filename).suffix.lower()
    if suffix not in SUPPORTED_UPLOAD_EXTENSIONS:
        supported = ", ".join(sorted(SUPPORTED_UPLOAD_EXTENSIONS))
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type. Supported: {supported}",
        )

    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Max size is {MAX_UPLOAD_BYTES // (1024 * 1024)} MB.",
        )
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    try:
        return triage_upload(file.filename, content)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Qwen model not found: {exc}. Place the GGUF under ./model/",
        ) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
