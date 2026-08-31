interface PreviewRevisionState {
  invalidateContent(): void
  invalidateConfig(): void
  markRendered(instance: object, element: HTMLElement): void
  canReuse(instance: object, element: HTMLElement): boolean
}

export function createPreviewState(owner: object): PreviewRevisionState {
  let contentRevision = 0
  let configRevision = 0
  let committed:
    | {
        owner: object
        element: HTMLElement
        contentRevision: number
        configRevision: number
      }
    | undefined
  return {
    invalidateContent() {
      contentRevision++
    },
    invalidateConfig() {
      configRevision++
    },
    markRendered(instance, element) {
      if (instance !== owner || !element.isConnected) return
      committed = { owner, element, contentRevision, configRevision }
    },
    canReuse(instance, element) {
      return Boolean(
        committed &&
          instance === owner &&
          committed.owner === instance &&
          committed.element === element &&
          element.isConnected &&
          committed.contentRevision === contentRevision &&
          committed.configRevision === configRevision,
      )
    },
  }
}

export function runPreviewEntry(
  state: PreviewRevisionState,
  instance: object,
  element: HTMLElement,
  render: () => void,
  reused: () => void = () => {
    /* optional reuse lifecycle */
  },
): boolean {
  if (state.canReuse(instance, element)) {
    reused()
    return true
  }
  render()
  return false
}

let activeOwner: object | undefined

export function installPreviewState(
  owner: object,
  snapshotMarkdown: () => string,
): () => void {
  const state = createPreviewState(owner)
  activeOwner = owner
  const win = window as any
  win.__vmdePreviewSnapshot = snapshotMarkdown
  win.__vmdeEnterPreview = (vditor: any) =>
    state.canReuse(vditor, vditor.preview.previewElement)
  win.__vmdePreviewRendered = (vditor: any, element: HTMLElement) =>
    state.markRendered(vditor, element)
  win.__vmdeInvalidatePreview = (kind: 'content' | 'config') => {
    if (kind === 'config') state.invalidateConfig()
    else state.invalidateContent()
  }
  return () => {
    if (activeOwner !== owner) return
    activeOwner = undefined
    delete win.__vmdePreviewSnapshot
    delete win.__vmdeEnterPreview
    delete win.__vmdePreviewRendered
    delete win.__vmdeInvalidatePreview
  }
}
