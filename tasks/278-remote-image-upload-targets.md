# Task 278 — Remote upload targets for pasted images (PicGo-style, via one trusted command)

**Status:** planned · **Impact:** 🟡 med (blog/wiki authors) · **Origin:** task 192 §11

## Problem

`onUpload` (src/extension.ts:754-800) only writes to the local assets folder. The
marketplace class (Markdown Image, hancel, ~144K; vs-picgo, ~56K driving PicGo-Core's 60+
hosts) uploads pasted images to Imgur/S3/CDNs and inserts the returned URL.

## Scope (zero-deps, security-postured — do NOT reimplement hosts)

- [ ] One setting `vmarkd.image.uploadCommand` (**no default**, workspace-trust-gated —
      the exact CLI pattern task 269 defines for AI sources): the host pipes the image
      (stdin bytes or a `$file` temp path token) to the command; stdout = final URL
      (first line, validated as http(s)).
- [ ] On success: insert the returned URL instead of the relative path (alt/naming rules
      from 277 still apply). On failure/timeout (configurable, default ~15s): **fall back
      to the existing local save** so an upload is never lost (the task-74 fallback rule) +
      a toast naming the failure.
- [ ] Per-workspace override supported (project-specific buckets); command + args array
      form to avoid shell-quoting traps; never log image bytes.
- [ ] Docs: one README example wiring `picgo upload`.

## Out of scope

- Built-in host integrations (Imgur/S3 SDKs), auth storage (the user's CLI owns it),
  re-uploading existing local assets (a later command on top of 268's scanner), remote
  DELETION.

## Verification

L1 (vscode-mock + fake command): success path inserts URL; timeout/failure falls back to
local file + link; untrusted workspace → command ignored with notice; stdout garbage →
fallback. L3: one journey with a stub script on PATH → pasted image link is the stub's
URL and no local file remains (or does, per a keep-local-copy setting — pin the default:
keep=false).
