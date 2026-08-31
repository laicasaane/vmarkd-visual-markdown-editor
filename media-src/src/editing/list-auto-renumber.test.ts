// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { installListAutoRenumber } from './list-normalize'

function mount() {
  document.body.innerHTML = `
    <div id="editor">
      <ol id="first" data-marker="1.">
        <li data-marker="1.">alpha</li>
        <li data-marker="2.">beta</li>
      </ol>
      <ol id="second" data-marker="1.">
        <li data-marker="1.">gamma</li>
      </ol>
    </div>
  `
  const editor = document.getElementById('editor') as HTMLElement
  return {
    editor,
    first: document.getElementById('first') as HTMLElement,
    second: document.getElementById('second') as HTMLElement,
    alpha: editor.querySelectorAll('li')[0]?.firstChild as Text,
    beta: editor.querySelectorAll('li')[1]?.firstChild as Text,
    gamma: editor.querySelectorAll('li')[2]?.firstChild as Text,
  }
}

function select(
  start: Node,
  startOffset: number,
  end = start,
  endOffset = startOffset,
) {
  const range = document.createRange()
  range.setStart(start, startOffset)
  range.setEnd(end, endOffset)
  const selection = getSelection()!
  selection.removeAllRanges()
  selection.addRange(range)
}

function setup() {
  const dom = mount()
  let deferred: (() => void) | undefined
  const normalize = vi.fn()
  const checkpoint = vi.fn()
  const vditor = { currentMode: 'ir' as const }
  const context = vi.fn(() => ({ vditor, editor: dom.editor }) as never)
  const dispose = installListAutoRenumber({
    document,
    context,
    defer: (callback) => {
      deferred = callback
    },
    normalize: (inner, editor, roots) => {
      normalize(inner, editor, [...roots])
      return 1
    },
    checkpoint,
  })
  return {
    ...dom,
    normalize,
    checkpoint,
    context,
    dispose,
    run: () => {
      const callback = deferred
      deferred = undefined
      if (!callback) throw new Error('no list normalization scheduled')
      callback()
    },
    scheduled: () => Boolean(deferred),
  }
}

beforeEach(() => {
  document.body.replaceChildren()
})

describe('structural list auto-renumber scheduling', () => {
  it.each(['insertText', 'insertParagraph'])(
    'ignores %s input',
    (inputType) => {
      const harness = setup()
      select(harness.alpha, 2)

      harness.editor.dispatchEvent(
        new InputEvent('beforeinput', { bubbles: true, inputType }),
      )

      expect(harness.scheduled()).toBe(false)
      expect(harness.context).not.toHaveBeenCalled()
      expect(harness.normalize).not.toHaveBeenCalled()
      harness.dispose()
    },
  )

  it.each(['deleteContentBackward', 'deleteContentForward', 'deleteByCut'])(
    'ignores the now-spin-backed %s path',
    (inputType) => {
      const harness = setup()
      select(harness.alpha, 1, harness.beta, 2)

      harness.editor.dispatchEvent(
        new InputEvent('beforeinput', {
          bubbles: true,
          inputType,
        }),
      )

      expect(harness.scheduled()).toBe(false)
      expect(harness.context).not.toHaveBeenCalled()
      harness.dispose()
    },
  )

  it.each(['deleteByDrag', 'insertFromDrop'])(
    'captures a non-collapsed list selection for %s',
    (inputType) => {
      const harness = setup()
      select(harness.alpha, 1, harness.beta, 2)

      harness.editor.dispatchEvent(
        new InputEvent('beforeinput', { bubbles: true, inputType }),
      )
      harness.run()

      expect(harness.normalize).toHaveBeenCalledTimes(1)
      expect(harness.normalize.mock.calls[0]?.[2]).toEqual([harness.first])
      harness.dispose()
    },
  )

  it('captures source and target roots across drag and drop', () => {
    const harness = setup()
    select(harness.alpha, 2)
    const selection = getSelection()!
    const remove = vi.spyOn(selection, 'removeAllRanges')
    const add = vi.spyOn(selection, 'addRange')
    harness.alpha.parentElement?.dispatchEvent(
      new Event('dragstart', { bubbles: true }),
    )
    expect(remove).toHaveBeenCalledTimes(1)
    expect(add).toHaveBeenCalledTimes(1)
    expect(selection.anchorNode).toBe(harness.alpha)
    expect(selection.anchorOffset).toBe(2)
    select(harness.gamma, 2)
    harness.gamma.parentElement?.dispatchEvent(
      new Event('drop', { bubbles: true }),
    )
    harness.second.insertBefore(
      harness.alpha.parentElement!,
      harness.gamma.parentElement!,
    )
    harness.run()

    expect(harness.normalize.mock.calls[0]?.[2]).toEqual([
      harness.first,
      harness.second,
    ])
    expect(harness.checkpoint).toHaveBeenCalledTimes(1)
    expect(selection.anchorNode?.textContent).toBe('alpha')
    expect(selection.anchorOffset).toBe(2)
    harness.dispose()
  })

  it('discovers a list root created only after the drop event', () => {
    const harness = setup()
    select(harness.alpha, 2)
    harness.alpha.parentElement?.dispatchEvent(
      new Event('dragstart', { bubbles: true }),
    )
    harness.editor.dispatchEvent(new Event('drop', { bubbles: true }))
    const created = document.createElement('ol')
    created.dataset.marker = '1.'
    harness.editor.append(created)
    created.append(harness.alpha.parentElement!)
    harness.run()

    expect(harness.normalize.mock.calls[0]?.[2]).toEqual([
      harness.first,
      created,
    ])
    harness.dispose()
  })

  it('disposal removes every structural listener and drops pending work', () => {
    const harness = setup()
    const remove = vi.spyOn(document, 'removeEventListener')
    select(harness.alpha, 1, harness.beta, 2)
    harness.alpha.parentElement?.dispatchEvent(
      new Event('dragstart', { bubbles: true }),
    )
    harness.editor.dispatchEvent(new Event('drop', { bubbles: true }))

    harness.dispose()

    for (const type of ['beforeinput', 'dragstart', 'drop'])
      expect(remove).toHaveBeenCalledWith(type, expect.any(Function), true)
    harness.run()
    expect(harness.normalize).not.toHaveBeenCalled()
  })
})
