#!/usr/bin/env node
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { fetchNpmRuntime } from './npm-vendor-fetch.mjs'

const version = process.argv[2]
const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const source = await fetchNpmRuntime({
  packageName: 'smiles-drawer',
  version,
  vendorDir: path.resolve(scriptDir, '../vendor/smiles-drawer'),
  runtimeFiles: [
    {
      destination: 'smiles-drawer.min.js',
      candidates: ['dist/smiles-drawer.min.js'],
    },
  ],
  description: 'SMILES molecule renderer (MIT)',
  origin: 'https://github.com/reymond-group/smilesDrawer',
})
console.log(`[fetch-smiles-drawer] pinned smiles-drawer@${source.version}`)
