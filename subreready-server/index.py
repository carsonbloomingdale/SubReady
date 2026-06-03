"""
SubReady API — rules-first triage with optional local Qwen narrative.
Compatible with master client ({ ocrText }) and full mobilization API.
"""

from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import json
import os
from typing import Any

from models import (
    AuditAppendRequest,
    ProjectCreate,
    ReadinessRequest,
    RequirementsRequest,
    TriageRequest,
)
from rules.engine import (
    PRESETS,
    ProjectContext,
    append_audit_event,
    evaluate_readiness,
    generate_requirements,
    infer_doc_type_from_text,
    triage_document,
)

app = FastAPI(title="SubReady", description="Adaptive subcontractor mobilization readiness")
app.add_middleware(CORSMiddleware, allow_origins=["*"])

MODEL_PATH = os.environ.get("MODEL_PATH", "./model/Qwen3-4B-Q4_K_M.gguf")
N_CTX = int(os.environ.get("N_CTX", "8192"))
MAX_OCR_CHARS = int(os.environ.get("MAX_OCR_CHARS", "12000"))
MIN_OCR_CHARS = int(os.environ.get("MIN_OCR_CHARS", "80"))
N_GPU_LAYERS = int(os.environ.get("N_GPU_LAYERS", "0"))

_llm = None


def _get_llm():
    global _llm
    if _llm is None and os.path.isfile(MODEL_PATH):
        from llama_cpp import Llama

        _llm = Llama(
            model_path=MODEL_PATH,
            n_ctx=N_CTX,
            n_gpu_layers=N_GPU_LAYERS,
            verbose=False,
        )
    return _llm


def _project_from_body(p: ProjectCreate) -> ProjectContext:
    return ProjectContext(**p.model_dump())


def truncate_ocr(text: str) -> str:
    text = text.strip()
    if len(text) <= MAX_OCR_CHARS:
        return text
    return text[:MAX_OCR_CHARS] + "\n\n[truncated]"


def _resolve_doc_type(ocr_text: str, client_doc_type: str | None) -> tuple[str, str | None]:
    """Return (doc_type used for rules, mismatch warning or None)."""
    inferred = infer_doc_type_from_text(ocr_text)
    if not client_doc_type:
        return inferred, None
    if client_doc_type != inferred:
        # Trust explicit slot when OCR is ambiguous; flag for GC.
        weak = len(ocr_text) < MIN_OCR_CHARS
        if weak or client_doc_type == "coi":
            return client_doc_type, (
                f"Client slot is {client_doc_type} but document text looks like {inferred}."
            )
    return client_doc_type, None


@app.get("/health")
async def health():
    from rules.engine import CATALOG

    h = CATALOG.get("readinessHeuristic", {})
    return {
        "ok": True,
        "llm": _get_llm() is not None,
        "modelPath": MODEL_PATH,
        "n_ctx": N_CTX,
        "readinessWeights": h.get("weights"),
        "classifications": h.get("classifications"),
        "engine": "rules-first",
    }


@app.get("/presets")
async def presets():
    out = {}
    for key, ctx in PRESETS.items():
        reqs = generate_requirements(ctx)
        out[key] = {
            "project": ctx.as_dict(),
            "requirements": [r.to_dict() for r in reqs],
            "readiness": evaluate_readiness(ctx, reqs),
        }
    return out


@app.get("/context/demo")
async def context_demo():
    from model.context.context_loader import CONTEXT_DIR, load_demo_project, load_glossary

    samples = []
    for line in (CONTEXT_DIR / "few_shot.jsonl").read_text(encoding="utf-8").splitlines():
        if line.strip():
            row = json.loads(line)
            row["ocrPreview"] = (CONTEXT_DIR / row["ocrSampleFile"]).read_text(encoding="utf-8")[:400]
            samples.append(row)
    return {
        "glossary": load_glossary(),
        "demoProject": load_demo_project(),
        "samples": samples,
    }


@app.get("/context/ocr/{sample_id}")
async def context_ocr_sample(sample_id: str):
    from model.context.context_loader import CONTEXT_DIR

    mapping = {
        "coi_hudson": "ocr_samples/coi_hudson_roofing_acord25.txt",
        "coi_north_river": "ocr_samples/coi_north_river_demo.txt",
        "w9_north_river": "ocr_samples/w9_north_river.txt",
    }
    rel = mapping.get(sample_id)
    if not rel:
        raise HTTPException(status_code=404, detail="Unknown sample_id")
    path = CONTEXT_DIR / rel
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Sample file missing")
    return {"sampleId": sample_id, "ocrText": path.read_text(encoding="utf-8")}


