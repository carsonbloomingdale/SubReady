# Qwen / llama.cpp context pack (SubReady hackathon)

Offline context for **Qwen3 4B GGUF** when `LLM_NARRATIVE=1` or when testing prompts in the IDE.

## Layout

| Path | Purpose |
|------|---------|
| `system_prompt.md` | Role, JSON schema, green/amber/red rules |
| `domain_glossary.json` | Doc types, demo subs, demo GCs, demo projects |
| `document_schemas.json` | Fields to extract per doc type |
| `demo_project.json` | Default 42 Maple Street residential job |
| `ocr_samples/*.txt` | Realistic OCR text from hackathon scannables |
| `fixtures/*.triage.json` | Expected model outputs for regression |
| `few_shot.jsonl` | Maps OCR samples → expected triage |
| `context_loader.py` | Builds chat messages for the API |

## Demo documents

| Contractor | Document | Source | Expected triage |
|------------|----------|--------|-----------------|
| Hudson Roofing LLC | COI ACORD 25 | PNG scan | **red** — expires **04/01/2026** (past as of June 2026) |
| North River Roofing | COI (simplified) | `COI_Active_Green.pdf` | **green** — active through **04/01/2027** |
| North River Roofing | W-9 | `North River roofing W_9 SubReady.pdf` | **amber** — unsigned only (LLC subtype not required) |

OCR samples are derived from your hackathon files (PDF text layer + visual review of W-9). Re-run Tesseract on scans and replace `ocr_samples/*.txt` if needed.

## Enable in server

```powershell
$env:LLM_NARRATIVE = "1"
python run_server.py
```

`POST /triage` uses rules engine first; LLM may refine `reason` / `nextStep` when enabled.

## Test prompt assembly (no model)

```powershell
cd subreready-server
python -c "from model.context.context_loader import build_qwen_prompt_string, load_ocr_sample; print(build_qwen_prompt_string(ocr_text=open('model/context/ocr_samples/w9_north_river.txt').read(), doc_type='w9', requirement_tier='required')[:2000])"
```

## Copy scannables into repo

Place files under `subreready-server/demo_scannables/`:

- `North River roofing W_9 SubReady.pdf`
- `COI_Active_Green.pdf`
- `COI_Hudson_Roofing_ACORD25.png`
