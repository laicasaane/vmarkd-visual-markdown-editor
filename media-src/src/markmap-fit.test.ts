import { afterEach, describe, expect, it, vi } from 'vitest'
import { installMarkmapResize } from './markmap-fit'

describe('installMarkmapResize disposal', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('removes the resize listener, cancels pending work, and permits reinstall', () => {
    vi.useFakeTimers()
    const addEventListener = vi.fn()
    const removeEventListener = vi.fn()
    const cancelAnimationFrame = vi.fn()
    const win = {
      document: {
        querySelectorAll: vi.fn(() => []),
      },
      addEventListener,
      removeEventListener,
      requestAnimationFrame: vi.fn(() => 23),
      cancelAnimationFrame,
    } as unknown as Window

    const dispose = installMarkmapResize(win)
    const onResize = addEventListener.mock.calls[0][1] as () => void
    onResize()

    expect(typeof dispose).toBe('function')
    dispose()

    expect(removeEventListener).toHaveBeenCalledWith('resize', onResize)
    expect(cancelAnimationFrame).toHaveBeenCalledWith(23)
    expect(vi.getTimerCount()).toBe(0)

    installMarkmapResize(win)
    expect(addEventListener).toHaveBeenCalledTimes(2)
  })
})
