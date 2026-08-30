#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import {
  marketplaceImagesBaseFromManifest,
  validateMarketplaceImageFiles,
} from './marketplace-images.mjs'
import { buildVscePackageArgs, parseVsixPackageArgs } from './vsix-package-args.mjs'

const require = createRequire(import.meta.url)
const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const { output: requestedOutput, preRelease } = parseVsixPackageArgs(
  process.argv.slice(2),
)

const output = path.resolve(
  requestedOutput
    ? requestedOutput
    : path.join('artifacts', `${pkg.name}-${pkg.version}.vsix`),
)
const marketplaceImagesBase = marketplaceImagesBaseFromManifest(pkg)
validateMarketplaceImageFiles(undefined, marketplaceImagesBase)
mkdirSync(path.dirname(output), { recursive: true })

const vscePackage = require.resolve('@vscode/vsce/package.json')
const vsceCli = path.join(path.dirname(vscePackage), 'vsce')
const result = spawnSync(
  process.execPath,
  buildVscePackageArgs({
    vsceCli,
    output,
    marketplaceImagesBase,
    preRelease,
  }),
  { stdio: 'inherit' },
)

if (result.error) throw result.error
if (result.status !== 0) process.exit(result.status ?? 1)

console.log(`Manual-upload VSIX ready: ${path.relative(process.cwd(), output)}`)
