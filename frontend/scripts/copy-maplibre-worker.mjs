// MapLibre GL JS v6 loads its worker from a separate file next to the bundle
// (maplibre-gl-worker.mjs). Vite cannot statically see that reference, so the
// worker is copied to public/ and MapLibre is pointed at it via setWorkerUrl().
import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = resolve(root, 'node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs')
const destination = resolve(root, 'public/maplibre-gl-worker.mjs')

mkdirSync(dirname(destination), { recursive: true })
copyFileSync(source, destination)
console.log(`Copied MapLibre worker to ${destination}`)
