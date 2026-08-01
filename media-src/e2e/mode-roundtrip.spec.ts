import { test, expect } from './coverage-fixture'

// Task 453 — migrated from test/vscode-e2e/mode-roundtrip.spec.ts (NET/task 190 P0): switching
// edit modes must not corrupt or lose content (J16). See mode-roundtrip-harness.ts's header for
// why the fixture and round-trip logic port unchanged (pure Vditor + Lute, no host API).
const ANCHORS = [
  'ALPHA',
  'BRAVO',
  'ZULU',
  'Alpha',
  'Beta',
  'const answer = 42',
  'First bullet',
  'Step one',
]

test('ir → wysiwyg → sv → ir preserves the document (round-trip is byte-stable)', async ({
  page,
}) => {
  await page.goto('/mode-roundtrip.html')
  await page.waitForFunction(() => (window as any).__ready === true)

  const getValue = () =>
    page.evaluate(
      () => (window as any).vditor.getValue() as string,
    ) as Promise<string>

  const switchMode = async (mode: string) => {
    await page.evaluate((m) => (window as any).__switchMode(m), mode)
    await page.waitForTimeout(600)
  }

  const ir0 = await getValue()
  await switchMode('wysiwyg')
  const wy = await getValue()
  await switchMode('sv')
  const sv = await getValue()
  await switchMode('ir')
  const ir1 = await getValue()
  // eslint-disable-next-line no-console
  console.log(
    `[mode-roundtrip] len ir0=${ir0.length} wy=${wy.length} sv=${sv.length} ir1=${ir1.length} identical=${ir0 === ir1}`,
  )

  // Content survives every hop (no block dropped mid round-trip).
  for (const a of ANCHORS) {
    expect(wy.includes(a), `wysiwyg keeps: ${a}`).toBe(true)
    expect(sv.includes(a), `sv keeps: ${a}`).toBe(true)
    expect(ir1.includes(a), `back-in-ir keeps: ${a}`).toBe(true)
  }
  // The round-trip returns to the exact original IR serialization — the no-drift guarantee.
  expect(ir1, 'ir → wysiwyg → sv → ir is byte-stable').toBe(ir0)
})
