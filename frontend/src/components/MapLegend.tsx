import { ALT_ROUTE_COLOR, RISK_LEVELS } from '../lib/risk'

const ORDER = [1, 2, 3, 4, 5]

export default function MapLegend() {
  return (
    <div className="pointer-events-none absolute bottom-6 left-3 z-10 rounded-lg border border-line-1 bg-surface-0/95 px-3 py-2.5 shadow-float">
      <div className="eyebrow">Risk along route</div>
      <ul className="mt-1.5 space-y-1">
        {ORDER.map((level) => (
          <li key={level} className="flex items-center gap-2 text-xs text-ink-2">
            <span
              className="h-2.5 w-2.5 rounded-full ring-1 ring-black/10"
              style={{ background: RISK_LEVELS[level].color }}
              aria-hidden="true"
            />
            {RISK_LEVELS[level].label}
          </li>
        ))}
      </ul>
      <div className="mt-2 flex items-center gap-2 border-t border-line-1 pt-2 text-xs text-ink-3">
        <span
          className="h-[3px] w-4 rounded-full"
          style={{ background: ALT_ROUTE_COLOR }}
          aria-hidden="true"
        />
        Alternative route
      </div>
    </div>
  )
}
