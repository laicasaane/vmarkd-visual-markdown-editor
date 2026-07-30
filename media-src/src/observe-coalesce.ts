// Leading + trailing-per-frame coalescing for MutationObserver callbacks (185/2c).
//
// Several editor observers (code-source, callouts, html-comment, echarts-fit) must run
// BEFORE PAINT so the user never sees an undecorated frame — which is why they were
// written fully synchronous. But a single keystroke fans out into SEVERAL mutation
// checkpoints (Vditor's spin, then our own fix-up modules), and each checkpoint used to
// pay a full subtree walk.
//
// This keeps the no-flash guarantee while collapsing the burst: the FIRST batch of a
// frame runs `fn` synchronously (before paint, exactly as today); every further batch in
// the same frame folds into ONE trailing re-run scheduled via requestAnimationFrame —
// which the event loop also executes before that frame paints. Net: at most 2 walks per
// frame instead of N, and no mutation is ever painted undecorated.
export interface FrameCoalesced {
  (): void
  /** Drop a pending trailing re-run (call from the observer's disposer). */
  cancel(): void
}

export function coalescePerFrame(fn: () => void): FrameCoalesced {
  let rafId = 0
  let dirtyAgain = false
  const handler = (() => {
    if (rafId) {
      dirtyAgain = true
      return
    }
    fn() // leading edge: synchronous, before paint
    rafId = requestAnimationFrame(() => {
      rafId = 0
      if (dirtyAgain) {
        dirtyAgain = false
        fn() // trailing edge: coalesced, still before this frame's paint
      }
    })
  }) as FrameCoalesced
  handler.cancel = () => {
    if (rafId) {
      cancelAnimationFrame(rafId)
      rafId = 0
    }
    dirtyAgain = false
  }
  return handler
}

// Same leading-sync + trailing-rAF coalescing as coalescePerFrame, but ALSO accumulates the
// MutationRecords across a same-frame burst and hands the union to `fn` — task 173's block-scoping
// (mutation-scope.ts) needs the records themselves, not just a "something changed" ping, and a
// per-callback array would lose whatever mutated during the trailing coalesced window.
export interface FrameCoalescedRecords {
  (records: MutationRecord[]): void
  /** Drop a pending trailing re-run (call from the observer's disposer). */
  cancel(): void
}

export function coalescePerFrameWithRecords(
  fn: (records: MutationRecord[]) => void,
): FrameCoalescedRecords {
  let rafId = 0
  let pending: MutationRecord[] = []
  const handler = ((records: MutationRecord[]) => {
    if (rafId) {
      pending.push(...records)
      return
    }
    fn(records) // leading edge: synchronous, before paint
    pending = []
    rafId = requestAnimationFrame(() => {
      rafId = 0
      if (pending.length) {
        const batch = pending
        pending = []
        fn(batch) // trailing edge: coalesced, still before this frame's paint
      }
    })
  }) as FrameCoalescedRecords
  handler.cancel = () => {
    if (rafId) {
      cancelAnimationFrame(rafId)
      rafId = 0
    }
    pending = []
  }
  return handler
}
