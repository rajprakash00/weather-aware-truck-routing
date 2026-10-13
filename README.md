# Weather-Aware Truck Routing

Pick the safest of three truck routes between two US cities — based on the weather the
truck will actually meet along the way, the load it carries, and the time the trip takes.

React + Django, with TomTom routing, Open-Meteo weather, and a MapLibre map.

Live: <https://weather-aware-truck-routing-osf1.onrender.com>

## What it does

Enter an origin, a destination, a load weight, and a departure time. The app:

1. Geocodes both cities (Open-Meteo geocoding, keyless).
2. Fetches up to three real truck routes (TomTom, `travelMode=truck` with the trip's
   actual vehicle weight), deduplicates them, and synthesizes by-waypoint alternatives
   when TomTom returns fewer than three.
3. Samples hour-level forecast weather at checkpoints every 10, 25, or 50 miles along
   each route, at the ETA the truck will be there.
4. Scores wind, rain, and snow risk at every checkpoint, escalating wind risk for heavy
   loads.
5. Recommends the safest route with a plain-language reason, and shows where the risk
   sits on the map: risk-colored route segments, checkpoint popups with local ETAs and
   per-factor risks.

An optional heatmap animates the 48-hour risk grid around the selected route, so you can
watch a storm system move across the corridor hour by hour.

## Architecture

One Django service serves both the API and the built React app. The frontend never calls
third-party APIs directly; every provider call happens in the backend.

```
frontend (React 19, Vite, TypeScript, Tailwind 4, MapLibre GL, TanStack Query)
        |  POST /api/routes, /api/heatmap
        v
backend (Django 6, DRF, WhiteNoise)
        |-- routing/risk.py           pure risk engine (no network, no DB, unit tested)
        |-- routing/planner.py        routes -> checkpoints -> weather -> payload
        |-- routing/heatmap.py        corridor grid + 48-hour risk series
        |-- routing/tomtom.py         truck routing + alternatives
        |-- routing/weather.py        batched Open-Meteo forecast calls
        |-- routing/geocoding.py      Open-Meteo geocoding
        |-- routing/cache.py          file cache (routes, weather, geocodes)
        v
TomTom  /  Open-Meteo (optional Cloudflare Worker proxy)
```

Provider responses are cached on disk, keyed by a hash of the request: geocodes 30 days,
routes 15 minutes (live traffic) or 1 hour (planned departures), weather 1 hour. There is
no database.

The map (MapLibre, OpenFreeMap Liberty style) draws one line per checkpoint interval in
that interval's risk color, checkpoint dots on the selected route, and an animated
corridor heatmap layer. React state keeps the last success on screen while a new solve
runs, so results never flash away.

## API

### `POST /api/routes`

Request:

```json
{
  "origin": "Kansas City, MO",
  "destination": "St. Louis, MO",
  "load_lb": 42000,
  "departure": "2026-10-14T08:00:00",
  "checkpoint_mi": 25
}
```

`origin` / `destination` are free-text city queries. `load_lb` is cargo weight (0 to
80,000) added to the truck's 17,000 lb curb weight. `departure` is optional ISO 8601: a
naive value is read as origin-local wall time, an offset-aware value is used as-is, and
omitting it means "now". `checkpoint_mi` is 10, 25, or 50 (default 25).

Response (200), abbreviated:

```json
{
  "origin": { "name": "...", "admin1": "...", "country_code": "US", "latitude": 39.1, "longitude": -94.58, "timezone": "America/Chicago" },
  "destination": { "...": "same shape" },
  "departure": { "utc": "2026-10-14T13:00:00Z", "local": "2026-10-14T08:00:00-05:00", "timezone": "America/Chicago" },
  "load_lb": 42000,
  "vehicle_weight_kg": 26762,
  "checkpoint_interval_mi": 25,
  "recommended_route_index": 0,
  "recommendation": { "summary": "...", "all_unsafe": false },
  "routes": [
    {
      "index": 0,
      "label": "Route A",
      "synthesized": false,
      "recommended": true,
      "distance_mi": 248.3,
      "duration_h": 3.9,
      "traffic_delay_min": 4,
      "bounds": [38.4, -94.9, 39.8, -89.9],
      "metrics": { "severe_mi": 0, "high_mi": 12.5, "no_travel_mi": 0, "avg_risk": 1.18, "max_risk": 3, "max_risk_label": "HIGH", "no_travel_checkpoints": 0, "checkpoints": 11, "duration_h": 3.9 },
      "geometry": [[39.1, -94.58], ["..."]],
      "checkpoints": [
        {
          "mi": 25.0, "lat": 39.1, "lon": -94.3, "eta_utc": "2026-10-14T13:24:00Z",
          "eta_local": "2026-10-14T08:24:00-05:00", "timezone": "America/Chicago",
          "beyond_48h": false, "wind_mph": 14.2, "gust_mph": 22.1, "rain_in": 0.0,
          "snow_in": 0.0, "temp_f": 58.1, "risk": 1, "risk_label": "LOW",
          "wind_risk": 1, "rain_risk": 1, "snow_risk": 1
        }
      ]
    }
  ],
  "warnings": [],
  "computed_at": "2026-10-13T18:02:11Z"
}
```

`geometry` carries roughly 2,000 `[lat, lon]` points. Checkpoints are sampled at
cumulative geodesic distance including the destination; `beyond_48h` marks points past
the 48-hour weather window, for which the forecast is extended further out.

### `POST /api/heatmap`

Same trip fields as `/api/routes`, plus `route_index` (0–2) selecting which route to
build the corridor around. The trip fields must match the solve request so the same
cached route resolves.

```json
{
  "origin": "Kansas City, MO",
  "destination": "St. Louis, MO",
  "load_lb": 42000,
  "departure": "2026-10-14T08:00:00",
  "route_index": 0
}
```

