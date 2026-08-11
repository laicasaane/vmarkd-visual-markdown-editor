import { test, expect } from './coverage-fixture'
import type { Page } from '@playwright/test'

// Task 86 — a named mermaid palette (or a content-theme pairing) is injected as mermaid's
// `base` theme + themeVariables, so the diagram renders in that palette. We assert the SVG's
// embedded theme CSS carries the palette's colours (ids stripped — they're per-render random).

function strip(s: string): string {
  return s.replace(/mermaid[A-Za-z0-9_-]+/g, 'ID')
}

async function themeStyle(page: Page): Promise<string> {
  return page.evaluate(() => {
    const svg = (window as any)
      .__el()
      .querySelector(
        '.vditor-ir__preview .language-mermaid svg',
      ) as SVGElement | null
    return svg?.querySelector('style')?.textContent || ''
  })
}

async function waitProcessed(page: Page) {
  await page.waitForFunction(
    () =>
      !!(window as any)
        .__el()
        .querySelector(
          '.vditor-ir__preview .language-mermaid[data-processed="true"] svg',
        ),
    undefined,
    { timeout: 8000 },
  )
}

// Re-render via __applyTheme and wait until the embedded style differs from `prev`.
async function applyAndWait(
  page: Page,
  setting: string | undefined,
  contentTheme: string | undefined,
  mode: 'dark' | 'light',
  prev: string,
): Promise<string> {
  await page.evaluate(([s, c, m]) => (window as any).__applyTheme(s, c, m), [
    setting,
    contentTheme,
    mode,
  ] as const)
  await page.waitForFunction(
    (p) => {
      const svg = (window as any)
        .__el()
        .querySelector(
          '.vditor-ir__preview .language-mermaid svg',
        ) as SVGElement | null
      const s = (svg?.querySelector('style')?.textContent || '').replace(
        /mermaid[A-Za-z0-9_-]+/g,
        'ID',
      )
      return s.length > 0 && s !== p
    },
    strip(prev),
    { timeout: 8000 },
  )
  return themeStyle(page)
}

test.beforeEach(async ({ page }) => {
  await page.goto('/mermaid.html')
  await page.waitForFunction(() => (window as any).__ready === true)
  await waitProcessed(page)
})

test('explicit palette renders the diagram in that palette (task 86)', async ({
  page,
}) => {
  const base = await themeStyle(page)
  expect(base.length).toBeGreaterThan(0)

  // Dracula — its line colour #6272a4 must appear in the rendered theme CSS.
  const dracula = await applyAndWait(page, 'dracula', undefined, 'dark', base)
  expect(strip(dracula)).not.toBe(strip(base))
  expect(dracula.toLowerCase()).toContain('#6272a4')

  // A different palette (nord) yields a different style + carries nord's line #4c566a.
  const nord = await applyAndWait(page, 'nord', undefined, 'dark', dracula)
  expect(strip(nord)).not.toBe(strip(dracula))
  expect(nord.toLowerCase()).toContain('#4c566a')
})

// Mermaid's C4 renderer ignores themeVariables: relationship labels/lines/boundaries come out
// #444444 and EVERY in-box label #FFFFFF (2.0:1 on its own light-blue `component` fill). We repaint
// the C4 SVG after render — box labels against their own box, the rest against the page.
const C4_DOC = [
  '```mermaid',
  'C4Context',
  'System_Boundary(b1, "Boundary") {',
  '  Person(user, "User")',
  '  System(api, "API")',
  '  Container(web, "Web", "React")',
  '  Component(db, "DB", "Postgres")',
  '}',
  'System_Ext(ext, "Ext")',
  'Rel(user, api, "Uses")',
  'BiRel(api, ext, "Talks")',
  '```',
].join('\n')

