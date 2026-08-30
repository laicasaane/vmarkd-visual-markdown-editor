import { execFileSync, spawnSync } from 'node:child_process'
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const REPO_ROOT = path.resolve(__dirname, '../..')
const RELEASE_SCRIPT = path.join(
  REPO_ROOT,
  'scripts/prepare-production-release.mjs',
)

const fixtures: string[] = []

function run(file: string, args: string[], cwd: string) {
  return execFileSync(file, args, { cwd, encoding: 'utf8' }).trim()
}

function git(cwd: string, ...args: string[]) {
  return run('git', args, cwd)
}

function writeManifests(cwd: string, version = '1.4.0') {
  writeFileSync(
    path.join(cwd, 'package.json'),
    `${JSON.stringify({ name: 'release-fixture', version }, null, 2)}\n`,
  )
  writeFileSync(
    path.join(cwd, 'package-lock.json'),
    `${JSON.stringify(
      {
        name: 'release-fixture',
        version,
        lockfileVersion: 3,
        requires: true,
        packages: { '': { name: 'release-fixture', version } },
      },
      null,
      2,
    )}\n`,
  )
}

function createRepository() {
  const cwd = mkdtempSync(path.join(tmpdir(), 'vmde-production-release-'))
  fixtures.push(cwd)
  git(cwd, 'init', '-b', 'main')
  git(cwd, 'config', 'user.name', 'VMDE Release Test')
  git(cwd, 'config', 'user.email', 'vmde-release-test@example.invalid')
  writeManifests(cwd)
  writeFileSync(path.join(cwd, 'README.md'), 'main baseline\n')
  git(cwd, 'add', 'package.json', 'package-lock.json', 'README.md')
  git(cwd, 'commit', '-m', 'test: main baseline')
  git(cwd, 'switch', '-c', 'dev')
  writeFileSync(path.join(cwd, 'README.md'), 'main baseline\ndev work\n')
  git(cwd, 'add', 'README.md')
  git(cwd, 'commit', '-m', 'test: dev work')
  return cwd
}

function release(cwd: string, target: string) {
  return spawnSync(process.execPath, [RELEASE_SCRIPT, target], {
    cwd,
    encoding: 'utf8',
  })
}

function manifestVersions(cwd: string) {
  const manifest = JSON.parse(
    readFileSync(path.join(cwd, 'package.json'), 'utf8'),
  )
  const lockfile = JSON.parse(
    readFileSync(path.join(cwd, 'package-lock.json'), 'utf8'),
  )
  return {
    package: manifest.version,
    lockfile: lockfile.version,
    lockfileRoot: lockfile.packages[''].version,
  }
}

function expectUnmutated(cwd: string, head: string, main: string) {
  expect(git(cwd, 'rev-parse', 'HEAD')).toBe(head)
  expect(git(cwd, 'rev-parse', 'main')).toBe(main)
  expect(manifestVersions(cwd)).toEqual({
    package: '1.4.0',
    lockfile: '1.4.0',
    lockfileRoot: '1.4.0',
  })
  expect(git(cwd, 'tag', '--list', '1.4.2')).toBe('')
}

afterEach(() => {
  for (const fixture of fixtures.splice(0)) {
    rmSync(fixture, { recursive: true, force: true })
  }
})

