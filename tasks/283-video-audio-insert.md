# Task 283 — Local video/audio embeds: fix the insert pipeline (render already works)

**Status:** planned · **Impact:** 🟡 med · **Origin:** task 192 §10 probe (fell through the 239-269 batch; re-flagged by §11)

## Problem

Probe-verified half-state: the RENDER side is fully ready — `<video>`/`<audio>` pass Lute
sanitize in preview AND IR html-block, round-trip stable, CSP allows media
(`media-src ${cspSource} data: blob:`, html-builder.ts:57) and `<base href>` resolves
relative srcs. But the drop/upload handler special-cases ONLY `.wav`
(media-src/src/main.ts:750-752 inserts `<audio>`); mp3/m4a/ogg/mp4/webm/mov all fall into
the image branch → `![](file.mp4)` → broken image icon. Screen recordings dragged into
notes are common.

## Scope

- [ ] Route `handleUploaded` by extension: audio (mp3/m4a/ogg/wav/flac) → `<audio controls
      src>`; video (mp4/webm/mov) → `<video controls src>`; images unchanged; other
      extensions → plain link `[name](path)` (resolves the task-190 §5 non-image-drop
      question for media, and complements 191 Probe-17's PDF case).
- [ ] Conversion pipeline bypass: media files skip the image webp path (they already do —
      verify + pin), size cap warning setting for huge drops.
- [ ] Document HTML media embeds in the README (226's companion list gains a line).
- [ ] The pasted/dropped file lands under `image.saveFolder` like images (naming via 277
      once it lands; timestamp scheme until then).

## Out of scope

- Transcoding, remote video (YouTube etc. — iframes are CSP-blocked by design; a
  thumbnail-link helper could be a future note), poster frames, subtitles.

## Verification

L1: extension-routing unit (the full table). L2: synthetic drop of an mp4 `File` → one
upload post + `<video controls>` inserted, round-trip stable. L3 real-VS-Code (mandatory —
CSP/resource pipeline): dropped webm renders a playable element (`readyState`/no error
event) and survives save/reopen.
