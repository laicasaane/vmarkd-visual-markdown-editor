#!/usr/bin/env node
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { fetchNpmRuntime } from './npm-vendor-fetch.mjs'

const version = process.argv[2]
const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const source = await fetchNpmRuntime({
  packageName: 'elkjs',
  version,
  vendorDir: path.resolve(scriptDir, '../vendor/elk'),
  runtimeFiles: [
    { destination: 'elk-api.js', candidates: ['lib/elk-api.js'] },
    {
      destination: 'elk-worker.min.js',
      candidates: ['lib/elk-worker.min.js'],
    },
  ],
  description: 'elkjs main-thread API and worker implementation (EPL-2.0)',
  origin: 'https://github.com/kieler/elkjs',
})
console.log(`[fetch-elk] pinned elkjs@${source.version}`)
