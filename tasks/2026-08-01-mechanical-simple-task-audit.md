# Audyt zadań: mechaniczne/proste vs wymagające projektu (2026-08-01)

**Zakres:** wszystkie 143 aktywne pliki w `tasks/` (bez `tasks/done/` i `tasks/parked/`), stan na
2026-08-01, po przeniesieniu 263 zadań ukończonych/odrzuconych do `tasks/done/` i 72 zadań
odłożonych do `tasks/parked/` tego samego dnia.

**Metoda:** agent przeczytał pełną treść (sekcję Scope/Impact/Status) każdego z 143 plików —
nie tylko linię statusu z `tasks/README.md`. Kryterium rozstrzygające dla granicznych
przypadków: *czy kompetentny inżynier, czytając TYLKO ten plik zadania, wiedziałby dokładnie
jaki kod napisać, bez podejmowania decyzji architektonicznej?* Jeśli tak → mechaniczne/proste,
nawet gdy impact jest oceniony jako średni/wysoki. Jeśli trzeba wybierać między podejściami
albo najpierw zbadać wykonalność → wymaga projektu/badań.

## Podsumowanie

| Kategoria | Liczba |
|---|---|
| **MECHANICAL_SIMPLE** — mały, dobrze opisany, bez otwartych decyzji | **94** |
| NEEDS_DESIGN_OR_RESEARCH — design-first/spike-first/decision-gated | 28 |
| LARGE_OR_MULTI_PART — epic, wieloetapowe, dotyka wielu podsystemów | 16 |
| BUG_OR_INVESTIGATION — nakład pracy nieznany do czasu zdiagnozowania | 5 |
| **Razem** | **143** |

Ten plik zawiera pełną listę wyłącznie dla kategorii **MECHANICAL_SIMPLE** (94 pozycje) —
to była treść pytania. Pozostałe 49 zadań (28+16+5) nie zostało tu wypisanych imiennie.

**Aktualizacja (2026-08-01, po weryfikacji grupy "Docs-only"):** 3 z tych 94 pozycji (56, 147,
470) po przeczytaniu pełnej treści okazały się faktycznie ukończone (status-line była
nieaktualna) — przeniesione do `tasks/done/` i wykreślone z aktywnego `tasks/`. Pozostałe 91
wciąż istnieją w `tasks/` jako aktywne, mechaniczne/proste zadania — patrz sekcja niżej dla
szczegółów tej korekty.

## Lista MECHANICAL_SIMPLE (94), pogrupowana tematycznie

### Wiki-linki — rozszerzają istniejący WikiCache/scan (10)
- 32-link-image-autocomplete.md — findFiles + watcher + post do webview
- 201-wiki-backlinks-panel.md — reverse index na istniejącym WikiCache + tree view
- 202-wiki-rename-refactor.md — WorkspaceEdit handler nad istniejącym wzorcem scan/index
- 203-wiki-anchor-links-fix.md — BUG z w pełni zidentyfikowaną przyczyną i nazwaną poprawką
- 204-wiki-embeds-transclusion.md — rozszerza istniejący wzorzec chip/data-render + jeden nowy komunikat protokołu
- 205-tags-chips-index.md — tokenizer + reużycie renderowania chipów z wiki
- 208-wiki-graph-view.md — reużycie wbudowanego echarts graph series, zależne tylko od indeksu z 201
- 210-wiki-hover-preview.md — hover popover reużywający istniejące wzorce render/protokół
- 211-wiki-unlinked-mentions.md — matcher + sekcja UI na istniejącym przebiegu skanowania
- 263-block-references.md — rozszerza istniejące wzorce wiki-cache/resolution (203+204)

### Callouts / inline adnotacje tekstu — na bazie callouts.ts (7)
- 206-obsidian-callout-compat.md — mapa aliasów + parsowanie markera zwijania na istniejącym mechanizmie
- 231-admonitions-compat.md — mapuje się na istniejące renderowanie calloutów przez dekorator
- 234-task-metadata-chips.md — słownik tokenów + renderowanie chipów, ustalony wzorzec
- 235-checklist-progress.md — logika liczenia + dekoracja odznaki
- 249-criticmarkup-track-changes.md — przebieg dekoracji + komendy accept/reject, w pełni opisane
- 257-details-toggle-editing.md — dekorator parujący węzły open/close, reużycie wzorca z callouts.ts
- 279-code-annotations.md — wykrywanie markerów + render legendy, przebieg dekoracji

### Nagłówki / sekcje / outline — wspólny "section engine" z 222 (8)
- 222-outline-heading-reorder.md — dobrze opisany silnik przenoszenia sekcji + wiring drag, brak otwartych pytań
- 250-heading-numbering.md — liczniki CSS + komendy zapisu, wyraźnie warstwowe
- 253-in-source-toc.md — komenda zapisująca między znacznikami, reużycie istniejącego sluggera
- 254-heading-level-shift.md — keybinding + silnik przesunięcia reużywający silnik sekcji z 222
- 258-section-folding.md — klasa CSS zwijania sterowana przez współdzielony silnik sekcji (222)
- 259-block-drag-handles.md — uogólnia silnik przenoszenia z 222 do dowolnych bloków, w pełni opisane
- 289-section-hoisting.md — mechanizm czysto wyświetlający, reużywa silnik sekcji z 258
- 290-heading-breadcrumb.md — sticky bar + obliczanie ścieżki nagłówków

