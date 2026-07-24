# 369 — łamanie kodu inline w Preview

**Jak sprawdzać:** przełączaj **IR ⇄ Preview** (nie przez WYSIWYG — przejście przez WYSIWYG
przepisuje źródło i wstawia brakującą spację, co ukryłoby cały efekt; to osobne zadanie 370).

Przed poprawką Preview tnął kod inline **w środku słowa**, np. `currentCo` / `lor`.
Po poprawce kod schodzi w całości do nowej linii — a gdy jest dłuższy niż kolumna, nadal się łamie.

---

## 1. Właściwy przypadek — tekst SKLEJONY z kodem, bez spacji

To jest ten kształt, który wywoływał błąd. Zwróć uwagę na trzecią kolumnę.

| Silnik | Motyw | Mechanizm |
|---|---|---|
| graphviz | ✅ | SVG post-processing`currentColor` |
| plantuml | ✅ | SVG post-processing`currentColor` |
| wavedrom | ✅ | SVG post-processing`currentColor` |
| nomnoml | ✅ | SVG post-processing`currentColor` |
| math (KaTeX) | ✅ | dziedziczy`currentColor` z panelu |

**Czego szukać:** `currentColor` ma być w jednym kawałku — w IR i w Preview tak samo.
Przed poprawką w Preview było rozcięte na `currentCo` + `lor`.

---

## 2. Druga strona zachowania — token DŁUŻSZY niż kolumna

Ten musi się łamać, inaczej wystawałby poza komórkę i rozjeżdżał tabelę.

| Silnik | Motyw | Mechanizm |
|---|---|---|
| przykład A | ✅ | prefix`aVeryLongInlineCodeTokenThatCannotFitInsideThisNarrowColumn` |
| przykład B | ✅ | `NieprzerwanyIdentyfikatorKtoryJestDluzszyNizCalaSzerokoscKolumnyTabeli` |

**Czego szukać:** tekst ma się zawijać wewnątrz komórki i **nie wychodzić** poza jej krawędź
ani nie rozjeżdżać szerokości tabeli.

---

## 3. Kontrola — normalny zapis, ze spacją

Tu nic się nie zmieniło i nie powinno: spacja od zawsze dawała miejsce na złamanie linii.

| Silnik | Motyw | Mechanizm |
|---|---|---|
| mermaid | ✅ | SVG post-processing `currentColor` |
| echarts | ✅ | canvas, kolory z `getComputedStyle` |

---

## 4. To samo poza tabelą

W wąskim akapicie efekt jest ten sam — kolumna tabeli była tylko najwęższym miejscem, w którym
to widać.

> Renderer maluje z wartości`currentColor`, którą pobiera z panelu, a fallbackiem jest`#9aa0a6`
> ustawiony na sztywno, bo materiał 3D nie zależy od motywu.

---

## 5. Czego poprawka NIE dotyka

Bloki kodu i diagramy zostały celowo wyłączone z reguły.

```js
// blok kodu — bez zmian
const msg = 'aVeryLongTokenInsideACodeBlockShouldKeepBehavingExactlyAsBefore'
```

```d2
a -> b: nadal renderuje się normalnie
```

---

## Znany, świadomie niedomknięty szczegół

Wiersze z kodem inline są w Preview wyższe o **0,86px** niż w IR (5,15px na całej tej tabeli).
Jedyna reguła, która to zeruje, powoduje wystawanie długich tokenów poza komórkę — dlatego
została odrzucona. Ta różnica jest poniżej progu dostrzegalności.
