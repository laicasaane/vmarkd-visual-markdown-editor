import { describe, expect, it } from 'vitest'
import {
  expandStdlibIncludes,
  hasRemoteInclude,
  needsStdlib,
  type StdlibMap,
} from './plantuml-stdlib'

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

  it('records a missing stdlib file (referenced but absent) and marks it in output', () => {
    const { source, missing } = expandStdlibIncludes(
      '!include <awslib/DoesNotExist>',
      {},
    )
    expect(missing).toEqual(['awslib/DoesNotExist'])
    expect(source).toContain('stdlib file not found offline')
  })

  it('leaves a plain diagram (no stdlib includes) untouched', () => {
    const src = '@startuml\nAlice -> Bob: Hi\n@enduml'
    expect(expandStdlibIncludes(src, {}).source).toBe(src)
  })
})
