"""Qwen-backed triage: check parsed subcontractor documents for mistakes."""

from __future__ import annotations

import json
import os
from functools import lru_cache
from typing import Any

from llama_cpp import Llama

from parser import ParsedDocument, parse_text

DEFAULT_MODEL_PATH = os.environ.get(
    "SUBREADY_MODEL_PATH", "./model/Qwen3-4B-Q4_K_M.gguf"
)

TRIAGE_PROMPT = """You are reviewing subcontractor compliance documents (COI, licenses, W-9, bonds, safety forms).

Analyze the structured parse below and identify mistakes, gaps, or risks such as:
- missing required fields (insured name, limits, dates, signatures)
- expired or missing expiration dates
- document type mismatch or unclear document
- OCR garbling that makes key values unreliable
- policy/license numbers that look incomplete

Return ONLY valid JSON with this shape:
{
  "status": "green" | "amber" | "red",
  "reason": "short summary for the user",
  "nextStep": "what the user should do next",
  "mistakes": ["list of specific issues found, empty if none"]
}

Status guide:
- green: looks complete and consistent
- amber: minor issues or needs human verification
- red: critical missing info, expired coverage, or unreadable document

Parsed document:
{payload}
"""


@lru_cache(maxsize=1)
def get_llm() -> Llama:
    return Llama(model_path=DEFAULT_MODEL_PATH)


def _build_payload(parsed: ParsedDocument) -> str:
    summary = parsed.to_summary()
    # Keep sections compact for the model context window.
    summary["sections"] = [
        {"title": s.title, "line_count": len(s.lines), "preview": s.lines[:8]}
        for s in parsed.sections
    ]
    return json.dumps(summary, indent=2)


def check_document(parsed: ParsedDocument) -> dict[str, Any]:
    """Send parsed document data to Qwen and return triage results."""
    llm = get_llm()
    payload = _build_payload(parsed)

    result = llm.create_chat_completion(
        messages=[
            {
                "role": "user",
                "content": TRIAGE_PROMPT.format(payload=payload),
            }
        ],
        response_format={"type": "json_object"},
    )

    content = result["choices"][0]["message"]["content"]
    data = json.loads(content)

    return {
        "status": data.get("status", "amber"),
        "reason": data.get("reason", "Review required."),
        "nextStep": data.get("nextStep", "Verify the document manually."),
        "mistakes": data.get("mistakes", []),
        "detectedTypes": parsed.detected_types,
        "parseWarnings": parsed.parse_warnings,
    }


def triage_ocr_text(ocr_text: str) -> dict[str, Any]:
    """Parse raw OCR text, then run Qwen mistake checking."""
    parsed = parse_text(ocr_text)
    return check_document(parsed)
