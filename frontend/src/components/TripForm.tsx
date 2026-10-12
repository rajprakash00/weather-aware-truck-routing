import { useState } from 'react'

import { localInputValue } from '../lib/format'

export interface TripFormValues {
  origin: string
  destination: string
  loadLb: number
  departure: string
  checkpointMi: number
}

interface TripFormProps {
  values: TripFormValues
  onChange: (values: TripFormValues) => void
  onSubmit: () => void
  isPending: boolean
}

const inputClass =
  'w-full rounded-md border border-line-2 bg-surface-0 px-3 py-2 text-base text-ink-1 placeholder:text-ink-3 transition-colors hover:border-ink-3/50 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/15'

const CHECKPOINT_OPTIONS = [10, 25, 50]

export default function TripForm({ values, onChange, onSubmit, isPending }: TripFormProps) {
  const canSubmit =
    values.origin.trim().length > 0 &&
    values.destination.trim().length > 0 &&
    values.loadLb >= 0 &&
    values.loadLb <= 80000 &&
    !isPending

  const [bounds] = useState(() => {
    const now = Date.now()
    return {
      minDeparture: localInputValue(new Date(now - 60 * 60 * 1000)),
      maxDeparture: localInputValue(new Date(now + 16 * 24 * 60 * 60 * 1000)),
    }
  })

  const set = (patch: Partial<TripFormValues>) => onChange({ ...values, ...patch })

  const swap = () =>
    onChange({ ...values, origin: values.destination, destination: values.origin })

  return (
    <form
      className="space-y-5 border-b border-line-1 p-4 lg:p-5"
      onSubmit={(event) => {
        event.preventDefault()
        if (canSubmit) onSubmit()
      }}
    >
      <div className="relative space-y-3">
        <div>
          <label htmlFor="origin" className="mb-1 block text-xs font-medium text-ink-2">
            From
          </label>
          <input
            id="origin"
            className={`${inputClass} pr-10`}
            value={values.origin}
            onChange={(event) => set({ origin: event.target.value })}
            placeholder="Los Angeles, CA"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <div>
          <label htmlFor="destination" className="mb-1 block text-xs font-medium text-ink-2">
            To
          </label>
          <input
            id="destination"
            className={`${inputClass} pr-10`}
            value={values.destination}
            onChange={(event) => set({ destination: event.target.value })}
            placeholder="Denver, CO"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <button
          type="button"
          onClick={swap}
          aria-label="Swap origin and destination"
          title="Swap origin and destination"
          className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded-md border border-line-1 bg-surface-0 p-1.5 text-ink-3 transition-colors hover:border-line-2 hover:text-ink-1"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path
              d="M4.5 2v9M4.5 11l-2-2M4.5 11l2-2M9.5 12V3M9.5 3l-2 2M9.5 3l2 2"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      <div>
        <div className="mb-1 flex items-baseline justify-between">
          <label htmlFor="load" className="text-xs font-medium text-ink-2">
            Load weight
          </label>
          <div className="flex items-baseline gap-1">
            <input
              id="load"
              type="number"
              min={0}
              max={80000}
              step={500}
              value={values.loadLb}
              onChange={(event) => {
                const next = Number(event.target.value)
                if (!Number.isNaN(next)) set({ loadLb: Math.min(80000, Math.max(0, next)) })
              }}
              className="tnum w-20 rounded-md border border-line-2 bg-surface-0 px-2 py-1 text-right text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/15"
            />
            <span className="text-xs text-ink-3">lb</span>
          </div>
        </div>
        <input
          type="range"
          min={0}
          max={80000}
          step={500}
          value={values.loadLb}
          onChange={(event) => set({ loadLb: Number(event.target.value) })}
          aria-label="Load weight in pounds"
          className="w-full"
        />
      </div>

      <div>
        <div className="mb-1 flex items-baseline justify-between">
          <label htmlFor="departure" className="text-xs font-medium text-ink-2">
            Departure
          </label>
          <button
            type="button"
            onClick={() => set({ departure: '' })}
            className={`text-xs transition-colors ${
              values.departure ? 'text-accent hover:text-accent-strong' : 'text-ink-3'
            }`}
          >
            Now
          </button>
        </div>
        <input
          id="departure"
          type="datetime-local"
          value={values.departure}
          min={bounds.minDeparture}
          max={bounds.maxDeparture}
          onChange={(event) => set({ departure: event.target.value })}
          className={`${inputClass} tnum`}
        />
        <p className="mt-1 text-xs text-ink-3">
          {values.departure ? 'Origin-local time.' : 'Departs now. Set a time to plan ahead.'}
        </p>
      </div>

      <div>
        <span className="mb-1 block text-xs font-medium text-ink-2">Checkpoints</span>
        <div className="flex rounded-md bg-surface-2 p-0.5" role="group" aria-label="Checkpoint spacing">
          {CHECKPOINT_OPTIONS.map((option) => {
            const selected = values.checkpointMi === option
            return (
              <button
                key={option}
                type="button"
                aria-pressed={selected}
                onClick={() => set({ checkpointMi: option })}
                className={`tnum flex-1 rounded-[5px] py-1 text-sm transition-colors ${
                  selected
                    ? 'bg-surface-0 font-medium text-ink-1 shadow-float'
                    : 'text-ink-2 hover:text-ink-1'
                }`}
              >
                {option} mi
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-strong active:translate-y-px disabled:pointer-events-none disabled:opacity-50"
        >
          {isPending ? 'Checking routes…' : 'Check routes'}
        </button>
      </div>
    </form>
  )
}
