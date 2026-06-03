"""Local Qwen triage helpers — validated JSON responses for /triage."""

from __future__ import annotations

import json
from typing import Any

from fastapi import HTTPException

TRIAGE_PROMPT = """You are reviewing a subcontractor compliance document.
Return ONLY valid JSON with exactly these keys:
- status: "green" (looks compliant), "amber" (needs human review), or "red" (clear issue)
- reason: one short sentence explaining the status
- nextStep: one short sentence telling the contractor what to do next

Document text:
"""


def parse_triage_response(raw: str) -> dict[str, str]:
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


def parse_llm_json(raw: str) -> dict[str, Any]:
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=502, detail=f"Model returned invalid JSON: {exc}") from exc


def run_llm_only_triage(llm: Any, ocr_text: str) -> dict[str, str]:
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
