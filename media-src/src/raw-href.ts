// Task 359 #2 — the RAW href attribute of a clicked `<a href>`, never `linkElement.href`. For
// a real HTML <a>, `.href` is always the browser-RESOLVED absolute URL: the webview's <base
// href> points at the doc directory's vscode-resource URL (markdown-editor-provider.ts), so a
// relative `./notes/a.md` resolves to `https://file+…vscode-resource…/notes/a.md` — which then
// matches onOpenLink's `/^https?:/` external-link test and routes to the OS browser instead of
// opening the file (measured in the task-359 probe). Callers use the `a[href]` selector, which
// already guarantees the attribute exists — for both HTML and SVG anchors (SVG <a>, e.g. d2
// shape/connection links, task 124 #5, exposes `.href` as a non-string SVGAnimatedString, but
// `getAttribute` works identically on both) — so there is no fallback to `.href`.
//
// Kept in its own module (no `./vscode-api` import) so it stays unit-testable under the plain
// `node` vitest environment — pulling in vscode-api.ts's `window.vscode = acquireVsCodeApi()`
// side effect would crash outside a DOM (see link-click.ts / link-open-policy.ts for the same
// pattern).
export function rawHrefOf(el: Element): string {
  return el.getAttribute('href') || ''
}
