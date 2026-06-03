"""
Rules-driven requirement generation and readiness scoring for SubReady.
Deterministic core; LLM is optional narrative layer on top of flags.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Literal

Tier = Literal["required", "optional", "conditional", "not_applicable"]
DocStatus = Literal["missing", "uploaded", "triaged"]
TriageStatus = Literal["green", "amber", "red"]

CATALOG_PATH = Path(__file__).with_name("catalog.json")


def _load_catalog() -> dict[str, Any]:
    with CATALOG_PATH.open(encoding="utf-8") as f:
        return json.load(f)


CATALOG = _load_catalog()


@dataclass
class ProjectContext:
    name: str = ""
    projectType: str = ""
    ownerType: str = ""
    fundingType: str = ""
    laborClassification: str = "non_prevailing_wage"
    setAside: str = "none"
    riskLevel: str = "low"
    jurisdiction: str = "US-NY"
    contractValueBand: str = "under_100k"
    tradeScope: str = "general"
    gcLegalName: str = ""

    def as_dict(self) -> dict[str, str]:
        return {
            "name": self.name,
            "projectType": self.projectType,
            "ownerType": self.ownerType,
            "fundingType": self.fundingType,
            "laborClassification": self.laborClassification,
            "setAside": self.setAside,
            "riskLevel": self.riskLevel,
            "jurisdiction": self.jurisdiction,
            "contractValueBand": self.contractValueBand,
            "tradeScope": self.tradeScope,
        }


@dataclass
class Requirement:
    docType: str
    label: str
    tier: Tier
    status: DocStatus = "missing"
    triageStatus: TriageStatus | None = None
    validityState: str | None = None
    expirationDate: str | None = None
    triageFlags: list[str] = field(default_factory=list)
    ruleIds: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "docType": self.docType,
            "label": self.label,
            "tier": self.tier,
            "status": self.status,
            "triageStatus": self.triageStatus,
            "validityState": self.validityState,
            "expirationDate": self.expirationDate,
            "triageFlags": self.triageFlags,
            "ruleIds": self.ruleIds,
        }


def _rule_matches(when: dict[str, list[str]], ctx: dict[str, str]) -> bool:
    if not when:
        return True
    for key, allowed in when.items():
        if ctx.get(key) not in allowed:
            return False
    return True


def _merge_tier(current: Tier | None, incoming: Tier) -> Tier:
    order = {"not_applicable": 0, "optional": 1, "conditional": 2, "required": 3}
    if current is None:
        return incoming
    return incoming if order[incoming] > order[current] else current


def generate_requirements(project: ProjectContext) -> list[Requirement]:
    ctx = project.as_dict()
    doc_meta = CATALOG["docTypes"]
    merged: dict[str, Requirement] = {}

    for rule in CATALOG["rules"]:
        if not _rule_matches(rule.get("when", {}), ctx):
            continue
        tier: Tier = rule["tier"]
        for doc_type in rule["docs"]:
            label = doc_meta.get(doc_type, {}).get("label", doc_type)
            existing = merged.get(doc_type)
            if existing:
                existing.tier = _merge_tier(existing.tier, tier)
                existing.ruleIds.append(rule["id"])
            else:
                merged[doc_type] = Requirement(
                    docType=doc_type,
                    label=label,
                    tier=tier,
                    ruleIds=[rule["id"]],
                )

    # Drop not_applicable from active checklist (keep for API transparency if needed)
    active = [r for r in merged.values() if r.tier != "not_applicable"]
    tier_order = {"required": 0, "conditional": 1, "optional": 2}
    active.sort(key=lambda r: (tier_order.get(r.tier, 9), r.label))
    return active


def resolve_scoring_profile(project: ProjectContext) -> str:
    ctx = project.as_dict()
    if ctx["projectType"] == "federal" or ctx["fundingType"] == "federal_assistance":
        return "federal"
    if ctx["fundingType"] == "nyserda" or ctx["projectType"] == "utility_energy":
        return "energy_retrofit"
    if ctx["projectType"] in ("public_infrastructure",) or ctx["fundingType"] in (
        "public",
        "dot_infrastructure",
        "grant_funded",
    ):
        return "public_works"
    if ctx["projectType"] == "residential" and ctx["fundingType"] == "private":
        return "residential_private"
    return "default"


def get_risk_profile(risk_level: str) -> dict[str, Any]:
    return CATALOG["riskProfiles"].get(risk_level, CATALOG["riskProfiles"]["low"])


def _keyword_score(ocr_text: str, doc_type: str) -> tuple[float, list[str]]:
    text = ocr_text.lower()
    keywords = CATALOG["docTypes"].get(doc_type, {}).get("keywords", [])
    if not keywords:
        return 0.5, ["no_keywords_configured"]
    hits = [k for k in keywords if k.lower() in text]
    ratio = len(hits) / len(keywords)
    flags: list[str] = []
    if ratio < 0.2:
        flags.append("wrong_document_type_suspected")
    elif ratio < 0.5:
        flags.append("weak_document_match")
    return min(1.0, ratio + 0.2), flags


_DATE_RE = re.compile(
    r"\b(0?[1-9]|1[0-2])[/.-](0?[1-9]|[12]\d|3[01])[/.-](\d{2,4})\b"
)
_EXPIRY_DOC_TYPES = frozenset(
    CATALOG.get("readinessHeuristic", {}).get(
        "expirationRelevantDocTypes",
        ["coi", "bonding", "trade_license", "osha"],
    )
)
_EXPIRING_DAYS = CATALOG.get("readinessHeuristic", {}).get("expiringWithinDays", 30)


def _reference_today() -> datetime:
    """Evaluation 'today' for expiration checks (env overrides catalog demo date)."""
    raw = os.environ.get("SUBREADY_REFERENCE_DATE") or CATALOG.get("readinessHeuristic", {}).get(
        "demoReferenceDate"
    )
    if raw:
        year, month, day = (int(x) for x in raw.split("-"))
        return datetime(year, month, day, tzinfo=timezone.utc)
    return datetime.now(timezone.utc)


def _parse_date(match: tuple[str, str, str]) -> datetime | None:
    month, day, year = int(match[0]), int(match[1]), int(match[2])
    if year < 100:
        year += 2000 if year < 70 else 1900
    try:
        return datetime(year, month, day, tzinfo=timezone.utc)
    except ValueError:
        return None


def _dates_from_lines_matching(ocr_text: str, pattern: str) -> list[datetime]:
    found: list[datetime] = []
    for line in ocr_text.splitlines():
        if re.search(pattern, line, re.IGNORECASE):
            for m in _DATE_RE.findall(line):
                d = _parse_date(m)
                if d:
                    found.append(d)
    return found


def _pick_policy_expiration(ocr_text: str, doc_type: str) -> datetime | None:
    """Prefer dates on 'expiration' lines; avoid treating loan effective-only dates as expiry."""
    exp_line_dates = _dates_from_lines_matching(ocr_text, r"expir")
    if exp_line_dates:
        return max(exp_line_dates)

    all_matches = _DATE_RE.findall(ocr_text)
    parsed = [d for d in (_parse_date(m) for m in all_matches) if d is not None]
    if not parsed:
        return None

    if doc_type == "coi" and len(parsed) >= 2:
        return max(parsed)

    if len(parsed) == 1:
        has_effective = bool(re.search(r"effective", ocr_text, re.IGNORECASE))
        has_expiration = bool(re.search(r"expir", ocr_text, re.IGNORECASE))
        if has_effective and not has_expiration:
            return None
        return parsed[0]

    return max(parsed)


def infer_doc_type_from_text(ocr_text: str) -> str:
    haystack = ocr_text.lower()
    w9_signals = sum(
        1
        for token in ("form w-9", "w-9", "taxpayer identification", "employer identification")
        if token in haystack
    )
    coi_signals = sum(
        1
        for token in (
            "certificate of liability",
            "certificate of insurance",
            "general liability",
            "acord",
            "certificate holder",
        )
        if token in haystack
    )
    if w9_signals > coi_signals:
        return "w9"
    if coi_signals > 0:
        return "coi"
    return "coi"


def _w9_missing_signature(ocr_text: str) -> bool:
    low = ocr_text.lower()
    if "w-9" not in low and "form w-9" not in low and "taxpayer" not in low:
        return False
    if re.search(r"signature[^\n]{0,50}(blank|\(\s*\)|_+\s*$)", low):
        return True
    if "date:" in low and re.search(r"date:\s*\(blank\)", low):
        return True
    if "part ii" in low and not re.search(r"date[^\d]*(\d{1,2}[/.-])", low):
        return True
    return False


def assess_document_validity(ocr_text: str, doc_type: str) -> dict[str, Any]:
    if doc_type not in _EXPIRY_DOC_TYPES:
        return {"validityState": "not_applicable", "expirationDate": None, "flags": []}

    expiry = _pick_policy_expiration(ocr_text, doc_type)
    if expiry is None:
        return {"validityState": "unknown", "expirationDate": None, "flags": ["expiry_not_found"]}
    today = _reference_today()
    iso = expiry.date().isoformat()
    if expiry < today:
        return {"validityState": "expired", "expirationDate": iso, "flags": ["expired"]}
    if expiry <= today + timedelta(days=_EXPIRING_DAYS):
        return {"validityState": "expiring_soon", "expirationDate": iso, "flags": ["expiring_soon"]}
    return {"validityState": "valid", "expirationDate": iso, "flags": []}


def _expiration_score(ocr_text: str, doc_type: str) -> tuple[float, list[str]]:
    v = assess_document_validity(ocr_text, doc_type)
    state = v["validityState"]
    flags = list(v["flags"])
    if state == "not_applicable":
        return 1.0, flags
    if state == "expired":
        return 0.0, flags
    if state == "expiring_soon":
        return 0.55, flags
    if state == "unknown":
        return 0.65, flags
    return 1.0, flags


def triage_document(
    ocr_text: str,
    doc_type: str,
    requirement_tier: Tier,
) -> dict[str, Any]:
    if not ocr_text.strip():
        return {
            "status": "red",
            "flags": ["empty_ocr"],
            "reason": "No readable text captured.",
            "nextStep": "Re-scan with better lighting and fill the frame.",
        }

    match_score, match_flags = _keyword_score(ocr_text, doc_type)
    expiry_score, expiry_flags = _expiration_score(ocr_text, doc_type)
    validity = assess_document_validity(ocr_text, doc_type)
    flags = match_flags + expiry_flags

    if "wrong_document_type_suspected" in flags:
        status: TriageStatus = "red"
        reason = f"Uploaded image does not resemble expected {doc_type.replace('_', ' ')}."
        next_step = "Confirm document type and re-scan the correct page."
    elif match_score >= 0.7 and expiry_score >= 0.8:
        status = "green"
        reason = "Document matches expected type; no critical issues detected."
        next_step = "No action required unless GC requests updated limits or endorsements."
    elif requirement_tier == "optional":
        status = "amber"
        reason = "Optional document captured with minor gaps."
        next_step = "GC may accept as-is or request a clearer copy before mobilization."
    else:
        status = "amber"
        reason = "Document likely correct but needs GC confirmation."
        next_step = "Verify limits, dates, and named insured before mobilizing."

    if validity["validityState"] == "expired":
        status = "red"
        reason = "Document appears expired."
        next_step = "Obtain renewed certificate before mobilization."
    elif validity["validityState"] == "expiring_soon":
        if status == "green":
            status = "amber"
        reason = f"Valid but expires {validity['expirationDate']} — within {_EXPIRING_DAYS} days."
        next_step = "Confirm coverage extends through project completion."
    elif "expiry_not_found" in flags and doc_type == "coi":
        status = "amber"
        reason = "COI captured; expiration date not detected."
        next_step = "Manually confirm policy expiration after job end date."

    if doc_type == "w9" and _w9_missing_signature(ocr_text):
        flags.append("w9_unsigned")
        if status == "green":
            status = "amber"
        reason = "W-9 identity fields present; signature and date missing on Part II."
        next_step = "Have the subcontractor sign and date the W-9 before payment setup."

    return {
        "status": status,
        "flags": flags,
        "matchScore": round(match_score, 2),
        "expiryScore": round(expiry_score, 2),
        "validityState": validity["validityState"],
        "expirationDate": validity["expirationDate"],
        "reason": reason,
        "nextStep": next_step,
    }


def evaluate_readiness(
    project: ProjectContext,
    requirements: list[Requirement],
    *,
    operational_signals: dict[str, Any] | None = None,
    audit_chain: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    from rules.readiness import OperationalSignals, evaluate_contractor_readiness

    profile_key = resolve_scoring_profile(project)
    emphasis = CATALOG["scoringProfiles"][profile_key]["emphasis"]
    signals = OperationalSignals.from_dict(operational_signals)
    if not signals.hasSafetyDocumentation:
        signals.hasSafetyDocumentation = any(
            r.docType in ("osha", "safety_manual")
            and r.status != "missing"
            and r.triageStatus in ("green", "amber")
            for r in requirements
        )
    if signals.uploadsExpected == 0:
        critical = [r for r in requirements if r.tier in ("required", "conditional")]
        signals.uploadsExpected = len(critical)
        signals.uploadsCompleted = sum(1 for r in critical if r.status != "missing")

    heuristic = evaluate_contractor_readiness(
        project,
        requirements,
        operational=signals,
        audit_chain=audit_chain or [],
    )

    required = [r for r in requirements if r.tier == "required"]
    conditional = [r for r in requirements if r.tier == "conditional"]
    optional = [r for r in requirements if r.tier == "optional"]

    return {
        **heuristic,
        "profile": profile_key,
        "emphasis": emphasis,
        "riskProfile": get_risk_profile(project.riskLevel),
        "summary": {
            "required": len(required),
            "conditional": len(conditional),
            "optional": len(optional),
        },
    }


def hash_payload(payload: dict[str, Any]) -> str:
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def append_audit_event(
    chain: list[dict[str, Any]],
    *,
    action: str,
    actor: str,
    entity_ref: str,
    note: str = "",
    document_hash: str | None = None,
) -> dict[str, Any]:
    prev_hash = chain[-1]["eventHash"] if chain else "0" * 64
    event = {
        "at": datetime.now(timezone.utc).isoformat(),
        "action": action,
        "actor": actor,
        "entityRef": entity_ref,
        "note": note,
        "documentHash": document_hash,
        "previousEventHash": prev_hash,
    }
    event["eventHash"] = hash_payload(event)
    return event


# --- Preset scenarios for demo / tests ---

PRESETS: dict[str, ProjectContext] = {
    "residential_remodel_private": ProjectContext(
        projectType="residential",
        ownerType="private_owner",
        fundingType="private",
        laborClassification="non_prevailing_wage",
        setAside="none",
        riskLevel="low",
    ),
    "municipal_public_works": ProjectContext(
        projectType="public_infrastructure",
        ownerType="municipality",
        fundingType="public",
        laborClassification="prevailing_wage",
        setAside="mwbe",
        riskLevel="high",
        contractValueBand="500k_plus",
    ),
    "federal_infrastructure": ProjectContext(
        projectType="federal",
        ownerType="federal_agency",
        fundingType="federal_assistance",
        laborClassification="prevailing_wage",
        setAside="section_3",
        riskLevel="high",
        contractValueBand="500k_plus",
    ),
    "nyserda_energy_retrofit": ProjectContext(
        projectType="utility_energy",
        ownerType="developer",
        fundingType="nyserda",
        laborClassification="non_prevailing_wage",
        setAside="mwbe",
        riskLevel="medium",
        tradeScope="hvac",
    ),
}
