#!/usr/bin/env python3
"""Assert demo OCR samples match expected expiration and triage rules."""

from pathlib import Path

from model.context.context_loader import load_ocr_sample
from rules.engine import assess_document_validity, triage_document

CONTEXT = Path(__file__).resolve().parent / "model" / "context"


def main():
    hudson = load_ocr_sample("ocr_samples/coi_hudson_roofing_acord25.txt")
    north = load_ocr_sample("ocr_samples/coi_north_river_demo.txt")

    h_valid = assess_document_validity(hudson, "coi")
    n_valid = assess_document_validity(north, "coi")
    assert h_valid["validityState"] == "expired", h_valid
    assert n_valid["validityState"] == "valid", n_valid

    h_triage = triage_document(hudson, "coi", "required")
    n_triage = triage_document(north, "coi", "required")
    assert h_triage["status"] == "red", h_triage
    assert n_triage["status"] in ("green", "amber"), n_triage
    assert "expired" in h_triage.get("flags", []) or h_triage["validityState"] == "expired"

    print("Hudson COI:", h_valid["validityState"], "->", h_triage["status"])
    print("North River COI:", n_valid["validityState"], "->", n_triage["status"])
    print("OK")


if __name__ == "__main__":
    main()
