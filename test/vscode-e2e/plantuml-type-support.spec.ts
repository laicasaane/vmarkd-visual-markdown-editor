import { wf } from './webview-helpers'
// PlantUML diagram-type support matrix regression (task 137). Our vendored TeaVM engine (js-plantuml
// 1.2026.6) is a SUBSET of full PlantUML — some types (ditaa, math/latex, salt, chen ER, nwdiag) aren't
// compiled in. This test LOCKS which types render offline: it feeds one minimal example of each through
// the ACTUAL engine in the real VS Code webview and asserts the supported set renders a real diagram
// (geometry + expected label, no error text) while the unsupported set renders the engine's loud
// "not supported / Syntax Error" card. It complements plantuml.spec.ts (which proves the full app
// render PATH for one block); this proves TYPE COVERAGE.
//
// Measured in ISOLATION — a fresh cache-busted engine import per type — on purpose: the engine carries
// sticky diagram-TYPE state across renders (task 347), so a single multi-block fixture would flake
// ("Assumed diagram type: sequence"). Fresh statics per type make the run deterministic. This still
// exercises the real vendored engine under the real webview CSP/resource pipeline (not the harness).
// The doc/table lives in docs/plantuml-type-support.md; if source.json bumps and this fails, update both.
import path from 'node:path'
import { expect, test } from 'vscode-test-playwright'

const FIXTURE = path.join(__dirname, 'fixtures', 'all-renderers.md')

// A representative supported type per family — each with a distinctive label proving the type actually
// rendered (not just "some svg"). Kept a subset of the full 19 (docs/plantuml-type-support.md) so the
// run stays quick; expand if a regression needs pinning.
const SUPPORTED: Array<{ key: string; src: string; label: string }> = [
  {
    key: 'sequence',
    label: 'Hello',
    src: '@startuml\nAlice -> Bob : Hello\nBob --> Alice : Hi\n@enduml',
  },
  {
    key: 'class',
    label: 'Foo',
    src: '@startuml\nclass Foo {\n +bar()\n}\nFoo --> Bar\n@enduml',
  },
  {
    key: 'object',
    label: 'Alice',
    src: '@startuml\nobject Alice\nobject Bob\nAlice : age = 30\n@enduml',
  },
  {
    key: 'activity-beta',
    label: 'process',
    src: '@startuml\nstart\n:Read input;\nif (ok?) then (yes)\n:process;\nelse (no)\n:abort;\nendif\nstop\n@enduml',
  },
  {
    key: 'component',
    label: 'First Component',
    src: '@startuml\n[First Component] --> [Second Component]\n@enduml',
  },
  {
    key: 'deployment',
    label: 'Server',
    src: '@startuml\nnode Server\ndatabase DB\nServer --> DB\n@enduml',
  },
  {
    key: 'state',
    label: 'Running',
    src: '@startuml\n[*] --> Idle\nIdle --> Running : go\nRunning --> [*]\n@enduml',
  },
  {
    key: 'timing',
    label: 'Waiting',
    src: '@startuml\nrobust "Web Browser" as WB\nconcise "Web User" as WU\n@0\nWU is Idle\nWB is Idle\n@100\nWU is Waiting\n@enduml',
  },
  {
    key: 'gantt',
    label: 'Prototype',
    src: "@startgantt\n[Prototype] lasts 10 days\n[Test] lasts 5 days\n[Test] starts at [Prototype]'s end\n@endgantt",
  },
  {
    key: 'mindmap',
    label: 'Root',
    src: '@startmindmap\n* Root\n** Branch A\n** Branch B\n@endmindmap',
  },
  {
    key: 'wbs',
    label: 'Project',
    src: '@startwbs\n* Project\n** Phase 1\n** Phase 2\n@endwbs',
  },
  {
    key: 'json',
    label: 'Apple',
    src: '@startjson\n{\n "fruit": "Apple",\n "size": "Large"\n}\n@endjson',
  },
  {
    key: 'regex',
    label: 'year',
    src: '@startregex\n(?<year>\\d{4})-(?<month>\\d{2})\n@endregex',
  },
  {
    key: 'ebnf',
    label: 'letter',
    src: '@startebnf\nletter = "a" | "b" | "c";\n@endebnf',
  },
  // The two blockdiag-family types the build DOES include — ONLY via their dedicated @start<type>
  // directive (the @startuml+nwdiag{} wrapper form errors with "use @startnwdiag instead").
  {
    key: 'nwdiag',
    label: 'web01',
    src: '@startnwdiag\nnetwork dmz {\n  web01 [address = "210.10.10.1"];\n  web02 [address = "210.10.10.2"];\n}\n@endnwdiag',
  },
  {
    key: 'packetdiag',
    label: 'Source Port',
    src: '@startpacketdiag\npacketdiag {\n  0-15: Source Port;\n  16-31: Destination Port;\n}\n@endpacketdiag',
  },
]

// Types the build does NOT include — must render the engine's loud error card, not a real diagram.
// `blockdiag` stands in for the rest of the blockdiag family (blockdiag/seqdiag/actdiag/rackdiag are
// all "not recognized"; only nwdiag + packetdiag above are compiled in).
const UNSUPPORTED: Array<{ key: string; src: string }> = [
  { key: 'chen-er', src: '@startchen\nentity Person {\n name\n}\n@endchen' },
  {
    key: 'salt',
    src: '@startsalt\n{\n Login | "MyName"\n [Cancel] | [ OK ]\n}\n@endsalt',
  },
  {
    key: 'ditaa',
    src: '@startditaa\n+--------+\n| Hello  |\n+--------+\n@endditaa',
  },
  { key: 'math', src: '@startmath\nf(t)=(a_0)/2 + sum_(n=1)^oo a_n\n@endmath' },
  {
    key: 'blockdiag',
    src: '@startblockdiag\nblockdiag {\n  A -> B -> C;\n}\n@endblockdiag',
  },
]

