#!/usr/bin/env node
import { promises as fs } from 'node:fs'
import esbuild from 'esbuild'

const production = process.argv.includes('--production')
const watch = process.argv.includes('--watch')

await fs.rm('dist', { recursive: true, force: true })

const ctx = await esbuild.context({
  entryPoints: ['src/app/extension.ts'],
  bundle: true,
  format: 'cjs',
  minify: production,
  sourcemap: !production,
  sourcesContent: false,
  platform: 'node',
  target: 'node22',
  outfile: 'dist/extension.js',
  external: ['vscode'],
  logLevel: 'info',
})

if (watch) {
  await ctx.watch()
  console.log('[host] watching src/ → dist/extension.js')
} else {
  await ctx.rebuild()
  await ctx.dispose()
}