Response (200):

```json
{
  "route_index": 0,
  "hours_utc": ["2026-10-14T13:00:00Z", "..."],
  "bounds": [38.4, -94.9, 39.8, -89.9],
  "points": [{ "lat": 39.1, "lon": -94.3, "risk": [1, 2, 3, "...48 ints"] }],
  "computed_at": "2026-10-13T18:02:11Z"
}
```

The grid covers a 25-mile corridor around the selected route (at most ~200 points, one
batched weather call for all points × 48 hours). `hours_utc` has 48 entries, hour 0 being
departure time; `risk` is the same integer risk score as the checkpoint risk in
`/api/routes`.

### Errors

- `400` request validation (DRF field errors)
- `422` location not found
- `502` / `503` / `504` provider errors; the body carries a `detail` message and, for
  weather failures, a snippet of the provider's response
- `GET /api/health/` returns `{"status": "ok"}` for uptime checks

## Risk model

`backend/routing/risk.py` is a pure, deterministic engine: no network, no database, no
Django. One unit test file covers ~40 cases.

Wind (sustained), rain (rain + showers combined), and snow (water equivalent) are scored
independently from 1 to 5, and a checkpoint's risk is the maximum of the three:

| Score | Label | Wind | Rain (in/h) | Snow (in/h) |
|---|---|---|---|---|
| 1 | LOW | < 25 mph | < 0.10 | < 0.5 |
| 2 | MODERATE | 25–34 | 0.10–0.24 | 0.5–0.9 |
| 3 | HIGH | 35–44 | 0.25–0.49 | 1.0–1.9 |
| 4 | SEVERE | 45–54 | 0.50–1.00 | 2.0–3.0 |
| 5 | NO TRAVEL | >= 55 | > 1.00 | > 3.0 |

Wind risk escalates with load weight first: 35–44 mph with a load over 40,000 lb becomes
SEVERE, and 45–54 mph with a load over 30,000 lb (or any wind >= 55 mph) becomes NO
TRAVEL. Thresholds are strict — exactly 30,000 / 40,000 lb does not escalate. Gusts are
displayed in popups but do not change the score.

The recommendation treats a checkpoint's risk as governing the interval ahead of it
(and mile-weights all metrics). A route with any NO TRAVEL checkpoint is never
recommended; if every route has one, the app recommends the one with the fewest
no-travel miles and sets `all_unsafe: true`. Otherwise routes are compared
lexicographically by severe miles, high miles, average risk, and duration — and the
recommendation's reason names the first dimension where the winner beat the runner-up.

## Local development

Requirements: Python 3.13+, Node 20+ (backend deps in `backend/requirements.txt`).

Backend:

```bash
cd backend
uv venv .venv && uv pip install -r requirements.txt
cp .env.example .env          # set TOMTOM_API_KEY
.venv/bin/python manage.py runserver
```

Frontend dev server (proxies `/api` to `:8000`):

```bash
cd frontend
npm install
npm run dev                    # http://localhost:5173
```

Tests and checks:

```bash
cd backend && .venv/bin/pytest -q    # risk engine tests
cd frontend && npm run lint
cd frontend && npm run build         # typecheck + production build
```

To run the production stack locally — Django serving the built frontend:

```bash
cd frontend && npm run build
cd ../backend
.venv/bin/python manage.py collectstatic --noinput
.venv/bin/python manage.py runserver
```

## Deployment

The app runs as a single Render web service (`render.yaml`) with Gunicorn
(`--workers 2 --threads 4 --timeout 120`). The build installs Python deps, builds the
frontend, runs migrations, and collects static files; WhiteNoise serves the built assets,
and Django serves the app shell for `/`.

Environment variables:

| Variable | Purpose |
|---|---|
| `TOMTOM_API_KEY` | Truck routing (required) |
| `OPEN_METEO_BASE_URL` | Optional weather host override; points at the Cloudflare Worker proxy in `ops/weather-proxy/` |
| `OPEN_METEO_API_KEY` | Optional fallback (Open-Meteo customer API); ignored when the base URL is set |
| `DJANGO_SECRET_KEY`, `DJANGO_DEBUG`, `DJANGO_ALLOWED_HOSTS`, `DJANGO_CSRF_TRUSTED_ORIGINS` | Django configuration |

Secrets live in `backend/.env` (gitignored) locally; `backend/.env.example` documents the
shape. On Render, set them in the dashboard (or `render.yaml` for generated values).

Open-Meteo rate limits the free forecast host per IP; on Render's shared NAT that limit
can be exhausted. `ops/weather-proxy/worker.js` is a small Cloudflare Worker that
forwards forecast requests without the caller's IP headers, so requests are slotted to
the worker identity instead. Point `OPEN_METEO_BASE_URL` at the deployed worker to use
it.

On the free Render plan the service spins down after 15 minutes idle, so a scheduled
GitHub Actions workflow (`.github/workflows/keep-alive.yml`) pings `/api/health/` every
10 minutes. Delete that workflow if the service moves to a paid plan.

## Providers

- **TomTom Routing API** — truck routes with traffic (`travelMode=truck`,
  `vehicleCommercial=true`, per-trip `vehicleWeight`). Free tier, 20k requests/month.
- **Open-Meteo** — forecast weather (batched POST, hourly variables, `timezone=auto`)
  and keyless geocoding. Free for non-commercial use; an API key or the Worker proxy
  covers heavier use.
- **MapLibre GL JS** — map rendering, with the **OpenFreeMap Liberty** vector tile
  style.

The app is a planning aid, not a substitute for professional dispatch judgment; always
check official road and weather sources before rolling.

## License

MIT — see [LICENSE](LICENSE).
