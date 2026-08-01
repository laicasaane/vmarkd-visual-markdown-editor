# Task 332 — Ambience micro-pack: typewriter sounds + completion pulse [IDEA]

**Status:** 💡 IDEA (2026-07-03) — **TO CONSIDER: adopt or park.** Creative audit (192 §13);
NOT scheduled. Honest rating: mood features, admitted as such. Both OFF by default.

## What it is & the effect

1. **Typewriter sound kit**: optional tasteful key sounds — soft thock per keystroke,
   ding-and-carriage sweep on Enter — volume control, a couple of machine profiles.
   Ghostwriter ships this and users cite it fondly in every review. Zero conceptual
   novelty; pure writing ritual.
2. **Completion pulse**: ticking the LAST unchecked box in a checklist gives ONE subtle
   300ms glow sweep + a status-bar "done" flash. The novelty is RESTRAINT — everyone else
   does confetti (Todoist/Things); in a professional editor confetti reads as cringe.
   **Full confetti burst and emoji-rain were evaluated and killed outright** — recorded
   here so they aren't re-proposed.

## Feasibility on our assets

Sounds: Web Audio + 3-4 short samples in media/ (CSP-safe, offline); keydown already
intercepted in capture phase. Pulse: checkbox toggles are already observable; one CSS
animation + a status-bar call (respects 266 reduced-motion). Hours-to-a-day each.

## Honest value

Gimmicks, plainly labeled — but costless, charming, and the kind of thing reviews mention.
Ship only as polish riding a bigger release, never as a headline.

## Decision

- [ ] **ADOPT** (as release garnish)
- [ ] **PARK** — reason: _______
