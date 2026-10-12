export interface RiskMeta {
  level: number
  label: string
  short: string
  color: string
  onColor: string
}

export const RISK_LEVELS: Record<number, RiskMeta> = {
  1: { level: 1, label: 'Low', short: 'LOW', color: '#3d9c5e', onColor: '#ffffff' },
  2: { level: 2, label: 'Moderate', short: 'MODERATE', color: '#e5b23f', onColor: '#201f27' },
  3: { level: 3, label: 'High', short: 'HIGH', color: '#e87f25', onColor: '#ffffff' },
  4: { level: 4, label: 'Severe', short: 'SEVERE', color: '#d33b36', onColor: '#ffffff' },
  5: { level: 5, label: 'No travel', short: 'NO TRAVEL', color: '#751f23', onColor: '#ffffff' },
}

export const ALT_ROUTE_COLOR = '#696f7b'

export function riskMeta(level: number): RiskMeta {
  return RISK_LEVELS[level] ?? RISK_LEVELS[1]
}
