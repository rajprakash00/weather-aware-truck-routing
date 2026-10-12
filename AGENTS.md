# AGENTS.md

Weather-aware truck routing: React + Django app that picks the safest of three truck
routes between two US cities using weather, load weight, and travel time.

## Layout

- `backend/` — Django + DRF API. All third-party calls (TomTom, Open-Meteo) happen here.
  - `backend/routing/risk.py` — pure risk engine (no network, no DB). Keep it pure and tested.
  - `backend/spikes/` — one-off provider verification scripts.
- `frontend/` — React (Vite + TypeScript), MapLibre map. Created on Day 3. Never calls
  third-party APIs directly.
- `.handoff/current.md` — session journal (gitignored). If you are an agent starting a new
  session here: read it first, then continue from "Next session focus".

## Commands

Backend (run from `backend/`):

- `uv venv .venv && uv pip install -r requirements.txt` (if `.venv/` missing)
- `.venv/bin/pytest -q` — risk engine tests
- `.venv/bin/python manage.py runserver` — dev API on :8000

Frontend (run from `frontend/`, Day 3+):

- `npm install`
- `npm run dev`

## Rules

- Never commit secrets. Keys live in `backend/.env` (gitignored); `.env.example` is the template.
- Risk logic stays in `backend/routing/risk.py` as pure functions with unit tests.
- The public repo contains product material only: no personal notes, journals, or process
  artifacts (those live in `.handoff/`, gitignored).
- Small commits, conventional style (`feat:`, `fix:`, `chore:`, `docs:`).
