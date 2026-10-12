import type { Feature, FeatureCollection, Point } from 'geojson'

import type { HeatmapPoint } from '../api/types'

export const HEATMAP_HOURS = 48
export const HEATMAP_FPS = 8
export const HEATMAP_FRAME_MS = 1000 / HEATMAP_FPS

export interface HeatmapFeatureProps {
  [key: string]: number
}

/**
 * One feature per grid point with all 48 risk levels baked in as r0..r47.
 * Animation swaps a single data-driven paint expression instead of setData.
 */
export function heatmapFeatureCollection(
  points: HeatmapPoint[],
): FeatureCollection<Point, HeatmapFeatureProps> {
  return {
    type: 'FeatureCollection',
    features: points.map((point) => {
      const properties: HeatmapFeatureProps = {}
      point.risk.forEach((level, hour) => {
        properties[`r${hour}`] = level
      })
      const feature: Feature<Point, HeatmapFeatureProps> = {
        type: 'Feature',
        properties,
        geometry: { type: 'Point', coordinates: [point.lon, point.lat] },
      }
      return feature
    }),
  }
}