### Listy (3)
- 255-list-renumber-command.md — komenda reużywająca istniejący przebieg normalizacji Lute
- 256-sv-table-formatter.md — komenda reużywająca istniejący normalizator Lute
- 281-sort-list-items.md — komenda sortująca reużywająca przebieg renumeracji z 255

### Caret / zaznaczenie / nawigacja (8)
- 223-selection-word-count.md — listener selectionchange + tekst w pasku statusu
- 274-document-bookmarks.md — toggle + moduł anchor + lista skoków, ustalony wzorzec dekoracji
- 275-reading-position-memory.md — zapis block-anchor + scroll, reużywa moduł z 274
- 276-extract-selection-to-note.md — komenda reużywająca istniejące wiki-create + serializację copy-path
- 285-bubble-selection-toolbar.md — overlay toolbar wywołujący istniejące akcje toolbara, w pełni opisane
- 286-caret-marker-reveal.md — BUG, jasna przyczyna + poprawka (rozszerzenie reveal na wszystkie ruchy caretu)
- 288-structural-selection.md — jeden współdzielony moduł chodzenia po zakresie napędza wszystkie skróty, brak otwartych decyzji
- 297-ir-link-popover.md — balonowy popover reużywający współdzielony prymityw overlay (285)

### Tryby edycji / drobne UX pisania — jedno ustawienie + mały moduł (13)
- 197-typewriter-mode.md — jedno ustawienie podłączające istniejącą opcję Vditor + audyt interakcji
- 198-focus-mode.md — jedno ustawienie + klasa przyciemnienia sterowana istniejącym selectionchange
- 199-smart-punctuation.md — jedno ustawienie + funkcja podstawiania w beforeinput
- 200-sv-autopairing.md — jedno ustawienie + mały moduł keydown, tylko sv
- 260-plain-markdown-presentation.md — komenda + overlay reużywający istniejący pipeline renderowania
- 261-writing-goals.md — arytmetyka po stronie hosta + wyświetlanie w pasku statusu
- 262-prose-style-check.md — pakiet reguł + przebieg dekoracji; ocena gramatyki jawnie poza zakresem
- 293-undo-boundaries.md — zachowanie silnika dmp, dodanie wymuszonych punktów flush; w pełni opisane
- 294-ime-composition-guards.md — audyt handlerów capture-phase + współdzielony helper guard
- 296-hemingway-mode.md — bramka klawiszy capture-phase, w pełni opisana
- 298-turn-into-menu.md — czysta funkcja transformacji + macierz par, jeden rdzeń komendy
- 299-placeholder-text.md — ustawienia + CSS; opcja placeholder Vditor już istnieje
- 300-content-width-presets.md — uogólnienie istniejącego ustawienia boolean do enuma + resolvera

### Obrazy / media (7)
- 213-remote-image-localization.md — komenda + fetch po stronie hosta reużywający istniejący pipeline obrazów
- 217-raster-image-zoom.md — rozszerzenie istniejącego mechanizmu diagram-zoom na `<img>`
- 270-drawio-excalidraw-bridge.md — komendy bridge-only + pliki szablonów, jawnie zawężony zakres
- 271-pdf-export-pipeline.md — przepływ detect+page.pdf() w pełni opisany; drobny spike już rozstrzygnięty
- 277-paste-image-naming.md — ustawienie szablonu + prompt potwierdzenia, rozszerza istniejący pipeline uploadu
- 278-remote-image-upload-targets.md — jedno ustawienie (command pipe) + logika fallback
- 283-video-audio-insert.md — BUG, przyczyna w pełni zidentyfikowana (luka w routingu rozszerzeń), wąska poprawka

### Eksport / kopiowanie / integracje zewnętrzne (5)
- 53-export-html-markdown.md — przepływy eksport/kopiuj w pełni opisane, "lean standalone" już zdecydowane
- 228-issue-tracker-links.md — tokenizer sterowany konfiguracją + istniejący wzorzec chipów
- 252-export-flatten-embeds.md — czysty rekurencyjny resolver po stronie hosta, w pełni opisany
- 272-workspace-tasks-tree.md — TreeView + indeks hosta reużywający wzorzec skanowania wiki-cache
- 280-copy-as-confluence-jira.md — konwersja przez zvendorowaną bibliotekę + komenda clipboard

### Referencje akademickie / matematyka (3)
- 246-numbered-equations-eqref.md — dobrze opisany przebieg pre-process + dekoracja
- 247-figure-table-captions-crossrefs.md — dobrze opisany przebieg dekoracji (współdzieli scanner, nadal samodzielny)
- 248-katex-command-completion.md — uzupełnianie w menu hint reużywające istniejący mechanizm hint.extend

