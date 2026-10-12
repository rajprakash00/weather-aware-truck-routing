interface EmptyStateProps {
  onExample: (origin: string, destination: string, plusDays: number) => void
}

const STEPS = [
  'Enter both cities, the load weight, and when the truck departs.',
  'Get up to three real truck routes, with hour-level weather at every checkpoint.',
  'See which route is safest for this load, and where the risk sits.',
]

const EXAMPLES = [
  { origin: 'Los Angeles, CA', destination: 'Denver, CO', plusDays: 0, label: 'Los Angeles → Denver' },
  { origin: 'Kansas City, MO', destination: 'St. Louis, MO', plusDays: 0, label: 'Kansas City → St. Louis' },
  {
    origin: 'Boston, MA',
    destination: 'Los Angeles, CA',
    plusDays: 10,
    label: 'Boston → Los Angeles, +10 days',
  },
]

export default function EmptyState({ onExample }: EmptyStateProps) {
  return (
    <div className="p-4 lg:p-5">
      <h2 className="text-sm font-semibold">Plan a load</h2>
      <ol className="mt-3 space-y-2.5">
        {STEPS.map((step, index) => (
          <li key={step} className="flex gap-2.5 text-sm text-ink-2">
            <span className="tnum mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent-strong">
              {index + 1}
            </span>
            {step}
          </li>
        ))}
      </ol>

      <div className="mt-5">
        <div className="eyebrow">Sample runs</div>
        <ul className="mt-2 space-y-0.5">
          {EXAMPLES.map((example) => (
            <li key={example.label}>
              <button
                type="button"
                onClick={() => onExample(example.origin, example.destination, example.plusDays)}
                className="w-full rounded-md px-2 py-1.5 text-left text-sm text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink-1"
              >
                {example.label}
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-ink-3">
          The first solve of a trip can take up to 30 seconds. Repeats return in under a second.
        </p>
      </div>
    </div>
  )
}
