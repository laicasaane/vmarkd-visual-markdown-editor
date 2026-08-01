// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The debounced keystroke→host serialize (createEditSync) is the corruption-critical core
// of the save path: a missed post loses the edit, a post while suppressed (mid stream /
// extension update) saves a truncated document, and a flush that trusts the incremental
// cache without auditing it could persist a drifted document. None of this had unit
// coverage (task 190 P0). Collaborators that touch the real Vditor/DOM/host are mocked;
// the debounce, incremental serializer and tuning stay REAL (they own their own tests).
const h = vi.hoisted(() => ({
  inner: null as {
    ir?: { element?: HTMLElement }
    options?: { undoDelay?: number }
    lute?: { VditorIRDOM2Md(html: string): string }
  } | null,
  activeEl: null as { textContent: string } | null,
  setBusyCursor: vi.fn(),
  nextPaint: vi.fn(() => Promise.resolve()),
  logToHost: vi.fn(),
}))
vi.mock('../util/inner-vditor', () => ({ innerVditor: () => h.inner }))
vi.mock('../util/source-map', () => ({ activeModeElement: () => h.activeEl }))
vi.mock('../chrome/busy-cursor', () => ({
  setBusyCursor: h.setBusyCursor,
  nextPaint: h.nextPaint,
}))
vi.mock('../util/webview-log', () => ({ logToHost: h.logToHost }))

import { createEditSync } from './edit-sync'

// Build an IR element with `n` top-level block children (drives the task-69 incremental gate:
// ≥700 blocks in IR mode → incremental serialize; below → plain getValue()).
function irElement(n: number): HTMLElement {
  const el = document.createElement('div')
  for (let i = 0; i < n; i++) el.appendChild(document.createElement('p'))
  return el
}

interface Opts {
  mode?: string
  blocks?: number
  getValue?: () => string
  serialize?: (html: string) => string
  suppressed?: boolean
  textLen?: number
}

function boot(o: Opts = {}) {
  const post = vi.fn()
  const value = o.getValue ?? (() => 'MD')
  h.inner = {
    ir: { element: irElement(o.blocks ?? 2) },
    options: { undoDelay: 800 },
    lute: { VditorIRDOM2Md: o.serialize ?? (() => 'INCR') },
  }
  h.activeEl = { textContent: 'x'.repeat(o.textLen ?? 10) }
  const vd = { getValue: value, getCurrentMode: () => o.mode ?? 'ir' }
  ;(globalThis as unknown as { vscode: unknown }).vscode = { postMessage: post }
  ;(globalThis as unknown as { vditor: unknown }).vditor = vd
  ;(window as unknown as { vditor: unknown }).vditor = vd
  const es = createEditSync({
    isSuppressed: () => o.suppressed ?? false,
    docMode: { cvActive: false, streamActive: false, docChars: 123 },
  })
  const edits = () => post.mock.calls.filter((c) => c[0]?.command === 'edit')
  const docModes = () =>
    post.mock.calls.filter((c) => c[0]?.command === 'docMode')
  return { es, post, edits, docModes }
}

describe('createEditSync', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('schedule() posts one debounced edit with the serialized content', () => {
    const { es, edits } = boot({ getValue: () => 'HELLO' })
    es.schedule()
    expect(edits()).toHaveLength(0)
    vi.advanceTimersByTime(250)
    expect(edits()).toHaveLength(1)
    expect(edits()[0][0]).toEqual({ command: 'edit', content: 'HELLO' })
  })

  it('coalesces rapid schedule() calls into a single edit post', () => {
    const { es, edits } = boot()
    es.schedule()
    es.schedule()
    es.schedule()
    vi.advanceTimersByTime(250)
    expect(edits()).toHaveLength(1)
  })

  it('flush() posts immediately and cancels the pending debounced post (no double send)', () => {
    const { es, edits } = boot({ getValue: () => 'SAVED' })
    es.schedule()
    es.flush()
    expect(edits()).toHaveLength(1)
    expect(edits()[0][0].content).toBe('SAVED')
    vi.advanceTimersByTime(250) // the coalesced idle must NOT also fire
    expect(edits()).toHaveLength(1)
  })

  it('posts nothing on idle while suppressed (a partial getValue would truncate the file)', () => {
    const { es, edits, docModes } = boot({ suppressed: true })
    es.schedule()
    vi.advanceTimersByTime(250)
    expect(edits()).toHaveLength(0)
    expect(docModes()).toHaveLength(0)
  })

  it('posts nothing on flush while suppressed', () => {
    const { es, edits } = boot({ suppressed: true })
    es.flush()
    expect(edits()).toHaveLength(0)
  })

  it('reportDocMode posts once per active-set signature (deduped)', () => {
    const { es, docModes } = boot()
    es.reportDocMode()
    es.reportDocMode()
    expect(docModes()).toHaveLength(1)
    expect(docModes()[0][0]).toMatchObject({
      command: 'docMode',
      contentVisibility: false,
      streaming: false,
      incremental: false,
    })
  })

  it('flush audits the incremental cache and posts the AUTHORITATIVE getValue on drift', () => {
    // Large IR doc → incremental path. Force the incremental serialize to disagree with the
    // full getValue(): the guard must log the drift, drop the cache, and save the
    // authoritative bytes — never the drifted incremental result (data-loss safety net).
    // identity serialize → the incremental cache is the joined block HTML, deterministically
    // DIFFERENT from the authoritative getValue() below → the drift guard must trip.
    const { es, edits } = boot({
      mode: 'ir',
      blocks: 700,
      serialize: (html) => html,
      getValue: () => 'AUTHORITATIVE',
    })
    es.flush()
    expect(edits()).toHaveLength(1)
    expect(edits()[0][0].content).toBe('AUTHORITATIVE')
    expect(h.logToHost).toHaveBeenCalledTimes(1)
  })
})
