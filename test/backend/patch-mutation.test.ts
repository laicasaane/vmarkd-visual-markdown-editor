import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { VDITOR_TS_PATCHES } from '../../media-src/esbuild-shared.mjs'

// The build-time coverage assert (esbuild-shared.mjs) fails when a registry entry's file
// regex matches NO Vditor file (rename detection). It does NOT catch a patch that matches
// its file but no longer BITES: a `.replace(anchor, …)` whose anchor a Vditor bump shifted
// returns the source unchanged — no throw, the bundle ships silently unpatched. This test
// closes that gap: every registry transform must MUTATE at least one file it matches, and
// re-applying it must be stable-or-throw (never a silent double-apply). Runs the real
// transforms over the real vendored source — the same inputs the build feeds them, so it
// tracks the pinned Vditor version automatically (task 190 P0).

const vditorSrc = fileURLToPath(
  new URL('../../media-src/node_modules/vditor/src', import.meta.url),
)

// Every .ts source file under the vendored Vditor tree (excluding .d.ts declarations),
// as absolute paths — the same shape esbuild passes each transform as `args.path`.
const allFiles = readdirSync(vditorSrc, { recursive: true })
  .map((rel) => path.join(vditorSrc, rel.toString()))
  .filter((p) => p.endsWith('.ts') && !p.endsWith('.d.ts'))

describe('VDITOR_TS_PATCHES effectivity (neuter detection)', () => {
  it('has entries to check', () => {
    expect(VDITOR_TS_PATCHES.length).toBeGreaterThan(20)
  })

  for (const entry of VDITOR_TS_PATCHES) {
    const label = String(entry.file)
    it(`mutates its matched source: ${label}`, () => {
      const matched = allFiles.filter((p) => entry.file.test(p))
      // Redundant with the build's rename assert, but a self-contained failure message here.
      expect(matched, `no vendored file matches ${label}`).not.toHaveLength(0)

      let mutatedCount = 0
      for (const file of matched) {
        const code = readFileSync(file, 'utf8')
        const once = entry.transform(code, file)
        if (once === code) continue // this file may be a pass-through of a multi-file entry
        mutatedCount++
        // No silent double-apply: a second pass over already-patched output must either
        // throw (anchor gone — the fail-loud guard) or be a no-op (idempotent), never
        // produce a third distinct result.
        try {
          expect(entry.transform(once, file)).toBe(once)
        } catch {
          // throwing on already-patched input is the acceptable fail-loud behaviour
        }
      }
      // The patch must bite at least ONE of the files it matches — else it ships unpatched.
      expect(
        mutatedCount,
        `${label} matched ${matched.length} file(s) but changed none — anchor drift?`,
      ).toBeGreaterThan(0)
    })
  }
})