### Dostępność (3)
- 265-screen-reader-semantics.md — dodatki atrybutów/aria przez współdzieloną ścieżkę renderowania, jednolity przegląd
- 266-reduced-motion.md — media query CSS + guardy matchMedia, podany szacunek pół dnia
- 267-high-contrast-support.md — przekazanie rodzaju motywu + zamiana CSS/palety, ustalony wzorzec rejestru

### Webview / security / keybindingi (5)
- 212-csp-widget-fixes.md — para BUG, ale w pełni zdiagnozowana, z nazwaną poprawką dla każdego
- 215-webview-context-menu.md — znakowanie `data-vscode-context` + wkłady menu, ustalony wzorzec
- 216-open-editor-keybinding.md — keybinding + zmiana `when` w palecie, trywialne
- 224-paste-url-wrap-link.md — pozostałe pozycje to drobne nazwane follow-upy + jedna osobna funkcja opt-in
- 225-lute-inline-extensions.md — przełączenie istniejących flag Lute `Set*` za ustawieniami; konflikt już rozwiązany

### D2 diagram — drobne (2)
- 129-d2-text-styles.md — pola WASM już wyeksportowane; wystarczy podłączyć 4 atrybuty stylu do `toSVG`
- 134-d2-label-icon-positioning.md — decyzje już rozstrzygnięte w pliku; pojedyncza zmiana obliczenia kotwicy

### Docs-only / drobne administracyjne — WERYFIKACJA 2026-08-01 (patrz niżej)
Ten nagłówek w pierwszej wersji audytu mylił "proste do zrobienia" z "już zrobione". Po
przeczytaniu pełnej treści wszystkich 8 plików okazało się, że tylko 3 były faktycznie
zamknięte; 5 ma odznaczoną (nieukończoną) sekcję Scope i zostaje w aktywnym `tasks/`:

**Faktycznie zamknięte i przeniesione do `tasks/done/` (3):**
- 56-vditor-listtoggle-bugfixes.md — crash naprawiony; pozostały zakres (per-item split)
  jawnie odrzucony decyzją 2026-06-04, nie zostawiony otwarty. Status-line skorygowana.
- 147-patch-engine-hardening.md — pozycje 1/3/5 zrobione; pozycja 4 zakończona (re-anchoring
  pozostałych 7 nie jest możliwe z definicji — to literały wersji/tłumaczenia); pozycja 2
  przekazana do zadania 144. Status-line skorygowana z "PARTIAL" na "CLOSED".
- 470-solid-kiss-review-residue.md — wszystkie 4 pozycje odznaczone `[x]`, treść mówi
  "closed out 2026-07-31"; sama linia Status była nieaktualna ("OPEN"). Skorygowana.

**Pozostają OTWARTE w `tasks/` — mechaniczne/proste, ale realnie nierozpoczęte (5):**
- 54-marketplace-onboarding.md — Status `planned`; cały Scope (Part A/B/C) nieodhaczony,
  żaden plik walkthrough nie istnieje.
- 81-marketplace-verify-publisher-domain.md — wymaga zewnętrznej akcji (posiadanie domeny +
  weryfikacja DNS), nic do zrobienia w repo do czasu spełnienia warunku.
- 226-readme-renderer-docs.md — Status `planned`; cały Scope nieodhaczony, README nie
  zaktualizowany.
- 401-adr0004-vditor-fork-trigger.md — Status `planned`; decyzja o triggerze na fork Vditora
  jeszcze niepodjęta, cały Scope nieodhaczony.
- 478-remaining-category4-css-conversions.md — 5 z 6 punktów zrobione, ale punkt 6 (konwersja
  tabeli) jawnie odłożony jako osobny przebieg i nie ma jeszcze własnego zadania — status
  celowo pozostawiony jako TODO na wyraźną prośbę użytkownika (2026-08-01).

### Pozostałe pojedyncze drobne (12)
- 52-source-to-webview-cursor-sync.md — reużywa istniejący mechanizm source-map, lustrzane odbicie istniejącego reveal
- 74-image-convert-webp-avif.md — spike już potwierdził plan A+C; wystarczy zaimplementować
- 79-preview-polish.md — dwa konkretne błędy wizualne z jasnym podejściem naprawy
- 88-vscode-copyfiles-destination.md — jasny cel/notatki projektowe; tylko drobny spike biblioteki matchera
- 207-frontmatter-properties-aliases.md — lekki ekstraktor podzbioru YAML + złączenie cache
- 209-daily-notes-templates.md — komenda + ustawienia + expander tokenów szablonu
- 220-preview-checkbox-toggle.md — przebieg post-render + handler kliknięcia mapowany przez source-map
- 221-snippet-templates-hint.md — reużycie istniejącego mechanizmu hint.extend z listą szablonów
- 230-code-snippet-transclusion.md — dyrektywa fence + odczyt/wycinek pliku po stronie hosta + wzorzec chipów
- 243-anchor-links-heading-ids.md — para BUG/fix, przyczyna w pełni zidentyfikowana, nazwana poprawka
- 251-print-css-pagebreaks.md — rozpoznawanie markera + blok CSS `@media print`
- 273-rewrap-to-column.md — komenda + silnik zawijania z w pełni opisanymi guardami
