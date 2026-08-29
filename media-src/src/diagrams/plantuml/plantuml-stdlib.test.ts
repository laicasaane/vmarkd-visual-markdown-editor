import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  expandStdlibIncludes,
  hasRemoteInclude,
  needsStdlib,
  type StdlibMap,
  stripInertStdlibLines,
} from './plantuml-stdlib'

// Load a REAL vendored lib file-map (media-src/vendor/plantuml-stdlib/<lib>.js merges a JSON literal onto
// window.__vmdePumlStdlib) so the task-354 tests exercise the actual packed bytes, not a hand-made map.
const VENDOR_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'vendor',
  'plantuml-stdlib',
)
function loadVendoredMap(jsFile: string): StdlibMap {
  const js = readFileSync(path.join(VENDOR_DIR, jsFile), 'utf8')
  const m = js.match(
    /Object\.assign\(window\.__vmdePumlStdlib\|\|\{\},([\s\S]*)\);\s*$/,
  )
  if (!m) throw new Error(`cannot parse vendored map ${jsFile}`)
  return JSON.parse(m[1]) as StdlibMap
}

describe('plantuml-stdlib — detection', () => {
  it('needsStdlib only for angle-bracket <lib/…> includes', () => {
    expect(needsStdlib('@startuml\n!include <C4/C4_Container>\n@enduml')).toBe(
      true,
    )
    expect(needsStdlib('!includeurl <awslib/AWSCommon>')).toBe(true)
    expect(needsStdlib('@startuml\nAlice -> Bob\n@enduml')).toBe(false)
    expect(needsStdlib('!include ./local.puml')).toBe(false) // relative, not stdlib
  })

  it('hasRemoteInclude for http(s) includes (offline-unsupported)', () => {
    expect(hasRemoteInclude('!includeurl https://example.com/x.puml')).toBe(
      true,
    )
    expect(hasRemoteInclude('!include https://example.com/x.puml')).toBe(true)
    expect(hasRemoteInclude('!include <C4/C4_Container>')).toBe(false)
  })
})

