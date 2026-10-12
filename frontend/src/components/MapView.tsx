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

import type { Checkpoint, SolveResponse } from '../api/types'

// The worker file is copied to public/ by scripts/copy-maplibre-worker.mjs.
setWorkerUrl(`${import.meta.env.BASE_URL}maplibre-gl-worker.mjs`)
import { ALT_ROUTE_COLOR } from '../lib/risk'
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

export default function MapView({
  data,
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

  useEffect(() => {
    selectRef.current = onSelectRoute
  }, [onSelectRoute])

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
      map.addSource('routes', { type: 'geojson', data: EMPTY })
      map.addSource('checkpoints', { type: 'geojson', data: EMPTY })

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

  return (
    <div className="relative h-full w-full bg-surface-2">
      <div ref={containerRef} className="h-full w-full" />
      <MapLegend />
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
