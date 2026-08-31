export interface BuiltInSnippet {
  trigger: string
  label: string
  markdown: string
}

export interface SnippetHintData {
  html: string
  value: string
}

export interface SnippetHintExtension {
  key: string
  hint(query: string): SnippetHintData[]
}

export const DETAILS_SNIPPET_MARKDOWN =
  '<details>\n<summary>Details</summary>\n\nDetails body\n\n</details>'

// Task 257 contributes only its own template. Task 221 remains the owner of the future complete
// registry (tables, diagrams, user snippets, grouping, aliases, and MRU ordering).
export const BUILTIN_SNIPPETS: readonly BuiltInSnippet[] = [
  {
    trigger: 'details',
    label: 'Details',
    markdown: DETAILS_SNIPPET_MARKDOWN,
  },
]

export function escapeSnippetSource(markdown: string): string {
  return markdown.replace(
    /[&<>]/gu,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[character] ?? character,
  )
}

export function snippetHints(
  query: string,
  render: (markdown: string) => string,
): SnippetHintData[] {
  const needle = query.toLowerCase()
  return BUILTIN_SNIPPETS.filter(
    ({ trigger, label }) =>
      trigger.includes(needle) || label.toLowerCase().includes(needle),
  ).map(({ label, markdown }) => ({
    html: `<span data-vmde-snippet-hint="1">${label}</span>`,
    value: render(markdown),
  }))
}

export function createSnippetHintExtension(
  render: (markdown: string) => string,
): SnippetHintExtension {
  return {
    key: ';;',
    hint: (query) => snippetHints(query, render),
  }
}

function snippetButton(target: EventTarget | null): HTMLButtonElement | null {
  const element = target instanceof Element ? target : null
  const button = element?.closest<HTMLButtonElement>('.vditor-hint button')
  return button?.querySelector('[data-vmde-snippet-hint]') ? button : null
}

export function installSnippetHintUndoBoundary(
  doc: Document,
  checkpoint: () => void,
): () => void {
  const onPointerDown = (event: PointerEvent) => {
    if (snippetButton(event.target)) checkpoint()
  }
  const onKeydown = (event: KeyboardEvent) => {
    if (
      event.key !== 'Enter' ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.isComposing
    )
      return
    const current = doc.querySelector<HTMLButtonElement>(
      '.vditor-hint[style*="display: block"] button.vditor-hint--current',
    )
    if (snippetButton(current)) checkpoint()
  }
  doc.addEventListener('pointerdown', onPointerDown, true)
  doc.addEventListener('keydown', onKeydown, true)
  return () => {
    doc.removeEventListener('pointerdown', onPointerDown, true)
    doc.removeEventListener('keydown', onKeydown, true)
  }
}
