// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  _resetCodeRefResolutionForTests,
  applyCodeRefResolution,
  codeRefResolution,
  registerCodeRefReapply,
  requestCodeRefResolution,
} from './code-ref-resolve'

// Task 229 — the host round-trip that gates code-ref decoration ("unresolved paths stay
// plain"). Uses fake timers to make the batch-debounce + timeout-fallback deterministic.
describe('code-ref-resolve', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    _resetCodeRefResolutionForTests()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('is undefined for an unasked path', () => {
    expect(codeRefResolution('src/foo.ts')).toBeUndefined()
  })

  it('batches same-tick requests into ONE resolve-code-refs post', () => {
    const post = vi.fn()
    requestCodeRefResolution('src/a.ts', post)
    requestCodeRefResolution('src/b.ts', post)
    requestCodeRefResolution('src/a.ts', post) // duplicate — deduped, not a second entry
    vi.advanceTimersByTime(50)
    expect(post).toHaveBeenCalledTimes(1)
    const [msg] = post.mock.calls[0]
    expect(msg.command).toBe('resolve-code-refs')
    expect(new Set(msg.paths)).toEqual(new Set(['src/a.ts', 'src/b.ts']))
  })

  it('resolves exactly the paths its OWN request asked, updates the cache, and re-runs every registered decorator', () => {
    const post = vi.fn()
    const reapply = vi.fn()
    registerCodeRefReapply(reapply)
    requestCodeRefResolution('src/exists.ts', post)
    requestCodeRefResolution('src/missing.ts', post)
    vi.advanceTimersByTime(50)
    const { requestId } = post.mock.calls[0][0]
    applyCodeRefResolution(requestId, ['src/exists.ts'])
    expect(codeRefResolution('src/exists.ts')).toBe(true)
    expect(codeRefResolution('src/missing.ts')).toBe(false)
    expect(reapply).toHaveBeenCalledTimes(1)
  })

  it('does not re-request an already-resolved (true OR false) path', () => {
    const post = vi.fn()
    requestCodeRefResolution('src/a.ts', post)
    vi.advanceTimersByTime(50)
    applyCodeRefResolution(post.mock.calls[0][0].requestId, [])
    expect(codeRefResolution('src/a.ts')).toBe(false)

    post.mockClear()
    requestCodeRefResolution('src/a.ts', post)
    vi.advanceTimersByTime(50)
    expect(post).not.toHaveBeenCalled() // already known — no new request
  })

  it('ignores a reply for a requestId it never sent (stale/foreign)', () => {
    const reapply = vi.fn()
    registerCodeRefReapply(reapply)
    applyCodeRefResolution('some-other-requestId', ['src/a.ts'])
    expect(codeRefResolution('src/a.ts')).toBeUndefined()
    expect(reapply).not.toHaveBeenCalled()
  })

  it('a second batch queued while the first is still in flight is NOT wrongly resolved by the first reply', () => {
    const post = vi.fn()
    requestCodeRefResolution('src/first.ts', post)
    vi.advanceTimersByTime(50)
    const firstRequestId = post.mock.calls[0][0].requestId

    // A second path is discovered before the first reply lands — its own batch timer starts,
    // but hasn't fired yet (still < 50ms), so it isn't part of `firstRequestId`'s paths.
    requestCodeRefResolution('src/second.ts', post)

    // The FIRST request's reply lands now, before the second batch flushes.
    applyCodeRefResolution(firstRequestId, ['src/first.ts'])
    // `src/second.ts` must still be unresolved — it was never part of `firstRequestId`.
    expect(codeRefResolution('src/second.ts')).toBeUndefined()

    vi.advanceTimersByTime(50)
    expect(post).toHaveBeenCalledTimes(2)
    const secondRequestId = post.mock.calls[1][0].requestId
    expect(secondRequestId).not.toBe(firstRequestId)
    applyCodeRefResolution(secondRequestId, ['src/second.ts'])
    expect(codeRefResolution('src/second.ts')).toBe(true)
  })

  it('a dropped reply times out and clears in-flight so a later pass can retry', () => {
    const post = vi.fn()
    requestCodeRefResolution('src/a.ts', post)
    vi.advanceTimersByTime(50) // flush the batch (posts the request)
    vi.advanceTimersByTime(2000) // the reply never arrives — fallback timeout fires
    expect(codeRefResolution('src/a.ts')).toBeUndefined() // NOT marked false — just retryable

    post.mockClear()
    requestCodeRefResolution('src/a.ts', post)
    vi.advanceTimersByTime(50)
    expect(post).toHaveBeenCalledTimes(1) // retried, since it's no longer in-flight
  })

  it('a reply that arrives before the timeout cancels the fallback (no double-processing)', () => {
    const post = vi.fn()
    const reapply = vi.fn()
    registerCodeRefReapply(reapply)
    requestCodeRefResolution('src/a.ts', post)
    vi.advanceTimersByTime(50)
    applyCodeRefResolution(post.mock.calls[0][0].requestId, ['src/a.ts'])
    reapply.mockClear()
    vi.advanceTimersByTime(2000) // past the fallback window — must be a no-op now
    expect(reapply).not.toHaveBeenCalled()
    expect(codeRefResolution('src/a.ts')).toBe(true)
  })

  it('registerCodeRefReapply returns an unregisterer', () => {
    const post = vi.fn()
    const reapply = vi.fn()
    const unregister = registerCodeRefReapply(reapply)
    unregister()
    requestCodeRefResolution('src/a.ts', post)
    vi.advanceTimersByTime(50)
    applyCodeRefResolution(post.mock.calls[0][0].requestId, ['src/a.ts'])
    expect(reapply).not.toHaveBeenCalled()
  })
})