describe('plantuml-stdlib — expandStdlibIncludes', () => {
  it('inlines a stdlib file + its dir-relative include (dir-aware)', () => {
    const map: StdlibMap = {
      'C4/C4_Container': '!include ./C4_Context.puml\nContainer_macro',
      'C4/C4_Context': 'Context_macro',
    }
    const { source, missing } = expandStdlibIncludes(
      '@startuml\n!include <C4/C4_Container>\n@enduml',
      map,
    )
    expect(missing).toEqual([])
    expect(source).toContain('Context_macro')
    expect(source).toContain('Container_macro')
    expect(source).not.toContain('!include') // everything resolved
    // order: the relative include expands where it sits (before Container_macro)
    expect(source.indexOf('Context_macro')).toBeLessThan(
      source.indexOf('Container_macro'),
    )
  })

  it('resolves ../ and nested dirs (awslib/Compute/EC2 → ../AWSCommon)', () => {
    const map: StdlibMap = {
      'awslib/Compute/EC2': '!include ../AWSCommon.puml\nEC2_sprite',
      'awslib/AWSCommon': 'AWSCommon_base',
    }
    const { source, missing } = expandStdlibIncludes(
      '!include <awslib/Compute/EC2>',
      map,
    )
    expect(missing).toEqual([])
    expect(source).toContain('AWSCommon_base')
    expect(source).toContain('EC2_sprite')
  })

  it('strips the RELATIVE_INCLUDE guard — keeps the relative branch, drops the remote else', () => {
    const map: StdlibMap = {
      'C4/A': [
        '!if %variable_exists("RELATIVE_INCLUDE")',
        '  !include ./B.puml',
        '!else',
        '  !include https://example.com/B.puml',
        '!endif',
        'A_body',
      ].join('\n'),
      'C4/B': 'B_defaults',
    }
    const { source } = expandStdlibIncludes('!include <C4/A>', map)
    expect(source).toContain('B_defaults') // relative branch taken + inlined
    expect(source).not.toContain('example.com') // remote else dropped
    expect(source).not.toContain('!if') // guard stripped structurally
    expect(source).not.toContain('!else')
    expect(source).toContain('A_body')
  })

  it('drops a bare remote include with a note (offline)', () => {
    const map: StdlibMap = {
      'C4/A': '!includeurl https://example.com/x\nA_body',
    }
    const { source } = expandStdlibIncludes('!include <C4/A>', map)
    expect(source).not.toContain('example.com')
    expect(source).toContain('remote include skipped offline')
    expect(source).toContain('A_body')
  })

  it('include-once: a shared base pulled by two files is inlined only once', () => {
    const map: StdlibMap = {
      'lib/Top': '!include ./A.puml\n!include ./C.puml',
      'lib/A': '!include ./Base.puml\nA_body',
      'lib/C': '!include ./Base.puml\nC_body',
      'lib/Base': 'BASE_ONCE',
    }
    const { source } = expandStdlibIncludes('!include <lib/Top>', map)
    expect(source.match(/BASE_ONCE/g)?.length).toBe(1)
    expect(source).toContain('A_body')
    expect(source).toContain('C_body')
  })

  it("synthesizes <lib/Cat/all> from the category's direct-child icons (aggregator not vendored)", () => {
    const map: StdlibMap = {
      'awslib/Compute/EC2': 'EC2_def',
      'awslib/Compute/Lambda': 'Lambda_def',
      'awslib/Database/RDS': 'RDS_def', // a DIFFERENT category — must not be pulled into Compute/all
    }
    const { source, missing } = expandStdlibIncludes(
      '!include <awslib/Compute/all>',
      map,
    )
    expect(missing).toEqual([]) // synthesized, not missing
    expect(source).toContain('EC2_def')
    expect(source).toContain('Lambda_def')
    expect(source).not.toContain('RDS_def')
  })

  it('synthesized all pulls DIRECT children only (deeper nesting has its own all)', () => {
    const map: StdlibMap = {
      'awslib/Compute/EC2': 'EC2_def',
      'awslib/Compute/Sub/Deep': 'Deep_def',
    }
    const { source } = expandStdlibIncludes(
      '!include <awslib/Compute/all>',
      map,
    )
    expect(source).toContain('EC2_def')
    expect(source).not.toContain('Deep_def')
  })

  it('all + an individual icon inlines the icon ONCE (include-once holds across synthesis)', () => {
    const map: StdlibMap = {
      'awslib/Compute/EC2': 'EC2_ONCE',
      'awslib/Compute/Lambda': 'Lambda_def',
    }
    const { source } = expandStdlibIncludes(
      '@startuml\n!include <awslib/Compute/all>\n!include <awslib/Compute/EC2>\n@enduml',
      map,
    )
    expect(source.match(/EC2_ONCE/g)?.length).toBe(1)
    expect(source).toContain('Lambda_def')
  })

  it('<lib/Cat/all> with no vendored children falls back to the missing note', () => {
    const { source, missing } = expandStdlibIncludes(
      '!include <awslib/Empty/all>',
      {},
    )
    expect(missing).toEqual(['awslib/Empty/all'])
    expect(source).toContain('stdlib file not found offline')
  })

  it('records a missing stdlib file (referenced but absent) and marks it in output', () => {
    const { source, missing } = expandStdlibIncludes(
      '!include <awslib/DoesNotExist>',
      {},
    )
    expect(missing).toEqual(['awslib/DoesNotExist'])
    expect(source).toContain('stdlib file not found offline')
  })

  it('strips @startuml/@enduml wrappers from an inlined file (no nested @startuml), keeps the user’s own', () => {
    const map: StdlibMap = {
      // an icon lib wrapped for standalone preview (edgy/cloudogu/cloudinsight do this)
      'cloudinsight/tomcat': '@startuml\nsprite $tomcat { X }\n@enduml',
    }
    const { source } = expandStdlibIncludes(
      '@startuml\n!include <cloudinsight/tomcat>\nrectangle "<$tomcat>"\n@enduml',
      map,
    )
    // exactly ONE @startuml survives — the user's; the inlined wrapper is gone
    expect(source.match(/@startuml/g)?.length).toBe(1)
    expect(source.match(/@enduml/g)?.length).toBe(1)
    expect(source).toContain('sprite $tomcat { X }') // the actual definition is inlined
  })

  it('leaves a plain diagram (no stdlib includes) untouched', () => {
    const src = '@startuml\nAlice -> Bob: Hi\n@enduml'
    expect(expandStdlibIncludes(src, {}).source).toBe(src)
  })
})

