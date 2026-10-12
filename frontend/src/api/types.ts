export interface Place {
  name: string
  admin1: string
  country_code: string
  latitude: number
  longitude: number
  timezone: string
}

export interface Departure {
  utc: string
  local: string
  timezone: string
}

export interface RouteMetrics {
  severe_mi: number
  high_mi: number
  no_travel_mi: number
  avg_risk: number
  max_risk: number
  max_risk_label: string
  no_travel_checkpoints: number
  checkpoints: number
  duration_h: number
}

export interface Checkpoint {
  mi: number
  lat: number
  lon: number
  eta_utc: string
  eta_local: string
  timezone: string
  beyond_48h: boolean
  wind_mph: number
  gust_mph: number
  rain_in: number
  snow_in: number
  temp_f: number
  risk: number
  risk_label: string
  wind_risk: number
  rain_risk: number
  snow_risk: number
}

export interface Route {
  index: number
  label: string
  synthesized: boolean
  recommended: boolean
  distance_mi: number
  duration_h: number
  traffic_delay_min: number
  bounds: [number, number, number, number]
  metrics: RouteMetrics
  geometry: [number, number][]
  checkpoints: Checkpoint[]
}

export interface Recommendation {
  summary: string
  all_unsafe: boolean
}

export interface SolveResponse {
  origin: Place
  destination: Place
  departure: Departure
  load_lb: number
  vehicle_weight_kg: number
  checkpoint_interval_mi: number
  recommended_route_index: number
  recommendation: Recommendation
  routes: Route[]
  warnings: string[]
  computed_at: string
}

export interface SolveRequest {
  origin: string
  destination: string
  load_lb: number
  departure?: string
  checkpoint_mi: number
}

export interface ApiErrorBody {
  detail?: unknown
}
