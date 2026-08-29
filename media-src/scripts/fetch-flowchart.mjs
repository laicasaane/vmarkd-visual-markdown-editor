#!/usr/bin/env node
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { fetchNpmRuntime } from './npm-vendor-fetch.mjs'

const version = process.argv[2]
const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const source = await fetchNpmRuntime({
  packageName: 'flowchart.js',
  version,
  vendorDir: path.resolve(scriptDir, '../vendor/flowchart.js'),
  runtimeFiles: [],
  bundle: {
    entry: 'index.js',
    destination: 'flowchart.min.js',
    globalName: 'flowchart',
  },
  additionalComponents: [{ name: 'raphael', version: '2.3.0' }],
  licenseCandidates: ['license'],
  description: 'flowchart DSL renderer (MIT)',
  origin: 'https://github.com/adrai/flowchart.js',
})
console.log(`[fetch-flowchart] pinned flowchart.js@${source.version}`)