describe('plantuml-stdlib — vendored task-354 lib maps resolve offline', () => {
  // The canonical `!include <lib/…>` each lib documents (from its upstream _examples_) must resolve fully
  // against the REAL vendored map — no `missing` (proves the include chain is self-contained in our set).
  // `merge` = other vendored maps a diagram loads transitively (STDLIB_DEPS mirror — k8s needs c4);
  // `expectMissing` = the only allowed missing keys (an unvendored, guarded-optional dependency).
  const CASES: Array<{
    lib: string
    js: string
    include: string
    key: string
    merge?: string[]
    expectMissing?: string[]
  }> = [
    {
      lib: 'k8s',
      js: 'k8s.js',
      include: '!include <k8s/Common>\n!include <k8s/OSS/KubernetesPod>',
      key: 'k8s/OSS/KubernetesPod',
      merge: ['c4.js'], // k8s/Common builds on <C4/C4> → loaded via STDLIB_DEPS at runtime
    },
    {
      lib: 'eip',
      js: 'eip.js',
      include: '!include <eip/EIP-PlantUML>',
      key: 'eip/EIP-PlantUML',
    },
    {
      lib: 'edgy',
      js: 'edgy.js',
      include: '!include <edgy/edgy2>',
      key: 'edgy/edgy2',
    },
    {
      lib: 'domainstory',
      js: 'domainstory.js',
      include: '!include <DomainStory/domainStory>',
      key: 'DomainStory/domainStory',
      // material2.1.19 sprites are only pulled inside a `!if $icon`-guarded procedure (optional icon
      // feature needing an unvendored 16 MB lib); core DomainStory renders without it.
      expectMissing: ['material2.1.19/$icon'],
    },
    {
      lib: 'cloudogu',
      js: 'cloudogu.js',
      include: '!include <cloudogu/common>\n!include <cloudogu/dogus/jenkins>',
      key: 'cloudogu/dogus/jenkins',
    },
    {
      lib: 'cloudinsight',
      js: 'cloudinsight.js',
      include: '!include <cloudinsight/tomcat>',
      key: 'cloudinsight/tomcat',
    },
    {
      lib: 'kubernetes',
      js: 'kubernetes.js',
      include: '!include <kubernetes/k8s-sprites-unlabeled-25pct>',
      key: 'kubernetes/k8s-sprites-unlabeled-25pct',
    },
  ]
  for (const c of CASES) {
    it(`${c.lib}: canonical include resolves (only guarded-optional deps missing)`, () => {
      const map: StdlibMap = { ...loadVendoredMap(c.js) }
      for (const extra of c.merge ?? [])
        Object.assign(map, loadVendoredMap(extra))
      expect(c.key in map).toBe(true)
      const { missing } = expandStdlibIncludes(
        `@startuml\n${c.include}\n@enduml`,
        map,
      )
      expect(missing).toEqual(c.expectMissing ?? [])
    })
  }

  it('synthesizes <k8s/OSS/all> + <cloudinsight/all> from the vendored icons (aggregator dropped)', () => {
    for (const [js, all, prefix] of [
      ['k8s.js', 'k8s/OSS/all', 'k8s/OSS/'],
      ['cloudinsight.js', 'cloudinsight/all', 'cloudinsight/'],
    ] as const) {
      const map = loadVendoredMap(js)
      expect(all in map).toBe(false) // the redundant aggregator is NOT shipped
      const { source, missing } = expandStdlibIncludes(`!include <${all}>`, map)
      expect(missing).toEqual([]) // synthesized from the direct-child icons
      // a known direct-child icon's text made it into the synthesized output
      const child = Object.keys(map).find(
        (k) => k.startsWith(prefix) && !k.slice(prefix.length).includes('/'),
      ) as string
      // a real definition line (skip the @startuml wrapper — stripped on inline — comments and blanks)
      const defLine = map[child]
        .split('\n')
        .find(
          (l) => l.trim() && !/^\s*@(?:start|end)/i.test(l) && !/^\s*'/.test(l),
        )!
      expect(source).toContain(defLine)
    }
  })

  it('DomainStory keeps its mixed-case prefix (case-sensitive lookup, mirrors PlantUML)', () => {
    const map = loadVendoredMap('domainstory.js')
    expect('DomainStory/domainStory' in map).toBe(true)
    // the lowercased spelling is a different (absent) key — it must be reported missing, not silently found
    const { missing } = expandStdlibIncludes(
      '!include <domainstory/domainStory>',
      map,
    )
    expect(missing).toEqual(['domainstory/domainStory'])
  })

  it("eip: the vendored map's /'…'/ block comments don't swallow trailing user content", () => {
    // Regression: EIP-PlantUML wraps each macro in a `/' EIP Pattern … '/` block; when stripInertStdlibLines
    // dropped the `'/` closer, the block stayed open and ate the macros AND the user's diagram (10×10 blank).
    const map = loadVendoredMap('eip.js')
    const { source } = expandStdlibIncludes(
      '@startuml\n!include <eip/EIP-PlantUML>\nrectangle "PLAIN" as p\n@enduml',
      map,
    )
    expect(source).toContain('PLAIN') // user content after the include is NOT swallowed
    expect(source).toContain('!define Message') // the EIP macros register (their block closed)
  })
})