// The engine's two loud "this type isn't in the build" shapes: an unknown @start… directive card, or a
// Syntax Error card (recognised @startuml, unknown inner keyword).
const ERROR_SIGNAL =
  /Diagram not supported by this release|is not recognized|Syntax Error|Assumed diagram type/i

test('PlantUML offline type-support matrix (supported render, unsupported fail loudly)', async ({
  workbox,
  evaluateInVSCode,
}) => {
  test.setTimeout(180_000)
  await evaluateInVSCode(
    async (vscode, args) => {
      const [uri] = args as [string]
      await vscode.commands.executeCommand('workbench.action.closeAllEditors')
      await vscode.extensions.getExtension('spiochacz.vmarkd')?.activate()
      await vscode.commands.executeCommand(
        'vscode.openWith',
        vscode.Uri.file(uri),
        'vmarkd.editor',
      )
    },
    [FIXTURE] as [string],
  )
  const frame = wf(workbox)
  await frame.locator('.vditor-ir').first().waitFor({ timeout: 60_000 })
  // The fixture's own plantuml block rendering guarantees viz-global.js (class/component/state layout
  // via Viz.js) + the engine are loaded and window.__vmarkdCdn is set before we probe.
  await frame
    .locator('.vditor-ir__preview .language-plantuml svg')
    .first()
    .waitFor({ timeout: 60_000 })
  await frame
    .locator('body')
    .evaluate(() => new Promise((r) => setTimeout(r, 1000)))

  const report = await frame.locator('body').evaluate(
    async (_el, types) => {
      const { supported, unsupported } = types as {
        supported: Array<{ key: string; src: string; label: string }>
        unsupported: Array<{ key: string; src: string }>
      }
      const cdn =
        (window as unknown as { __vmarkdCdn?: string }).__vmarkdCdn || ''
      const pumlUrl = `${cdn}/dist/js/plantuml/plantuml.js`
      const waitForSvg = (host: HTMLElement, ms: number) =>
        new Promise<void>((resolve) => {
          if (host.querySelector('svg')) return resolve()
          const obs = new MutationObserver(() => {
            if (host.querySelector('svg')) {
              obs.disconnect()
              resolve()
            }
          })
          obs.observe(host, { childList: true, subtree: true })
          setTimeout(() => {
            obs.disconnect()
            resolve()
          }, ms)
        })
      let rev = 500000
      const renderOne = async (key: string, src: string) => {
        rev += 1
        const host = document.createElement('div')
        host.id = `matrix-${key}-${rev}`
        host.style.cssText = 'position:absolute;left:-99999px;top:0'
        document.body.appendChild(host)
        let hasSvg = false
        let text = ''
        let geometry = 0
        // Fresh module per type → fresh statics → task-347 sticky type state can't leak between types.
        const mod = (await import(
          /* @vite-ignore */ `${pumlUrl}?rev=matrix${rev}`
        )) as {
          render: (lines: string[], targetId: string) => void
        }
        mod.render(src.split(/\r\n|\r|\n/), host.id)
        await waitForSvg(host, 12000)
        const svg = host.querySelector('svg')
        hasSvg = !!svg
        if (svg) {
          text = Array.from(svg.querySelectorAll('text'))
            .map((t) => t.textContent ?? '')
            .join(' | ')
          geometry = svg.querySelectorAll(
            'path, line, polygon, ellipse, rect',
          ).length
        }
        host.remove()
        return { key, hasSvg, text, geometry }
      }
      const sup = []
      for (const s of supported) sup.push(await renderOne(s.key, s.src))
      const uns = []
      for (const u of unsupported) uns.push(await renderOne(u.key, u.src))
      return { cdn, sup, uns }
    },
    { supported: SUPPORTED, unsupported: UNSUPPORTED },
  )

  // eslint-disable-next-line no-console
  console.log(`[puml-matrix] cdn=${report.cdn}`)
  for (const r of [...report.sup, ...report.uns]) {
    // eslint-disable-next-line no-console
    console.log(`[puml-matrix] ${JSON.stringify(r)}`)
  }

  // Supported: a real diagram — svg present, geometry drawn, expected label, and NOT an error card.
  for (const want of SUPPORTED) {
    const got = report.sup.find((r) => r.key === want.key)
    expect(got, `${want.key} produced a result`).toBeTruthy()
    expect(got?.hasSvg, `${want.key} rendered an <svg>`).toBe(true)
    expect(got?.geometry ?? 0, `${want.key} drew geometry`).toBeGreaterThan(0)
    expect(
      ERROR_SIGNAL.test(got?.text ?? ''),
      `${want.key} is NOT an error card`,
    ).toBe(false)
    expect(
      (got?.text ?? '').includes(want.label),
      `${want.key} shows its label "${want.label}"`,
    ).toBe(true)
  }
  // Unsupported: the engine's loud error card (never a silent blank, never a real diagram).
  for (const u of UNSUPPORTED) {
    const got = report.uns.find((r) => r.key === u.key)
    expect(got?.hasSvg, `${u.key} rendered an <svg> (the error card)`).toBe(
      true,
    )
    expect(
      ERROR_SIGNAL.test(got?.text ?? ''),
      `${u.key} is the loud "not supported"/syntax-error card`,
    ).toBe(true)
  }
})
