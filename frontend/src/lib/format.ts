const MILES = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })
const INTEGER = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const TWO_DECIMALS = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const SNOW = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 2,
})

export function formatDuration(hours: number): string {
  const totalMinutes = Math.round(hours * 60)
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  if (h === 0) return `${m} min`
  return `${h} h ${String(m).padStart(2, '0')} m`
}

export function formatMiles(mi: number): string {
  return `${MILES.format(mi)} mi`
}

export function formatLoad(lb: number): string {
  return `${INTEGER.format(lb)} lb`
}

export function formatWind(mph: number): string {
  return `${INTEGER.format(mph)} mph`
}

export function formatRain(inches: number): string {
  return `${TWO_DECIMALS.format(inches)} in`
}

export function formatSnow(inches: number): string {
  return `${SNOW.format(inches)} in`
}

export function formatTemp(f: number): string {
  return `${INTEGER.format(f)} °F`
}

export function formatRisk(avg: number): string {
  return TWO_DECIMALS.format(avg)
}

export interface ClockParts {
  weekday: string
  time: string
}

function clockFormatter(timezone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
}

export function formatClock(isoUtc: string, timezone: string): ClockParts {
  try {
    const parts = clockFormatter(timezone).formatToParts(new Date(isoUtc))
    const get = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value ?? ''
    return { weekday: get('weekday'), time: `${get('hour')}:${get('minute')}` }
  } catch {
    return { weekday: '', time: '--:--' }
  }
}

export function formatDate(isoUtc: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    }).format(new Date(isoUtc))
  } catch {
    return ''
  }
}

export function formatTzAbbrev(isoUtc: string, timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'short',
    }).formatToParts(new Date(isoUtc))
    return parts.find((part) => part.type === 'timeZoneName')?.value ?? ''
  } catch {
    return ''
  }
}

export function formatElapsed(seconds: number): string {
  return `${seconds.toFixed(1)} s`
}

/** Value for a datetime-local input: local wall time, no offset. */
export function localInputValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function placeLabel(place: { name: string; admin1: string }): string {
  return place.admin1 ? `${place.name}, ${place.admin1}` : place.name
}
