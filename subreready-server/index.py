from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from logic import triage_ocr_text

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
