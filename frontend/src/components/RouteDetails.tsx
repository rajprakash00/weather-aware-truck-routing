import type { Checkpoint, Route } from '../api/types'
import { formatClock, formatWind } from '../lib/format'
import { riskMeta } from '../lib/risk'

interface RouteDetailsProps {
  route: Route
  checkpointMi: number
  onFocus: (route: Route, checkpoint: Checkpoint) => void
  onFit: (index: number) => void
}

export default function RouteDetails({ route, checkpointMi, onFocus, onFit }: RouteDetailsProps) {
  const highlights = route.checkpoints
    .filter((checkpoint) => checkpoint.risk >= 3)
    .sort((a, b) => b.risk - a.risk || a.mi - b.mi)
    .slice(0, 3)

  return (
    <section className="border-b border-line-1 p-4 lg:p-5" aria-label={`${route.label} details`}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold">{route.label} details</h3>
        <button
          type="button"
          onClick={() => onFit(route.index)}
          className="text-xs font-medium text-accent transition-colors hover:text-accent-strong"
        >
          Zoom to route
        </button>
      </div>
      <p className="tnum mt-1 text-xs text-ink-3">
        max risk {riskMeta(route.metrics.max_risk).label.toLowerCase()} ·{' '}
        {route.metrics.no_travel_checkpoints > 0
          ? `${route.metrics.no_travel_checkpoints} no-travel checkpoint${
              route.metrics.no_travel_checkpoints === 1 ? '' : 's'
            }`
          : `${route.metrics.checkpoints} checkpoints, none above high`}
        {route.traffic_delay_min > 0.5 ? ` · +${route.traffic_delay_min.toFixed(0)} min traffic` : ''}
      </p>

      {highlights.length > 0 && (
        <>
          <div className="eyebrow mt-4">Risk highlights</div>
          <ul className="mt-2 space-y-1">
            {highlights.map((checkpoint) => {
              const meta = riskMeta(checkpoint.risk)
              const clock = formatClock(checkpoint.eta_utc, checkpoint.timezone)
              return (
                <li key={checkpoint.mi}>
                  <button
                    type="button"
                    onClick={() => onFocus(route, checkpoint)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-surface-2"
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: meta.color }}
                      aria-hidden="true"
                    />
                    <span className="tnum shrink-0 text-ink-2">mi {Math.round(checkpoint.mi)}</span>
                    <span className="tnum text-ink-3">
                      {clock.weekday} {clock.time}
                    </span>
                    <span className="ml-auto shrink-0 font-medium" style={{ color: meta.color }}>
                      {meta.label}
                    </span>
                    <span className="tnum hidden shrink-0 text-xs text-ink-3 sm:inline">
                      {formatWind(checkpoint.wind_mph)} wind
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}

      <div className="eyebrow mt-5">Checkpoints every {checkpointMi} mi</div>
      <div className="mt-2 max-h-72 overflow-y-auto rounded-md border border-line-1">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-surface-1 text-left text-ink-3">
            <tr>
              <th className="px-1.5 py-1.5 font-medium whitespace-nowrap">Mi</th>
              <th className="px-1.5 py-1.5 font-medium whitespace-nowrap">ETA</th>
              <th className="px-1.5 py-1.5 font-medium whitespace-nowrap">Risk</th>
              <th className="px-1.5 py-1.5 text-right font-medium whitespace-nowrap">Wind mph</th>
              <th className="px-1.5 py-1.5 text-right font-medium whitespace-nowrap">Rain in</th>
              <th className="px-1.5 py-1.5 text-right font-medium whitespace-nowrap">Snow in</th>
            </tr>
          </thead>
          <tbody className="tnum">
            {route.checkpoints.map((checkpoint) => {
              const meta = riskMeta(checkpoint.risk)
              const clock = formatClock(checkpoint.eta_utc, checkpoint.timezone)
              return (
                <tr key={checkpoint.mi} className="border-t border-line-1">
                  <td className="px-1.5 py-1 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => onFocus(route, checkpoint)}
                      className="rounded-sm px-1 py-0.5 text-left text-ink-2 underline decoration-line-2 underline-offset-2 transition-colors hover:bg-surface-2 hover:text-ink-1"
                      aria-label={`Show checkpoint at mile ${Math.round(checkpoint.mi)}`}
                    >
                      {Math.round(checkpoint.mi)}
                    </button>
                  </td>
                  <td className="px-1.5 py-1 whitespace-nowrap text-ink-2">
                    {clock.weekday} {clock.time}
                    {checkpoint.beyond_48h && <span className="ml-1 text-ink-3">+48h</span>}
                  </td>
                  <td className="px-1.5 py-1 whitespace-nowrap">
                    <span className="flex items-center gap-1.5 text-ink-2">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: meta.color }}
                        aria-hidden="true"
                      />
                      {meta.label}
                    </span>
                  </td>
                  <td className="px-1.5 py-1 text-right whitespace-nowrap text-ink-2">
                    {Math.round(checkpoint.wind_mph)}
                  </td>
                  <td className="px-1.5 py-1 text-right whitespace-nowrap text-ink-2">
                    {checkpoint.rain_in.toFixed(2)}
                  </td>
                  <td className="px-1.5 py-1 text-right whitespace-nowrap text-ink-2">
                    {checkpoint.snow_in.toFixed(1)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-ink-3">
        Click a mile marker to inspect it on the map. Risk governs the interval after each checkpoint.
      </p>
    </section>
  )
}
