import type { Route, RouteMetrics } from '../api/types'
import { formatDuration, formatMiles, formatRisk } from '../lib/format'
import { riskMeta } from '../lib/risk'

function RiskStrip({ route }: { route: Route }) {
  const total = route.distance_mi || 1
  const flagged = [
    { mi: route.metrics.high_mi, color: riskMeta(3).color, label: 'high' },
    { mi: route.metrics.severe_mi, color: riskMeta(4).color, label: 'severe' },
    { mi: route.metrics.no_travel_mi, color: riskMeta(5).color, label: 'no travel' },
  ]
  const flaggedTotal = flagged.reduce((sum, part) => sum + part.mi, 0)
  const rest = Math.max(0, total - flaggedTotal)
  const title =
    flaggedTotal > 0
      ? `${flaggedTotal.toFixed(1)} mi at HIGH or worse; the rest moderate or lower`
      : 'No miles at HIGH or worse'

  return (
    <div
      className="flex h-1.5 overflow-hidden rounded-full bg-line-1"
      title={title}
      role="img"
      aria-label={title}
    >
      <div style={{ width: `${(rest / total) * 100}%`, background: 'var(--color-line-2)' }} />
      {flagged.map(
        (part) =>
          part.mi > 0 && (
            <div
              key={part.label}
              style={{ width: `${(part.mi / total) * 100}%`, background: part.color }}
            />
          ),
      )}
    </div>
  )
}

function riskSummaryLine(metrics: RouteMetrics): string {
  const parts: string[] = []
  if (metrics.no_travel_mi > 0) parts.push(`${formatMiles(metrics.no_travel_mi)} no-travel`)
  if (metrics.severe_mi > 0) parts.push(`${formatMiles(metrics.severe_mi)} severe`)
  if (metrics.high_mi > 0) parts.push(`${formatMiles(metrics.high_mi)} high`)
  return parts.length > 0 ? parts.join(' · ') : 'No high-risk miles'
}

interface RouteListProps {
  routes: Route[]
  selectedIndex: number
  onSelect: (index: number) => void
}

export default function RouteList({ routes, selectedIndex, onSelect }: RouteListProps) {
  return (
    <section className="border-b border-line-1" aria-label="Routes">
      <ol>
        {routes.map((route) => {
          const selected = route.index === selectedIndex
          return (
            <li key={route.index} className="border-b border-line-1 last:border-b-0">
              <button
                type="button"
                onClick={() => onSelect(route.index)}
                aria-pressed={selected}
                className={`w-full px-4 py-3 text-left transition-colors lg:px-5 ${
                  selected ? 'bg-accent-soft/70' : 'hover:bg-surface-1'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-sm font-semibold ${selected ? 'text-accent-strong' : 'text-ink-1'}`}
                    >
                      {route.label}
                    </span>
                    {route.recommended && (
                      <span className="rounded-full bg-ink-1 px-2 py-0.5 text-2xs font-semibold tracking-wide text-white uppercase">
                        Recommended
                      </span>
                    )}
                    {route.synthesized && (
                      <span className="rounded-full border border-line-2 px-2 py-0.5 text-2xs font-medium text-ink-3">
                        Via-point
                      </span>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="tnum text-sm font-semibold">{formatDuration(route.duration_h)}</div>
                    <div className="tnum text-xs text-ink-3">{formatMiles(route.distance_mi)}</div>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <div className="flex-1">
                    <RiskStrip route={route} />
                  </div>
                  <span className="tnum shrink-0 text-xs text-ink-3">
                    avg {formatRisk(route.metrics.avg_risk)}
                  </span>
                </div>
                <div className="tnum mt-1.5 text-xs text-ink-3">{riskSummaryLine(route.metrics)}</div>
              </button>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
