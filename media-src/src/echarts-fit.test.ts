import { afterEach, describe, expect, it, vi } from 'vitest'
import { installEchartsResize } from './echarts-fit'

describe('installEchartsResize disposal', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('disconnects its observer fleet, cancels pending work, and permits reinstall', () => {
    const resizeDisconnect = vi.fn()
    const mutationDisconnect = vi.fn()
    let notifyResize: (() => void) | undefined

    class FakeResizeObserver {
      constructor(callback: () => void) {
        notifyResize = callback
      }
      observe = vi.fn()
      disconnect = resizeDisconnect
    }
    class FakeMutationObserver {
      observe = vi.fn()
      disconnect = mutationDisconnect
    }

    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 31))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())

    const addEventListener = vi.fn()
    const removeEventListener = vi.fn()
    const cancelAnimationFrame = vi.fn()
    const body = {} as HTMLElement
    const win = {
      document: {
        body,
        getElementById: vi.fn(() => body),
        querySelectorAll: vi.fn(() => []),
      },
      addEventListener,
      removeEventListener,
      requestAnimationFrame: vi.fn(() => 17),
      cancelAnimationFrame,
      ResizeObserver: FakeResizeObserver,
      MutationObserver: FakeMutationObserver,
    } as unknown as Parameters<typeof installEchartsResize>[0]

    const dispose = installEchartsResize(win)
    notifyResize?.()

    expect(typeof dispose).toBe('function')
    dispose()

    expect(removeEventListener).toHaveBeenCalledWith(
      'resize',
      addEventListener.mock.calls[0][1],
    )
    expect(resizeDisconnect).toHaveBeenCalledOnce()
    expect(mutationDisconnect).toHaveBeenCalledOnce()
    expect(cancelAnimationFrame).toHaveBeenCalledWith(17)

    installEchartsResize(win)
    expect(addEventListener).toHaveBeenCalledTimes(2)
  })
})
