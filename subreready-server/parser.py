"""Parse subcontractor documents into structured data for triage."""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field
from pathlib import Path


DATE_PATTERN = re.compile(
    r"\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2}|"
    r"(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4})\b",
    re.IGNORECASE,
)
EMAIL_PATTERN = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b")
MONEY_PATTERN = re.compile(r"\$[\d,]+(?:\.\d{2})?|\b\d{1,3}(?:,\d{3})+\b")
POLICY_PATTERN = re.compile(
    r"\b(?:policy|certificate|cert\.?|license|lic\.?)\s*(?:#|no\.?|number)?\s*[:#]?\s*([A-Z0-9-]{4,})\b",
    re.IGNORECASE,
)

DOC_TYPE_HINTS: dict[str, tuple[str, ...]] = {
    "certificate_of_insurance": (
        "certificate of insurance",
        "certificate holder",
        "general liability",
        "workers compensation",
        "coi",
    ),
    "license": ("contractor license", "license number", "state license", "lic #"),
    "w9": ("form w-9", "w-9", "taxpayer identification", "ein", "ssn"),
    "bond": ("performance bond", "payment bond", "surety"),
    "safety": ("osha", "safety program", "em 385"),
}


@dataclass
class DocumentSection:
    title: str
    lines: list[str]


@dataclass
class ParsedDocument:
    raw_text: str
    cleaned_text: str
    line_count: int
    sections: list[DocumentSection]
    detected_types: list[str]
    dates: list[str]
    emails: list[str]
    amounts: list[str]
    policy_or_license_ids: list[str]
    parse_warnings: list[str] = field(default_factory=list)

    def to_summary(self) -> dict:
        return asdict(self)


def _normalize_whitespace(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _fix_common_ocr_errors(text: str) -> str:
    replacements = {
        " l ": " 1 ",
        " O ": " 0 ",
        "|": "I",
    }
    for old, new in replacements.items():
        text = text.replace(old, new)
    return text


def _split_sections(lines: list[str]) -> list[DocumentSection]:
    sections: list[DocumentSection] = []
    current_title = "body"
    current_lines: list[str] = []

    header_pattern = re.compile(r"^[A-Z0-9][A-Z0-9\s/&-]{2,}$")

    for line in lines:
        stripped = line.strip()
        if not stripped:
            if current_lines:
                current_lines.append("")
            continue

        is_header = (
            len(stripped) < 80
            and header_pattern.match(stripped)
            and sum(ch.isalpha() for ch in stripped) >= 3
        )
        if is_header and current_lines:
            sections.append(DocumentSection(title=current_title, lines=current_lines))
            current_title = stripped.title()
            current_lines = []
        else:
            current_lines.append(stripped)

    if current_lines:
        sections.append(DocumentSection(title=current_title, lines=current_lines))

    return sections or [DocumentSection(title="body", lines=lines)]


def _detect_document_types(text: str) -> list[str]:
    lowered = text.lower()
    found: list[str] = []
    for doc_type, phrases in DOC_TYPE_HINTS.items():
        if any(phrase in lowered for phrase in phrases):
            found.append(doc_type)
    return found


def _extract_fields(text: str) -> tuple[list[str], list[str], list[str], list[str]]:
    dates = list(dict.fromkeys(DATE_PATTERN.findall(text)))
    emails = list(dict.fromkeys(EMAIL_PATTERN.findall(text)))
    amounts = list(dict.fromkeys(MONEY_PATTERN.findall(text)))
    policies = list(dict.fromkeys(m.group(1) for m in POLICY_PATTERN.finditer(text)))
    return dates, emails, amounts, policies


def parse_text(raw_text: str) -> ParsedDocument:
    """Parse OCR or plain text from a subcontractor document."""
    warnings: list[str] = []

    if not raw_text or not raw_text.strip():
        return ParsedDocument(
            raw_text=raw_text or "",
            cleaned_text="",
            line_count=0,
            sections=[],
            detected_types=[],
            dates=[],
            emails=[],
            amounts=[],
            policy_or_license_ids=[],
            parse_warnings=["Document text is empty."],
        )

    cleaned = _normalize_whitespace(_fix_common_ocr_errors(raw_text))
    lines = [line for line in cleaned.split("\n") if line.strip()]

    if len(cleaned) < 40:
        warnings.append("Document is very short; OCR may have failed.")
    if len(lines) < 3:
        warnings.append("Few text lines detected; image quality may be low.")

    sections = _split_sections(lines)
    detected_types = _detect_document_types(cleaned)
    dates, emails, amounts, policy_ids = _extract_fields(cleaned)

    if not detected_types:
        warnings.append("Could not identify document type from keywords.")

    return ParsedDocument(
        raw_text=raw_text,
        cleaned_text=cleaned,
        line_count=len(lines),
        sections=sections,
        detected_types=detected_types,
        dates=dates,
        emails=emails,
        amounts=amounts,
        policy_or_license_ids=policy_ids,
        parse_warnings=warnings,
    )


def parse_file(path: str | Path) -> ParsedDocument:
    """Read a text-based document from disk and parse it."""
    file_path = Path(path)
    if not file_path.exists():
        return ParsedDocument(
            raw_text="",
            cleaned_text="",
            line_count=0,
            sections=[],
            detected_types=[],
            dates=[],
            emails=[],
            amounts=[],
            policy_or_license_ids=[],
            parse_warnings=[f"File not found: {file_path}"],
        )

    suffix = file_path.suffix.lower()
    if suffix not in {".txt", ".md", ".csv"}:
        return ParsedDocument(
            raw_text="",
            cleaned_text="",
            line_count=0,
            sections=[],
            detected_types=[],
            dates=[],
            emails=[],
            amounts=[],
            policy_or_license_ids=[],
            parse_warnings=[
                f"Unsupported file type '{suffix}'. Provide OCR text or a .txt file."
            ],
        )

    return parse_text(file_path.read_text(encoding="utf-8", errors="replace"))