async function renderC4(
  page: Page,
  setting: string | undefined,
  mode: 'dark' | 'light',
) {
  await page.evaluate(
    ([s, m, doc]) => {
      ;(window as any).__applyTheme(s, undefined, m)
      ;(window as any).vditor.setValue(doc)
    },
    [setting, mode, C4_DOC] as const,
  )
  await page.waitForFunction(
    () =>
      !!document.querySelector(
        '.language-mermaid svg[aria-roledescription="c4"] line',
      ),
    undefined,
    { timeout: 8000 },
  )
  return page.evaluate(() => {
    const svg = document.querySelector(
      '.language-mermaid svg[aria-roledescription="c4"]',
    ) as SVGElement
    const label = (txt: string) =>
      [...svg.querySelectorAll('text')]
        .find((t) => t.textContent === txt)
        ?.getAttribute('fill')
    const boxes = [...svg.querySelectorAll('g > rect[fill], g > path[fill]')]
      .map((el) => el.getAttribute('fill'))
      .filter((fill) => fill && fill !== 'none')
    return {
      // Drawing order is mermaid's (external first); the SET of fills is what we assert on.
      boxes: boxes.sort(),
      userInk: label('User'),
      dbInk: label('DB'),
      extInk: label('Ext'),
      relation: label('Uses'),
      boundary: label('Boundary'),
      line: svg.querySelector('line')?.getAttribute('stroke'),
      arrow: svg.querySelector('marker path')?.getAttribute('fill'),
      // Anything mermaid drew and we failed to repaint still carries its hard-coded default.
      leftovers: [...svg.querySelectorAll('*')].filter((el) =>
        ['#444444', '#444'].includes(
          (el.getAttribute('stroke') ?? '').toLowerCase(),
        ),
      ).length,
    }
  })
}

test('C4 on a dark palette: dark box ramp, white box labels, palette relationships', async ({
  page,
}) => {
  const c4 = await renderC4(page, 'vscode-dark-2026', 'dark')

  expect(c4.boxes).toEqual([
    '#062b50',
    '#083e70',
    '#0d537f',
    '#176a96',
    '#33383b',
  ])
  expect(c4.userInk).toBe('#ffffff')
  expect(c4.dbInk).toBe('#ffffff')
  expect(c4.extInk).toBe('#ffffff')
  expect(c4.relation).toBe('#bbbebf')
  expect(c4.boundary).toBe('#bbbebf')
  expect(c4.line).toBe('#48a0c7')
  expect(c4.arrow).toBe('#48a0c7')
  expect(c4.leftovers).toBe(0)
})

test('C4 on a light palette: canonical fills, ink chosen per box', async ({
  page,
}) => {
  const c4 = await renderC4(page, 'vscode-light-2026', 'light')

  expect(c4.boxes).toEqual([
    '#08427B',
    '#1168BD',
    '#438DD5',
    '#85BBF0',
    '#999999',
  ])
  expect(c4.userInk).toBe('#ffffff')
  // The reported bug: white on #85BBF0 is 2.0:1 — the light-blue box gets dark ink instead.
  expect(c4.dbInk).toBe('#0d1b2a')
  expect(c4.extInk).toBe('#0d1b2a')
  expect(c4.relation).toBe('#202020')
  expect(c4.line).toBe('#0069cc')
  expect(c4.leftovers).toBe(0)
})

