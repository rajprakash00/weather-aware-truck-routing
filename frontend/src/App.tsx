import { useMutation } from '@tanstack/react-query'
import { useCallback, useRef, useState } from 'react'

import { SolveError, solveRoutes } from './api/solve'
import type { Checkpoint, Route, SolveRequest, SolveResponse } from './api/types'
import Header from './components/Header'
import MapView, { type MapFocus } from './components/MapView'
import ResultsPanel from './components/ResultsPanel'
import TripForm, { type TripFormValues } from './components/TripForm'
import { localInputValue } from './lib/format'

interface SolveArgs {
  request: SolveRequest
  signal: AbortSignal
}

const DEFAULT_VALUES: TripFormValues = {
  origin: '',
  destination: '',
  loadLb: 40000,
  departure: '',
  checkpointMi: 25,
}

export default function App() {
  const [values, setValues] = useState<TripFormValues>(DEFAULT_VALUES)
  const [result, setResult] = useState<SolveResponse | null>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [focus, setFocus] = useState<MapFocus | null>(null)
  const [fitRequest, setFitRequest] = useState<{ index: number; key: number } | null>(null)
  const [solveSeconds, setSolveSeconds] = useState<number | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const keyRef = useRef(0)
  const startedAtRef = useRef(0)

  const mutation = useMutation<SolveResponse, SolveError, SolveArgs>({
    mutationFn: ({ request, signal }) => solveRoutes(request, signal),
    retry: false,
    onSuccess: (data) => {
      setSolveSeconds((Date.now() - startedAtRef.current) / 1000)
      setResult(data)
      setSelectedIndex(data.recommended_route_index)
      setFitRequest(null)
      setFocus(null)
    },
    onError: (error) => {
      if (error.name !== 'AbortError') setSolveSeconds(null)
    },
  })

  const runSolve = useCallback(
    (overrides: Partial<TripFormValues> = {}) => {
      const next = { ...values, ...overrides }
      setValues(next)
      const request: SolveRequest = {
        origin: next.origin.trim(),
        destination: next.destination.trim(),
        load_lb: next.loadLb,
        checkpoint_mi: next.checkpointMi,
        ...(next.departure ? { departure: next.departure } : {}),
      }
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      startedAtRef.current = Date.now()
      setFocus(null)
      mutation.mutate({ request, signal: controller.signal })
    },
    [values, mutation],
  )

  const cancelSolve = () => {
    abortRef.current?.abort()
    mutation.reset()
  }

  const selectFromPanel = (index: number) => {
    setSelectedIndex(index)
    keyRef.current += 1
    setFitRequest({ index, key: keyRef.current })
  }

  const fitRoute = (index: number) => {
    keyRef.current += 1
    setFitRequest({ index, key: keyRef.current })
  }

  const focusCheckpoint = (route: Route, checkpoint: Checkpoint) => {
    keyRef.current += 1
    setSelectedIndex(route.index)
    setFocus({
      key: keyRef.current,
      lat: checkpoint.lat,
      lon: checkpoint.lon,
      route: route.index,
      label: route.label,
      checkpoint,
    })
  }

  const handleExample = (origin: string, destination: string, plusDays: number) => {
    const departure =
      plusDays > 0 ? localInputValue(new Date(Date.now() + plusDays * 86_400_000)) : ''
    runSolve({ origin, destination, departure })
  }

  const error =
    mutation.error && mutation.error.name !== 'AbortError' ? mutation.error : null

  return (
    <div className="flex flex-1 flex-col">
      <Header />
      <main className="flex flex-1 flex-col lg:grid lg:h-[calc(100dvh_-_3.5rem)] lg:flex-none lg:grid-cols-[400px_minmax(0,1fr)] lg:overflow-hidden">
        <section className="flex min-h-0 flex-col border-line-1 lg:overflow-y-auto lg:border-r">
          <TripForm
            values={values}
            onChange={setValues}
            onSubmit={() => runSolve()}
            isPending={mutation.isPending}
          />
          <ResultsPanel
            data={result}
            error={error}
            isPending={mutation.isPending}
            solveSeconds={solveSeconds}
            selectedIndex={selectedIndex}
            onSelect={selectFromPanel}
            onFocus={focusCheckpoint}
            onFit={fitRoute}
            onCancel={cancelSolve}
            onRetry={() => runSolve()}
            onExample={handleExample}
          />
        </section>
        <section className="h-[56dvh] min-h-[360px] shrink-0 lg:h-auto lg:min-h-0">
          <MapView
            data={result}
            selectedIndex={selectedIndex}
            onSelectRoute={setSelectedIndex}
            fitRequest={fitRequest}
            focus={focus}
          />
        </section>
      </main>
    </div>
  )
}
