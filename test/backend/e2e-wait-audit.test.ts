import { describe, expect, it } from 'vitest'
import {
  auditSource,
  findMissingDispositions,
} from '../../scripts/audit-vscode-e2e-waits.mjs'

describe('real-VS-Code fixed-wait audit', () => {
  it('finds direct, shared, and named-wrapper waits while excluding skipped and conditional guards', () => {
    const source = `
      import { settle } from './webview-helpers'
      const CASCADE_SETTLE_MS = 2200
      const wait = (ms: number) =>
        frame.locator('body').evaluate((_body, delay) =>
          new Promise((resolve) => setTimeout(resolve, delay)), ms)

      test('active', async () => {
        // task 512: retain — negative observation window
        await settle(frame, 1500)
        await wait(CASCADE_SETTLE_MS)
        await workbox.waitForTimeout(1200)
        await frame.locator('body').evaluate(() =>
          new Promise((resolve) => setTimeout(resolve, 800)))
      })

      test.skip('skipped', async () => {
        await settle(frame, 5000)
      })

      test('conditional guard', async () => {
        await new Promise<void>((resolve) => {
          const observer = new MutationObserver(() => {
            observer.disconnect()
            resolve()
          })
          setTimeout(() => {
            observer.disconnect()
            resolve()
          }, 12000)
        })
      })
    `

    const result = auditSource('sample.spec.ts', source)
    expect(result.map(({ delay, shape }) => ({ delay, shape }))).toEqual([
      { delay: 1500, shape: 'settle' },
      { delay: 2200, shape: 'wrapper:wait' },
      { delay: 1200, shape: 'waitForTimeout' },
      { delay: 800, shape: 'setTimeout' },
    ])
    expect(result[0].disposition).toContain('negative observation window')
    expect(result.every((wait) => wait.testTitle === 'active')).toBe(true)
  })

  it('reports only long executable waits without a task disposition', () => {
    const rows = auditSource(
      'missing.spec.ts',
      `
        test('x', async () => {
          await settle(frame, 1500)
          // task 512: retain — input sequencing
          await settle(frame, 1800)
          await settle(frame, 500)
        })
      `,
    )

    expect(findMissingDispositions(rows).map((wait) => wait.delay)).toEqual([
      1500,
    ])
  })

  it('includes waits in shared helpers reachable from the default spec file', () => {
    const rows = auditSource(
      'shared.spec.ts',
      `
        async function boot() {
          await frame.locator('body').evaluate(() =>
            new Promise((resolve) => setTimeout(resolve, 2500)))
        }
        test('uses boot', async () => { await boot() })
      `,
    )

    expect(rows).toMatchObject([
      { delay: 2500, shape: 'setTimeout', testTitle: '<shared helper>' },
    ])
  })
})
