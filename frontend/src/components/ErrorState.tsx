import type { SolveError } from '../api/solve'

function hintFor(error: SolveError): string | null {
  if (error.status === 422) {
    return 'Try a larger city or add the state, for example “Springfield, MO”.'
  }
  if (error.status === 502 || error.status === 503 || error.status === 504) {
    return 'The routing or weather provider did not respond. Try again in a moment.'
  }
  if (error.status === 0) {
    return 'The request never reached the server. Check your connection and try again.'
  }
  return null
}

interface ErrorStateProps {
  error: SolveError
  onRetry: () => void
  compact?: boolean
}

export default function ErrorState({ error, onRetry, compact = false }: ErrorStateProps) {
  const hint = hintFor(error)

  return (
    <div
      role="alert"
      className={`rounded-lg border border-risk-4/30 bg-risk-4/5 ${compact ? 'm-4 p-3 lg:m-5 lg:mx-5' : 'm-4 p-4 lg:m-5'}`}
    >
      <div className="text-sm font-semibold">
        {compact ? 'This solve failed' : 'Could not solve this trip'}
      </div>
      <p className="mt-1 text-sm text-ink-2">{error.message}</p>
      {hint && <p className="mt-1 text-xs text-ink-3">{hint}</p>}
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 rounded-md border border-line-2 bg-surface-0 px-3 py-1.5 text-sm font-medium transition-colors hover:border-ink-3/60"
      >
        Try again
      </button>
    </div>
  )
}
