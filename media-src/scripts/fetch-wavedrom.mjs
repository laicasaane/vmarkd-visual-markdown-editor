#!/usr/bin/env node
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { fetchNpmRuntime } from './npm-vendor-fetch.mjs'

const version = process.argv[2]
const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const source = await fetchNpmRuntime({
  packageName: 'wavedrom',
  version,
  vendorDir: path.resolve(scriptDir, '../vendor/wavedrom'),
  runtimeFiles: [
    {
      destination: 'wavedrom.min.js',
      candidates: [
        'wavedrom.unpkg.min.js',
        'wavedrom.min.js',
        'dist/wavedrom.min.js',
      ],
    },
  ],
  description: 'digital timing diagram renderer (MIT)',
  origin: 'https://github.com/wavedrom/wavedrom',
})
console.log(`[fetch-wavedrom] pinned wavedrom@${source.version}`)
