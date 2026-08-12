// Task 513 — refresh an <img> whose file was replaced on disk under an unchanged path.
//
// Measured in real VS Code (test/vscode-e2e/image-swap-refresh-probe.spec.ts, all widths in px of
// the same swapped file): idle 1024, after a document re-render 1024, after building a BRAND NEW
// <img> with the same src 1024 — the stale bytes come from Chromium's HTTP cache keyed on the
// `https://file+.vscode-resource…` URL, not from anything in our DOM. A cache-busted URL read 2780
// (the real new width), and so did `fetch(url, {cache:'reload'})` followed by a reload of the same
// URL. `connect-src ${cspSource}` is already in the CSP, so the fetch is allowed.
//
// We take the fetch route on purpose: the `src` ATTRIBUTE is left byte-identical (a relative
// `shot.png` stays `shot.png`), so Lute cannot serialize a cache-busting query back into the saved
// markdown — the failure mode a `?v=` rewrite would have risked on every IR/WYSIWYG round-trip.

/** Normalise a file path for comparison: forward slashes, no drive-letter case difference. */
function normalize(p: string): string {
  const s = p.replace(/\\/g, '/')
  return /^[a-zA-Z]:\//.test(s) ? s[0].toLowerCase() + s.slice(1) : s
}

/** The on-disk path a webview resource URL points at, or '' when it is not a file URL. */
export function filePathOfResourceUrl(url: string): string {
  try {
    const { pathname } = new URL(url)
    const decoded = decodeURIComponent(pathname)
    // Windows resource URLs carry the drive as `/c:/…`.
    return normalize(decoded.replace(/^\/([a-zA-Z]:)/, '$1'))
  } catch {
    return ''
  }
}

/** Does this <img> resolve to `fsPath`? */
export function imageMatchesPath(src: string, fsPath: string): boolean {
  const target = normalize(fsPath)
  const actual = filePathOfResourceUrl(src)
  if (!actual || !target) return false
  return actual === target || actual.endsWith(target)
}

async function reload(img: HTMLImageElement): Promise<void> {
  const resolved = img.src
  const attr = img.getAttribute('src')
  if (!resolved || attr === null) return
  try {
    // Revalidate the cache entry for THIS url; the reload below then reads the fresh bytes.
    await fetch(resolved, { cache: 'reload' })
  } catch {
    // Offline/denied: fall through — the re-set below still costs nothing.
  }
  img.removeAttribute('src')
  img.setAttribute('src', attr)
}

/**
 * Re-fetch every rendered image that points at one of `paths` (absolute fs paths from the host).
 * Returns how many elements were refreshed — the e2e reads it, and it keeps the function testable.
 */
export async function refreshChangedImages(
  doc: Document,
  paths: string[],
): Promise<number> {
  if (!paths.length) return 0
  const images = [...doc.querySelectorAll('img')] as HTMLImageElement[]
  const stale = images.filter((img) =>
    paths.some((p) => imageMatchesPath(img.src, p)),
  )
  await Promise.all(stale.map(reload))
  return stale.length
}
