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

export interface ExpandResult {
  source: string
  missing: string[] // stdlib keys referenced but absent from the map (→ a comment marks each in output)
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
    if (text == null) {
      missing.push(key)
      return `' [vmarkd: stdlib file not found offline: <${key}>]`
    }
    return processLines(stripGuards(text), dirname(key))
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
