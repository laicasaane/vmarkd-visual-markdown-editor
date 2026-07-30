# List editing probe (task 428)

Distinct lists so each probed operation acts on its own anchors without disturbing the others.

## Unordered — Enter at start of a non-empty item

- uapple
- ubanana
- ucherry

## Unordered — Enter on an empty item should exit the list

- ealpha
- ebeta

## Ordered — Backspace on the marker (item with text)

1. oone
2. otwo
3. othree

## Nested — Backspace on the marker (nested item outdents)

- nparent
  - nchildone
  - nchildtwo

## Checklist — Enter continues the checklist; Backspace on marker

- [ ] ctaskone
- [ ] ctasktwo
