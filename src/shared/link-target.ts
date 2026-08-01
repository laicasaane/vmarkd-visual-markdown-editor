// Task 359 — classify a document-content link href into what onOpenLink should do with it.
// Pure function, no VS Code needed (L1 unit-testable exhaustively). Shared with task 243
// (fragment/heading navigation) so `file.md#heading` is split into path+fragment in exactly
// ONE place — 243 will consume `.fragment` on the `local` case to scroll after opening;
// nothing here resolves it yet.

type ClassifiedHref =
  | { kind: 'external'; href: string } // http(s) — env.openExternal
  | { kind: 'refused'; reason: string } // disallowed scheme (command:, javascript:, file:, vscode:, …)
  | { kind: 'scheme'; href: string } // allowlisted non-file scheme (mailto:, tel:) — vscode.open unparsed
  | { kind: 'same-doc-anchor'; fragment: string } // "#heading" alone — left to task 243
  | { kind: 'local'; path: string; fragment?: string } // filesystem target, percent-decoded

// Allowlist, NOT a denylist. A relative link must not be able to escape into an arbitrary
// scheme (task 359 hard rule) — so everything not explicitly named here is refused, including
// `command:` (arbitrary command execution), `javascript:`/`data:` (script injection), and
// `file:`/`vscode-resource:`/`vscode-webview:`/`vscode-file:` (would bypass the workspace/
// doc-dir containment check in onOpenLink entirely by handing vscode.open an absolute URI
// that never goes through the `local` branch's relative-resolve + containment logic).
//
// `vscode:`/`vscode-insiders:` were on this list at first (task 359) and were REMOVED after an
// adversarial follow-up review — MEASURED, not assumed (real VS Code,
// `test/vscode-e2e/vscode-scheme-urihandler-probe.spec.ts`): `vscode.commands.executeCommand(
// 'vscode.open', Uri.parse('vscode://<publisher>.<extid>/<path>?<query>'))` — the exact call
// `onOpenLink`'s `scheme` branch makes — DOES dispatch to that extension's registered
// `vscode.window.registerUriHandler`, and the query string reaches it unmodified, including
// attacker-controlled parameters from the clicked link. onOpenLink has no workspace-trust gate
// on link-opening (unlike `ensureCanWriteFiles`), so this fired from an untrusted document too.
// That is a confused-deputy hole in allowlist clothing: the classifier cannot distinguish a
// benign `vscode:settings` from `vscode://some-other-installed-extension/exploit?…` — the
// SHAPE is identical, only the target extension's own handler decides what the query does, and
// the target extension has no idea the invocation came from an untrusted document's link. No
// narrower "safe shape" (e.g. authority-less `vscode:` only) was carved out — that would need
// its own empirical proof it can't reach the same dispatch, and the cost of a markdown author
// occasionally wanting a `vscode:settings`-style link is far lower than the cost of getting that
// carve-out wrong. Refuse the whole scheme.
const SAFE_SCHEMES = new Set(['mailto', 'tel'])

// A URI scheme is `ALPHA *( ALPHA / DIGIT / "+" / "-" / "." ) ":"`. Windows drive-letter paths
// ("C:\foo", "C:/foo") match that grammar (scheme "c") but are filesystem paths — task 359 bug
// #1 is exactly `Uri.parse` misreading one as a scheme, so this must be excluded BEFORE the
// scheme check below, not handled by it.
const WINDOWS_DRIVE_PATH_RE = /^[a-zA-Z]:[\\/]/
const SCHEME_RE = /^([a-zA-Z][a-zA-Z0-9+.-]*):/

export function classifyHref(href: string): ClassifiedHref {
  const raw = String(href).trim()
  if (!raw) {
    return { kind: 'refused', reason: 'empty link target' }
  }
  if (/^https?:/i.test(raw)) {
    return { kind: 'external', href: raw }
  }

  // Scheme detection happens on the RAW (not percent-decoded) string — decoding first would
  // let an encoded scheme delimiter (`%63ommand:` → `command:`) sneak past this check and
  // fall through to the local-path branch, which then percent-decodes it anyway. Order matters.
  const isWindowsDrivePath = WINDOWS_DRIVE_PATH_RE.test(raw)
  const schemeMatch = isWindowsDrivePath ? null : SCHEME_RE.exec(raw)
  if (schemeMatch) {
    const scheme = schemeMatch[1].toLowerCase()
    if (SAFE_SCHEMES.has(scheme)) {
      // A real URI string — hand it to vscode.open unparsed. Uri.parse is the CORRECT
      // constructor here, unlike for filesystem paths (task 359 bug #1): this genuinely is a
      // URI, not an fsPath that happens to contain a colon.
      return { kind: 'scheme', href: raw }
    }
    return {
      kind: 'refused',
      reason: `the "${scheme}:" scheme is not allowed in a document link`,
    }
  }

  // Local filesystem target (relative or absolute, POSIX or Windows drive path). Split off
  // any #fragment BEFORE resolving (task 243 owns fragment/anchor navigation) — this only
  // stops `file.md#heading` being treated as a literal filename containing "#" (part of bug
  // #1: Uri.parse would have split it wrongly; Uri.file would instead treat it as one literal,
  // nonexistent filename). A literal "#" survives here only if percent-encoded (`%23`), which
  // is why the split happens BEFORE decoding.
  const hashIndex = raw.indexOf('#')
  const pathPart = hashIndex >= 0 ? raw.slice(0, hashIndex) : raw
  const fragment = hashIndex >= 0 ? raw.slice(hashIndex + 1) : undefined
  if (!pathPart) {
    // "#heading" alone. Not yet implemented (task 243) — the caller no-ops rather than trying
    // (and failing) to open a file literally named "#heading".
    return { kind: 'same-doc-anchor', fragment: fragment ?? '' }
  }

  // A markdown link's destination may be percent-encoded the way a browser would encode it
  // ("my%20file.md"). Decode so it resolves to the real filename. A stray "%" that ISN'T a
  // valid escape (e.g. a literal "%" in a filename) throws — fall back to the raw text rather
  // than refusing the whole link.
  let path = pathPart
  try {
    path = decodeURIComponent(pathPart)
  } catch {
    // leave `path` as the raw, non-decoded pathPart
  }
  return { kind: 'local', path, fragment }
}
