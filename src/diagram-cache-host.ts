// Task 184 — persistent diagram render→SVG cache that lives in the HOST (extension
// process), so it survives closing a tab (a webview is destroyed on tab close, so an
// in-webview cache — the reverted task-183 idea — cannot outlive it) and, via a disk
// backing under `context.globalStorageUri`, a VS Code restart.
//
// A rendered SVG is a PURE function of `(engine, engine-version, theme, source-text)`, so
// an entry never goes stale — lifetime here is purely memory/disk MANAGEMENT (LRU + a size
// cap), never freshness. Two tiers:
//   - Tier A (memory): the authoritative `Map<hash, Entry>`; the host process spans the
//     whole VS Code window session, so it outlives every webview → reopen within a session
//     is an instant memory hit.
//   - Tier B (disk): `<dir>/index.json` + `<dir>/blobs/<hash>.svg`, a mirror of Tier A,
//     lazily read on first use and debounce-written on mutation. LRU-pruned by a byte cap.
//
// ⭐ Per-document PINNED current-set (the eviction-fairness guarantee, the user's ask): the
// cache tracks, per OPEN docUri, the hash of the CURRENT render of EACH diagram (keyed by a
// stable diagramId). Every hash in an open doc's current-set is PINNED — never LRU-evicted.
// So editing diagram A (which floods the LRU with A's intermediate/settled states) can NEVER
// evict diagram B/C/D's latest renders, and every diagram's LAST render is always retained.
// The LRU only reclaims UNPINNED surplus: A's superseded older renders (you edited past them)
// and closed-doc renders under memory/disk pressure.
//
// This module is PURE (no `vscode` import): it takes a plain directory path + a version
// string + a clock seam, so vitest can drive it against a tmp dir with the real node fs.
// The thin vscode glue (resolving `globalStorageUri`, wiring the provider messages) lives in
// src/extension.ts.
import * as fs from 'node:fs'
import * as path from 'node:path'

export interface DiagramCacheOptions {
  /** Storage directory (host resolves this to `<globalStorageUri>/diagram-render-cache`). */
  dir: string
  /** Per-build engine-version stamp (task 184 §Key). A CHANGE wipes the disk store on load
   *  so old-engine SVGs are never reused — old entries can't match a new-version hash anyway
   *  (the webview folds the version into the hash), and this actively reclaims their bytes. */
  version: string
  /** Byte cap for the on-disk/in-memory store (default ~50 MB). Pinned current-set entries
   *  are preferentially retained; only genuinely cold, UNPINNED entries are pruned. */
  maxBytes?: number
  /** Clock seam for deterministic LRU ordering in unit tests. */
  now?: () => number
  /** Debounced-write delay (ms). Tests pass 0 + call `flushNow()` for determinism. */
  flushDelayMs?: number
  /** Wipe the disk store on construction. Set only under the e2e harness (VMARKD_E2E): the real-VS-Code
   *  suite reuses ONE worker-scoped globalStorage across every test, so a diagram cached by an earlier
   *  spec would HIT in a later one — breaking specs that assert a FRESH render/pipeline (e.g. the d2
   *  lazy-load bundle probe) with a non-deterministic, order-dependent failure. A fresh VS Code is
   *  launched per test, so wiping on construction gives each test an isolated cache. NEVER set in
   *  production — it would defeat task 184's persistence. */
  freshStart?: boolean
}

interface Entry {
  svg: string
  bytes: number
  lastUsed: number
}

const DEFAULT_MAX_BYTES = 50 * 1024 * 1024
const DEFAULT_FLUSH_MS = 750
// Orphan-blob GC skips blobs younger than this: a concurrently-flushing OTHER window writes
// blobs BEFORE its index lands, so a fresh unreferenced blob may be about to be referenced.
const GC_GRACE_MS = 10 * 60_000

type IndexRows = Record<string, { bytes: number; lastUsed: number }>

