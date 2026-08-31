import { describe, expect, it } from 'vitest'
import {
  compareNumericVersions,
  derivePreviewVersion,
  nextPreviewArtifactCounter,
  parseNumericVersion,
  runVersionContractCli,
  validateLockfileRootVersion,
  validateProductionBaseline,
  validateProductionTag,
  validateProductionVersion,
} from '../../scripts/version-contract.mjs'
import {
  buildVscePackageArgs,
  parseVsixPackageArgs,
} from '../../scripts/vsix-package-args.mjs'

describe('numeric Marketplace version contract', () => {
  it.each([
    ['0.0.0', { major: 0, minor: 0, patch: 0 }],
    ['1.4.2', { major: 1, minor: 4, patch: 2 }],
    ['12.34.567', { major: 12, minor: 34, patch: 567 }],
  ])('parses numeric version %s', (version, expected) => {
    expect(parseNumericVersion(version)).toEqual(expected)
  })

  it.each([
    '1.4',
    '1.4.0-preview.3',
    'v1.4.0',
    '01.4.0',
    '1.04.0',
    '1.4.00',
    '-1.4.0',
  ])('rejects non-numeric version %s', (version) => {
    expect(() => parseNumericVersion(version)).toThrow('numeric version X.Y.Z')
  })

  it('rejects non-string and unsafe numeric version components', () => {
    expect(() => parseNumericVersion(null)).toThrow('numeric version X.Y.Z')
    expect(() => parseNumericVersion('1.4.9007199254740992')).toThrow(
      'safe integer',
    )
  })

  it('orders numeric version components rather than text', () => {
    expect(compareNumericVersions('1.4.9', '1.4.10')).toBe(-1)
    expect(compareNumericVersions('1.4.10', '1.4.10')).toBe(0)
    expect(compareNumericVersions('2.0.0', '1.999.999')).toBe(1)
  })

  it('accepts even-minor production versions and rejects odd preview lines', () => {
    expect(validateProductionVersion('1.4.2')).toEqual({
      major: 1,
      minor: 4,
      patch: 2,
    })
    expect(() => validateProductionVersion('1.5.123')).toThrow(
      'even minor number',
    )
  })

  it('derives the next odd minor from a production baseline and Azure build id', () => {
    expect(derivePreviewVersion('1.4.2', '123')).toBe('1.5.123')
    expect(() => derivePreviewVersion('1.5.0', '123')).toThrow(
      'even minor number',
    )
    expect(() => derivePreviewVersion('1.4.0', '0123')).toThrow(
      'positive numeric build ID',
    )
  })

  it('counts only completed VSIX artifacts on the exact preview line', () => {
    expect(
      nextPreviewArtifactCounter(
        [
          'vmde-1.5.1-preview.vsix',
          'vmde-1.5.12-preview.vsix',
          'vmde-1.5.13-preview-deadbee.vsix',
          'vmde-1.5.bad-preview.vsix',
          'vmde-1.5.99-preview-not-a-hash.vsix',
          'vmde-1.4.99-preview.vsix',
          'other-1.5.99-preview.vsix',
          'vmde-1.5.14.vsix',
        ],
        'vmde',
        '1.4.0',
      ),
    ).toBe(14)
    expect(nextPreviewArtifactCounter([], 'vmde', '1.4.0')).toBe(1)
    expect(() =>
      nextPreviewArtifactCounter(
        ['vmde-1.5.9007199254740991-preview.vsix'],
        'vmde',
        '1.4.0',
      ),
    ).toThrow('exceeds safe integer range')
  })

  it('requires an exact even numeric production tag equal to both manifests', () => {
    const manifest = { version: '1.4.2' }
    const lockfile = {
      version: '1.4.2',
      packages: { '': { version: '1.4.2' } },
    }
    expect(validateLockfileRootVersion(lockfile, '1.4.2')).toBeUndefined()
    expect(validateProductionBaseline(manifest, lockfile)).toEqual({
      major: 1,
      minor: 4,
      patch: 2,
    })
    expect(validateProductionTag('1.4.2', manifest, lockfile)).toEqual({
      major: 1,
      minor: 4,
      patch: 2,
    })
  })

  it.each([
    ['v1.4.2', 'numeric version X.Y.Z'],
    ['1.5.2', 'even minor number'],
    ['1.4.3', 'does not match package.json version'],
  ])('rejects production tag %s when it violates %s', (tag, message) => {
    expect(() =>
      validateProductionTag(
        tag,
        { version: '1.4.2' },
        {
          version: '1.4.2',
          packages: { '': { version: '1.4.2' } },
        },
      ),
    ).toThrow(message)
  })

  it.each([
    [
      { version: '1.4.3', packages: { '': { version: '1.4.2' } } },
      'package-lock.json version',
    ],
    [
      { version: '1.4.2', packages: { '': { version: '1.4.3' } } },
      'package-lock.json packages[""].version',
    ],
  ])('rejects lockfile root mismatch: %s', (lockfile, message) => {
    expect(() => validateLockfileRootVersion(lockfile, '1.4.2')).toThrow(
      message,
    )
  })

  it.each([
    [
      { version: '1.5.0' },
      { version: '1.5.0', packages: { '': { version: '1.5.0' } } },
      'even minor number',
    ],
    [
      { version: '1.4.0' },
      { version: '1.4.1', packages: { '': { version: '1.4.0' } } },
      'package-lock.json version must equal 1.4.0',
    ],
    [
      { version: '1.4.0' },
      { version: '1.4.0', packages: { '': { version: '1.4.1' } } },
      'package-lock.json packages[""].version must equal 1.4.0',
    ],
  ])(
    'rejects an invalid production baseline before release derivation',
    (manifest, lockfile, message) => {
      expect(() => validateProductionBaseline(manifest, lockfile)).toThrow(
        message,
      )
    },
  )

  it('emits plain and Azure values without import-time side effects', () => {
    const readJson = (file: string) =>
      JSON.stringify(
        file === 'package.json'
          ? { version: '1.4.0' }
          : { version: '1.4.0', packages: { '': { version: '1.4.0' } } },
      )
    expect(
      runVersionContractCli(
        ['preview', 'package.json', 'package-lock.json', '123'],
        readJson,
      ),
    ).toBe('1.5.123')
    expect(
      runVersionContractCli(
        ['preview', 'package.json', 'package-lock.json', '123', '--azure'],
        readJson,
      ),
    ).toBe(
      '##vso[task.setvariable variable=VMDE_VERSION;isReadOnly=true]1.5.123',
    )
  })

  it.each([
    [
      { version: '1.5.0' },
      { version: '1.5.0', packages: { '': { version: '1.5.0' } } },
      'even minor number',
    ],
    [
      { version: '1.4.0' },
      { version: '1.4.1', packages: { '': { version: '1.4.0' } } },
      'package-lock.json version must equal 1.4.0',
    ],
  ])(
    'rejects an invalid Azure preview baseline through the CLI',
    (manifest, lockfile, message) => {
      expect(() =>
        runVersionContractCli(
          ['preview', 'package.json', 'package-lock.json', '123', '--azure'],
          (file: string) =>
            JSON.stringify(file === 'package.json' ? manifest : lockfile),
        ),
      ).toThrow(message)
    },
  )

  it('validates production and release values through the CLI surface', () => {
    expect(runVersionContractCli(['production', '1.4.0'])).toBe('1.4.0')
    expect(
      runVersionContractCli(
        ['release', '1.4.0', 'package.json', 'package-lock.json', '--azure'],
        (file) =>
          JSON.stringify(
            file === 'package.json'
              ? { version: '1.4.0' }
              : { version: '1.4.0', packages: { '': { version: '1.4.0' } } },
          ),
      ),
    ).toBe('##vso[task.setvariable variable=VMDE_VERSION;isReadOnly=true]1.4.0')
    expect(() => runVersionContractCli(['unknown'])).toThrow('Usage:')
  })
})

