import { useQuery } from '@tanstack/react-query'
import {
  GeoJSONSource,
  LngLatBounds,
  Map as MapLibreMap,
  NavigationControl,
  Popup,
  ScaleControl,
  setWorkerUrl,
  type ExpressionSpecification,
} from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useRef, useState } from 'react'

import { solveHeatmap } from '../api/solve'
import type { Checkpoint, HeatmapRequest, SolveRequest, SolveResponse } from '../api/types'

// The worker file is copied to public/ by scripts/copy-maplibre-worker.mjs.
setWorkerUrl(`${import.meta.env.BASE_URL}maplibre-gl-worker.mjs`)
import { formatClock } from '../lib/format'
import { HEATMAP_FRAME_MS, HEATMAP_HOURS, heatmapFeatureCollection } from '../lib/heatmap'
import { ALT_ROUTE_COLOR, riskColorExpression } from '../lib/risk'
import {
  checkpointFeatureCollection,
  checkpointPopupHtml,
  routeFeatureCollection,
  ROUTE_COLOR_EXPRESSION,
  type CheckpointProps,
} from '../lib/routes'
import MapLegend from './MapLegend'

export interface MapFocus {
  key: number
  lat: number
  lon: number
  route: number
  label: string
  checkpoint: Checkpoint
}

interface MapViewProps {
  data: SolveResponse | null
  request: SolveRequest | null
  selectedIndex: number
  onSelectRoute: (index: number) => void
  fitRequest: { index: number; key: number } | null
  focus: MapFocus | null
}

const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'
const EMPTY = { type: 'FeatureCollection' as const, features: [] }

function routeBounds(route: { bounds: [number, number, number, number] }): LngLatBounds {
  return new LngLatBounds(
    [route.bounds[1], route.bounds[0]],
    [route.bounds[3], route.bounds[2]],
  )
}

function PlayIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M3.5 1.8 10 6l-6.5 4.2V1.8Z" fill="currentColor" />
    </svg>
  )
}

function PauseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M3 2h2.2v8H3zM6.8 2H9v8H6.8z" fill="currentColor" />
    </svg>
  )
}

