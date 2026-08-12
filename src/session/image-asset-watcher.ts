import * as NodePath from 'node:path'
import * as vscode from 'vscode'

// Task 513 — an image replaced ON DISK under an unchanged path kept showing its OLD bytes in the
// open editor. Measured in real VS Code (test/vscode-e2e/image-swap-refresh-probe.spec.ts): the
// bytes change, but the webview's `https://file+.vscode-resource…/<path>` URL is served from
// Chromium's HTTP cache — even a BRAND NEW <img> element with the same src gets the stale bytes, so
// no amount of re-rendering in the webview can fix it. Only a different URL, or an explicit
// revalidation of that URL, refetches.
//
// The host half is here: work out which local image files the open document references, watch
// exactly those, and tell the webview when one changes. The webview half (links/image-refresh.ts)
// does the revalidation — deliberately WITHOUT touching the `src` attribute, so nothing can leak
// into the serialized markdown.

// Markdown `![alt](path "title")` plus raw HTML `<img src="path">`. Reference-style images
// (`![alt][ref]`) resolve through a link definition and are NOT matched — the same limit the
// asset-link actions already carry; a doc using them keeps today's behaviour, it does not break.
// The `<…>` form is the one that may contain spaces, so it needs its own branch.
const MD_IMAGE =
  /!\[[^\]]*\]\(\s*(?:<([^>]+)>|([^)\s]+))(?:\s+["'][^"']*["'])?\s*\)/g
const HTML_IMAGE = /<img\b[^>]*?\ssrc\s*=\s*["']([^"']+)["']/gi

// Everything the webview can already load without the file system: remote, inline and
// webview-internal URLs. Only real files on disk can go stale behind a cached URL.
const NON_FILE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i

/**
 * The distinct local image paths a markdown document references, as they appear in the source
 * (relative to the document, or absolute). Pure — the caller resolves them against the doc.
 */
export function extractLocalImagePaths(markdown: string): string[] {
  const out = new Set<string>()
  for (const re of [MD_IMAGE, HTML_IMAGE]) {
    re.lastIndex = 0
    let m = re.exec(markdown)
    while (m) {
      const raw = (m[1] ?? m[2])?.trim()
      if (raw && !NON_FILE.test(raw) && !raw.startsWith('#')) {
        // A query/fragment is not part of the file name on disk.
        out.add(raw.replace(/[?#].*$/, ''))
      }
      m = re.exec(markdown)
    }
  }
  return [...out]
}

/** Resolve the extracted paths against the document's own directory. */
export function resolveImagePaths(
  docFsPath: string,
  paths: string[],
): string[] {
  const dir = NodePath.dirname(docFsPath)
  const out = new Set<string>()
  for (const p of paths) {
    const decoded = (() => {
      try {
        return decodeURIComponent(p)
      } catch {
        return p
      }
    })()
    out.add(NodePath.resolve(dir, decoded))
  }
  return [...out]
}

// A document can reference an unbounded number of images; one watcher each would be a silly cost
// for a 500-image gallery. Watch the first N distinct paths — the case this exists for (a handful
// of screenshots in a README) sits far below it.
const MAX_WATCHED = 100

/**
 * Watches the local image files a document references and reports the ones that change on disk.
 * `refresh()` is idempotent for an unchanged path set, so it is safe to call on every keystroke.
 */
export class ImageAssetWatcher {
  private watchers: vscode.Disposable[] = []
  private watchedKey = ''

  constructor(
    private readonly notify: (paths: string[]) => void,
    private readonly log?: (message: string) => void,
  ) {}

  refresh(docFsPath: string, markdown: string): void {
    const paths = resolveImagePaths(
      docFsPath,
      extractLocalImagePaths(markdown),
    ).slice(0, MAX_WATCHED)
    const key = paths.join('\n')
    if (key === this.watchedKey) return
    this.watchedKey = key
    this.disposeWatchers()
    for (const p of paths) {
      // An absolute-path RelativePattern watches a single file, inside the workspace or outside it
      // (a README can point at an image above the workspace root).
      const pattern = new vscode.RelativePattern(
        vscode.Uri.file(NodePath.dirname(p)),
        NodePath.basename(p),
      )
      const w = vscode.workspace.createFileSystemWatcher(pattern)
      const fire = () => {
        this.log?.(`[image-watch] changed ${p}`)
        this.notify([p])
      }
      this.watchers.push(w, w.onDidChange(fire), w.onDidCreate(fire))
    }
  }

  private disposeWatchers(): void {
    for (const w of this.watchers) w.dispose()
    this.watchers = []
  }

  dispose(): void {
    this.disposeWatchers()
    this.watchedKey = ''
  }
}
