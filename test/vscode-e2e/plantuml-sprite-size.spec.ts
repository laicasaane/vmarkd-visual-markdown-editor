// Task 354/355 — a BITMAP-sprite PlantUML diagram must never be scaled above its intrinsic size.
//
// Why this exists: `main.css` boosts small PlantUML to `min-width:300px` so a short sequence diagram
// isn't tiny. Vectors upscale cleanly, but the stdlib icon libraries (k8s/aws/azure — task 136/354)
// emit bitmap `<image>` sprites, and boosting those stretched and blurred them (user: "za duże,
// sprity porozciągane"). Task 354 scoped the boost to `svg:not(:has(image))`.
//
// That fix had NO regression guard: the sizing net (`diagram-width.spec.ts`) measures
// `all-renderers.md`, which contains exactly one PlantUML block — a pure-vector sequence. There was
// no sprite diagram in ANY fixture, so nothing would have caught the regression that produced 355.
//
// Deliberately NOT asserted here: the boost VALUE (300px) and the resulting vector scale factor.
// Those are exactly what task 355 is re-deciding by eye; pinning them would cement a number under
// review. What is asserted is the part 354 settled and that is not a matter of taste — upscaling a
// bitmap degrades it — plus the column-fit invariant.
//   node build.mjs && xvfb-run -a npx playwright test plantuml-sprite-size.spec.ts
import path from 'node:path'
import { expect, test } from 'vscode-test-playwright'

const FIXTURE = path.join(__dirname, 'fixtures', 'plantuml-sprite-size.md')

function wf(workbox: import('@playwright/test').Page) {
  return workbox
    .frameLocator('iframe.webview')
    .frameLocator('iframe[title="vMarkd"], #active-frame')
}

// PlantUML's TeaVM engine renders cold here, and the sprite diagram additionally pulls the k8s
// stdlib (which transitively loads C4) — ~2s per block on top of the VS Code boot.
test.setTimeout(180_000)

test('a bitmap-sprite plantuml diagram renders at natural size (never upscaled)', async ({
  workbox,
  evaluateInVSCode,
}) => {
  await evaluateInVSCode(
    async (vscode, args) => {
      const [uri] = args as [string]
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
  // Wait for the ACTIVE mode element only. Vditor creates all four mode elements up front and shows
  // one, so a multi-mode locator with .first() can resolve to a hidden one and wait out the timeout.
  await frame.locator('.vditor-ir').first().waitFor({ timeout: 60_000 })
  await frame
    .locator('body')
    .evaluate(() => new Promise((r) => setTimeout(r, 25_000)))

  const m = await frame.locator('body').evaluate(() => {
    const col = Math.round(
      (
        document.querySelector(
          '.vditor-ir__preview, .vditor-wysiwyg__preview, .vditor-preview',
        ) as HTMLElement
      ).getBoundingClientRect().width,
    )
    const svgs = (
      [
        ...document.querySelectorAll(
          '.language-plantuml > svg, code.language-plantuml > svg',
        ),
      ] as SVGSVGElement[]
    ).filter((s) => s.getBoundingClientRect().width > 0)
    const shape = (s: SVGSVGElement) => {
      const r = s.getBoundingClientRect()
      const vb = (s.getAttribute('viewBox') ?? '').split(/[ ,]+/).map(Number)
      return {
        sprite: !!s.querySelector('image'),
        w: Math.round(r.width),
        h: Math.round(r.height),
        vbW: vb.length === 4 ? Math.round(vb[2]) : null,
        vbH: vb.length === 4 ? Math.round(vb[3]) : null,
      }
    }
    return { col, svgs: svgs.map(shape) }
  })
  // eslint-disable-next-line no-console
  console.log(`[plantuml-sprite-size] ${JSON.stringify(m)}`)

  const sprite = m.svgs.find((s) => s.sprite)
  const vector = m.svgs.find((s) => !s.sprite)

  // The fixture itself is part of the guard: if the icon library ever stops emitting <image>, this
  // spec would silently stop testing anything.
  expect(sprite, 'no sprite (<image>) plantuml svg rendered').toBeDefined()
  expect(vector, 'no pure-vector plantuml svg rendered').toBeDefined()
  expect(sprite?.vbW ?? 0).toBeGreaterThan(0)

  // THE GUARD: a bitmap sprite diagram is never scaled up. Allow 2% for sub-pixel layout rounding.
  const scale = (sprite?.w ?? 0) / (sprite?.vbW ?? 1)
  expect(
    scale,
    `sprite plantuml upscaled ${scale.toFixed(2)}x (${sprite?.vbW}px -> ${sprite?.w}px) — the min-width boost must exclude svg:has(image)`,
  ).toBeLessThanOrEqual(1.02)

  // Neither diagram may overflow the text column.
  expect(sprite?.w ?? 9999).toBeLessThanOrEqual(m.col + 1)
  expect(vector?.w ?? 9999).toBeLessThanOrEqual(m.col + 1)
})
