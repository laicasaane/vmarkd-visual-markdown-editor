import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { DiagramCache } from '../../src/diagram-cache-host'

// Task 184 — the pure host cache (no vscode): LRU + size cap, per-doc PINNED current-set
// fairness, disk round-trip, version-key invalidation. Driven against a real tmp dir with a
// deterministic clock (now = incrementing counter) and flushDelayMs:0 (explicit flushNow()).

let dir: string
// Monotonic clock so LRU ordering is deterministic (oldest lastUsed evicts first).
let clock: number
const now = () => ++clock

function makeCache(
  opts: Partial<ConstructorParameters<typeof DiagramCache>[0]> = {},
) {
  return new DiagramCache({
    dir,
    version: 'v1',
    maxBytes: 1_000_000,
    now,
    flushDelayMs: 0,
    ...opts,
  })
}

// An SVG string of an approximate byte size (so we can drive the byte cap deterministically).
const svgOf = (tag: string, bytes = 100) =>
  `<svg data-t="${tag}">${'x'.repeat(Math.max(0, bytes - 20))}</svg>`

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vmarkd-cache-'))
  clock = 0
})
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('DiagramCache — memory tier', () => {
  it('stores + serves a render by hash', () => {
    const c = makeCache()
    c.put('doc://a', 'd2#0', 'h1', svgOf('one'))
    expect(c.get('h1')).toContain('data-t="one"')
    expect(c.get('missing')).toBeUndefined()
  })

  it('a hit bumps recency so it is NOT the next eviction victim', () => {
    // Cap fits ~2 small entries; three unpinned (closed-doc) entries force eviction.
    const c = makeCache({ maxBytes: 250 })
    c.put('doc://a', 'd2#0', 'h1', svgOf('1', 100))
    c.put('doc://a', 'd2#1', 'h2', svgOf('2', 100))
    c.closeDoc('doc://a') // both now unpinned LRU
    c.get('h1') // touch h1 → newer than h2
    c.put('doc://b', 'd2#0', 'h3', svgOf('3', 100)) // pushes over cap → evict oldest unpinned
    expect(c.get('h2')).toBeUndefined() // h2 was the least-recently-used → evicted
    expect(c.get('h1')).toBeDefined() // touched → survived
  })
})

describe('DiagramCache — per-doc PINNED current-set fairness', () => {
  it('editing ONE diagram never evicts sibling diagrams, and every latest render is retained', () => {
    // Cap holds ~4 entries of 100 bytes. One doc, three diagrams (A/B/C) + heavy editing of A.
    const c = makeCache({ maxBytes: 400 })
    c.put('doc://x', 'd2#0', 'A1', svgOf('A1', 100)) // A, initial
    c.put('doc://x', 'd2#1', 'B', svgOf('B', 100)) // B (sibling)
    c.put('doc://x', 'd2#2', 'C', svgOf('C', 100)) // C (sibling)
    // Heavily edit A: each new render supersedes A's previous (which becomes UNPINNED surplus).
    let lastA = 'A1'
    for (let i = 2; i <= 40; i++) {
      lastA = `A${i}`
      c.put('doc://x', 'd2#0', lastA, svgOf(lastA, 100))
    }
    // Fairness: siblings' latest renders are ALWAYS retained (pinned).
    expect(c.get('B')).toBeDefined()
    expect(c.get('C')).toBeDefined()
    // A's LATEST render is retained (pinned as the current-set entry).
    expect(c.get(lastA)).toBeDefined()
    // A's superseded early renders were reclaimed as unpinned surplus (cap enforced).
    expect(c.get('A1')).toBeUndefined()
    expect(c.stats().totalBytes).toBeLessThanOrEqual(400)
  })

  it('keeps pinned entries even when they exceed the cap (fairness wins over the cap)', () => {
    // 5 distinct diagrams pinned, cap only fits 2 — all 5 latest renders must survive.
    const c = makeCache({ maxBytes: 200 })
    for (let i = 0; i < 5; i++)
      c.put('doc://y', `d2#${i}`, `P${i}`, svgOf(`P${i}`, 100))
    for (let i = 0; i < 5; i++) expect(c.get(`P${i}`)).toBeDefined()
  })

  it('closeDoc releases pins so closed-doc renders become evictable surplus', () => {
    const c = makeCache({ maxBytes: 150 })
    c.put('doc://z', 'd2#0', 'Z', svgOf('Z', 100))
    expect(c.get('Z')).toBeDefined()
    c.closeDoc('doc://z') // Z now unpinned
    // A different open doc pushes over the cap → the closed-doc entry is reclaimed.
    c.put('doc://z2', 'd2#0', 'Z2', svgOf('Z2', 100))
    expect(c.get('Z')).toBeUndefined()
    expect(c.get('Z2')).toBeDefined()
  })
})

describe('DiagramCache — disk tier (survives restart)', () => {
  it('round-trips through disk: a fresh instance on the same dir serves the render', () => {
    const c1 = makeCache()
    c1.put('doc://a', 'd2#0', 'h1', svgOf('persisted'))
    c1.flushNow()
    // Simulate a restart: brand-new instance, same dir + version.
    const c2 = makeCache()
    expect(c2.get('h1')).toContain('data-t="persisted"')
  })

  it('version bump wipes the disk store (old-engine SVGs never reused)', () => {
    const c1 = makeCache({ version: 'v1' })
    c1.put('doc://a', 'd2#0', 'h1', svgOf('old'))
    c1.flushNow()
    const c2 = makeCache({ version: 'v2' }) // engine re-pin
    expect(c2.get('h1')).toBeUndefined()
    // The store is usable again under the new version.
    c2.put('doc://a', 'd2#0', 'h2', svgOf('new'))
    c2.flushNow()
    const c3 = makeCache({ version: 'v2' })
    expect(c3.get('h2')).toContain('data-t="new"')
  })

  it('persisted store stays under the byte cap (LRU pruned before write)', () => {
    const c = makeCache({ maxBytes: 300 })
    // 10 unpinned entries of 100 bytes: only ~3 fit.
    for (let i = 0; i < 10; i++) {
      c.put('doc://a', `d2#${i}`, `k${i}`, svgOf(`k${i}`, 100))
      c.closeDoc('doc://a') // unpin immediately so each is surplus
    }
    c.flushNow()
    expect(c.stats().totalBytes).toBeLessThanOrEqual(300)
    // The on-disk blob dir must not hold more than the cap allows either.
    const blobs = fs.readdirSync(path.join(dir, 'blobs'))
    expect(blobs.length).toBeLessThanOrEqual(3)
  })
})
