#!/usr/bin/env python3
"""Unit tests for llm_triage helpers and TRIAGE_MODE=llm API path."""

from fastapi import HTTPException
from fastapi.testclient import TestClient

import index
import llm_triage


def test_parse_triage_response_valid():
    raw = '{"status":"green","reason":"OK","nextStep":"Submit to GC"}'
    assert llm_triage.parse_triage_response(raw)["status"] == "green"


def test_parse_triage_response_rejects_bad_status():
    raw = '{"status":"blue","reason":"x","nextStep":"y"}'
    try:
        llm_triage.parse_triage_response(raw)
        raise AssertionError("expected HTTPException")
    except HTTPException as exc:
        assert exc.status_code == 502


def test_llm_mode_without_model(monkeypatch):
    monkeypatch.setattr(index, "TRIAGE_MODE", "llm")
    monkeypatch.setattr(index, "_get_llm", lambda: None)
    client = TestClient(index.app)
    r = client.post(
        "/triage",
        json={"ocrText": "certificate of insurance policy number 12345"},
    )
    assert r.status_code == 503


if __name__ == "__main__":
    from unittest.mock import patch

    test_parse_triage_response_valid()
    test_parse_triage_response_rejects_bad_status()

    class _Monkey:
        def setattr(self, obj, name, value):
            setattr(obj, name, value)

    test_llm_mode_without_model(_Monkey())
    print("OK")