export class DiagramCache {
  // Tier A — authoritative in-memory store.
  private readonly entries = new Map<string, Entry>()
  // Per-OPEN-doc current-set: docUri → (diagramId → current hash). Only open docs are
  // tracked; on close the doc's pins are released (its entries stay as unpinned LRU).
  private readonly pinnedByDoc = new Map<string, Map<string, string>>()
  // Reference count of pins per hash — a hash is PINNED (never evicted) while count > 0.
  // Ref-counted because the same render can be the current-set entry of several diagrams
  // (e.g. duplicate diagrams, or the IR preview + the full-Preview overlay of one block).
  private readonly pinCount = new Map<string, number>()

  private totalBytes = 0
  private loaded = false
  // Disk write bookkeeping — only touch the blobs that actually changed.
  private readonly pendingWrites = new Set<string>()
  private readonly pendingDeletes = new Set<string>()
  private flushTimer: ReturnType<typeof setTimeout> | null = null

  private readonly dir: string
  private readonly blobsDir: string
  private readonly indexPath: string
  private readonly version: string
  private readonly maxBytes: number
  private readonly now: () => number
  private readonly flushDelayMs: number

  constructor(opts: DiagramCacheOptions) {
    this.dir = opts.dir
    this.blobsDir = path.join(opts.dir, 'blobs')
    this.indexPath = path.join(opts.dir, 'index.json')
    this.version = opts.version
    this.maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES
    this.now = opts.now ?? Date.now
    this.flushDelayMs = opts.flushDelayMs ?? DEFAULT_FLUSH_MS
    // e2e isolation only — see DiagramCacheOptions.freshStart. Wipe before the lazy load so the first
    // ensureLoaded() reads an empty (or just-cleared) store.
    if (opts.freshStart) this.wipeDisk()
  }

  // Lazy disk read (Tier B → Tier A). Gated so the ~50 MB read never lands on the extension
  // activation path — it runs on the first cache message instead. A version mismatch (engine
  // re-pin) wipes the store; any corruption falls back to an empty cache (never throws).
  private ensureLoaded(): void {
    if (this.loaded) return
    this.loaded = true
    try {
      const raw = fs.readFileSync(this.indexPath, 'utf8')
      const index = JSON.parse(raw) as {
        version?: string
        entries?: Record<string, { bytes: number; lastUsed: number }>
      }
      if (index.version !== this.version) {
        // Engine-version bump → old-version SVGs must not be reused. Wipe + start fresh.
        this.wipeDisk()
        return
      }
      for (const [hash, meta] of Object.entries(index.entries ?? {})) {
        try {
          const svg = fs.readFileSync(this.blobPath(hash), 'utf8')
          const bytes = Buffer.byteLength(svg, 'utf8')
          this.entries.set(hash, { svg, bytes, lastUsed: meta.lastUsed })
          this.totalBytes += bytes
        } catch {
          // Missing/corrupt blob — skip this entry (the index is advisory).
        }
      }
      this.gcOrphanBlobs(index.entries ?? {})
    } catch {
      // No index yet / unreadable → empty cache.
    }
  }

  // Startup-only sweep (185/3b): delete blob files no index row references. Orphans arise
  // from crashed sessions and from the pre-merge last-write-wins index races. Compares
  // against REAL time (not the `now` test seam) because the reference is an fs mtime.
  private gcOrphanBlobs(rows: IndexRows): void {
    try {
      for (const name of fs.readdirSync(this.blobsDir)) {
        if (!name.endsWith('.svg')) continue
        if (rows[name.slice(0, -4)]) continue
        const p = path.join(this.blobsDir, name)
        try {
          if (Date.now() - fs.statSync(p).mtimeMs < GC_GRACE_MS) continue
          fs.rmSync(p, { force: true })
        } catch {
          // best-effort
        }
      }
    } catch {
      // no blobs dir yet
    }
  }

  private blobPath(hash: string): string {
    return path.join(this.blobsDir, `${hash}.svg`)
  }

