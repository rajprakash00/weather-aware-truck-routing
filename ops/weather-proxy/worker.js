const FORWARDED_HEADERS = ['content-type', 'user-agent']

export default {
  async fetch(request) {
    if (request.method !== 'POST') {
      return new Response('method not allowed', { status: 405 })
    }
    // Forward only safe headers: Cloudflare copies CF-Connecting-IP and
    // X-Forwarded-For from the caller, and Open-Meteo would rate-limit the
    // subrequest by the caller's IP instead of the CF-Worker identity.
    const headers = new Headers()
    for (const name of FORWARDED_HEADERS) {
      const value = request.headers.get(name)
      if (value) headers.set(name, value)
    }
    const url = new URL(request.url)
    url.hostname = 'api.open-meteo.com'
    url.protocol = 'https:'
    return fetch(new Request(url, { method: 'POST', headers, body: request.body }))
  },
}
