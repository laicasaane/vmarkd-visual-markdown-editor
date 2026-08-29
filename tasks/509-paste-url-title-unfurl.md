# Task 509 — Optional title unfurl when pasting a URL

**Status:** 📋 TODO · **Impact:** ⚪ optional convenience · **Depends on:** task 224

## Goal

When the user pastes a bare HTTP(S) URL at a collapsed caret, optionally fetch the page title and
use it as the link label:

```md
[Interesting article](https://example.com/article)
```

The current default remains the deterministic task-224 behaviour:

```md
[https://example.com/article](https://example.com/article)
```

## Requirements

- Add `vmde.paste.fetchLinkTitle`, default `false`.
- Perform the request in the extension host, never directly from the webview.
- Keep the original URL immediately usable while the title request is pending.
- Parse only the document `<title>`; no arbitrary page content or scripts.
- Apply a short timeout and preserve the URL label on DNS, HTTP, parsing, or network failure.
- Do not fetch in untrusted workspaces.
- Avoid duplicate requests for the same URL during one editor session.
- Never fetch when text is selected, the caret is inside a link/code/math/diagram source, or the
  clipboard contains HTML rather than a bare URL.
- Treat redirects and non-HTTP(S) schemes conservatively.

## Verification

- Unit tests for setting resolution, URL classification, timeout/error fallback, title parsing, and
  untrusted-workspace gating.
- Chromium harness test for the webview placeholder/update protocol.
- Real-VS-Code e2e with a local HTTP fixture, proving the request stays host-side and that failure
  leaves the original URL link intact.
- No network access in tests outside the local fixture.

## Out of scope

- OpenGraph metadata, favicons, previews, or image cards.
- Automatic unfurling when the setting is off.
- Fetching titles for URLs already present in the document.
