"""
Contractor Readiness Heuristic — offline operational mobilization scoring.

Fixed category weights (40/25/15/10/10) with 0–100 overall score and classification bands.
Does not replace legal or governmental verification.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

from rules.engine import CATALOG, ProjectContext, Requirement

ValidityState = Literal["valid", "expiring_soon", "expired", "unknown", "not_applicable"]

HEURISTIC = CATALOG["readinessHeuristic"]
WEIGHTS = HEURISTIC["weights"]
REGULATORY_DOCS = frozenset(HEURISTIC["regulatoryDocTypes"])
EXPIRY_DOCS = frozenset(HEURISTIC["expirationRelevantDocTypes"])
EXPIRING_DAYS = HEURISTIC["expiringWithinDays"]


@dataclass
class OperationalSignals:
    uploadsCompleted: int = 0
    uploadsExpected: int = 0
    avgResponseMinutes: float | None = None
    hasContactInfo: bool = False
    hasSafetyDocumentation: bool = False
    inconsistentFields: list[str] = field(default_factory=list)

    @classmethod
    def from_dict(cls, data: dict[str, Any] | None) -> OperationalSignals:
        if not data:
            return cls()
        return cls(
            uploadsCompleted=int(data.get("uploadsCompleted", 0)),
            uploadsExpected=int(data.get("uploadsExpected", 0)),
            avgResponseMinutes=data.get("avgResponseMinutes"),
            hasContactInfo=bool(data.get("hasContactInfo", False)),
            hasSafetyDocumentation=bool(data.get("hasSafetyDocumentation", False)),
            inconsistentFields=list(data.get("inconsistentFields", [])),
        )


def classify_readiness(score_0_100: float) -> dict[str, str]:
    for band in HEURISTIC["classifications"]:
        if score_0_100 >= band["min"]:
            return {"id": band["id"], "label": band["label"]}
    return {"id": "high_compliance_risk", "label": "High Compliance Risk"}


def _doc_presence_points(req: Requirement) -> float:
    if req.status == "missing":
        return 0.0
    if req.triageStatus == "red":
        return 0.0
    if req.triageStatus == "green":
        return 1.0
    if req.triageStatus == "amber":
        return 0.75
    if req.status in ("uploaded", "triaged"):
        return 0.5
    return 0.0


def score_documentation_completeness(requirements: list[Requirement]) -> dict[str, Any]:
    critical = [r for r in requirements if r.tier in ("required", "conditional")]
    optional = [r for r in requirements if r.tier == "optional"]
    tw = HEURISTIC["tierWeights"]

    def avg(items: list[Requirement]) -> float:
        if not items:
            return 1.0
        return sum(_doc_presence_points(r) for r in items) / len(items)

    critical_score = avg(critical)
    optional_score = avg(optional)
    if optional:
        combined = critical_score * tw["critical"] + optional_score * tw["optional"]
    else:
        combined = critical_score

    missing_critical = [r.docType for r in critical if r.status == "missing"]
    failed_critical = [r.docType for r in critical if r.triageStatus == "red"]

    return {
        "score": round(combined, 4),
        "weight": WEIGHTS["documentationCompleteness"],
        "weightedContribution": round(combined * WEIGHTS["documentationCompleteness"] * 100, 2),
        "detail": {
            "criticalCount": len(critical),
            "optionalCount": len(optional),
            "criticalScore": round(critical_score, 4),
            "optionalScore": round(optional_score, 4),
            "missingCritical": missing_critical,
            "failedCritical": failed_critical,
        },
    }


def score_document_validity(requirements: list[Requirement]) -> dict[str, Any]:
    scored_docs = [
        r
        for r in requirements
        if r.status != "missing" and r.docType in EXPIRY_DOCS
    ]
    if not scored_docs:
        scored_docs = [r for r in requirements if r.status != "missing"]

    if not scored_docs:
        return {
            "score": 0.0,
            "weight": WEIGHTS["documentValidity"],
            "weightedContribution": 0.0,
            "detail": {"evaluated": 0, "warnings": [], "expired": []},
        }

    points: list[float] = []
    warnings: list[str] = []
    expired: list[str] = []

    for r in scored_docs:
        state = getattr(r, "validityState", None) or "unknown"
        if state == "expired":
            points.append(0.0)
            expired.append(r.docType)
        elif state == "expiring_soon":
            points.append(0.55)
            warnings.append(r.docType)
        elif state == "valid":
            points.append(1.0)
        elif r.triageStatus == "red":
            points.append(0.15)
            expired.append(r.docType)
        elif r.triageStatus == "green":
            points.append(0.95 if state == "unknown" else 1.0)
        elif r.triageStatus == "amber":
            points.append(0.7)
            warnings.append(r.docType)
        else:
            points.append(0.6)

    avg = sum(points) / len(points)
    if expired:
        avg = min(avg, 0.35)

    return {
        "score": round(avg, 4),
        "weight": WEIGHTS["documentValidity"],
        "weightedContribution": round(avg * WEIGHTS["documentValidity"] * 100, 2),
        "detail": {
            "evaluated": len(scored_docs),
            "warnings": warnings,
            "expired": expired,
        },
    }


def score_operational_reliability(signals: OperationalSignals) -> dict[str, Any]:
    if signals.uploadsExpected > 0:
        upload_ratio = min(1.0, signals.uploadsCompleted / signals.uploadsExpected)
    else:
        upload_ratio = 0.5

    if signals.avgResponseMinutes is None:
        response_score = 0.7
    elif signals.avgResponseMinutes <= 60:
        response_score = 1.0
    elif signals.avgResponseMinutes <= 240:
        response_score = 0.8
    elif signals.avgResponseMinutes <= 1440:
        response_score = 0.5
    else:
        response_score = 0.3

    contact_score = 1.0 if signals.hasContactInfo else 0.4
    safety_score = 1.0 if signals.hasSafetyDocumentation else 0.5
    inconsistency_penalty = min(0.5, len(signals.inconsistentFields) * 0.15)
    consistency_score = max(0.0, 1.0 - inconsistency_penalty)

    combined = (
        upload_ratio * 0.4
        + response_score * 0.2
        + contact_score * 0.15
        + safety_score * 0.15
        + consistency_score * 0.1
    )

    return {
        "score": round(combined, 4),
        "weight": WEIGHTS["operationalReliability"],
        "weightedContribution": round(combined * WEIGHTS["operationalReliability"] * 100, 2),
        "detail": {
            "uploadRatio": round(upload_ratio, 4),
            "responseScore": round(response_score, 4),
            "hasContactInfo": signals.hasContactInfo,
            "hasSafetyDocumentation": signals.hasSafetyDocumentation,
            "inconsistentFields": signals.inconsistentFields,
        },
    }


def _project_requires_regulatory(project: ProjectContext) -> bool:
    ctx = project.as_dict()
    if ctx["laborClassification"] == "prevailing_wage":
        return True
    if ctx["setAside"] != "none":
        return True
    if ctx["fundingType"] in (
        "public",
        "grant_funded",
        "federal_assistance",
        "hud_cdbg",
        "dot_infrastructure",
    ):
        return True
    if ctx["projectType"] in (
        "public_infrastructure",
        "federal",
        "institutional",
        "emergency_response",
    ):
        return True
    if ctx["ownerType"] in ("municipality", "state_agency", "federal_agency"):
        return True
    return False


def score_regulatory_alignment(
    project: ProjectContext,
    requirements: list[Requirement],
) -> dict[str, Any]:
    if not _project_requires_regulatory(project):
        return {
            "score": 1.0,
            "weight": WEIGHTS["regulatoryAlignment"],
            "weightedContribution": round(1.0 * WEIGHTS["regulatoryAlignment"] * 100, 2),
            "detail": {"applicable": False, "reason": "Private/non-regulated project profile."},
        }

    regulatory_reqs = [
        r for r in requirements if r.docType in REGULATORY_DOCS and r.tier != "optional"
    ]
    if not regulatory_reqs:
        return {
            "score": 1.0,
            "weight": WEIGHTS["regulatoryAlignment"],
            "weightedContribution": round(10.0, 2),
            "detail": {"applicable": True, "regulatoryCount": 0},
        }

    points = [_doc_presence_points(r) for r in regulatory_reqs]
    avg = sum(points) / len(points)
    missing = [r.docType for r in regulatory_reqs if r.status == "missing"]

    return {
        "score": round(avg, 4),
        "weight": WEIGHTS["regulatoryAlignment"],
        "weightedContribution": round(avg * WEIGHTS["regulatoryAlignment"] * 100, 2),
        "detail": {
            "applicable": True,
            "regulatoryCount": len(regulatory_reqs),
            "missingRegulatory": missing,
        },
    }


def verify_audit_chain(chain: list[dict[str, Any]]) -> tuple[float, dict[str, Any]]:
    if not chain:
        return 0.2, {"events": 0, "chainValid": False, "reason": "no_audit_events"}

    valid_links = 0
    for i, event in enumerate(chain):
        expected_prev = chain[i - 1]["eventHash"] if i > 0 else "0" * 64
        if event.get("previousEventHash") == expected_prev and event.get("eventHash"):
            valid_links += 1

    continuity = valid_links / len(chain)
    action_types = {e.get("action") for e in chain}
    has_capture = bool(action_types & {"document_captured", "document_triaged"})
    has_review = "mobilization_approved" in action_types or "gc_review" in action_types

    score = continuity * 0.7
    if has_capture:
        score += 0.15
    if has_review:
        score += 0.15
    score = min(1.0, score)

    return round(score, 4), {
        "events": len(chain),
        "chainValid": continuity >= 1.0,
        "continuity": round(continuity, 4),
        "hasCaptureEvents": has_capture,
        "hasReviewEvents": has_review,
    }


def score_audit_integrity(chain: list[dict[str, Any]]) -> dict[str, Any]:
    score, detail = verify_audit_chain(chain)
    return {
        "score": score,
        "weight": WEIGHTS["auditIntegrity"],
        "weightedContribution": round(score * WEIGHTS["auditIntegrity"] * 100, 2),
        "detail": detail,
    }


def evaluate_contractor_readiness(
    project: ProjectContext,
    requirements: list[Requirement],
    *,
    operational: OperationalSignals | None = None,
    audit_chain: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    operational = operational or OperationalSignals()
    audit_chain = audit_chain or []

    categories = {
        "documentationCompleteness": score_documentation_completeness(requirements),
        "documentValidity": score_document_validity(requirements),
        "operationalReliability": score_operational_reliability(operational),
        "regulatoryAlignment": score_regulatory_alignment(project, requirements),
        "auditIntegrity": score_audit_integrity(audit_chain),
    }

    overall_100 = round(
        sum(c["weightedContribution"] for c in categories.values()),
        1,
    )
    classification = classify_readiness(overall_100)

    critical = [r for r in requirements if r.tier in ("required", "conditional")]
    blocking = [
        r.docType
        for r in critical
        if r.status == "missing" or r.triageStatus == "red"
    ]

    mobilization_ready = (
        overall_100 >= 90
        and not blocking
        and all(r.triageStatus in ("green", "amber") for r in critical if r.status != "missing")
        and all(r.status != "missing" for r in critical)
    )

    warnings: list[str] = []
    if categories["documentValidity"]["detail"].get("warnings"):
        warnings.append("Documents expiring soon — confirm before job end.")
    if categories["documentValidity"]["detail"].get("expired"):
        warnings.append("Expired or invalid documents detected.")
    if overall_100 < 90 and overall_100 >= 75:
        warnings.append("Conditionally ready — GC approval with noted conditions recommended.")

    return {
        "overallScore": overall_100,
        "classification": classification,
        "mobilizationReady": mobilization_ready,
        "blocking": blocking,
        "warnings": warnings,
        "categories": categories,
        "weights": WEIGHTS,
        "disclaimer": (
            "Operational readiness triage only — not legal or governmental verification."
        ),
    }
