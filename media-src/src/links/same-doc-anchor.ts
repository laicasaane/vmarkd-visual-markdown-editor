// Task 243 — same-document `#fragment` anchor links. Resolves against the shared slugger
// (src/heading-slug.ts, the host-tree cross-import — same shape as echarts-theme.ts's) and
// reuses the EXISTING scroll-to-heading mechanism (outline.ts's scrollToHeadingIndex) entirely
// in-process: no host round-trip, no new webview→host message. This is what
// asset-link-actions.ts's `same-doc-anchor` case used to no-op on — now the webview never
// posts that href to the host at all (see the call sites in link-click.ts / link-click-fix.ts),
// so that host branch stays a no-op for the (should-be-unreachable) case where it still is.
import type Vditor from 'vditor'
import { classifyHref } from '../../src/link-target'
import {
  parseHeadingsFromMarkdown,
  resolveFragment,
  type SlugifyMode,
} from '../../src/heading-slug'
import { scrollToHeadingIndex } from './outline'

let slugifyMode: SlugifyMode = 'github'

// Mirrors link-open-policy.ts's applyLinkOpenSetting: called once at init (vditor-init.ts) and
// again on every live config change (message-router.ts's handleConfigChanged), so a settings
// edit takes effect without reopening the document.
export function applySlugifyModeSetting(mode: string | undefined): void {
  slugifyMode = mode === 'gitlab' ? 'gitlab' : 'github'
}

export function getSlugifyMode(): SlugifyMode {
  return slugifyMode
}

// A same-doc-anchor href's fragment is the RAW post-`#` text (link-target.ts doesn't decode it,
// matching how it leaves `local`'s fragment undecoded too) — percent-decode here the same way
// classifyHref decodes `local.path`, so `%20`/unicode-escaped links resolve. A stray `%` that
// isn't a valid escape falls back to the raw text rather than failing the whole click.
function decodeFragment(raw: string): string {
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

// If `href` is a bare `#fragment` (classifyHref's `same-doc-anchor` kind), resolve it against
// THIS document's own headings and scroll+flash — never posting anything to the host. Returns
// true when it handled the href at all (including "fragment didn't match any heading" — a
// same-doc anchor never falls through to open-link), false when `href` isn't a same-doc anchor,
// so the caller should proceed with its normal open-link routing.
export function tryScrollToSameDocAnchor(
  href: string,
  vditor: Vditor | undefined,
): boolean {
  const classified = classifyHref(href)
  if (classified.kind !== 'same-doc-anchor') return false
  if (!vditor || typeof vditor.getValue !== 'function') return true
  const fragment = decodeFragment(classified.fragment)
  const headings = parseHeadingsFromMarkdown(vditor.getValue())
  const index = resolveFragment(headings, fragment, slugifyMode)
  if (index !== undefined) {
    scrollToHeadingIndex(vditor, index)
  }
  return true
}
