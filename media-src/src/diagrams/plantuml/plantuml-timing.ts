// Phase-resolved PlantUML render timing (task 430). Every number previously quoted about PlantUML
// perf came from a different fixture/run/instrument (task 349/352/139/348/351 — see the task doc) and
// none of them are re-derivable after a change. This gives `renderPlantumlBlock` (plantuml-render.ts)
// a cheap, always-the-same-shape breakdown across the five phases that actually exist in that code
// path: queue wait, engine import, stdlib expand, engine render, post-process.
//
// Split into its own module (rather than inlined in plantuml-render.ts) because the accumulator is
// PURE — no DOM, no window — so it can be unit-tested directly with an injected clock, unlike the
// wiring in renderPlantumlBlock which needs the MutationObserver/async render path.

import { logToHost } from '../../util/webview-log'

type PumlPhase =
  | 'queueWait'
  | 'engineImport'
  | 'stdlibExpand'
  | 'engineRender'
  | 'postProcess'

const PHASES: readonly PumlPhase[] = [
  'queueWait',
  'engineImport',
  'stdlibExpand',
  'engineRender',
  'postProcess',
]

interface PumlTimingBreakdown {
  queueWait: number
  engineImport: number
  stdlibExpand: number
  engineRender: number
  postProcess: number
  /** Sum of the five phases above — computed, never measured independently, so it can never drift
   *  from them (the unit test's "phases sum to the total" requirement holds by construction). */
  total: number
}

const nowFallback = () =>
  typeof performance !== 'undefined' ? performance.now() : Date.now()

/**
 * Accumulates elapsed time per phase from start()/end() pairs. A phase whose start()/end() are never
 * called stays at 0 (not NaN/undefined) — e.g. `stdlibExpand` on a plain non-stdlib diagram, or
 * `engineImport` on a warm engine that still gets a start/end pair but one close enough to 0 to be
 * noise. start() called twice without an intervening end() just moves the open mark (last one wins);
 * end() with no matching open start() is a no-op — neither can happen on the single straight-line path
 * `renderPlantumlBlock` drives it through, but the primitive doesn't assume that to stay guessable in
 * the unit test.
 */
export class PumlTiming {
  private readonly phases: Record<PumlPhase, number> = {
    queueWait: 0,
    engineImport: 0,
    stdlibExpand: 0,
    engineRender: 0,
    postProcess: 0,
  }
  private readonly openAt = new Map<PumlPhase, number>()

  constructor(private readonly now: () => number = nowFallback) {}

  start(phase: PumlPhase): void {
    this.openAt.set(phase, this.now())
  }

  end(phase: PumlPhase): void {
    const t0 = this.openAt.get(phase)
    if (t0 === undefined) return // end() without a matching start() — nothing to add
    this.phases[phase] += this.now() - t0
    this.openAt.delete(phase)
  }

  breakdown(): PumlTimingBreakdown {
    const total = PHASES.reduce((sum, p) => sum + this.phases[p], 0)
    return { ...this.phases, total }
  }
}

// Gate (task 430's "so a normal session pays nothing"): a normal open never constructs a `PumlTiming`
// at all — `pumlTimingEnabled()` is checked once per block in plantuml-render.ts's render loop, and
// when it's false the render path carries a `null` timing handle throughout (every call site is
// `timing?.start(...)`), so the only cost left on a default open is that one boolean read per block.
// Off by default; the real-VS-Code e2e spec is what flips it on `window` before opening the fixture.
export function pumlTimingEnabled(): boolean {
  return (
    (window as unknown as { __vmarkdPumlTimingEnabled?: boolean })
      .__vmarkdPumlTimingEnabled === true
  )
}

export interface PumlTimingRecord extends PumlTimingBreakdown {
  targetId: string
  /** 'class' | 'nonClass' — the two engine categories from plantuml-render.ts's dual-instance split
   *  (task 350). Kept as a bare string here (not that module's EngineKind) so this module stays free
   *  of a dependency back onto plantuml-render.ts. */
  engineKind: string
  /** Which path resolved the render: the MutationObserver seeing the <svg> land (the normal case) or
   *  the 5 s wedge-guard fallback in renderPlantumlBlock. On 'fallback' `engineRender` reads ~5000 ms
   *  by construction (the fallback timeout, not a real engine cost) — read it as "this block never
   *  settled", not as a render-time number. */
  settledBy: 'observer' | 'fallback'
  /** True when this render tripped the `renderedIsClass` safety net (task 429/350): `isClassSource`
   *  routed to the wrong warm engine instance and it had to be discarded (re-imported fresh next use).
   *  Ties this instrument to task 429 — a misread shows up here as a real `engineImport` cost on the
   *  NEXT same-category render, not just as a load-count bump. */
  engineDiscarded: boolean
}

// Every breakdown this session, in render order, on `window` for the e2e spec to read — an array
// (not last-write-wins) because a document holds many PlantUML blocks and `plantumlRender` loops all
// of them; a single overwritten global would only ever show whichever block finished last.
function recordsGlobal(): PumlTimingRecord[] {
  const w = window as unknown as { __vmarkdPumlTimings?: PumlTimingRecord[] }
  if (!w.__vmarkdPumlTimings) w.__vmarkdPumlTimings = []
  return w.__vmarkdPumlTimings
}

// Finalise one block's timing: compute the breakdown, append it to the window array, and log the
// one-line summary to the Visual Markdown Editor Output channel (task 430 — `logToHost`, never console.log, per the
// standing debug/metrics rule). Caller-gated: only invoked when `timing` is non-null, i.e. only when
// `pumlTimingEnabled()` was true for this block.
export function recordPumlTiming(
  timing: PumlTiming,
  meta: Omit<PumlTimingRecord, keyof PumlTimingBreakdown>,
): void {
  const record: PumlTimingRecord = { ...timing.breakdown(), ...meta }
  recordsGlobal().push(record)
  logToHost(
    `[puml-timing] ${record.targetId} engine=${record.engineKind} settledBy=${record.settledBy} discarded=${record.engineDiscarded} ` +
      `queueWait=${record.queueWait.toFixed(1)}ms import=${record.engineImport.toFixed(1)}ms expand=${record.stdlibExpand.toFixed(1)}ms ` +
      `render=${record.engineRender.toFixed(1)}ms post=${record.postProcess.toFixed(1)}ms total=${record.total.toFixed(1)}ms`,
  )
}
