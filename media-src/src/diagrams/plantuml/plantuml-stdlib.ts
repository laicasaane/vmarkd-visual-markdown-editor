// Offline resolution of PlantUML stdlib `!include <lib/…>` (task 136). Our vendored TeaVM `plantuml.js`
// ships NO stdlib and exposes NO include-resolution hook, so C4/AWS/Azure diagrams fail offline
// ("Fatal parsing error"). We fix it by EXPANDING includes textually BEFORE calling the engine's
// render(): pull each referenced `.puml` from a vendored file-map and inline it. Pure + unit-tested
// (plantuml-stdlib.test.ts); the lazy-load of the vendored map + the wiring live in plantuml-render.ts.
//
// THE gotcha (see the memory note): the stdlib files guard every relative include with
//   !if %variable_exists("RELATIVE_INCLUDE")
//     !include ./X.puml
//   !else
//     !include https://…/X.puml   (remote — fails offline)
//   !endif
// A naïve "inline relative, drop remote" expander still fails DEEP in the macros, because the engine
// evaluates the guard as FALSE, takes the !else (remote) branch, and SKIPS the inlined !if content — so
// the library's ?=-defaults never run. We therefore strip the guard STRUCTURALLY (keep the !if branch,
// drop the guard lines + the !else branch) so the engine sees the inlined content unconditionally.

export type StdlibMap = Record<string, string> // "C4/C4_Container" -> file text (key has NO .puml suffix)

// `!include <lib/path>` (angle-bracket stdlib form); also the _many/_once/url spellings.
const STDLIB_INCLUDE = /^\s*!include(?:_many|_once|url)?\s+<([^>]+)>\s*$/i
// A remote include — unsupported offline. `!includeurl URL`, `!include URL`, `!include <URL>`.
const REMOTE_INCLUDE = /^\s*!include(?:url)?\s+<?\s*https?:/i
// A local relative include INSIDE a stdlib file: `!include ./x.puml` / `../y.puml` / `x.puml`.
const RELATIVE_INCLUDE =
  /^\s*!include(?:_many|_once)?\s+(\.{0,2}\/?[^<>\s]\S*)\s*$/i
// The RELATIVE_INCLUDE guard block — keep the !if (relative) branch, drop the guard + the !else branch.
const RELATIVE_GUARD =
  /^[ \t]*!if\s+%variable_exists\(\s*"RELATIVE_INCLUDE"\s*\)[ \t]*\r?\n([\s\S]*?)^[ \t]*!else\b[\s\S]*?^[ \t]*!endif[ \t]*$/gm

// Does the source reference a stdlib include (`!include <…>`)? Cheap gate so a plain PlantUML diagram
// never pays the stdlib lazy-load.
export function needsStdlib(source: string): boolean {
  return /^\s*!include(?:_many|_once|url)?\s+<[^>]+>/im.test(source)
}

// Does the source pull a REMOTE include (http/https)? Those can't work offline — the caller shows a note.
export function hasRemoteInclude(source: string): boolean {
  return /^\s*!include(?:url)?\s+<?\s*https?:/im.test(source)
}

function dirname(key: string): string {
  const i = key.lastIndexOf('/')
  return i < 0 ? '' : key.slice(0, i)
}

// Resolve a relative spec (`./x.puml`, `../y.puml`, `x.puml`) against a file's dir → a map key (no ext).
function joinDir(dir: string, rel: string): string {
  const parts = dir ? dir.split('/') : []
  for (const seg of rel.replace(/\.puml$/i, '').split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') parts.pop()
    else parts.push(seg)
  }
  return parts.join('/')
}

function stripGuards(text: string): string {
  return text.replace(RELATIVE_GUARD, (_m, ifBranch: string) =>
    ifBranch.replace(/[\r\n]+$/, ''),
  )
}

// A `@startuml…@enduml` (or `@startmindmap`, …) wrapper directive. Some stdlib icon files (edgy, cloudogu,
// cloudinsight, …) wrap their macro/sprite definitions in one so they render standalone in a preview —
// but INLINING such a file into the user's already-open diagram injects a NESTED `@startuml`, which the
// engine rejects with "Syntax Error? (Assumed diagram type: …)". Strip these directives from inlined
// stdlib files. Applied ONLY inside expandFile (never to the user's own top-level source, which keeps its
// real `@startuml`). C4/awslib/azure carry no wrapper, so this is a no-op for them.
const DIAGRAM_WRAPPER = /^\s*@(?:start|end)[a-z]+\b.*$/i
function stripDiagramWrappers(text: string): string {
  return text
    .split('\n')
    .filter((l) => !DIAGRAM_WRAPPER.test(l))
    .join('\n')
}

export interface ExpandResult {
  source: string
  missing: string[] // stdlib keys referenced but absent from the map (→ a comment marks each in output)
}

