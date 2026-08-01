// @vitest-environment jsdom
import { test, expect, vi, beforeEach, afterEach } from 'vitest'
import { coalescePerFrame } from './observe-coalesce'

// Deterministic rAF: capture callbacks, fire them explicitly as "the frame boundary".
let frameCallbacks: FrameRequestCallback[]
beforeEach(() => {
  frameCallbacks = []
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    frameCallbacks.push(cb)
    return frameCallbacks.length
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    frameCallbacks[id - 1] = () => {}
  })
})
afterEach(() => vi.unstubAllGlobals())

const fireFrame = () => {
  const cbs = frameCallbacks
  frameCallbacks = []
  for (const cb of cbs) cb(0)
}

test('the FIRST batch of a frame runs synchronously (no-flash guarantee)', () => {
  const fn = vi.fn()
  const run = coalescePerFrame(fn)
  run()
  expect(fn).toHaveBeenCalledTimes(1) // leading edge, no rAF wait
})

test('same-frame bursts collapse into ONE trailing re-run before the frame paints', () => {
  const fn = vi.fn()
  const run = coalescePerFrame(fn)
  run() // leading (sync)
  run()
  run()
  run() // three more batches in the same frame…
  expect(fn).toHaveBeenCalledTimes(1)
  fireFrame() // …fold into a single pre-paint trailing run
  expect(fn).toHaveBeenCalledTimes(2)
})

test('a clean frame (no further batches) schedules no trailing run', () => {
  const fn = vi.fn()
  const run = coalescePerFrame(fn)
  run()
  fireFrame()
  expect(fn).toHaveBeenCalledTimes(1)
  // next frame's first batch is leading/synchronous again
  run()
  expect(fn).toHaveBeenCalledTimes(2)
})

test('cancel() drops a pending trailing run (disposer path)', () => {
  const fn = vi.fn()
  const run = coalescePerFrame(fn)
  run()
  run() // marks a trailing re-run
  run.cancel()
  fireFrame()
  expect(fn).toHaveBeenCalledTimes(1) // trailing never fired
})
