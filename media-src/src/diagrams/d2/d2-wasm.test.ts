import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url))

// Boot the vendored compile-only WASM in an isolated vm context and return window.d2compile.
function bootCompile(): (src: string) => any {
  const wasmExec = readFileSync(r('../../../vendor/d2/wasm_exec.js'), 'utf8')
  const wasm = readFileSync(r('../../../vendor/d2/d2-compile.wasm'))
  const ctx: any = {
    TextEncoder,
    TextDecoder,
    crypto,
    performance,
    console,
    fetch,
    Date,
    Math,
    Object,
    Array,
    JSON,
    Uint8Array,
    Reflect,
    WebAssembly,
  }
  ctx.globalThis = ctx
  // TinyGo's wasm_exec.js exports `Go` onto `global`/`window`/`self` (it predates the globalThis
  // convention Go's own wasm_exec uses), so the isolated vm context must expose one — point `global`
  // at the context. Without it the loader throws "cannot export Go".
  ctx.global = ctx
  vm.createContext(ctx)
  vm.runInContext(wasmExec, ctx)
  const go = new ctx.Go()
  return { go, wasm, ctx } as any
}

describe('d2 compile-only wasm (node smoke)', () => {
  let compile: (src: string) => any
  it('boots and compiles a->b into a graph with 2 shapes + 1 edge', async () => {
    const { go, wasm, ctx }: any = bootCompile()
    const { instance } = await WebAssembly.instantiate(wasm, go.importObject)
    go.run(instance) // do NOT await
    await new Promise((res) => setTimeout(res, 80))
    compile = ctx.d2compile
    const out = compile('a -> b')
    expect(out.error).toBeUndefined()
    const graph = JSON.parse(out.graph)
    expect(graph.shapes.length).toBe(2)
    expect(graph.edges.length).toBe(1)
    expect(graph.edges[0].dstArrow).toBe(true)
    expect(graph.sequence).toBe(false)
  })

  it('flags a top-level sequence_diagram on the graph', () => {
    const out = compile('shape: sequence_diagram\nalice -> bob: hi')
    expect(out.error).toBeUndefined()
    expect(JSON.parse(out.graph).sequence).toBe(true)
  })

  it('emits a circle shape + container nesting + grid flag', () => {
    const circle = JSON.parse(compile('x: {shape: circle}').graph)
    expect(circle.shapes[0].shape).toBe('circle')

    const nested = JSON.parse(compile('box: {\n  a -> b\n}').graph)
    expect(nested.shapes.find((s: any) => s.id === 'box.a')?.container).toBe(
      'box',
    )

    const grid = JSON.parse(compile('grid: {grid-rows: 2; a;b;c;d}').graph)
    expect(grid.shapes.find((s: any) => s.id === 'grid')?.special.isGrid).toBe(
      true,
    )
  })

  it('returns { error } for invalid d2 (never throws)', () => {
    const out = compile('a ->')
    expect(out.error).toBeTruthy()
  })

  it('marshals root + per-container direction (task 127)', () => {
    const graph = JSON.parse(
      compile('direction: right\na -> b\nc: {\n  direction: up\n  x -> y\n}')
        .graph,
    )
    expect(graph.direction).toBe('right')
    expect(graph.shapes.find((s: any) => s.id === 'c')?.direction).toBe('up')
    // a plain graph emits no direction field (omitempty)
    expect(JSON.parse(compile('a -> b').graph).direction).toBeUndefined()
  })

  it('marshals arrowhead shapes + labels per end (task 128)', () => {
    const graph = JSON.parse(
      compile(
        'a -> b: {\n  source-arrowhead: 1 { shape: cf-one }\n  target-arrowhead: * { shape: cf-many }\n}\np -> q: { target-arrowhead.shape: diamond }\nm -> n',
      ).graph,
    )
    const ab = graph.edges.find((e: any) => e.src === 'a')
    expect(ab.srcArrowhead).toEqual({ shape: 'cf-one', label: '1' })
    expect(ab.dstArrowhead).toEqual({ shape: 'cf-many', label: '*' })
    const pq = graph.edges.find((e: any) => e.src === 'p')
    expect(pq.dstArrowhead?.shape).toBe('diamond')
    expect(pq.srcArrowhead).toBeUndefined()
    // a plain edge carries no arrowhead objects (falls back to the booleans)
    const mn = graph.edges.find((e: any) => e.src === 'm')
    expect(mn.srcArrowhead).toBeUndefined()
    expect(mn.dstArrowhead).toBeUndefined()
  })

  it('resolves the filled-* arrowhead variant from style.filled (task 128)', () => {
    const graph = JSON.parse(
      compile(
        'a -> b: { target-arrowhead: { shape: diamond; style.filled: true } }',
      ).graph,
    )
    expect(graph.edges[0].dstArrowhead?.shape).toBe('filled-diamond')
  })

  it('marshals connection style: stroke/dash/width/opacity/animated (task 124 #1)', () => {
    const e = JSON.parse(
      compile(
        'a -> b: { style: { stroke: red; stroke-width: 4; stroke-dash: 3; opacity: 0.5; animated: true } }',
      ).graph,
    ).edges[0]
    expect(e.stroke).toBe('red')
    expect(e.strokeWidth).toBe('4')
    expect(e.strokeDash).toBe('3')
    expect(e.opacity).toBe('0.5')
    expect(e.animated).toBe(true)
    // an unstyled edge carries none (renderer keeps the theme default)
    const plain = JSON.parse(compile('a -> b').graph).edges[0]
    expect(plain.stroke).toBeUndefined()
    expect(plain.animated).toBeFalsy()
  })

  it('marshals tooltip / link / icon (task 124 #3/#5)', () => {
    const graph = JSON.parse(
      compile(
        'a: { tooltip: hi there; link: https://x.com }\nb: { shape: image; icon: https://x.com/i.png }',
      ).graph,
    )
    const a = graph.shapes.find((s: any) => s.id === 'a')
    expect(a.tooltip).toBe('hi there')
    expect(a.link).toBe('https://x.com')
    const b = graph.shapes.find((s: any) => s.id === 'b')
    expect(b.shape).toBe('image')
    expect(b.icon).toBe('https://x.com/i.png')
  })

  it("marshals block-string language: |md| -> text shape with language 'markdown' (task 154)", () => {
    const graph = JSON.parse(
      compile(
        'note: |md\n# Heading\n- **bold** point\n|\nplain: hello\nsnippet: |go\nfunc main() {}\n|',
      ).graph,
    )
    const note = graph.shapes.find((s: any) => s.id === 'note')
    // d2 promotes a |md| block-string label to shape:text + Language "markdown"
    // (compile.go: obj.Language == "markdown" -> obj.Shape.Value = ShapeText).
    expect(note.shape).toBe('text')
    expect(note.language).toBe('markdown')
    expect(note.label).toContain('# Heading')
    // A plain label carries NO language (omitempty) — the md branch must not trigger.
    const plainShape = graph.shapes.find((s: any) => s.id === 'plain')
    expect(plainShape.language).toBeUndefined()
    // A code block string keeps its language tag (future use), not 'markdown' —
    // d2 expands short aliases (ShortToFullLanguageAliases: go->golang, md->markdown).
    const snippet = graph.shapes.find((s: any) => s.id === 'snippet')
    expect(snippet.language).toBe('golang')
  })

  it('keeps a code shape’s block-string language for syntax highlighting', () => {
    const graph = JSON.parse(compile('snippet: |go\nfunc main() {}\n|').graph)
    const snippet = graph.shapes.find((s: any) => s.id === 'snippet')

    expect(snippet.shape).toBe('code')
    expect(snippet.language).toBe('golang')
  })

  it('marshals sql_table column FK endpoints as indices (task 133)', () => {
    const graph = JSON.parse(
      compile(
        'users: { shape: sql_table; id: int {constraint: primary_key}; name: string }\norders: { shape: sql_table; id: int; user_id: int {constraint: foreign_key} }\norders.user_id -> users.id',
      ).graph,
    )
    const fk = graph.edges[0]
    expect(fk.src).toBe('orders') // endpoint is the TABLE node, not orders.user_id
    expect(fk.dst).toBe('users')
    expect(fk.srcColumnIndex).toBe(1) // user_id is the 2nd column of orders
    expect(fk.dstColumnIndex).toBe(0) // id is the 1st column of users
  })

  // --- task 159 export batch: every field below is EXPORTED (present in the JSON); the RENDER of
  // each lands in its consumer task (121/129/130/134/135). These assert the contract, not the paint.
  it('exports shape effects: 3d/multiple/shadow/double-border/fill-pattern (task 159 → 121)', () => {
    const s = JSON.parse(
      compile(
        'x: { style: { 3d: true; shadow: true; multiple: true; double-border: true; fill-pattern: dots } }',
      ).graph,
    ).shapes[0]
    expect(s.threeD).toBe(true)
    expect(s.shadow).toBe(true)
    expect(s.multiple).toBe(true)
    expect(s.doubleBorder).toBe(true)
    expect(s.fillPattern).toBe('dots')
  })

  it('exports shape text styles: font-size/font/underline/text-transform (task 159 → 129)', () => {
    const s = JSON.parse(
      compile(
        'y: hi { style: { font-size: 20; font: mono; underline: true; text-transform: uppercase } }',
      ).graph,
    ).shapes[0]
    expect(s.fontSize).toBe('20')
    expect(s.font).toBe('mono')
    expect(s.underline).toBe(true)
    expect(s.textTransform).toBe('uppercase')
  })

  it('exports explicit dimensions + absolute pin (task 159 → 130)', () => {
    const dim = JSON.parse(compile('z: { width: 200; height: 100 }').graph)
      .shapes[0]
    expect(dim.width).toBe('200')
    expect(dim.height).toBe('100')
    const pin = JSON.parse(
      compile('w.top: 50\nw.left: 60\nw: hi').graph,
    ).shapes.find((x: any) => x.id === 'w')
    expect(pin.top).toBe('50')
    expect(pin.left).toBe('60')
  })

  it('exports label/icon/tooltip near positions (task 159 → 134)', () => {
    const label = JSON.parse(
      compile('a: hi { label.near: outside-top-left }').graph,
    ).shapes[0]
    // labelPosition reads Attributes.LabelPosition (the source keyword), NOT the layout-resolved
    // Object.LabelPosition *string that shadows it (that stays nil in the compile-only pipeline).
    expect(label.labelPosition).toBe('outside-top-left')
    const icon = JSON.parse(
      compile('a: hi { icon: https://x/i.png; icon.near: top-right }').graph,
    ).shapes[0]
    expect(icon.iconPosition).toBe('top-right')
    const tip = JSON.parse(
      compile('a: hi { tooltip: yo; tooltip.near: top-center }').graph,
    ).shapes[0]
    expect(tip.tooltipPosition).toBe('top-center')
  })

  it('exports iconStyle + grid gaps (task 159 → 134/135)', () => {
    const icon = JSON.parse(
      compile('a: hi { icon: https://x/i.png; icon.style.opacity: 0.4 }').graph,
    ).shapes[0]
    expect(icon.iconStyle?.opacity).toBe('0.4')
    const grid = JSON.parse(
      compile(
        'g: { grid-rows: 2; grid-gap: 40; vertical-gap: 10; horizontal-gap: 20; a; b }',
      ).graph,
    ).shapes.find((x: any) => x.id === 'g')
    expect(grid.special.gridGap).toBe('40')
    expect(grid.special.verticalGap).toBe('10')
    expect(grid.special.horizontalGap).toBe('20')
  })

  it('exports connection-label text styling from e.Style (task 159 → 129)', () => {
    const e = JSON.parse(
      compile(
        'a -> b: hi { style: { font-color: red; font-size: 18; bold: true; italic: true; underline: true; border-radius: 8 } }',
      ).graph,
    ).edges[0]
    expect(e.fontColor).toBe('red')
    expect(e.fontSize).toBe('18')
    expect(e.bold).toBe(true)
    expect(e.italic).toBe(true)
    expect(e.underline).toBe(true)
    expect(e.borderRadius).toBe('8') // connection corner rounding (→ task 135)
  })

  it('omits every task-159 field on a plain shape/edge (omitempty — no regression)', () => {
    const plainShape = JSON.parse(compile('a: hi').graph).shapes[0]
    for (const k of [
      'threeD',
      'shadow',
      'multiple',
      'doubleBorder',
      'fillPattern',
      'fontSize',
      'font',
      'underline',
      'textTransform',
      'width',
      'height',
      'top',
      'left',
      'labelPosition',
      'iconPosition',
      'tooltipPosition',
      'iconStyle',
    ]) {
      expect(plainShape[k], `plain shape must not carry ${k}`).toBeUndefined()
    }
    const plainEdge = JSON.parse(compile('a -> b').graph).edges[0]
    for (const k of [
      'fontColor',
      'fontSize',
      'bold',
      'italic',
      'underline',
      'borderRadius',
    ]) {
      expect(plainEdge[k], `plain edge must not carry ${k}`).toBeUndefined()
    }
  })

  it('exports source-level vars.d2-config (task 159 → 132)', () => {
    // d2compiler.Compile returns the config as its 2nd value (previously discarded); the entrypoint
    // now marshals its scalar fields onto graph.config.
    const cfg = JSON.parse(
      compile(
        'vars: { d2-config: { sketch: true; theme-id: 200; dark-theme-id: 201; pad: 50; center: true; layout-engine: elk } }\na -> b',
      ).graph,
    ).config
    expect(cfg.sketch).toBe(true)
    expect(cfg.themeID).toBe(200)
    expect(cfg.darkThemeID).toBe(201)
    expect(cfg.pad).toBe(50)
    expect(cfg.center).toBe(true)
    expect(cfg.layoutEngine).toBe('elk')
    // a graph with no vars.d2-config carries no config field (omitempty)
    expect(JSON.parse(compile('a -> b').graph).config).toBeUndefined()
  })
})