// The auto path: no palette at all, so the ONLY dark signal is Vditor's own render theme, which
// reaches the hook as its 2nd argument. `setValue` renders through Vditor's own (light) theme, so
// drive the dark render the way a VS Code flip does — through reRenderMermaid.
test('C4 without a palette on a dark editor: dark ramp, readable relationships', async ({
  page,
}) => {
  await renderC4(page, undefined, 'light')
  await page.evaluate(() =>
    (window as any).__applyTheme(undefined, undefined, 'dark'),
  )
  await page.waitForFunction(
    () =>
      !!document.querySelector(
        '.language-mermaid svg[aria-roledescription="c4"] g > rect[fill="#062b50"]',
      ),
    undefined,
    { timeout: 8000 },
  )

  const c4 = await page.evaluate(() => {
    const svg = document.querySelector(
      '.language-mermaid svg[aria-roledescription="c4"]',
    ) as SVGElement
    const label = (txt: string) =>
      [...svg.querySelectorAll('text')]
        .find((t) => t.textContent === txt)
        ?.getAttribute('fill')
    return {
      userInk: label('User'),
      relation: label('Uses'),
      line: svg.querySelector('line')?.getAttribute('stroke'),
      leftovers: [...svg.querySelectorAll('*')].filter((el) =>
        ['#444444', '#444'].includes(
          (el.getAttribute('stroke') ?? '').toLowerCase(),
        ),
      ).length,
    }
  })
  expect(c4).toEqual({
    userInk: '#ffffff',
    relation: '#d4d4d4',
    line: '#8ab4f8',
    leftovers: 0,
  })
})

test('C4 without a palette still gets readable in-box ink', async ({
  page,
}) => {
  const c4 = await renderC4(page, undefined, 'light')

  expect(c4.boxes).toContain('#85BBF0')
  expect(c4.dbInk).toBe('#0d1b2a')
  expect(c4.userInk).toBe('#ffffff')
})

// C4Container draws `ContainerDb`/`ContainerQueue` as <path>, not <rect> — the ink pass keys off any
// filled shape in a group precisely so those aren't left with mermaid's white-on-light-blue.
test('C4Container: database/queue shapes get readable ink too', async ({
  page,
}) => {
  await page.evaluate(() => {
    ;(window as any).__applyTheme('vscode-light-2026', undefined, 'light')
    ;(window as any).vditor.setValue(
      [
        '```mermaid',
        'C4Container',
        'Person(u, "Customer")',
        'Container_Boundary(c1, "Shop") {',
        '  Container(spa, "SPA", "React")',
        '  ContainerDb(db, "Database", "Postgres")',
        '  ContainerQueue(q, "Events", "Kafka")',
        '}',
        'System_Ext(mail, "Mail", "SendGrid")',
        'Rel(u, spa, "Uses")',
        'Rel_Back(spa, mail, "Sends via")',
        '```',
      ].join('\n'),
    )
  })
  await page.waitForFunction(
    () =>
      !!document.querySelector(
        '.language-mermaid svg[aria-roledescription="c4"] line',
      ),
    undefined,
    { timeout: 8000 },
  )

  const inks = await page.evaluate(() => {
    const svg = document.querySelector(
      '.language-mermaid svg[aria-roledescription="c4"]',
    ) as SVGElement
    const label = (txt: string) =>
      [...svg.querySelectorAll('text')]
        .find((t) => t.textContent === txt)
        ?.getAttribute('fill')
    return {
      db: label('Database'),
      queue: label('Events'),
      spa: label('SPA'),
      leftovers: [...svg.querySelectorAll('*')].filter((el) =>
        ['#444444', '#444'].includes(
          (el.getAttribute('stroke') ?? '').toLowerCase(),
        ),
      ).length,
    }
  })
  // Container-level shapes are mermaid's `#438DD5`: white on it is 3.5:1, dark ink 6.4:1.
  expect(inks).toEqual({
    db: '#0d1b2a',
    queue: '#0d1b2a',
    spa: '#0d1b2a',
    leftovers: 0,
  })
})

