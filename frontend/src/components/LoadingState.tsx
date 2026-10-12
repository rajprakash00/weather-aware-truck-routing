import { useEffect, useState } from 'react'

const PHASES = [
  { until: 1.5, label: 'Locating the two cities' },
  { until: 8, label: 'Finding truck routes' },
  { until: 15, label: 'Comparing route alternatives' },
  { until: Number.POSITIVE_INFINITY, label: 'Checking weather along each route' },
]

export default function LoadingState({ onCancel }: { onCancel: () => void }) {
  const [start] = useState(() => Date.now())
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const timer = window.setInterval(() => {
      setElapsed((Date.now() - start) / 1000)
    }, 100)
    return () => window.clearInterval(timer)
  }, [start])

  const phase = PHASES.find((candidate) => elapsed < candidate.until) ?? PHASES[PHASES.length - 1]

  return (
    <div className="p-4 lg:p-5" aria-busy="true" aria-live="polite">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
          <span className="text-sm font-medium">{phase.label}…</span>
        </div>
        <span className="tnum text-xs text-ink-3">{elapsed.toFixed(1)} s</span>
      </div>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-surface-2">
        <div className="animate-indeterminate h-full w-1/4 rounded-full bg-accent" />
      </div>
      {elapsed > 12 && (
        <p className="mt-3 text-xs text-ink-3">
          Cold solves can take up to 30 seconds. Repeats of the same trip return in under a second.
        </p>
      )}

      <ul className="mt-5 animate-pulse space-y-3" aria-hidden="true">
        {[0, 1, 2].map((row) => (
          <li key={row} className="space-y-2 rounded-lg border border-line-1 p-3">
            <div className="flex justify-between">
              <div className="h-3.5 w-20 rounded bg-surface-2" />
              <div className="h-3.5 w-16 rounded bg-surface-2" />
            </div>
            <div className="h-1.5 w-full rounded-full bg-surface-2" />
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={onCancel}
        className="mt-5 text-sm text-ink-2 underline underline-offset-2 transition-colors hover:text-ink-1"
      >
        Cancel
      </button>
    </div>
  )
}
