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
// Kept in its own module (no `./vscode-api` import): a pure DOM helper with no need to talk to
// the host has no reason to depend on the module that does. (Before task 470, vscode-api.ts
// acquired the vscode postMessage handle as an IMPORT-time side effect, so avoiding the import
// here also dodged a crash under a `window`-less test environment; that side effect is gone now —
// vscode-api.ts only exports an idempotent initVsCodeApi(), called explicitly from preload.ts's
// boot path — so importing vscode-api.ts here would be merely unnecessary, not unsafe.
// link-click.ts / link-open-policy.ts have the same "just doesn't need it" shape, without ever
// having needed this comment.)
export function rawHrefOf(el: Element): string {
  return el.getAttribute('href') || ''
}
