import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAutoWrapController } from './auto-wrap'

afterEach(() => vi.useRealTimers())

function setup(target = { generation: 1 }) {
  const current = { value: target }
  const apply = vi.fn()
  const onError = vi.fn()
  const controller = createAutoWrapController({
    captureTarget: () => current.value,
    isTargetCurrent: (captured) => captured === current.value,
    apply,
    onError,
  })
  controller.updateConfig({ enabled: true, delayMs: 500, column: 80 })
  return { controller, current, apply, onError }
}

describe('createAutoWrapController', () => {
  it('uses one trailing debounce and resets it on every eligible insertText', async () => {
    vi.useFakeTimers()
    const { controller, apply } = setup()

    controller.handleInput({ inputType: 'insertText', isComposing: false })
    await vi.advanceTimersByTimeAsync(499)
    expect(apply).not.toHaveBeenCalled()
    controller.handleInput({ inputType: 'insertText', isComposing: false })
    await vi.advanceTimersByTimeAsync(499)
    expect(apply).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(apply).toHaveBeenCalledTimes(1)
  })

  it.each([
    'insertFromPaste',
    'insertFromDrop',
    'deleteContentBackward',
    'insertParagraph',
    'historyUndo',
    'historyRedo',
    'formatBold',
  ])('does not schedule %s', async (inputType) => {
    vi.useFakeTimers()
    const { controller, apply } = setup()

    controller.handleInput({ inputType, isComposing: false })
    await vi.runAllTimersAsync()
    expect(apply).not.toHaveBeenCalled()
  })

  it('cancels a pending prose wrap when a non-text input intervenes', async () => {
    vi.useFakeTimers()
    const { controller, apply } = setup()
    controller.handleInput({ inputType: 'insertText', isComposing: false })
    controller.handleInput({ inputType: 'historyUndo', isComposing: false })

    await vi.runAllTimersAsync()
    expect(apply).not.toHaveBeenCalled()
  })

  it('defers all work during composition and schedules once on compositionend', async () => {
    vi.useFakeTimers()
    const { controller, apply } = setup()

    controller.handleCompositionStart()
    controller.handleInput({ inputType: 'insertText', isComposing: true })
    await vi.advanceTimersByTimeAsync(1000)
    expect(apply).not.toHaveBeenCalled()
    controller.handleCompositionEnd()
    await vi.advanceTimersByTimeAsync(500)
    expect(apply).toHaveBeenCalledTimes(1)
  })

  it('cancels on disable and delay changes; later input uses the new delay', async () => {
    vi.useFakeTimers()
    const { controller, apply } = setup()
    controller.handleInput({ inputType: 'insertText', isComposing: false })

    controller.updateConfig({ enabled: true, delayMs: 750, column: 80 })
    await vi.advanceTimersByTimeAsync(500)
    expect(apply).not.toHaveBeenCalled()
    controller.handleInput({ inputType: 'insertText', isComposing: false })
    await vi.advanceTimersByTimeAsync(749)
    expect(apply).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(apply).toHaveBeenCalledTimes(1)

    controller.handleInput({ inputType: 'insertText', isComposing: false })
    controller.updateConfig({ enabled: false, delayMs: 750, column: 80 })
    await vi.runAllTimersAsync()
    expect(apply).toHaveBeenCalledTimes(1)
  })

  it('drops a stale target and creates no apply work', async () => {
    vi.useFakeTimers()
    const { controller, current, apply } = setup()
    controller.handleInput({ inputType: 'insertText', isComposing: false })
    current.value = { generation: 2 }

    await vi.advanceTimersByTimeAsync(500)
    expect(apply).not.toHaveBeenCalled()
  })

  it('suppresses recursive scheduling from its own apply callback', async () => {
    vi.useFakeTimers()
    const { controller, apply } = setup()
    apply.mockImplementation(() => {
      controller.handleInput({ inputType: 'insertText', isComposing: false })
    })

    controller.handleInput({ inputType: 'insertText', isComposing: false })
    await vi.advanceTimersByTimeAsync(1000)
    expect(apply).toHaveBeenCalledTimes(1)
  })

  it('cancel and dispose clear pending work, and dispose is permanent', async () => {
    vi.useFakeTimers()
    const { controller, apply } = setup()
    controller.handleInput({ inputType: 'insertText', isComposing: false })
    controller.cancel()
    await vi.runAllTimersAsync()
    expect(apply).not.toHaveBeenCalled()

    controller.handleInput({ inputType: 'insertText', isComposing: false })
    controller.dispose()
    controller.handleInput({ inputType: 'insertText', isComposing: false })
    await vi.runAllTimersAsync()
    expect(apply).not.toHaveBeenCalled()
  })

  it('reports apply failures without leaving recursion suppression armed', async () => {
    vi.useFakeTimers()
    const { controller, apply, onError } = setup()
    apply.mockRejectedValueOnce(new Error('format failed'))
    controller.handleInput({ inputType: 'insertText', isComposing: false })
    await vi.advanceTimersByTimeAsync(500)
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'format failed' }),
    )

    controller.handleInput({ inputType: 'insertText', isComposing: false })
    await vi.advanceTimersByTimeAsync(500)
    expect(apply).toHaveBeenCalledTimes(2)
  })

  it('keeps independent editor controllers independent', async () => {
    vi.useFakeTimers()
    const first = setup({ generation: 1 })
    const second = setup({ generation: 2 })
    first.controller.handleInput({
      inputType: 'insertText',
      isComposing: false,
    })
    second.controller.handleInput({
      inputType: 'insertText',
      isComposing: false,
    })
    first.controller.cancel()

    await vi.advanceTimersByTimeAsync(500)
    expect(first.apply).not.toHaveBeenCalled()
    expect(second.apply).toHaveBeenCalledTimes(1)
  })
})
