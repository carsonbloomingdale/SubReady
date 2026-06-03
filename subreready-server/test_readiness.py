#!/usr/bin/env python3
"""Offline checks for contractor readiness heuristic."""

from rules.engine import PRESETS, Requirement, generate_requirements, evaluate_readiness
from rules.readiness import classify_readiness


def _filled_partial(reqs: list[Requirement]) -> list[Requirement]:
    out = []
    for i, r in enumerate(reqs):
        copy = Requirement(
            docType=r.docType,
            label=r.label,
            tier=r.tier,
            status="missing",
            triageStatus=None,
            ruleIds=r.ruleIds,
        )
        if r.tier == "required" and i < 2:
            copy.status = "triaged"
            copy.triageStatus = "green"
            copy.validityState = "valid"
        out.append(copy)
    return out


def main():
    assert classify_readiness(92)["id"] == "ready_for_mobilization"
    assert classify_readiness(80)["id"] == "conditionally_ready"
    assert classify_readiness(60)["id"] == "incomplete_review_required"
    assert classify_readiness(40)["id"] == "high_compliance_risk"

    ctx = PRESETS["residential_remodel_private"]
    reqs = generate_requirements(ctx)
    empty = evaluate_readiness(ctx, reqs)
    print("Residential (empty):", empty["overallScore"], empty["classification"]["label"])

    partial = evaluate_readiness(ctx, _filled_partial(reqs))
    print("Residential (partial):", partial["overallScore"], partial["classification"]["label"])

    municipal = PRESETS["municipal_public_works"]
    m_reqs = generate_requirements(municipal)
    m_partial = evaluate_readiness(municipal, _filled_partial(m_reqs))
    print("Municipal (partial):", m_partial["overallScore"], m_partial["classification"]["label"])
    print("  regulatory:", m_partial["categories"]["regulatoryAlignment"]["detail"])

    print("OK")


if __name__ == "__main__":
    main()
