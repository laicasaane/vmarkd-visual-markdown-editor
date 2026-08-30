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
type Step = Record<string, unknown>

const steps = (yaml: Record<string, unknown>) =>
  (yaml.jobs as Array<{ steps: Step[] }>)[0].steps
const namedStep = (yaml: Record<string, unknown>, displayName: string) => {
  const step = steps(yaml).find(
    (candidate) => candidate.displayName === displayName,
  )
  expect(step, `missing step: ${displayName}`).toBeDefined()
  return step as Step
}
const scriptOf = (step: Step) => {
  expect(typeof step.script).toBe('string')
  return step.script as string
}
const scriptStep = (yaml: Record<string, unknown>, displayName: string) =>
  scriptOf(namedStep(yaml, displayName))
const ordered = (yaml: Record<string, unknown>, displayNames: string[]) => {
  const indexes = displayNames.map((displayName) =>
    steps(yaml).findIndex((step) => step.displayName === displayName),
  )
  expect(indexes).not.toContain(-1)
  expect(indexes).toEqual([...indexes].sort((left, right) => left - right))
}
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
    expect(yaml.trigger).toEqual({ branches: { include: ['main'] } })
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

    expect(preview.tags).toBeUndefined()
    expect(excludesAll(release.branches)).toBe(true)
    expect({
      preview: {
        branches: !excludesAll(preview.branches),
        tags: preview.tags !== undefined,
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
      const { yaml } = pipeline(name)
      expect(steps(yaml)).toContainEqual(
        expect.objectContaining({
          task: 'NodeTool@0',
          inputs: { versionSpec: '22.x' },
        }),
      )
      expect(scriptStep(yaml, 'Install root dependencies')).toBe('npm ci')
      expect(scriptStep(yaml, 'Install webview dependencies')).toBe(
        'npm --prefix media-src ci',
      )
      expect(scriptStep(yaml, 'Audit dependencies and vendored runtimes')).toBe(
        'npm run audit',
      )
      expect(scriptStep(yaml, 'Audit D2 Go call graph')).toBe(
        'npm run audit:d2-go',
      )
      expect(scriptStep(yaml, 'Run unit tests')).toBe('npm test')
    },
  )

  it('guards the preview branch and uses a shell version before Azure exposes it to later steps', () => {
    const { yaml } = pipeline('preview.yml')
    expect(scriptStep(yaml, 'Validate preview branch')).toContain(
      'if [ "$(Build.SourceBranch)" != "refs/heads/main" ]; then',
    )
    const derive = scriptStep(yaml, 'Derive disposable preview version')
    expect(derive).toContain(
      'preview_version="$(node scripts/version-contract.mjs preview "$production_version" "$(Build.BuildId)")"',
    )
    expect(derive).toContain(
      'echo "##vso[task.setvariable variable=vmdeVersion]$preview_version"',
    )
    expect(derive).toContain(
      'npm version "$preview_version" --no-git-tag-version --ignore-scripts',
    )
    expect(derive).not.toContain('npm version "$(vmdeVersion)"')
  })

  it('validates exact production tags and main reachability before installation', () => {
    const { yaml } = pipeline('release.yml')
    const releaseValidation = scriptStep(
      yaml,
      'Validate production tag and main reachability',
    )
    expect(releaseValidation).toContain(
      'node scripts/version-contract.mjs release "$(Build.SourceBranchName)" package.json package-lock.json --azure',
    )
    expect(releaseValidation).toContain(
      'git fetch origin +refs/heads/main:refs/remotes/origin/main',
    )
    expect(releaseValidation).toContain(
      'git merge-base --is-ancestor "$(Build.SourceVersion)" "refs/remotes/origin/main"',
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
      const { yaml } = pipeline(name)
      const packageName = prerelease
        ? 'Package prerelease VSIX'
        : 'Package production VSIX'
      const verifyName = prerelease
        ? 'Verify prerelease archive metadata'
        : 'Verify production archive metadata'
      const packageScript = scriptStep(yaml, packageName)
      const verifyScript = scriptStep(yaml, verifyName)
      const artifactStep = namedStep(
        yaml,
        prerelease
          ? 'Publish preview VSIX artifact'
          : 'Publish production VSIX artifact',
      )
      const publishScript = scriptStep(
        yaml,
        prerelease
          ? 'Publish preview VSIX to Marketplace'
          : 'Publish production VSIX to Marketplace',
      )

      expect(packageScript.match(/npm run package:vsix/g)).toHaveLength(1)
      expect(packageScript).toContain(`VSIX="${vsixPath}"`)
      expect(packageScript).toContain('--out "$VSIX"')
      expect(verifyScript).toContain('unzip -p "$VSIX" extension/package.json')
      expect(verifyScript).toContain('unzip -p "$VSIX" extension.vsixmanifest')
      expect(verifyScript).toContain(
        'grep -q \'<Identity[^>]*Version="$(vmdeVersion)"\'',
      )
      expect(artifactStep.inputs).toEqual(
        expect.objectContaining({ targetPath: vsixPath }),
      )
      expect(publishScript).toContain(
        `vsce publish --packagePath "${vsixPath}"`,
      )
      if (prerelease) {
        expect(verifyScript).toContain(
          'Microsoft.VisualStudio.Code.PreRelease.*Value="true"',
        )
        expect(publishScript).toContain(
          `vsce publish --packagePath "${vsixPath}" --pre-release`,
        )
      } else {
        expect(verifyScript).toContain(
          'if unzip -p "$VSIX" extension.vsixmanifest | grep -q',
        )
        expect(publishScript).not.toContain(
          `vsce publish --packagePath "${vsixPath}" --pre-release`,
        )
      }
    },
  )

  it.each(['preview.yml', 'release.yml'])(
    'exposes VSCE_PAT only to the final Marketplace publish step in %s',
    (name) => {
      const { yaml } = pipeline(name)
      const publishingSteps = steps(yaml).filter((step) =>
        String(step.script ?? '').includes('vsce publish'),
      )
      const secretSteps = steps(yaml).filter(
        (step) => (step.env as Record<string, unknown> | undefined)?.VSCE_PAT,
      )
      expect(publishingSteps).toHaveLength(1)
      expect(publishingSteps[0].env).toEqual({ VSCE_PAT: '$(VSCE_PAT)' })
      expect(secretSteps).toEqual(publishingSteps)
      expect(
        steps(yaml).some((step) =>
          String(step.script ?? '').includes('--skip-duplicate'),
        ),
      ).toBe(false)
    },
  )

  it('orders preview validation through Marketplace publication', () => {
    const { yaml } = pipeline('preview.yml')
    ordered(yaml, [
      'Validate preview branch',
      'Install root dependencies',
      'Install webview dependencies',
      'Audit dependencies and vendored runtimes',
      'Audit D2 Go call graph',
      'Run unit tests',
      'Derive disposable preview version',
      'Package prerelease VSIX',
      'Verify prerelease archive metadata',
      'Publish preview VSIX artifact',
      'Publish preview VSIX to Marketplace',
    ])
  })

  it('orders production validation through Marketplace publication', () => {
    const { yaml } = pipeline('release.yml')
    ordered(yaml, [
      'Validate production tag and main reachability',
      'Install root dependencies',
      'Install webview dependencies',
      'Audit dependencies and vendored runtimes',
      'Audit D2 Go call graph',
      'Run unit tests',
      'Package production VSIX',
      'Verify production archive metadata',
      'Publish production VSIX artifact',
      'Publish production VSIX to Marketplace',
    ])
  })

  it('leaves every current GitHub workflow byte-identical to HEAD', () => {
    for (const [name, expectedHash] of Object.entries(GITHUB_WORKFLOW_HASHES)) {
      const actualHash = createHash('sha256')
        .update(read(`.github/workflows/${name}`))
        .digest('hex')
      expect(actualHash).toBe(expectedHash)
    }
  })
})
