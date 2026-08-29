#!/usr/bin/env node
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { fetchNpmRuntime } from './npm-vendor-fetch.mjs'

const version = process.argv[2]
const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const source = await fetchNpmRuntime({
  packageName: 'abcjs',
  version,
  vendorDir: path.resolve(scriptDir, '../vendor/abcjs'),
  runtimeFiles: [
    {
      destination: 'abcjs_basic.min.js',
      candidates: ['dist/abcjs-basic-min.js', 'dist/abcjs_basic.min.js'],
    },
  ],
  description: 'ABC music notation renderer (MIT)',
  origin: 'https://github.com/paulrosen/abcjs',
})
console.log(`[fetch-abcjs] pinned abcjs@${source.version}`)