@app.post("/requirements/generate")
async def requirements_generate(body: RequirementsRequest):
    ctx = _project_from_body(body.project)
    reqs = generate_requirements(ctx)
    readiness = evaluate_readiness(ctx, reqs)
    return {
        "project": ctx.as_dict(),
        "requirements": [r.to_dict() for r in reqs],
        "scoringProfile": readiness["profile"],
        "emphasis": readiness["emphasis"],
        "riskProfile": readiness["riskProfile"],
        "readinessPreview": {
            "overallScore": readiness["overallScore"],
            "classification": readiness["classification"],
        },
    }


@app.post("/triage")
async def triage(body: TriageRequest):
    ocr_text = truncate_ocr(body.ocrText)
    if not ocr_text or ocr_text.startswith("[PDF document:"):
        raise HTTPException(
            status_code=400,
            detail="No readable text. Use an image scan or load a demo OCR sample.",
        )
    if len(ocr_text) < MIN_OCR_CHARS:
        raise HTTPException(
            status_code=400,
            detail=f"OCR text too short ({len(ocr_text)} chars). Re-scan or use a demo sample.",
        )

    doc_type, mismatch = _resolve_doc_type(ocr_text, body.docType)
    tier = body.requirementTier

    result = triage_document(ocr_text, doc_type, tier)
    result["deterministicStatus"] = result["status"]
    result["docType"] = doc_type
    result["inferredDocType"] = infer_doc_type_from_text(ocr_text)
    if mismatch:
        result["slotMismatch"] = mismatch
        if result["status"] == "green":
            result["status"] = "amber"
            result["reason"] = f"{mismatch} {result['reason']}"

    llm = _get_llm()
    use_full_context = os.environ.get("LLM_FULL_CONTEXT") == "1"
    use_narrative = os.environ.get("LLM_NARRATIVE") == "1"

    if llm and (use_full_context or use_narrative):
        try:
            if use_full_context:
                from model.context.context_loader import build_qwen_messages

                project_ctx = body.project.model_dump() if body.project else None
                messages = build_qwen_messages(
                    ocr_text=ocr_text,
                    doc_type=doc_type,
                    requirement_tier=tier,
                    project=project_ctx,
                    rule_flags=result.get("flags", []),
                )
                chat = llm.create_chat_completion(
                    messages=messages,
                    response_format={"type": "json_object"},
                    max_tokens=512,
                    temperature=0.2,
                )
                llm_out = json.loads(chat["choices"][0]["message"]["content"])
                # Rules engine owns status; LLM only enriches narrative fields.
                result["reason"] = llm_out.get("reason", result["reason"])
                result["nextStep"] = llm_out.get("nextStep", result["nextStep"])
                if llm_out.get("extracted"):
                    result["extracted"] = llm_out["extracted"]
            else:
                prompt = (
                    "Given triage flags, write concise reason and nextStep for a GC onsite. "
                    f"Return JSON only: {{\"reason\":\"...\",\"nextStep\":\"...\"}}. "
                    f"Flags: {result['flags']}. Status: {result['status']}. Doc: {doc_type}."
                )
                chat = llm.create_chat_completion(
                    messages=[{"role": "user", "content": prompt}],
                    response_format={"type": "json_object"},
                    max_tokens=256,
                    temperature=0.2,
                )
                narrative = json.loads(chat["choices"][0]["message"]["content"])
                result["reason"] = narrative.get("reason", result["reason"])
                result["nextStep"] = narrative.get("nextStep", result["nextStep"])
        except Exception as exc:
            result["llmWarning"] = f"LLM skipped: {exc}"

    return result


@app.post("/readiness/evaluate")
async def readiness_evaluate(body: ReadinessRequest):
    ctx = _project_from_body(body.project)
    from rules.engine import Requirement

    reqs: list[Requirement] = []
    for raw in body.requirements:
        reqs.append(
            Requirement(
                docType=raw["docType"],
                label=raw.get("label", raw["docType"]),
                tier=raw.get("tier", "required"),
                status=raw.get("status", "missing"),
                triageStatus=raw.get("triageStatus"),
                validityState=raw.get("validityState"),
                expirationDate=raw.get("expirationDate"),
                triageFlags=raw.get("triageFlags", []),
                ruleIds=raw.get("ruleIds", []),
            )
        )
    ops = body.operationalSignals.model_dump() if body.operationalSignals else None
    return evaluate_readiness(
        ctx,
        reqs,
        operational_signals=ops,
        audit_chain=body.auditChain,
    )


@app.post("/audit/append")
async def audit_append(body: AuditAppendRequest):
    event = append_audit_event(
        body.chain,
        action=body.action,
        actor=body.actor,
        entityRef=body.entityRef,
        note=body.note,
        document_hash=body.documentHash,
    )
    return {"event": event, "chainLength": len(body.chain) + 1}
