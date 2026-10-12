import type { HeatmapRequest, HeatmapResponse, SolveRequest, SolveResponse } from './types'

export class SolveError extends Error {
  status: number
  fieldErrors: Record<string, string[]>

  constructor(message: string, status = 0, fieldErrors: Record<string, string[]> = {}) {
    super(message)
    this.name = 'SolveError'
    this.status = status
    this.fieldErrors = fieldErrors
  }
}

function firstFieldError(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  for (const value of Object.values(body)) {
    if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'string') {
      return value[0]
    }
    if (typeof value === 'string') return value
  }
  return null
}

async function postJson<ResponseBody>(
  path: string,
  request: unknown,
  signal?: AbortSignal,
): Promise<ResponseBody> {
  let response: Response
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new SolveError('Cannot reach the routing service. Check your connection and try again.')
  }

  if (!response.ok) {
    let body: unknown = null
    try {
      body = await response.json()
    } catch {
      body = null
    }
    const detail = firstFieldError(body) ?? 'The routing service returned an error.'
    throw new SolveError(detail, response.status, collectFieldErrors(body))
  }

  return (await response.json()) as ResponseBody
}

export function solveRoutes(
  request: SolveRequest,
  signal?: AbortSignal,
): Promise<SolveResponse> {
  return postJson<SolveResponse>('/api/routes', request, signal)
}

export function solveHeatmap(
  request: HeatmapRequest,
  signal?: AbortSignal,
): Promise<HeatmapResponse> {
  return postJson<HeatmapResponse>('/api/heatmap', request, signal)
}

function collectFieldErrors(body: unknown): Record<string, string[]> {
  if (!body || typeof body !== 'object') return {}
  const fields: Record<string, string[]> = {}
  for (const [key, value] of Object.entries(body)) {
    if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
      fields[key] = value as string[]
    }
  }
  return fields
}
