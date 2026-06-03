"""
Load SubReady context documents for Qwen / llama.cpp prompts.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

CONTEXT_DIR = Path(__file__).resolve().parent


def _read_text(name: str) -> str:
    return (CONTEXT_DIR / name).read_text(encoding="utf-8")


def _read_json(name: str) -> Any:
    return json.loads((CONTEXT_DIR / name).read_text(encoding="utf-8"))


def load_system_prompt() -> str:
    return _read_text("system_prompt.md")


def load_glossary() -> dict[str, Any]:
    return _read_json("domain_glossary.json")


def load_demo_project() -> dict[str, Any]:
    return _read_json("demo_project.json")


def load_ocr_sample(filename: str) -> str:
    return (CONTEXT_DIR / filename).read_text(encoding="utf-8")


def load_few_shot_for_doc_type(doc_type: str, max_examples: int = 2) -> list[dict[str, Any]]:
    examples: list[dict[str, Any]] = []
    jsonl_path = CONTEXT_DIR / "few_shot.jsonl"
    if not jsonl_path.exists():
        return examples

    for line in jsonl_path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        row = json.loads(line)
        if row.get("docType") != doc_type:
            continue
        ocr = load_ocr_sample(row["ocrSampleFile"])
        expected = json.loads((CONTEXT_DIR / row["expectedFile"]).read_text(encoding="utf-8"))
        examples.append(
            {
                "ocrExcerpt": ocr[:2500],
                "expected": expected["expectedTriage"],
            }
        )
        if len(examples) >= max_examples:
            break
    return examples


def build_qwen_messages(
    *,
    ocr_text: str,
    doc_type: str,
    requirement_tier: str,
    project: dict[str, Any] | None = None,
    rule_flags: list[str] | None = None,
    include_few_shot: bool = True,
) -> list[dict[str, str]]:
    system_parts = [
        load_system_prompt(),
        "\n\n## Domain glossary (abbreviated)\n",
        json.dumps(load_glossary(), indent=2)[:4000],
    ]
    if project:
        system_parts.append("\n\n## Active project\n")
        system_parts.append(json.dumps(project, indent=2))

    messages: list[dict[str, str]] = [
        {"role": "system", "content": "".join(system_parts)},
    ]

    if include_few_shot:
        for ex in load_few_shot_for_doc_type(doc_type):
            messages.append(
                {
                    "role": "user",
                    "content": (
                        f"docType={doc_type}\nOCR:\n{ex['ocrExcerpt']}\n"
                        "Return triage JSON only."
                    ),
                }
            )
            messages.append(
                {
                    "role": "assistant",
                    "content": json.dumps(ex["expected"], separators=(",", ":")),
                }
            )

    user_body = {
        "docType": doc_type,
        "requirementTier": requirement_tier,
        "ruleFlags": rule_flags or [],
        "ocrText": ocr_text[:6000],
    }
    messages.append(
        {
            "role": "user",
            "content": (
                "Triage this document for field mobilization readiness. "
                "Return JSON only matching the schema in the system prompt.\n\n"
                + json.dumps(user_body, indent=2)
            ),
        }
    )
    return messages


def build_qwen_prompt_string(**kwargs: Any) -> str:
    """Single-string prompt for completion-style models."""
    messages = build_qwen_messages(**kwargs)
    parts = []
    for m in messages:
        parts.append(f"[{m['role'].upper()}]\n{m['content']}\n")
    return "\n".join(parts)