describe('guarded production release helper', () => {
  it('catches a release that does not atomically synchronize dev and main with one exact manifest-only commit and an annotated tag', () => {
    const cwd = createRepository()
    const previousDev = git(cwd, 'rev-parse', 'dev')
    const result = release(cwd, '1.4.2')

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(git(cwd, 'branch', '--show-current')).toBe('dev')
    const releaseCommit = git(cwd, 'rev-parse', 'dev')
    expect(releaseCommit).not.toBe(previousDev)
    expect(git(cwd, 'rev-parse', 'main')).toBe(releaseCommit)
    expect(git(cwd, 'show', '-s', '--format=%s', releaseCommit)).toBe(
      'release: 1.4.2',
    )
    expect(
      git(
        cwd,
        'diff-tree',
        '--no-commit-id',
        '--name-only',
        '-r',
        releaseCommit,
      )
        .split('\n')
        .sort(),
    ).toEqual(['package-lock.json', 'package.json'])
    expect(manifestVersions(cwd)).toEqual({
      package: '1.4.2',
      lockfile: '1.4.2',
      lockfileRoot: '1.4.2',
    })
    expect(git(cwd, 'cat-file', '-t', 'refs/tags/1.4.2')).toBe('tag')
    expect(git(cwd, 'rev-list', '-n', '1', 'refs/tags/1.4.2')).toBe(
      releaseCommit,
    )
    expect(git(cwd, 'status', '--porcelain', '--untracked-files=no')).toBe('')
  })

  it('catches a release that rejects, deletes, stages, or commits an allowed untracked file', () => {
    const cwd = createRepository()
    const protectedFile = path.join(cwd, 'LOCAL_AGENT_TASK.md')
    writeFileSync(protectedFile, 'untracked and unchanged\n')

    const result = release(cwd, '1.4.2')

    expect(result.status).toBe(0)
    expect(readFileSync(protectedFile, 'utf8')).toBe(
      'untracked and unchanged\n',
    )
    expect(git(cwd, 'status', '--porcelain')).toBe('?? LOCAL_AGENT_TASK.md')
    expect(git(cwd, 'show', '--format=', '--name-only', 'HEAD')).not.toContain(
      'LOCAL_AGENT_TASK.md',
    )
  })

  it.each([
    ['unstaged', false],
    ['staged', true],
  ])('catches mutation when a tracked %s change exists', (_name, staged) => {
    const cwd = createRepository()
    const originalHead = git(cwd, 'rev-parse', 'HEAD')
    const originalMain = git(cwd, 'rev-parse', 'main')
    writeFileSync(path.join(cwd, 'README.md'), 'dirty tracked file\n')
    if (staged) git(cwd, 'add', 'README.md')

    const result = release(cwd, '1.4.2')

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('tracked working tree must be clean')
    expectUnmutated(cwd, originalHead, originalMain)
  })

  it('catches mutation from any branch other than dev', () => {
    const cwd = createRepository()
    git(cwd, 'switch', 'main')
    const originalHead = git(cwd, 'rev-parse', 'HEAD')

    const result = release(cwd, '1.4.2')

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('current branch must be exactly dev')
    expectUnmutated(cwd, originalHead, originalHead)
  })

  it('catches mutation when local main is not an ancestor of dev', () => {
    const cwd = createRepository()
    const originalHead = git(cwd, 'rev-parse', 'HEAD')
    git(cwd, 'switch', 'main')
    writeFileSync(path.join(cwd, 'main-only.txt'), 'divergent main\n')
    git(cwd, 'add', 'main-only.txt')
    git(cwd, 'commit', '-m', 'test: diverge main')
    const divergentMain = git(cwd, 'rev-parse', 'HEAD')
    git(cwd, 'switch', 'dev')

    const result = release(cwd, '1.4.2')

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('local main must be an ancestor of dev')
    expectUnmutated(cwd, originalHead, divergentMain)
  })

  it('catches mutation when the required local main branch does not exist', () => {
    const cwd = createRepository()
    const originalHead = git(cwd, 'rev-parse', 'HEAD')
    git(cwd, 'branch', '-D', 'main')

    const result = release(cwd, '1.4.2')

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('local main branch does not exist')
    expect(git(cwd, 'rev-parse', 'HEAD')).toBe(originalHead)
    expect(manifestVersions(cwd)).toEqual({
      package: '1.4.0',
      lockfile: '1.4.0',
      lockfileRoot: '1.4.0',
    })
    expect(git(cwd, 'tag', '--list', '1.4.2')).toBe('')
  })

  it.each([
    ['1.4.0', 'strictly greater than current version 1.4.0'],
    ['1.5.0', 'even minor number'],
    ['v1.4.2', 'numeric version X.Y.Z'],
  ])('catches mutation for invalid target %s', (target, message) => {
    const cwd = createRepository()
    const originalHead = git(cwd, 'rev-parse', 'HEAD')
    const originalMain = git(cwd, 'rev-parse', 'main')

    const result = release(cwd, target)

    expect(result.status).toBe(1)
    expect(result.stderr).toContain(message)
    expectUnmutated(cwd, originalHead, originalMain)
  })

  it('catches mutation when package and lockfile baseline versions disagree', () => {
    const cwd = createRepository()
    const originalHead = git(cwd, 'rev-parse', 'HEAD')
    const originalMain = git(cwd, 'rev-parse', 'main')
    const lockfilePath = path.join(cwd, 'package-lock.json')
    const lockfile = JSON.parse(readFileSync(lockfilePath, 'utf8'))
    lockfile.packages[''].version = '1.2.0'
    writeFileSync(lockfilePath, `${JSON.stringify(lockfile, null, 2)}\n`)
    git(cwd, 'add', 'package-lock.json')
    git(cwd, 'commit', '-m', 'test: mismatched lock baseline')
    const mismatchedHead = git(cwd, 'rev-parse', 'HEAD')

    const result = release(cwd, '1.4.2')

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('packages[""].version must equal 1.4.0')
    expect(git(cwd, 'rev-parse', 'HEAD')).toBe(mismatchedHead)
    expect(git(cwd, 'rev-parse', 'main')).toBe(originalMain)
    expect(git(cwd, 'tag', '--list', '1.4.2')).toBe('')
    expect(originalHead).not.toBe(mismatchedHead)
  })

  it('catches mutation when the target tag already exists', () => {
    const cwd = createRepository()
    const originalHead = git(cwd, 'rev-parse', 'HEAD')
    const originalMain = git(cwd, 'rev-parse', 'main')
    git(cwd, 'tag', '-a', '1.4.2', '-m', 'existing target tag')

    const result = release(cwd, '1.4.2')

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('tag already exists: 1.4.2')
    expect(git(cwd, 'rev-parse', 'HEAD')).toBe(originalHead)
    expect(git(cwd, 'rev-parse', 'main')).toBe(originalMain)
    expect(manifestVersions(cwd)).toEqual({
      package: '1.4.0',
      lockfile: '1.4.0',
      lockfileRoot: '1.4.0',
    })
  })

  it('catches a non-CAS main update and preserves the visible post-commit recovery state without tagging', () => {
    const cwd = createRepository()
    const hooks = path.join(cwd, '.git', 'hooks')
    mkdirSync(hooks, { recursive: true })
    const hook = path.join(hooks, 'post-commit')
    writeFileSync(
      hook,
      [
        '#!/bin/sh',
        'old=$(git rev-parse refs/heads/main)',
        'tree=$(git rev-parse refs/heads/main^{tree})',
        'raced=$(printf \'concurrent main update\\n\' | git commit-tree "$tree" -p refs/heads/main)',
        'git update-ref refs/heads/main "$raced" "$old"',
        '',
      ].join('\n'),
      { mode: 0o755 },
    )

    const result = release(cwd, '1.4.2')

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('compare-and-swap failed')
    expect(result.stderr).toContain('No automatic rollback was attempted')
    expect(result.stderr).toContain('Recovery state: branch=dev')
    expect(git(cwd, 'show', '-s', '--format=%s', 'dev')).toBe('release: 1.4.2')
    expect(git(cwd, 'show', '-s', '--format=%s', 'main')).toBe(
      'concurrent main update',
    )
    expect(git(cwd, 'tag', '--list', '1.4.2')).toBe('')
    expect(git(cwd, 'status', '--porcelain', '--untracked-files=no')).toBe('')
  })
})

describe('production release VS Code task', () => {
  it('catches a task that does not pass one prompted exact version to the repository Node helper', () => {
    const text = readFileSync(
      path.join(REPO_ROOT, '.vscode/tasks.json'),
      'utf8',
    )
    const tasksConfig = JSON.parse(
      text
        .split('\n')
        .filter((line) => !line.trimStart().startsWith('//'))
        .join('\n'),
    )
    const releaseTasks = tasksConfig.tasks.filter(
      (task: { label?: string }) =>
        task.label === 'Release: prepare production version',
    )

    expect(releaseTasks).toEqual([
      {
        label: 'Release: prepare production version',
        type: 'process',
        command: 'node',
        args: [
          '${workspaceFolder}/scripts/prepare-production-release.mjs',
          '${input:productionVersion}',
        ],
        options: { cwd: '${workspaceFolder}' },
        problemMatcher: [],
      },
    ])
    expect(tasksConfig.inputs).toEqual([
      {
        id: 'productionVersion',
        type: 'promptString',
        description:
          'Exact production version (X.Y.Z, even minor, greater than current)',
      },
    ])
  })
})
