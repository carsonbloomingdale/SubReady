#!/usr/bin/env python3
"""API triage smoke tests (no GGUF required)."""

from fastapi.testclient import TestClient

from model.context.context_loader import load_ocr_sample

# Import after env — no LLM at import
import index  # noqa: E402

client = TestClient(index.app)


def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["engine"] == "rules-first"


def test_hudson_coi_red():
    ocr = load_ocr_sample("ocr_samples/coi_hudson_roofing_acord25.txt")
    r = client.post("/triage", json={"ocrText": ocr, "docType": "coi"})
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "red"
    assert data["validityState"] == "expired"


def test_north_river_coi_green():
    ocr = load_ocr_sample("ocr_samples/coi_north_river_demo.txt")
    r = client.post("/triage", json={"ocrText": ocr, "docType": "coi"})
    assert r.status_code == 200
    assert r.json()["status"] == "green"


def test_w9_amber():
    ocr = load_ocr_sample("ocr_samples/w9_north_river.txt")
    r = client.post("/triage", json={"ocrText": ocr, "docType": "w9"})
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "amber"
    assert "w9_unsigned" in data.get("flags", [])


def test_pdf_placeholder_rejected():
    r = client.post("/triage", json={"ocrText": "[PDF document: test.pdf]"})
    assert r.status_code == 400


if __name__ == "__main__":
    test_health()
    test_hudson_coi_red()
    test_north_river_coi_green()
    test_w9_amber()
    test_pdf_placeholder_rejected()
    print("OK")
