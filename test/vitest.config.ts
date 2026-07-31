import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const here = fileURLToPath(new URL('.', import.meta.url))
const repoRoot = resolve(here, '..')

// vditor/src is a `declare const VDITOR_VERSION` source (see esbuild-shared.mjs's header) — any
// unit test importing a vditor util module (list-backspace.ts, task 462) pulls in constants.ts,
// which reads that global and throws "VDITOR_VERSION is not defined" without it. Mirrors
// esbuild-shared.mjs's `vditorSourceConfig.define` (same value, read the same way) rather than
// hardcoding the version, so the two can't drift.
const vditorVersion = JSON.parse(
  readFileSync(
    resolve(repoRoot, 'media-src/node_modules/vditor/package.json'),
    'utf8',
  ),
).version

export default defineConfig({
  root: repoRoot,
  define: {
    VDITOR_VERSION: JSON.stringify(vditorVersion),
  },
  resolve: {
    alias: {
      // The backend imports the real `vscode` module, which only exists inside
      // the Extension Host. Point it at our in-memory mock for unit tests.
      vscode: resolve(here, 'backend/vscode-mock.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: [
      'test/backend/**/*.test.ts',
      // Migrated webview unit tests (pure logic — no DOM needed).
      'media-src/src/**/*.test.ts',
    ],
    coverage: {
      provider: 'v8',
      reportsDirectory: resolve(repoRoot, 'coverage'),
      // json-summary feeds scripts/check-coverage-modules.mjs (the 0%-module ratchet, task 190).
      reporter: ['text', 'html', 'json-summary'],
      include: ['src/**/*.ts', 'media-src/src/**/*.ts'],
      exclude: [
        '**/*.test.ts',
        // Entry points / wiring that need the real Extension Host or DOM.
        'media-src/src/main.ts',
        'media-src/src/preload.ts',
        'media-src/src/types.ts',
      ],
      // NON-REGRESSION floor, not an aspiration (task 150 item 3). Baseline at
      // introduction was ~59/55/57/60 (stmts/branch/funcs/lines); these sit a few
      // points below so a real coverage DROP fails `npm run test:coverage` (run in
      // CI) while normal fluctuation doesn't. RAISE them as coverage grows; never
      // lower to make a red build green — add tests instead.
      thresholds: {
        statements: 56,
        branches: 51,
        functions: 54,
        lines: 56,
      },
    },
  },
})