  private wipeDisk(): void {
    try {
      fs.rmSync(this.dir, { recursive: true, force: true })
    } catch {
      // best-effort
    }
  }

  private isPinned(hash: string): boolean {
    return (this.pinCount.get(hash) ?? 0) > 0
  }

  private pin(hash: string): void {
    this.pinCount.set(hash, (this.pinCount.get(hash) ?? 0) + 1)
  }

  private unpin(hash: string): void {
    const next = (this.pinCount.get(hash) ?? 0) - 1
    if (next <= 0) this.pinCount.delete(hash)
    else this.pinCount.set(hash, next)
  }

  /** Serve a cached SVG by hash (memory tier). Bumps LRU recency. */
  get(hash: string): string | undefined {
    this.ensureLoaded()
    const e = this.entries.get(hash)
    if (!e) return undefined
    e.lastUsed = this.now()
    this.scheduleFlush() // persist the recency bump (cheap; index-only)
    return e.svg
  }

  /** Store a completed render and PIN it as the current-set entry for (docUri, diagramId).
   *  The webview is the authority on what it rendered — it posts the exact hash it computed. */
  put(docUri: string, diagramId: string, hash: string, svg: string): void {
    this.ensureLoaded()
    const bytes = Buffer.byteLength(svg, 'utf8')
    const existing = this.entries.get(hash)
    if (existing) {
      this.totalBytes += bytes - existing.bytes
      existing.svg = svg
      existing.bytes = bytes
      existing.lastUsed = this.now()
    } else {
      this.entries.set(hash, { svg, bytes, lastUsed: this.now() })
      this.totalBytes += bytes
    }
    this.pendingWrites.add(hash)
    this.pendingDeletes.delete(hash)

    // Update this diagram's pin: the new hash becomes current (pinned); the render it
    // SUPERSEDES for this same (docUri, diagramId) loses its pin → it's now UNPINNED surplus,
    // eligible for LRU eviction. Sibling diagrams' pins are untouched — the fairness guarantee.
    let byDoc = this.pinnedByDoc.get(docUri)
    if (!byDoc) {
      byDoc = new Map()
      this.pinnedByDoc.set(docUri, byDoc)
    }
    const prev = byDoc.get(diagramId)
    if (prev !== hash) {
      if (prev !== undefined) this.unpin(prev)
      byDoc.set(diagramId, hash)
      this.pin(hash)
    }

    this.evictIfNeeded()
    this.scheduleFlush()
  }

  /** Mark a document open (so its future pins are retained). Optional — `put` registers a
   *  doc implicitly; this lets the host pre-register on open for clarity. */
  registerDoc(docUri: string): void {
    if (!this.pinnedByDoc.has(docUri)) this.pinnedByDoc.set(docUri, new Map())
  }

  /** A tab closed: release the doc's pins. Its renders REMAIN in memory + on disk as unpinned
   *  LRU entries (so a reopen within the session is still an instant hit) — they're only
   *  reclaimed later under memory/disk pressure. */
  closeDoc(docUri: string): void {
    const byDoc = this.pinnedByDoc.get(docUri)
    if (!byDoc) return
    for (const hash of byDoc.values()) this.unpin(hash)
    this.pinnedByDoc.delete(docUri)
  }

