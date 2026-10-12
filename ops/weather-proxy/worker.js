export default {
  async fetch(request) {
    if (request.method !== 'POST') {
      return new Response('method not allowed', { status: 405 })
    }
    const url = new URL(request.url)
    url.hostname = 'api.open-meteo.com'
    url.protocol = 'https:'
    return fetch(new Request(url, request))
  },
}
