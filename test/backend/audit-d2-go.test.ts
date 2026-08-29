import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { auditD2Go, readD2Commit } from '../../scripts/audit-d2-go.mjs'

const REPO_ROOT = path.resolve(import.meta.dirname, '../..')
const temps: string[] = []

afterEach(async () => {
  await Promise.all(
    temps.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  )
})

describe('D2 compile-only Go audit', () => {
  it('reads the pinned D2 commit from the build script', async () => {
    await expect(readD2Commit(REPO_ROOT)).resolves.toBe('2446e24')
  })

  it('clones, verifies, applies the exact stubs, and runs govulncheck', async () => {
    const tempBase = await mkdtemp(path.join(tmpdir(), 'vmde-d2-audit-test-'))
    temps.push(tempBase)
    const calls: Array<{ command: string; args: string[]; cwd?: string }> = []
    const copies: Array<[string, string]> = []
    const runner = {
      async command(
        command: string,
        args: string[],
        options: { cwd?: string } = {},
      ) {
        calls.push({ command, args, cwd: options.cwd })
        if (command === 'git' && args[0] === 'clone') {
          const checkout = args.at(-1) as string
          await mkdir(path.join(checkout, 'd2renderers/d2fonts'), {
            recursive: true,
          })
          await mkdir(path.join(checkout, 'd2renderers/d2latex'), {
            recursive: true,
          })
          await mkdir(path.join(checkout, 'lib/textmeasure'), {
            recursive: true,
          })
          await writeFile(
            path.join(checkout, 'lib/textmeasure/original.go'),
            'old',
          )
        }
        if (command === 'git' && args.includes('rev-parse')) {
          return { code: 0, stdout: '2446e24deadbeef\n', stderr: '' }
        }
        if (command === 'git' && args.includes('status')) {
          return { code: 0, stdout: '', stderr: '' }
        }
        if (args.includes('./d2compileonly')) {
          const checkout = options.cwd as string
          expect(
            await readFile(
              path.join(checkout, 'd2renderers/d2fonts/d2fonts_embed_wasm.go'),
              'utf8',
            ),
          ).toContain('package d2fonts')
          expect(
            await readFile(
              path.join(checkout, 'd2renderers/d2latex/latex_embed_wasm.go'),
              'utf8',
            ),
          ).toContain('package d2latex')
          expect(
            await readFile(
              path.join(checkout, 'lib/textmeasure/stub-textmeasure.go'),
              'utf8',
            ),
          ).toContain('package textmeasure')
          expect(
            await readFile(
              path.join(checkout, 'd2compileonly/main.go'),
              'utf8',
            ),
          ).toContain('package main')
        }
        return { code: 0, stdout: '', stderr: '' }
      },
      async copyFile(source: string, destination: string) {
        copies.push([source, destination])
        const { copyFile } = await import('node:fs/promises')
        await copyFile(source, destination)
      },
    }

    await expect(
      auditD2Go({ repoRoot: REPO_ROOT, tempBase, runner }),
    ).resolves.toMatchObject({ code: 0, commit: '2446e24' })

    expect(calls.map(({ command, args }) => [command, ...args])).toEqual([
      [
        'git',
        'clone',
        '--filter=blob:none',
        '--no-checkout',
        'https://github.com/terrastruct/d2',
        expect.any(String),
      ],
      ['git', '-C', expect.any(String), 'checkout', '2446e24'],
      ['git', '-C', expect.any(String), 'rev-parse', 'HEAD'],
      ['git', '-C', expect.any(String), 'status', '--porcelain'],
      ['go', 'install', 'golang.org/x/vuln/cmd/govulncheck@latest'],
      [expect.stringMatching(/go-bin\/govulncheck$/), './d2compileonly'],
    ])
    expect(copies.map(([source]) => path.basename(source))).toEqual([
      'stub-d2fonts_embed_wasm.go',
      'stub-latex_embed_wasm.go',
      'stub-textmeasure.go',
      'main.go',
    ])
  })
})
