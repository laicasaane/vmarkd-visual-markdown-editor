// fix cannot find global
;(window as any).global = window.global || globalThis

// Task 370: hand every Lute instance to the whitespace-gap repair the moment Vditor creates it
// (our setLute build patch calls this global). It has to be installed before ANY Vditor is
// constructed — Vditor renders the initial value from initUI, before `options.after` — and this
// module is the one thing both main.ts and every e2e harness import first, so the editor and the
// harnesses cannot drift apart on it.
import { patchLuteGapRepair } from '../../src/lute-gap-repair'
;(window as any).__vmarkdPatchLute = patchLuteGapRepair
