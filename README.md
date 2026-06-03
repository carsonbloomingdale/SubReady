# SubReady

Local triage and grading of subcontractor documents (PDF/image upload or camera scan).

## Prerequisites

| Tool | Purpose |
|------|---------|
| [Git](https://git-scm.com/) | Push/pull |
| Python 3.12+ | API server |
| Node.js 18+ & npm | React client |
| [Tesseract](https://github.com/tesseract-ocr/tesseract) | Server-side image OCR (`brew install tesseract`) |
| Qwen GGUF model | Local LLM triage (not in git; see below) |

## Quick start

```bash
cd SubReady   # this folder (the git repo root)
chmod +x scripts/*.sh
./scripts/setup.sh
./scripts/run-server.sh    # terminal 1 — http://localhost:8000
./scripts/run-client.sh    # terminal 2 — http://localhost:5173
```

Place your model file at:

`subreready-server/model/Qwen3-4B-Q4_K_M.gguf`

Or set `SUBREADY_MODEL_PATH` in `subreready-server/.env` (copy from `.env.example`).

## Git (push / pull)

This project’s git root is **`SubReady/SubReady`** (not the parent folder). Always run git commands here:

```bash
cd /path/to/SubReady/SubReady
git status
git pull origin main      # or your branch, e.g. backend
git add -A
git commit -m "Your message"
git push origin HEAD
```

Remote: `https://github.com/carsonbloomingdale/SubReady.git`

### First-time authentication

Git needs permission to talk to GitHub:

- **HTTPS:** use a [Personal Access Token](https://github.com/settings/tokens) as the password when prompted, or configure the macOS keychain / Git credential helper.
- **SSH:** add your SSH key to GitHub, then switch the remote:
  ```bash
  git remote set-url origin git@github.com:carsonbloomingdale/SubReady.git
  ```

Verify access:

```bash
git fetch origin
```

### Nested repo note

If your editor opens `/Users/.../SubReady` (parent), that folder is a **separate** git repo. Day-to-day work and push/pull should use **`SubReady/SubReady`** where `subreready-server` and `subreready-client` live.

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/upload` | PDF/image file upload |
| POST | `/api/triage` | JSON `{ "ocrText": "..." }` |

## Troubleshooting

- **503 model not found** — Add the GGUF under `subreready-server/model/` or fix `.env`.
- **Image OCR errors** — Install Tesseract: `brew install tesseract`.
- **Client can’t reach API** — Server must be on port 8000; Vite proxies `/api` to it.
