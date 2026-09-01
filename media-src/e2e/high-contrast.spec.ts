import type { Page } from '@playwright/test'
import { expect, test } from './coverage-fixture'

const INIT = {
  command: 'update',
  type: 'init',
  content: '# High contrast\n\nBody.\n',
  cdn: '/vditor',
  options: {
    showToolbar: true,
    useVscodeThemeColor: true,
    enableFullWidth: true,
    contentTheme: 'auto',
  },
  theme: 'dark',
  themeKind: 'dark',
  wiki: { enabled: false },
}

async function open(page: Page) {
  await page.addInitScript((init) => {
    ;(window as any).acquireVsCodeApi = () => ({
      postMessage: (message: any) => {
        if (message?.command === 'ready') window.postMessage(init, '*')
      },
      getState: () => undefined,
      setState: () => undefined,
    })
  }, INIT)
  await page.goto('/prerender.html', { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(
    () =>
      !document.getElementById('vmde-prerender') &&
      !!document.querySelector('#app .vditor-ir pre.vditor-reset'),
    undefined,
    { timeout: 15_000 },
  )
}

test('live high-contrast kind applies borders, focus, chips, and the shared diagram palette', async ({
  page,
}) => {
  await open(page)
  await page.evaluate((init) => {
    document.documentElement.style.setProperty(
      '--vscode-editor-background',
      '#000000',
    )
    document.documentElement.style.setProperty(
      '--vscode-editor-foreground',
      '#ffffff',
    )
    document.documentElement.style.setProperty(
      '--vscode-contrastBorder',
      '#ffff00',
    )
    document.documentElement.style.setProperty(
      '--vscode-focusBorder',
      '#00ffff',
    )
    window.postMessage(
      { ...init, command: 'config-changed', themeKind: 'high-contrast' },
      '*',
    )
  }, INIT)
  await expect(page.locator('body')).toHaveClass(/vscode-high-contrast/)

  const result = await page.evaluate(() => {
    const table = document.createElement('table')
    table.innerHTML = '<tbody><tr><td>cell</td></tr></tbody>'
    const callout = document.createElement('blockquote')
    callout.dataset.callout = 'note'
    const chip = document.createElement('span')
    chip.className = 'wiki-link-chip'
    chip.textContent = 'Home'
    const controls = document.createElement('div')
    controls.className = 'vmde-diagram-controls'
    const button = document.createElement('button')
    button.textContent = 'Zoom'
    controls.appendChild(button)
    document.querySelector('.vditor-reset')!.append(table, callout, chip)
    document.body.append(controls)
    button.focus()

    const flowchart = (window as any).__vmdeFlowchartOpts(document.body)
    return new Promise<Record<string, unknown>>((resolve) =>
      requestAnimationFrame(() => {
        const td = table.querySelector('td')!
        resolve({
          darkClass: document.body.classList.contains('vscode-high-contrast'),
          lightClass: document.body.classList.contains(
            'vscode-high-contrast-light',
          ),
          tableBorder: getComputedStyle(td).borderColor,
          calloutBorder: getComputedStyle(callout).borderLeftColor,
          controlsBorder: getComputedStyle(controls).borderColor,
          chipShadow: getComputedStyle(chip).boxShadow,
          focusWidth: getComputedStyle(button).outlineWidth,
          focusColor: getComputedStyle(button).outlineColor,
          diagramLine: flowchart['line-color'],
          diagramText: flowchart['font-color'],
        })
      }),
    )
  })

  expect(result).toMatchObject({
    darkClass: true,
    lightClass: false,
    tableBorder: 'rgb(255, 255, 0)',
    calloutBorder: 'rgb(255, 255, 0)',
    controlsBorder: 'rgb(255, 255, 0)',
    focusWidth: '3px',
    focusColor: 'rgb(0, 255, 255)',
    diagramLine: '#ffff00',
    diagramText: '#ffffff',
  })
  expect(String(result.chipShadow)).toContain('rgb(255, 255, 0)')
})

test('forced-colors keeps non-themed chrome and focus visible', async ({
  page,
}) => {
  await page.emulateMedia({ forcedColors: 'active' })
  await open(page)
  const result = await page.evaluate(() => {
    const controls = document.createElement('div')
    controls.className = 'vmde-diagram-controls'
    const button = document.createElement('button')
    button.textContent = 'Zoom'
    controls.appendChild(button)
    document.body.append(controls)
    button.focus()
    return {
      active: matchMedia('(forced-colors: active)').matches,
      borderStyle: getComputedStyle(controls).borderStyle,
      borderWidth: getComputedStyle(controls).borderWidth,
      outlineWidth: getComputedStyle(button).outlineWidth,
    }
  })
  expect(result).toEqual({
    active: true,
    borderStyle: 'solid',
    borderWidth: '1px',
    outlineWidth: '3px',
  })
})
