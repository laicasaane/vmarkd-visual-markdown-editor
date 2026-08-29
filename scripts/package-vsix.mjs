#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)
const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const args = process.argv.slice(2)
const outIndex = args.indexOf('--out')

if (outIndex >= 0 && !args[outIndex + 1]) {
  throw new Error('--out requires a file path')
}
if (args.some((arg, index) => index !== outIndex && index !== outIndex + 1)) {
  throw new Error(`unknown argument: ${args.join(' ')}`)
}

const output = path.resolve(
  outIndex >= 0
    ? args[outIndex + 1]
    : path.join('artifacts', `${pkg.name}-${pkg.version}.vsix`),
)
mkdirSync(path.dirname(output), { recursive: true })

const vscePackage = require.resolve('@vscode/vsce/package.json')
const vsceCli = path.join(path.dirname(vscePackage), 'vsce')
const result = spawnSync(
  process.execPath,
  [vsceCli, 'package', '--no-dependencies', '--out', output],
  { stdio: 'inherit' },
)

if (result.error) throw result.error
if (result.status !== 0) process.exit(result.status ?? 1)

console.log(`Manual-upload VSIX ready: ${path.relative(process.cwd(), output)}`)
