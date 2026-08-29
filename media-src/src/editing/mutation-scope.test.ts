// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { queryIncludingSelf, scopeMutations } from './mutation-scope'

function irRootWith(innerHTML: string): HTMLElement {
  const wrapper = document.createElement('div')
  wrapper.className = 'vditor-ir'
  const root = document.createElement('pre')
  root.className = 'vditor-reset'
  root.innerHTML = innerHTML
  wrapper.appendChild(root)
  document.body.replaceChildren(wrapper)
  return root
}

// Collect a batch of MutationRecords for a synchronous mutation by observing BEFORE it runs and
// reading `takeRecords()` immediately after — avoids depending on the microtask queue in a test.
function recordsFor(root: HTMLElement, mutate: () => void): MutationRecord[] {
  const obs = new MutationObserver(() => {
    /* never invoked — records are read synchronously via takeRecords() below */
  })
  obs.observe(root, { childList: true, subtree: true, characterData: true })
  mutate()
  const records = obs.takeRecords()
  obs.disconnect()
  return records
}

beforeEach(() => {
  document.body.replaceChildren()
})

describe('scopeMutations', () => {
  it('an empty batch (initial mount pass) always means full walk', () => {
    expect(scopeMutations([])).toEqual({ full: true, blocks: new Set() })
  })

  it('outerHTML replace of ONE top-level block scopes to just that block (the common per-keystroke path)', () => {
    const root = irRootWith(
      '<p id="a">a</p><blockquote id="b">b</blockquote><p id="c">c</p>',
    )
    const b = root.querySelector('#b') as HTMLElement
    const records = recordsFor(root, () => {
      b.outerHTML = '<blockquote id="b">b2</blockquote>'
    })
    const scope = scopeMutations(records)
    expect(scope.full).toBe(false)
    expect(scope.blocks.size).toBe(1)
    const only = [...scope.blocks][0] as HTMLElement
    expect(only.id).toBe('b')
    expect(only.textContent).toBe('b2')
    // the untouched siblings must NOT be in scope
    expect([...scope.blocks].some((el) => (el as HTMLElement).id === 'a')).toBe(
      false,
    )
    expect([...scope.blocks].some((el) => (el as HTMLElement).id === 'c')).toBe(
      false,
    )
  })

  it('a characterData change resolves via its target (marker-rewrite case, e.g. renaming a callout type)', () => {
    const root = irRootWith(
      '<blockquote id="bq"><p id="p">text</p></blockquote>',
    )
    const textNode = root.querySelector('#p')!.firstChild as Text
    const records = recordsFor(root, () => {
      textNode.textContent = 'changed'
    })
    const scope = scopeMutations(records)
    expect(scope.full).toBe(false)
    expect(scope.blocks.size).toBe(1)
    expect(([...scope.blocks][0] as HTMLElement).id).toBe('bq')
  })

  it('root.innerHTML replace (the isIRElement path) widens to full once many top-level blocks land at once', () => {
    const root = irRootWith('<p>only</p>')
    const records = recordsFor(root, () => {
      root.innerHTML = Array.from({ length: 8 }, (_, i) => `<p>${i}</p>`).join(
        '',
      )
    })
    const scope = scopeMutations(records)
    expect(scope.full).toBe(true)
  })

  it('root.innerHTML replace with FEW resulting blocks stays scoped (no special-casing on target===root)', () => {
    const root = irRootWith('<p>only</p>')
    const records = recordsFor(root, () => {
      root.innerHTML = '<p id="x">x</p>'
    })
    const scope = scopeMutations(records)
    expect(scope.full).toBe(false)
    expect(scope.blocks.size).toBe(1)
  })

  it('a pure decoration write (data-render="1") is dropped entirely — no walk, not even scoped', () => {
    const root = irRootWith('<div id="host"></div>')
    const host = root.querySelector('#host') as HTMLElement
    const records = recordsFor(root, () => {
      const overlay = document.createElement('div')
      overlay.setAttribute('data-render', '1')
      host.appendChild(overlay)
    })
    const scope = scopeMutations(records)
    expect(scope.full).toBe(false)
    expect(scope.blocks.size).toBe(0)
  })

  it('a known vmde decoration class is also dropped (callout preview / marker / title / comment span)', () => {
    const root = irRootWith('<blockquote id="bq"><p>[!NOTE]</p></blockquote>')
    const bq = root.querySelector('#bq') as HTMLElement
    const records = recordsFor(root, () => {
      const preview = document.createElement('div')
      preview.className = 'vditor-ir__preview vmde-callout__preview'
      bq.appendChild(preview)
    })
    const scope = scopeMutations(records)
    expect(scope.full).toBe(false)
    expect(scope.blocks.size).toBe(0)
  })

  it('a record MIXING a decoration with real content still passes (never target-based)', () => {
    // Mirrors the spin: blockElement.outerHTML replace produces a NEW block whose subtree happens to
    // contain a decoration — that record must still resolve to the real block, not be dropped.
    const root = irRootWith('<blockquote id="bq"><p>old</p></blockquote>')
    const records = recordsFor(root, () => {
      const bq = root.querySelector('#bq') as HTMLElement
      bq.outerHTML =
        '<blockquote id="bq2"><p>new</p><div data-render="1" class="vmde-stale-overlay"></div></blockquote>'
    })
    const scope = scopeMutations(records)
    expect(scope.full).toBe(false)
    expect(scope.blocks.size).toBe(1)
    expect(([...scope.blocks][0] as HTMLElement).id).toBe('bq2')
  })

  it('a mutation outside any .vditor-reset root over-scopes to full (safety net, never silently drops)', () => {
    const detachedParent = document.createElement('div') // no .vditor-reset ancestor at all
    const child = document.createElement('p')
    detachedParent.appendChild(child)
    const rec = {
      type: 'childList',
      target: detachedParent,
      addedNodes: Object.assign([child], {
        item: (i: number) => [child][i],
      }) as unknown as NodeList,
      removedNodes: [] as unknown as NodeList,
    } as unknown as MutationRecord
    const scope = scopeMutations([rec])
    expect(scope.full).toBe(true)
  })

  it('a pure removal (no addedNodes) is a no-op — nothing new to decorate', () => {
    const root = irRootWith('<p id="a">a</p><p id="b">b</p>')
    const b = root.querySelector('#b') as HTMLElement
    const records = recordsFor(root, () => {
      b.remove()
    })
    const scope = scopeMutations(records)
    expect(scope.full).toBe(false)
    expect(scope.blocks.size).toBe(0)
  })

  it('a stray text-node addedNode (no wrapping element) is skipped, not mistaken for a block', () => {
    const root = irRootWith('<p id="a">a</p>')
    const records = recordsFor(root, () => {
      root.querySelector('#a')!.after(document.createTextNode('bare text'))
    })
    const scope = scopeMutations(records)
    // A bare text addedNode can never itself be (or contain) a blockquote/code-block/html-block — the
    // 3 decorators only ever match ELEMENT selectors — so it's correctly ignored as noise, same as a
    // pure removal: nothing to re-scan, but that's a real "nothing to do", not an unresolvable case.
    expect(scope.full).toBe(false)
    expect(scope.blocks.size).toBe(0)
  })

  it('once a batch is deemed full, later records are skipped (short-circuit, not re-processed)', () => {
    const root = irRootWith('<p id="a">a</p><p id="b">b</p>')
    const detached = document.createElement('div')
    const strayChild = document.createElement('p')
    detached.appendChild(strayChild)
    const outsideRootRecord = {
      type: 'childList',
      target: detached,
      addedNodes: [strayChild] as unknown as NodeList,
      removedNodes: [] as unknown as NodeList,
    } as unknown as MutationRecord
    const b = root.querySelector('#b') as HTMLElement
    const realRecords = recordsFor(root, () => {
      b.outerHTML = '<p id="b2">b2</p>'
    })
    // the out-of-root record comes FIRST — it alone forces full:true, and the loop must break
    // before even looking at the second (perfectly resolvable) record.
    const scope = scopeMutations([outsideRootRecord, ...realRecords])
    expect(scope.full).toBe(true)
  })

  it('a characterData change on a text node DIRECTLY under root (no block wrapper) safely falls back to full', () => {
    const root = irRootWith('')
    const text = document.createTextNode('unwrapped')
    root.appendChild(text)
    const records = recordsFor(root, () => {
      text.textContent = 'unwrapped, edited'
    })
    // characterData records always resolve via `target` (never skipped like a childList addedNode
    // would be) — topLevelBlockOf's climb starts AT root (the text's parent) and runs past it looking
    // for a top-level block, correctly finding none (there isn't one) rather than returning a wrong
    // element — the safe over-scope-to-full fallback, not a silent no-op.
    const scope = scopeMutations(records)
    expect(scope.full).toBe(true)
  })
})

describe('queryIncludingSelf', () => {
  it('matches the root itself in addition to descendants', () => {
    const root = document.createElement('blockquote')
    root.innerHTML = '<p><blockquote>nested</blockquote></p>'
    document.body.replaceChildren(root)
    const found = queryIncludingSelf(root, 'blockquote')
    expect(found).toHaveLength(2)
    expect(found[0]).toBe(root)
  })

  it('returns only descendants when the root does not itself match', () => {
    const root = document.createElement('div')
    root.innerHTML = '<blockquote>a</blockquote>'
    document.body.replaceChildren(root)
    const found = queryIncludingSelf(root, 'blockquote')
    expect(found).toHaveLength(1)
    expect(found[0]).not.toBe(root)
  })
})