// Drop line-start comments (`'…`) and blank lines from an INLINED stdlib file. They are semantically
// inert, but the offline TeaVM engine re-preprocesses the whole inlined stdlib on EVERY render — and that
// stdlib is macro-heavy and large (the C4 core alone is ~1956 lines, ~400 of them comments/blanks). Measured
// ~14% faster on a C4 render (2573→2225 ms) with them gone; the cost floor is the macro/variable evaluation,
// which this doesn't touch, so it's a modest-but-free win. Applied ONLY to inlined stdlib files (never the
// user's own source), and only to WHOLE-LINE `'` comments — never a `/'…'/` block delimiter or a mid-line
// apostrophe — so it can't change a diagram's meaning. Exported for the unit test.
//
// CRUCIAL: the drop pattern is `'` NOT followed by `/`. A block-comment CLOSER `'/` also starts with `'`,
// and dropping it leaves the `/'` block comment UNCLOSED — swallowing every later line (macros AND the
// user's diagram) → an empty render. This bit EIP-PlantUML (`/'  EIP Pattern …\n'/` before each macro):
// the whole diagram came out 10×10 blank. `(?!\/)` keeps `'/` so the block still closes. (task 354)
export function stripInertStdlibLines(text: string): string {
  return text
    .split('\n')
    .filter((l) => l.trim() !== '' && !/^\s*'(?!\/)/.test(l))
    .join('\n')
}

// Expand every `!include <lib/…>` (and the relative includes they pull) against `map`, inlining each
// file ONCE (include-once), stripping the RELATIVE_INCLUDE guards, and dropping remote includes. Returns
// the expanded source + the list of any missing keys (so the caller can surface a precise note).
export function expandStdlibIncludes(
  source: string,
  map: StdlibMap,
): ExpandResult {
  const seen = new Set<string>()
  const missing: string[] = []

  const expandFile = (key: string): string => {
    if (seen.has(key)) return '' // include-once (the libs re-include shared bases; guarded internally too)
    seen.add(key)
    const text = map[key]
    // Strip inert comment/blank lines from the inlined stdlib (perf; see stripInertStdlibLines). Done on
    // the RAW file text BEFORE processLines so the `' [vmarkd: …]` breadcrumbs processLines inserts for
    // remote/missing includes (also `'`-comments) survive. Nested includes are stripped by their own
    // expandFile.
    if (text != null)
      return processLines(
        stripInertStdlibLines(stripGuards(stripDiagramWrappers(text))),
        dirname(key),
      )
    // Not vendored directly — synthesize a per-category `<lib/Cat/all>` aggregator on the fly (task 136):
    // upstream's `all.puml` is EXACTLY the concatenation of the category's direct-child icon files
    // (verified: same macros/sprites, no category-level glue), so we DON'T ship the redundant ~3.4 MB of
    // aggregators — we rebuild `all` from the individual icons we already vendor. Each child goes through
    // expandFile so include-once still holds (`all` + an individual icon → the icon inlined once).
    if (key.slice(key.lastIndexOf('/') + 1) === 'all') {
      const prefix = `${dirname(key)}/`
      const children = Object.keys(map)
        .filter(
          (k) => k.startsWith(prefix) && !k.slice(prefix.length).includes('/'),
        )
        .sort()
      if (children.length) return children.map((k) => expandFile(k)).join('\n')
    }
    // A key holding a PlantUML VARIABLE (`<material2.1.19/$icon>`, domainstory's per-icon include)
    // can never be resolved here — this expander is textual and runs before the engine, so `$icon`
    // is still a procedure parameter. Inline the WHOLE library instead: the include is not
    // load-bearing (the caller's own `%set_variable_value($var, "$ma_" + $icon)` runs regardless),
    // so every icon draws as soon as its sprite exists. Only viable because the vendored map is a
    // trimmed one — see STDLIB_FILES/material in plantuml-render.ts (task 384). Not "missing":
    // nothing is, once the whole set is in.
    if (key.includes('$')) {
      const prefix = `${key.slice(0, key.indexOf('/') + 1)}`
      const all = Object.keys(map)
        .filter((k) => k.startsWith(prefix))
        .sort()
      if (all.length) return all.map((k) => expandFile(k)).join('\n')
    }
    missing.push(key)
    return `' [vmarkd: stdlib file not found offline: <${key}>]`
  }

  const processLines = (text: string, dir: string): string => {
    const out: string[] = []
    for (const line of text.split(/\r?\n/)) {
      const stdlib = STDLIB_INCLUDE.exec(line)
      if (stdlib) {
        out.push(expandFile(stdlib[1].trim().replace(/\.puml$/i, '')))
        continue
      }
      if (REMOTE_INCLUDE.test(line)) {
        out.push("' [vmarkd: remote include skipped offline]")
        continue
      }
      const rel = RELATIVE_INCLUDE.exec(line)
      if (rel && !/^https?:/i.test(rel[1])) {
        out.push(expandFile(joinDir(dir, rel[1])))
        continue
      }
      out.push(line)
    }
    return out.join('\n')
  }

  // Top-level user source: its stdlib includes carry their own lib dir; there is no ambient dir here.
  return { source: processLines(stripGuards(source), ''), missing }
}
