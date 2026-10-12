import type { SolveError } from '../api/solve'
import type { Checkpoint, Route, SolveResponse } from '../api/types'
import {
  formatClock,
  formatDate,
  formatDuration,
  formatElapsed,
  formatLoad,
  formatMiles,
  formatRisk,
  formatTzAbbrev,
  placeLabel,
} from '../lib/format'
import EmptyState from './EmptyState'
import ErrorState from './ErrorState'
import LoadingState from './LoadingState'
import RouteDetails from './RouteDetails'
import RouteList from './RouteList'

interface ResultsPanelProps {
  data: SolveResponse | null
  error: SolveError | null
  isPending: boolean
  solveSeconds: number | null
  selectedIndex: number
  onSelect: (index: number) => void
  onFocus: (route: Route, checkpoint: Checkpoint) => void
  onFit: (index: number) => void
  onCancel: () => void
  onRetry: () => void
  onExample: (origin: string, destination: string, plusDays: number) => void
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="eyebrow">{label}</div>
      <div className="tnum mt-0.5 text-sm font-semibold">{value}</div>
    </div>
  )
}

export default function ResultsPanel({
  data,
  error,
  isPending,
  solveSeconds,
  selectedIndex,
  onSelect,
  onFocus,
  onFit,
  onCancel,
  onRetry,
  onExample,
}: ResultsPanelProps) {
  if (isPending) return <LoadingState onCancel={onCancel} />
  if (!data && error) return <ErrorState error={error} onRetry={onRetry} />
  if (!data) return <EmptyState onExample={onExample} />

  const recommended =
    data.routes.find((route) => route.index === data.recommended_route_index) ?? data.routes[0]
  const selected = data.routes.find((route) => route.index === selectedIndex) ?? data.routes[0]
  const departureClock = formatClock(data.departure.utc, data.departure.timezone)
  const departureTz = formatTzAbbrev(data.departure.utc, data.departure.timezone)

  return (
    <div className="animate-fade-rise">
      {error && <ErrorState error={error} onRetry={onRetry} compact />}

      <section className="border-b border-line-1 p-4 lg:p-5">
        <div className="eyebrow">Trip</div>
        <h2 className="mt-1 text-xl font-semibold tracking-tight">
          {placeLabel(data.origin)} <span className="font-normal text-ink-3">→</span>{' '}
          {placeLabel(data.destination)}
        </h2>
        <div className="tnum mt-0.5 text-sm text-ink-2">
          {formatDate(data.departure.utc, data.departure.timezone)}, {departureClock.time} {departureTz}
          {' · '}
          {formatLoad(data.load_lb)}
          {solveSeconds !== null ? ` · solved in ${formatElapsed(solveSeconds)}` : ''}
        </div>

        <div className="mt-4 rounded-lg bg-accent-soft p-3.5 ring-1 ring-accent-line/70">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-2xs font-semibold tracking-[0.08em] text-accent-strong uppercase">
              Recommended
            </span>
            <span className="text-base font-semibold">{recommended.label}</span>
          </div>
          <p className="mt-1.5 text-sm text-ink-2">{data.recommendation.summary}</p>
          {data.recommendation.all_unsafe && (
            <p className="mt-1 text-sm font-semibold text-risk-4">
              Every route has a no-travel checkpoint. Consider delaying departure.
            </p>
          )}
          <div className="mt-3 flex gap-6 border-t border-accent-line/70 pt-2.5">
            <Metric label="Duration" value={formatDuration(recommended.duration_h)} />
            <Metric label="Distance" value={formatMiles(recommended.distance_mi)} />
            <Metric label="Avg risk" value={formatRisk(recommended.metrics.avg_risk)} />
          </div>
        </div>
      </section>

      {data.warnings.length > 0 && (
        <section className="border-b border-line-1 px-4 py-3 lg:px-5" aria-label="Warnings">
          <ul className="space-y-1">
            {data.warnings.map((warning) => (
              <li key={warning} className="flex gap-2 text-xs text-ink-2">
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  className="mt-0.5 shrink-0 text-risk-3"
                  aria-hidden="true"
                >
                  <path
                    d="M6 1.2 11 10.5H1L6 1.2Z"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.3"
                    strokeLinejoin="round"
                  />
                  <path d="M6 5v2.2M6 8.8v.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                </svg>
                {warning}
              </li>
            ))}
          </ul>
        </section>
      )}

      <RouteList routes={data.routes} selectedIndex={selectedIndex} onSelect={onSelect} />

      <RouteDetails
        route={selected}
        checkpointMi={data.checkpoint_interval_mi}
        onFocus={onFocus}
        onFit={onFit}
      />

      <footer className="p-4 lg:p-5">
        <p className="text-xs text-ink-3">
          Weather from Open-Meteo hourly forecasts, sampled at checkpoint ETAs. Risk thresholds are
          guidance, not a guarantee. Check road closures and chain laws before dispatch.
        </p>
      </footer>
    </div>
  )
}
