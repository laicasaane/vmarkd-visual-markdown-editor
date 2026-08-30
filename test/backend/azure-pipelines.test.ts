import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(import.meta.dirname, '../..')
const PIPELINES = '.azure/pipelines'
const GITHUB_WORKFLOW_HASHES = {
  'ci.yml': '9b441eb425cc25ed3170952ae4db4471c7fc3c23009e01337cd7ed9c7259ddcc',
  'nightly.yml':
    'b82c6ef674793197f16701baadbeda6fbf5063c9240a05a5ceb874b09149d499',
  'publish.yml':
    '25cfaf5357b57e298adc09963e2630e296f6940b8193498d87abc0a0bb3e44e7',
  'pr-webview-smoke.yml':
    'd01b5f6d72fc6a73aca6aa963b46a7adf74ae277bf3d7597da74a1349bbc3bed',
  'release.yml':
    'af57e8d2f0dbab186a024ce2a18bbe50a62bce128c92128096a14af1437d772f',
}

const read = (path: string) => readFileSync(resolve(ROOT, path), 'utf8')
const pipeline = (name: string) => {
  const source = read(`${PIPELINES}/${name}`)
  return { source, yaml: parse(source) as Record<string, unknown> }
}
const steps = (yaml: Record<string, unknown>) =>
  (yaml.jobs as Array<{ steps: Array<Record<string, unknown>> }>)[0].steps
const scriptSteps = (yaml: Record<string, unknown>) =>
  steps(yaml)
    .filter((step) => typeof step.script === 'string')
    .map((step) => String(step.script))
    .join('\n')
const excludesAll = (filters: unknown) =>
  (filters as { exclude?: string[] } | undefined)?.exclude?.includes('*') ??
  false

describe('Azure Marketplace pipeline contracts', () => {
  it('keeps exactly the two approved Azure entrypoints', () => {
    expect(readdirSync(resolve(ROOT, PIPELINES)).sort()).toEqual([
      'preview.yml',
      'release.yml',
    ])
  })

  it('runs preview only for pushes to main', () => {
    const { yaml } = pipeline('preview.yml')
    expect(yaml.trigger).toEqual({
      branches: { include: ['main'] },
      tags: { exclude: ['*'] },
    })
    expect(yaml.pr).toBe('none')
  })

  it('runs production only for broadly matched tags, never branches', () => {
    const { yaml } = pipeline('release.yml')
    expect(yaml.trigger).toEqual({
      branches: { exclude: ['*'] },
      tags: { include: ['*'] },
    })
    expect(yaml.pr).toBe('none')
  })

  it('keeps preview branch-only and production tag-only trigger domains disjoint', () => {
    const preview = pipeline('preview.yml').yaml.trigger as Record<
      string,
      unknown
    >
    const release = pipeline('release.yml').yaml.trigger as Record<
      string,
      unknown
    >

    expect(excludesAll(preview.tags)).toBe(true)
    expect(excludesAll(release.branches)).toBe(true)
    expect({
      preview: {
        branches: !excludesAll(preview.branches),
        tags: !excludesAll(preview.tags),
      },
      release: {
        branches: !excludesAll(release.branches),
        tags: !excludesAll(release.tags),
      },
    }).toEqual({
      preview: { branches: true, tags: false },
      release: { branches: false, tags: true },
    })
  })

  it.each(['preview.yml', 'release.yml'])(
    'uses Node 22 and installs, audits, and tests both workspaces in %s',
    (name) => {
      const { source, yaml } = pipeline(name)
      expect(steps(yaml)).toContainEqual(
        expect.objectContaining({
          task: 'NodeTool@0',
          inputs: { versionSpec: '22.x' },
        }),
      )
      expect(source).toContain('npm ci')
      expect(source).toContain('npm --prefix media-src ci')
      expect(source).toContain('npm run audit')
      expect(source).toContain('npm run audit:d2-go')
      expect(source).toContain('npm test')
    },
  )

  it('derives the disposable preview version through the version contract', () => {
    const { source, yaml } = pipeline('preview.yml')
    expect(scriptSteps(yaml)).toContain(
      'node scripts/version-contract.mjs preview "$production_version" "$(Build.BuildId)" --azure',
    )
    expect(source).toContain(
      'npm version "$(vmdeVersion)" --no-git-tag-version --ignore-scripts',
    )
    expect(source).toContain('--pre-release')
  })

  it('validates exact production tags and main reachability before installation', () => {
    const { yaml } = pipeline('release.yml')
    const releaseValidation = scriptSteps(yaml)
    expect(releaseValidation).toContain(
      'node scripts/version-contract.mjs release "$(Build.SourceBranchName)" package.json package-lock.json --azure',
    )
    expect(releaseValidation).toContain('git fetch origin main')
    expect(releaseValidation).toContain(
      'git merge-base --is-ancestor "$(Build.SourceVersion)" "origin/main"',
    )
    expect(steps(yaml)[0]).toEqual(
      expect.objectContaining({
        checkout: 'self',
        fetchDepth: 0,
        fetchTags: true,
      }),
    )
  })

  it.each([
    ['preview.yml', 'artifacts/vmde-$(vmdeVersion)-preview.vsix', true],
    ['release.yml', 'artifacts/vmde-$(vmdeVersion).vsix', false],
  ])(
    'packages %s exactly once, verifies its archive, and reuses the same VSIX path',
    (name, vsixPath, prerelease) => {
      const { source, yaml } = pipeline(name)
      const commands = scriptSteps(yaml)
      expect(commands.match(/npm run package:vsix/g)).toHaveLength(1)
      expect(source).toContain(`VSIX="${vsixPath}"`)
      expect(source).toContain('npm run package:vsix --')
      expect(source).toContain('--out "$VSIX"')
      expect(source).toContain('unzip -p "$VSIX" extension/package.json')
      expect(source).toContain('unzip -p "$VSIX" extension.vsixmanifest')
      expect(steps(yaml)).toContainEqual(
        expect.objectContaining({
          task: 'PublishPipelineArtifact@1',
          inputs: expect.objectContaining({ targetPath: vsixPath }),
        }),
      )
      expect(source).toContain(`vsce publish --packagePath "${vsixPath}"`)
      if (prerelease) {
        expect(source).toContain(
          `vsce publish --packagePath "${vsixPath}" --pre-release`,
        )
      } else {
        expect(source).not.toContain(
          `vsce publish --packagePath "${vsixPath}" --pre-release`,
        )
      }
    },
  )

  it.each(['preview.yml', 'release.yml'])(
    'exposes VSCE_PAT only to the final Marketplace publish step in %s',
    (name) => {
      const { source, yaml } = pipeline(name)
      const publishingSteps = steps(yaml).filter((step) =>
        String(step.script ?? '').includes('vsce publish'),
      )
      expect(publishingSteps).toHaveLength(1)
      expect(publishingSteps[0].env).toEqual({ VSCE_PAT: '$(VSCE_PAT)' })
      expect(source.match(/VSCE_PAT/g)).toHaveLength(2)
      expect(source).not.toContain('--skip-duplicate')
    },
  )

  it('leaves every current GitHub workflow byte-identical to HEAD', () => {
    for (const [name, expectedHash] of Object.entries(GITHUB_WORKFLOW_HASHES)) {
      const actualHash = createHash('sha256')
        .update(read(`.github/workflows/${name}`))
        .digest('hex')
      expect(actualHash).toBe(expectedHash)
    }
  })
})