// A LIVE flip goes through reRenderMermaid (offscreen render + SVG swap), not the first-render path.
// The dark ramp has no reverse mapping, so only a true re-render can walk it back — assert it does.
test('C4 follows a live dark→light palette flip', async ({ page }) => {
  const dark = await renderC4(page, 'vscode-dark-2026', 'dark')
  expect(dark.boxes).toContain('#062b50')

  await page.evaluate(() =>
    (window as any).__applyTheme('vscode-light-2026', undefined, 'light'),
  )
  await page.waitForFunction(
    () =>
      !!document.querySelector(
        '.language-mermaid svg[aria-roledescription="c4"] g > rect[fill="#08427B"]',
      ),
    undefined,
    { timeout: 8000 },
  )

  const flipped = await page.evaluate(() => {
    const svg = document.querySelector(
      '.language-mermaid svg[aria-roledescription="c4"]',
    ) as SVGElement
    return {
      boxes: [...svg.querySelectorAll('g > rect[fill], g > path[fill]')]
        .map((el) => el.getAttribute('fill'))
        .filter((fill) => fill && fill !== 'none')
        .sort(),
      dbInk: [...svg.querySelectorAll('text')]
        .find((t) => t.textContent === 'DB')
        ?.getAttribute('fill'),
      relation: [...svg.querySelectorAll('text')]
        .find((t) => t.textContent === 'Uses')
        ?.getAttribute('fill'),
    }
  })
  expect(flipped).toEqual({
    boxes: ['#08427B', '#1168BD', '#438DD5', '#85BBF0', '#999999'],
    dbInk: '#0d1b2a',
    relation: '#202020',
  })
})

test('content-theme pairing: auto + github-dark injects the github-dark palette', async ({
  page,
}) => {
  const base = await themeStyle(page)
  const paired = await applyAndWait(page, 'auto', 'github-dark', 'dark', base)
  expect(paired.toLowerCase()).toContain('#3d444d') // github-dark line colour
})

test('explicit setting wins over the content-theme pairing', async ({
  page,
}) => {
  const base = await themeStyle(page)
  // content theme pairs github-light, but an explicit nord must win.
  const nord = await applyAndWait(page, 'nord', 'github-light', 'light', base)
  expect(nord.toLowerCase()).toContain('#4c566a') // nord line, not github
  expect(nord.toLowerCase()).not.toContain('#d1d9e0') // github-light line absent
})

// The webview must actually load the Mermaid version we vendor over Vditor's bundled
// copy (build.mjs syncMermaid + the esbuild ?v= bump) — not Vditor's pinned 11.6.0.
// Guards that the version bump reaches the running webview, not just the vendored file.
test("loads a bumped Mermaid build (not Vditor's pinned 11.6.0)", async ({
  page,
}) => {
  const src = await page.evaluate(
    () =>
      (
        document.getElementById(
          'vditorMermaidScript',
        ) as HTMLScriptElement | null
      )?.src ?? '',
  )
  expect(src).toMatch(/mermaid\.min\.js\?v=\d+\.\d+\.\d+/) // cache-buster present
  expect(src).not.toContain('v=11.6.0') // the esbuild ?v= bump applied
})

// Each content theme's `auto` pairing resolves to the same palette as picking that
// palette explicitly — proves the registry rows (incl. the user's vscode/material
// picks) are wired end-to-end through the bundled resolver, not just in unit tests.
const PAIRINGS: Array<[string, string, 'dark' | 'light']> = [
  ['github-dark', 'github-dark', 'dark'],
  ['material-dark', 'one-dark', 'dark'],
  ['vscode-dark-2026', 'vscode-dark-2026', 'dark'],
  ['vscode-light-2026', 'vscode-light-2026', 'light'],
  ['github-light', 'github-light', 'light'],
]
for (const [content, palette, mode] of PAIRINGS) {
  test(`auto pairs ${content} → ${palette}`, async ({ page }) => {
    // __applyTheme stores the resolved themeVariables on window before re-rendering;
    // read them for auto+content vs the explicit palette and assert they match.
    const vars = (setting: string, ct?: string) =>
      page.evaluate(
        ([s, c, m]) => {
          ;(window as any).__applyTheme(s, c, m)
          return (window as any).__vmarkdMermaidVars
        },
        [setting, ct, mode] as const,
      )
    const auto = await vars('auto', content)
    const explicit = await vars(palette, undefined)
    expect(auto).not.toBeNull()
    expect(auto).toEqual(explicit)
  })
}
