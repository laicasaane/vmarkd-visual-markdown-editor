// Empty stand-ins for Vditor toolbar buttons we never enable (task 20). Vditor's
// `toolbar/index.ts` statically imports Br/Fullscreen/Record/Export/Help and switches
// on them, so esbuild can't drop them by tree-shaking alone — esbuild-shared.mjs
// redirects those imports here, dropping their deps and dead markup. Our toolbar uses
// `Divider` for `|` separators (not `Br`), enables none of these, and folds Help into
// the Info dialog (fixInfoDialog) — so these classes are never constructed at runtime.

class StubElement {
  public element: HTMLElement = document.createElement('div')
}

export class Br extends StubElement {}
export class Fullscreen extends StubElement {}
export class Record extends StubElement {}
export class Export extends StubElement {}
// Help is folded into the Info dialog; the `help` toolbar item is dropped (toolbar.ts).
export class Help extends StubElement {}

// Vditor 3.11.3 statically imports optional image-caption code even though VMDE
// never enables that option. Preserve the disabled behavior without paying an eager module cost.
export const renderImageCaptions = (): void => undefined
export const renderImageCaptionHTML = <T>(html: T): T => html

// Vditor 3.11.3 added a native WaveDrom pass, but this editor's diagram runtime already owns
// WaveDrom rendering, error handling, theme flips, and caching. Keep one authoritative renderer.
export const wavedromRender = (): void => undefined