describe('guarded VSIX package arguments', () => {
  it('defaults to a production package with an explicit output path', () => {
    expect(parseVsixPackageArgs([])).toEqual({
      preRelease: false,
      output: undefined,
    })
    expect(
      parseVsixPackageArgs(['--out', 'artifacts/vmde-1.4.0.vsix']),
    ).toEqual({
      preRelease: false,
      output: 'artifacts/vmde-1.4.0.vsix',
    })
    expect(
      buildVscePackageArgs({
        vsceCli: '/node_modules/@vscode/vsce/vsce',
        output: '/workspace/artifacts/vmde-1.4.0.vsix',
        marketplaceImagesBase:
          'https://raw.githubusercontent.com/laicasaane/vmde/HEAD',
      }),
    ).toEqual([
      '/node_modules/@vscode/vsce/vsce',
      'package',
      '--no-dependencies',
      '--baseImagesUrl',
      'https://raw.githubusercontent.com/laicasaane/vmde/HEAD',
      '--out',
      '/workspace/artifacts/vmde-1.4.0.vsix',
    ])
  })

  it('forwards prerelease metadata while retaining every existing VSCE guard', () => {
    expect(
      buildVscePackageArgs({
        vsceCli: '/node_modules/@vscode/vsce/vsce',
        output: '/workspace/artifacts/vmde-1.5.123.vsix',
        marketplaceImagesBase:
          'https://raw.githubusercontent.com/laicasaane/vmde/HEAD',
        preRelease: true,
      }),
    ).toEqual([
      '/node_modules/@vscode/vsce/vsce',
      'package',
      '--no-dependencies',
      '--baseImagesUrl',
      'https://raw.githubusercontent.com/laicasaane/vmde/HEAD',
      '--pre-release',
      '--out',
      '/workspace/artifacts/vmde-1.5.123.vsix',
    ])
    expect(
      parseVsixPackageArgs([
        '--pre-release',
        '--out',
        'artifacts/vmde-1.5.123.vsix',
      ]),
    ).toEqual({ preRelease: true, output: 'artifacts/vmde-1.5.123.vsix' })
  })

  it.each([
    [['--out'], '--out requires a file path'],
    [['--out', '--pre-release'], '--out requires a file path'],
    [['--out', 'one.vsix', '--out', 'two.vsix'], 'duplicate argument'],
    [['--pre-release', '--pre-release'], 'duplicate argument'],
    [['--wat'], 'unknown argument'],
  ])('rejects malformed package arguments %j', (args, message) => {
    expect(() => parseVsixPackageArgs(args)).toThrow(message)
  })
})
