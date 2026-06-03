"""LLM triage on structured parse output (backend branch advancement)."""

from __future__ import annotations

import json
from typing import Any

from parser import ParsedDocument, parse_text, parse_upload

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


def _build_payload(parsed: ParsedDocument) -> str:
    summary = parsed.to_summary()
    summary["sections"] = [
        {"title": s.title, "line_count": len(s.lines), "preview": s.lines[:8]}
        for s in parsed.sections
    ]
    return json.dumps(summary, indent=2)


def check_document(llm: Any, parsed: ParsedDocument) -> dict[str, Any]:
    """Send parsed document data to the local LLM and return triage results."""
    payload = _build_payload(parsed)

    result = llm.create_chat_completion(
        messages=[{"role": "user", "content": TRIAGE_PROMPT.format(payload=payload)}],
        response_format={"type": "json_object"},
        max_tokens=512,
        temperature=0.2,
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


def triage_ocr_text(llm: Any, ocr_text: str) -> dict[str, Any]:
    """Parse raw OCR text, then run LLM mistake checking."""
    parsed = parse_text(ocr_text)
    result = check_document(llm, parsed)
    result["parsed"] = parsed.to_summary()
    return result


def triage_upload(llm: Any, filename: str, content: bytes) -> dict[str, Any]:
    """Extract text from PDF/image upload, parse, then run LLM mistake checking."""
    parsed = parse_upload(filename, content)
    result = check_document(llm, parsed)
    result["parsed"] = parsed.to_summary()
    return result