  // Reclaim UNPINNED entries, least-recently-used first, until under the byte cap. Pinned
  // current-set entries are never touched — if the pinned set alone exceeds the cap we simply
  // stay over it (fairness wins over the cap; the cap only bounds cold surplus).
  private evictIfNeeded(): void {
    if (this.totalBytes <= this.maxBytes) return
    const unpinned: { hash: string; lastUsed: number }[] = []
    for (const [hash, e] of this.entries) {
      if (!this.isPinned(hash)) unpinned.push({ hash, lastUsed: e.lastUsed })
    }
    unpinned.sort((a, b) => a.lastUsed - b.lastUsed) // oldest first
    for (const { hash } of unpinned) {
      if (this.totalBytes <= this.maxBytes) break
      const e = this.entries.get(hash)
      if (!e) continue
      this.entries.delete(hash)
      this.totalBytes -= e.bytes
      this.pendingWrites.delete(hash)
      this.pendingDeletes.add(hash)
    }
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return
    if (this.flushDelayMs <= 0) return // tests drive flushNow() explicitly
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null
      this.flushNow()
    }, this.flushDelayMs)
    // Don't keep the host process alive just to flush the cache.
    if (typeof this.flushTimer === 'object' && 'unref' in this.flushTimer) {
      ;(this.flushTimer as { unref: () => void }).unref()
    }
  }

  /** Write the dirty blobs + index to disk synchronously (Tier B). Best-effort — a disk
   *  failure must never break rendering, so it swallows errors. Public so tests + shutdown
   *  can force a deterministic write.
   *
   *  Multi-window discipline (185/3b): several host processes (VS Code windows) can share
   *  this dir via globalStorage. The index is therefore written READ-MERGE-WRITE — union of
   *  the freshly-read disk rows and ours (newer lastUsed wins) — through an atomic
   *  temp+rename, never a blind overwrite that would drop another window's entries
   *  (last-write-wins) or leave torn JSON on a crash. An in-memory entry whose disk row
   *  vanished (evicted by another window) re-queues its blob so the written index never
   *  references bytes that aren't on disk. */
  flushNow(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
    try {
      fs.mkdirSync(this.blobsDir, { recursive: true })
      const rows = this.readDiskRows()
      // Heal: another window's eviction may have deleted a blob our entries still cover.
      for (const hash of this.entries.keys()) {
        if (!rows[hash] && !this.pendingWrites.has(hash)) {
          this.pendingWrites.add(hash)
        }
      }
      for (const hash of this.pendingDeletes) {
        delete rows[hash]
        try {
          fs.rmSync(this.blobPath(hash), { force: true })
        } catch {
          /* ignore */
        }
      }
      this.pendingDeletes.clear()
      // Blobs land BEFORE the index so the index never references a missing file.
      for (const hash of this.pendingWrites) {
        const e = this.entries.get(hash)
        if (e) fs.writeFileSync(this.blobPath(hash), e.svg, 'utf8')
      }
      this.pendingWrites.clear()
      for (const [hash, e] of this.entries) {
        const disk = rows[hash]
        rows[hash] = {
          bytes: e.bytes,
          lastUsed: disk ? Math.max(disk.lastUsed, e.lastUsed) : e.lastUsed,
        }
      }
      const tmp = `${this.indexPath}.${process.pid}.tmp`
      fs.writeFileSync(
        tmp,
        JSON.stringify({ version: this.version, entries: rows }),
        'utf8',
      )
      fs.renameSync(tmp, this.indexPath) // atomic — readers never observe a torn index
    } catch {
      // best-effort disk mirror
    }
  }

  // The current on-disk index rows, or {} when absent/corrupt/other-version. A
  // different-version index (a window that hasn't picked up the new engine pin yet)
  // must not leak old-engine rows into our merged write.
  private readDiskRows(): IndexRows {
    try {
      const index = JSON.parse(fs.readFileSync(this.indexPath, 'utf8')) as {
        version?: string
        entries?: IndexRows
      }
      return index.version === this.version ? { ...(index.entries ?? {}) } : {}
    } catch {
      return {}
    }
  }

  /** Test/introspection view of the internal state. */
  stats(): {
    memoryEntries: number
    totalBytes: number
    pinnedHashes: number
    openDocs: number
  } {
    return {
      memoryEntries: this.entries.size,
      totalBytes: this.totalBytes,
      pinnedHashes: this.pinCount.size,
      openDocs: this.pinnedByDoc.size,
    }
  }

  /** Flush pending writes; called on extension deactivate. */
  dispose(): void {
    this.flushNow()
  }
}
