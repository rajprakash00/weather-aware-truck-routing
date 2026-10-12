import type { Feature, FeatureCollection, LineString, Point } from 'geojson'
import type { ExpressionSpecification } from 'maplibre-gl'

import type { Checkpoint, Route } from '../api/types'
import { formatClock, formatRain, formatSnow, formatTemp, formatWind } from './format'
import { riskMeta } from './risk'

export interface RouteSegmentProps {
  route: number
  risk: number
  selected: number
}

export type CheckpointProps = Checkpoint & { route: number; label: string }

export const ROUTE_COLOR_EXPRESSION: ExpressionSpecification = [
  'match',
  ['get', 'risk'],
  1,
  riskMeta(1).color,
  2,
  riskMeta(2).color,
  3,
  riskMeta(3).color,
  4,
  riskMeta(4).color,
  5,
  riskMeta(5).color,
  riskMeta(1).color,
]

function nearestVertex(geometry: [number, number][], lat: number, lon: number): number {
  let best = 0
  let bestDistance = Number.POSITIVE_INFINITY
  for (let i = 0; i < geometry.length; i += 1) {
    const dLat = geometry[i][0] - lat
    const dLon = geometry[i][1] - lon
    const distance = dLat * dLat + dLon * dLon
    if (distance < bestDistance) {
      bestDistance = distance
      best = i
    }
  }
  return best
}

function segment(
  route: Route,
  start: number,
  end: number,
  risk: number,
  selected: boolean,
): Feature<LineString, RouteSegmentProps> | null {
  const coordinates = route.geometry.slice(start, end).map(([lat, lon]) => [lon, lat])
  if (coordinates.length < 2) return null
  return {
    type: 'Feature',
    properties: { route: route.index, risk, selected: selected ? 1 : 0 },
    geometry: { type: 'LineString', coordinates },
  }
}

/**
 * One LineString per checkpoint interval, carrying the risk that governs that
 * interval. Features are ordered so the selected route draws on top.
 */
export function routeFeatureCollection(
  routes: Route[],
  selectedIndex: number,
): FeatureCollection<LineString, RouteSegmentProps> {
  const ordered = [...routes].sort(
    (a, b) => Number(a.index === selectedIndex) - Number(b.index === selectedIndex),
  )
  const features: Feature<LineString, RouteSegmentProps>[] = []

  for (const route of ordered) {
    const selected = route.index === selectedIndex
    if (route.geometry.length < 2) continue
    if (route.checkpoints.length === 0) {
      const whole = segment(route, 0, route.geometry.length, 1, selected)
      if (whole) features.push(whole)
      continue
    }

    const cuts = route.checkpoints.map((cp) => nearestVertex(route.geometry, cp.lat, cp.lon))
    if (cuts[0] > 0) {
      const lead = segment(route, 0, cuts[0] + 1, route.checkpoints[0].risk, selected)
      if (lead) features.push(lead)
    }
    for (let i = 0; i < cuts.length - 1; i += 1) {
      const start = cuts[i]
      const end = Math.max(cuts[i + 1], start + 1)
      const part = segment(route, start, end + 1, route.checkpoints[i].risk, selected)
      if (part) features.push(part)
    }
  }

  return { type: 'FeatureCollection', features }
}

export function checkpointFeatureCollection(
  routes: Route[],
): FeatureCollection<Point, CheckpointProps> {
  const features: Feature<Point, CheckpointProps>[] = []
  for (const route of routes) {
    for (const cp of route.checkpoints) {
      features.push({
        type: 'Feature',
        properties: { ...cp, route: route.index, label: route.label },
        geometry: { type: 'Point', coordinates: [cp.lon, cp.lat] },
      })
    }
  }
  return { type: 'FeatureCollection', features }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function factorLine(name: string, level: number): string {
  const meta = riskMeta(level)
  const weight = level >= 3 ? 'font-semibold' : ''
  return `<div class="${weight}" style="color:${level >= 3 ? meta.color : 'inherit'}">${name} ${escapeHtml(meta.short)}</div>`
}

export function checkpointPopupHtml(cp: CheckpointProps): string {
  const meta = riskMeta(cp.risk)
  const clock = formatClock(cp.eta_utc, cp.timezone)
  const factors = [
    ['Wind', cp.wind_risk],
    ['Rain', cp.rain_risk],
    ['Snow', cp.snow_risk],
  ] as const
  const worstFactor = Math.max(cp.wind_risk, cp.rain_risk, cp.snow_risk)
  const escalated = cp.risk > worstFactor

  return `
    <div class="w-[270px] p-3.5">
      <div class="flex items-start justify-between gap-3 pr-5">
        <div>
          <div class="text-sm font-semibold tnum">mi ${Math.round(cp.mi)}</div>
          <div class="text-xs text-ink-2 tnum">${clock.weekday} ${clock.time} local</div>
        </div>
        <span class="shrink-0 rounded-full px-2 py-0.5 text-2xs font-semibold uppercase tracking-wide"
              style="background:${meta.color};color:${meta.onColor}">${escapeHtml(meta.short)} ${cp.risk}</span>
      </div>
      <div class="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-sm tnum">
        <div>Wind <span class="font-medium">${formatWind(cp.wind_mph)}</span></div>
        <div class="text-ink-2">Gust ${formatWind(cp.gust_mph)}</div>
        <div>Rain <span class="font-medium">${formatRain(cp.rain_in)}</span></div>
        <div>Snow <span class="font-medium">${formatSnow(cp.snow_in)}</span></div>
        <div>Temp <span class="font-medium">${formatTemp(cp.temp_f)}</span></div>
      </div>
      <div class="mt-3 flex flex-wrap gap-x-3 gap-y-0.5 border-t border-line-1 pt-2 text-xs text-ink-2">
        ${factors.map(([name, level]) => factorLine(name, level)).join('')}
      </div>
      ${escalated ? '<div class="mt-2 text-xs font-medium" style="color:#d33b36">Raised by load weight</div>' : ''}
      ${cp.beyond_48h ? '<div class="mt-2 text-xs text-ink-3">Beyond 48 h: extended-range forecast</div>' : ''}
    </div>
  `
}