describe('plantuml-stdlib — stripInertStdlibLines (perf)', () => {
  it('drops line-start comments + blank lines, keeps real statements', () => {
    const input = [
      "' a comment",
      '  ',
      '!procedure $Foo()',
      '',
      "   ' indented comment",
      '!$x = 1',
    ].join('\n')
    expect(stripInertStdlibLines(input)).toBe('!procedure $Foo()\n!$x = 1')
  })

  it('never strips a mid-line apostrophe or a block-comment delimiter (meaning-preserving)', () => {
    // `/'…'/` opener/closer don't start with `'`, and a statement with an inline apostrophe stays.
    const input = [
      "/' block open",
      'Rel(a, b, "it\'s fine")',
      "block close '/",
    ].join('\n')
    expect(stripInertStdlibLines(input)).toBe(input)
  })

  it("keeps a block-comment CLOSER `'/` at LINE START (EIP bug: dropping it left the /' block unclosed)", () => {
    // `'/` starts with `'` but MUST survive — else the /' block never closes and swallows all later code.
    const input = [
      "/' a block",
      '  content',
      "'/",
      '!define Foo() rectangle X',
    ].join('\n')
    const out = stripInertStdlibLines(input)
    expect(out).toContain("'/") // the closer survives
    expect(out).toContain('!define Foo() rectangle X') // code after the block is not swallowed
  })

  it('is applied to INLINED stdlib but leaves the user source comments intact', () => {
    const map: StdlibMap = {
      'C4/A': "' stdlib comment\n\n!define Person(a) rectangle a",
    }
    const { source } = expandStdlibIncludes(
      "' my own comment\n!include <C4/A>\nPerson(u)",
      map,
    )
    // stdlib comment/blank gone…
    expect(source).not.toContain('stdlib comment')
    expect(source).toContain('!define Person(a) rectangle a')
    // …the user's own comment is preserved (only inlined stdlib files are stripped).
    expect(source).toContain("' my own comment")
  })
})

describe('a variable key inlines the whole library (task 384)', () => {
  const map = {
    'material2.1.19/account': 'sprite $ma_account [1x1/16z] {A}',
    'material2.1.19/laptop': 'sprite $ma_laptop [1x1/16z] {B}',
    'other/thing': 'not this one',
  }

  it('inlines every file of the referenced lib when the key holds a $variable', () => {
    const out = expandStdlibIncludes(
      '!include <material2.1.19/$icon>\nPerson(a)',
      map,
    )
    // domainstory cannot tell us WHICH icon at expansion time, so all of them go in…
    expect(out.source).toContain('$ma_account')
    expect(out.source).toContain('$ma_laptop')
    // …and it is not a failure, so nothing is reported missing (the note would be a false alarm).
    expect(out.missing).toEqual([])
    // A different library is not dragged along.
    expect(out.source).not.toContain('not this one')
  })

  it('still reports a variable key whose library was not loaded at all', () => {
    const out = expandStdlibIncludes('!include <nope/$icon>', map)
    expect(out.missing).toEqual(['nope/$icon'])
  })

  it('inlines the set once even when several icons ask for it (include-once)', () => {
    const out = expandStdlibIncludes(
      '!include <material2.1.19/$icon>\n!include <material2.1.19/$icon>',
      map,
    )
    expect(out.source.match(/\$ma_account/g)?.length).toBe(1)
  })
})
