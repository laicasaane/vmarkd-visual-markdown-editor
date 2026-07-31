// Sanitize a pasted/dropped image file name before it becomes an on-disk asset name.
//
// The old inline regex in main.ts (`.replace(/[^\w-_.]+/, '_')`) had two bugs (task 191 §0):
//   1. no `/g` — only the FIRST run of disallowed characters was replaced, so a second bad
//      run (e.g. a later `/`) survived;
//   2. the class permitted `.`, so an interior `..` survived — and the host then joined the
//      name straight into the assets folder (extension.ts), so a crafted `../` could escape it.
//
// This replaces EVERY run of disallowed characters (including path separators) and collapses
// any `..`, so the result is always a single safe path segment. The host ALSO guards the join
// with basename + a containment check (defense in depth) — this is the first line, not the only.
export function sanitizeUploadName(name: string): string {
  const cleaned = name
    .replace(/[^\w.-]+/g, '_') // every run of disallowed chars (incl / and \) → one `_`
    .replace(/\.{2,}/g, '_') // collapse `..`/`...` so no path-traversal segment remains
  return cleaned || '_'
}