export default function MapView({
  data,
  request,
  selectedIndex,
  onSelectRoute,
  fitRequest,
  focus,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const popupRef = useRef<Popup | null>(null)
  const lastDataRef = useRef<SolveResponse | null>(null)
  const selectRef = useRef(onSelectRoute)
  const [ready, setReady] = useState(false)
  const [heatmapOn, setHeatmapOn] = useState(false)
  const [frame, setFrame] = useState(0)
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    selectRef.current = onSelectRoute
  }, [onSelectRoute])

  const heatmapRequest: HeatmapRequest | null = request
    ? { ...request, route_index: selectedIndex }
    : null

  const heatmapQuery = useQuery({
    queryKey: ['heatmap', heatmapRequest],
    queryFn: async ({ signal }) => {
      if (!heatmapRequest) throw new Error('No solved request to build a heatmap from.')
      return solveHeatmap(heatmapRequest, signal)
    },
    enabled: heatmapRequest !== null && data !== null,
    staleTime: 60 * 60 * 1000,
  })
  const heatmap = heatmapQuery.data ?? null

  // Reset the animation when a new grid arrives (data adjustment during render).
  const [lastHeatmap, setLastHeatmap] = useState<typeof heatmap>(null)
  if (lastHeatmap !== heatmap) {
    setLastHeatmap(heatmap)
    if (heatmap) setFrame(0)
  }

  useEffect(() => {
    if (!containerRef.current) return
    const map = new MapLibreMap({
      container: containerRef.current,
      style: STYLE_URL,
      center: [-98, 38.5],
      zoom: 3.8,
      attributionControl: { compact: true },
    })
    mapRef.current = map
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right')
    map.addControl(new ScaleControl({ unit: 'imperial' }), 'bottom-right')

    const openPopup = (coordinates: [number, number], props: CheckpointProps) => {
      popupRef.current?.remove()
      popupRef.current = new Popup({ offset: 14, maxWidth: '300px' })
        .setLngLat(coordinates)
        .setHTML(checkpointPopupHtml(props))
        .addTo(map)
    }

    map.on('load', () => {
      map.addSource('heatmap', { type: 'geojson', data: EMPTY })
      map.addSource('routes', { type: 'geojson', data: EMPTY })
      map.addSource('checkpoints', { type: 'geojson', data: EMPTY })

      map.addLayer({
        id: 'heatmap-circles',
        type: 'circle',
        source: 'heatmap',
        layout: { visibility: 'none' },
        paint: {
          'circle-color': riskColorExpression(['get', 'r0']),
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            3,
            3,
            4,
            5.5,
            5,
            10.5,
            6,
            20,
            7,
            39,
            8,
            77,
            10,
            150,
          ],
          'circle-blur': 0.85,
          'circle-opacity': 0.55,
        },
      })

      map.addLayer({
        id: 'routes-casing',
        type: 'line',
        source: 'routes',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#ffffff',
          'line-opacity': 0.65,
          'line-width': ['case', ['==', ['get', 'selected'], 1], 9, 5],
        },
      })

      map.addLayer({
        id: 'routes-line',
        type: 'line',
        source: 'routes',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': [
            'case',
            ['==', ['get', 'selected'], 1],
            ROUTE_COLOR_EXPRESSION,
            ALT_ROUTE_COLOR,
          ] as ExpressionSpecification,
          'line-width': ['case', ['==', ['get', 'selected'], 1], 5.5, 3],
          'line-opacity': ['case', ['==', ['get', 'selected'], 1], 1, 0.85],
        },
      })

      map.addLayer({
        id: 'checkpoints',
        type: 'circle',
        source: 'checkpoints',
        paint: {
          'circle-color': ROUTE_COLOR_EXPRESSION,
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 3.5, 7, 5, 11, 7.5],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1.5,
        },
      })

      map.on('click', 'routes-line', (event) => {
        const feature = event.features?.[0]
        const route = feature?.properties?.route
        if (typeof route === 'number') selectRef.current(route)
      })

      map.on('click', 'checkpoints', (event) => {
        const feature = event.features?.[0]
        if (!feature || feature.geometry.type !== 'Point') return
        openPopup(
          feature.geometry.coordinates as [number, number],
          feature.properties as unknown as CheckpointProps,
        )
      })

      const hover = (cursor: string) => () => {
        map.getCanvas().style.cursor = cursor
      }
      for (const layer of ['routes-line', 'checkpoints']) {
        map.on('mouseenter', layer, hover('pointer'))
        map.on('mouseleave', layer, hover(''))
      }

      setReady(true)
    })

    return () => {
      setReady(false)
      popupRef.current?.remove()
      popupRef.current = null
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const routesSource = map.getSource('routes') as GeoJSONSource | undefined
    const checkpointsSource = map.getSource('checkpoints') as GeoJSONSource | undefined
    if (!routesSource || !checkpointsSource) return

    routesSource.setData(routeFeatureCollection(data?.routes ?? [], selectedIndex))
    checkpointsSource.setData(checkpointFeatureCollection(data?.routes ?? []))
    map.setFilter('checkpoints', ['==', ['get', 'route'], selectedIndex])

    if (data && lastDataRef.current !== data) {
      lastDataRef.current = data
      const bounds = new LngLatBounds()
      for (const route of data.routes) {
        bounds.extend([route.bounds[1], route.bounds[0]])
        bounds.extend([route.bounds[3], route.bounds[2]])
      }
      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, { padding: 48, duration: 900, maxZoom: 9 })
      }
    }
  }, [ready, data, selectedIndex])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const source = map.getSource('heatmap') as GeoJSONSource | undefined
    if (!source) return
    source.setData(heatmap ? heatmapFeatureCollection(heatmap.points) : EMPTY)
  }, [ready, heatmap])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    if (!map.getLayer('heatmap-circles')) return
    map.setLayoutProperty(
      'heatmap-circles',
      'visibility',
      heatmapOn && heatmap ? 'visible' : 'none',
    )
  }, [ready, heatmapOn, heatmap])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !heatmap || !map.getLayer('heatmap-circles')) return
    map.setPaintProperty(
      'heatmap-circles',
      'circle-color',
      riskColorExpression(['get', `r${frame}`]),
    )
  }, [ready, heatmap, frame])

  useEffect(() => {
    if (!playing) return
    const timer = window.setInterval(() => {
      setFrame((current) => (current + 1) % HEATMAP_HOURS)
    }, HEATMAP_FRAME_MS)
    return () => window.clearInterval(timer)
  }, [playing])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !fitRequest || !data) return
    const route = data.routes.find((candidate) => candidate.index === fitRequest.index)
    if (!route) return
    map.fitBounds(routeBounds(route), { padding: 64, duration: 700, maxZoom: 10 })
  }, [ready, fitRequest, data])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    if (!focus) {
      popupRef.current?.remove()
      popupRef.current = null
      return
    }
    const center: [number, number] = [focus.lon, focus.lat]
    const zoom = Math.max(map.getZoom(), 8)
    map.flyTo({ center, zoom, duration: 800 })
    popupRef.current?.remove()
    popupRef.current = new Popup({ offset: 14, maxWidth: '300px' })
      .setLngLat(center)
      .setHTML(
        checkpointPopupHtml({
          ...focus.checkpoint,
          route: focus.route,
          label: focus.label,
        }),
      )
      .addTo(map)
  }, [ready, focus])

  const toggleHeatmap = () => {
    setPlaying(false)
    setHeatmapOn((current) => !current)
  }

  const frameClock =
    heatmap && data ? formatClock(heatmap.hours_utc[frame] ?? '', data.departure.timezone) : null

  return (
    <div className="relative h-full w-full bg-surface-2">
      <div ref={containerRef} className="h-full w-full" />
      <MapLegend />
      <div className="absolute top-3 left-3 z-10 w-64 max-w-[calc(100%_-_1.5rem)] rounded-lg border border-line-1 bg-surface-0/95 shadow-float">
        <button
          type="button"
          onClick={toggleHeatmap}
          disabled={!data}
          aria-pressed={heatmapOn}
          className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm font-medium transition-colors hover:bg-surface-1 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full ${heatmapOn ? 'bg-accent' : 'bg-line-2'}`}
              aria-hidden="true"
            />
            Weather over time
          </span>
          <span className="text-2xs text-ink-3">{heatmapOn ? 'HIDE' : 'SHOW'}</span>
        </button>
        {heatmapOn && (
          <div className="border-t border-line-1 px-3 py-2.5" aria-live="polite">
            {heatmapQuery.isPending ? (
              <div className="flex items-center gap-2 text-xs text-ink-2">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
                Loading 48 h forecast…
              </div>
            ) : heatmapQuery.isError ? (
              <div className="space-y-2">
                <p className="text-xs text-ink-2">
                  {heatmapQuery.error instanceof Error
                    ? heatmapQuery.error.message
                    : 'The forecast grid could not be loaded.'}
                </p>
                <button
                  type="button"
                  onClick={() => heatmapQuery.refetch()}
                  className="text-xs font-medium text-accent-strong underline underline-offset-2"
                >
                  Retry
                </button>
              </div>
            ) : heatmap && heatmap.points.length > 0 ? (
              <div>
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setPlaying((current) => !current)}
                    aria-label={playing ? 'Pause forecast animation' : 'Play forecast animation'}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-white transition-colors hover:bg-accent-strong"
                  >
                    {playing ? <PauseIcon /> : <PlayIcon />}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={HEATMAP_HOURS - 1}
                    value={frame}
                    onChange={(event) => {
                      setPlaying(false)
                      setFrame(Number(event.target.value))
                    }}
                    aria-label="Forecast hour"
                    className="w-full"
                  />
                </div>
                <div className="mt-2 flex items-baseline justify-between text-xs">
                  <span className="tnum font-semibold">T+{frame} h</span>
                  {frameClock && (
                    <span className="tnum text-ink-2" title="Origin-local time">
                      {frameClock.weekday} {frameClock.time}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-xs text-ink-2">No forecast grid for this route.</p>
            )}
          </div>
        )}
      </div>
      {!data && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
          <div className="rounded-lg border border-line-1 bg-surface-0/95 px-4 py-2.5 text-center text-sm text-ink-2 shadow-float">
            Routes and weather risk appear here after you check a trip.
          </div>
        </div>
      )}
    </div>
  )
}
