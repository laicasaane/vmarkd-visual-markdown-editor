import { execFileSync, spawnSync } from 'node:child_process'
import {
  existsSync,
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
const PROTECTED_FILE = 'LOCAL_AGENT_TASK.md'
const PROTECTED_CONTENT = 'untracked and unchanged\n'

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
  writeFileSync(path.join(cwd, PROTECTED_FILE), PROTECTED_CONTENT)
  return cwd
}

function release(cwd: string, target: string, environment = {}) {
  return spawnSync(process.execPath, [RELEASE_SCRIPT, target], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...environment },
  })
}

function createGitWrapper(lines: string[]) {
  const bin = mkdtempSync(path.join(tmpdir(), 'vmde-release-git-wrapper-'))
  fixtures.push(bin)
  writeFileSync(path.join(bin, 'git'), `${lines.join('\n')}\n`, { mode: 0o755 })
  return {
    PATH: `${bin}:${process.env.PATH}`,
    VMDE_REAL_GIT: run('which', ['git'], REPO_ROOT),
  }
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

function observedGit(cwd: string, ...args: string[]) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' })
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  }
}

function snapshotFiles(cwd: string, args: string[]) {
  const files = git(cwd, ...args)
    .split('\0')
    .filter(Boolean)
    .sort()
  return Object.fromEntries(
    files.map((file) => [
      file,
      readFileSync(path.join(cwd, file)).toString('base64'),
    ]),
  )
}

function snapshotRepository(cwd: string) {
  return {
    branch: git(cwd, 'branch', '--show-current'),
    head: git(cwd, 'rev-parse', 'HEAD'),
    main: observedGit(
      cwd,
      'rev-parse',
      '--verify',
      '--quiet',
      'refs/heads/main',
    ),
    tags: git(
      cwd,
      'for-each-ref',
      '--format=%(refname)%00%(objecttype)%00%(objectname)%00%(*objectname)',
      'refs/tags',
    ),
    packageBytes: readFileSync(path.join(cwd, 'package.json')).toString(
      'base64',
    ),
    lockfileBytes: readFileSync(path.join(cwd, 'package-lock.json')).toString(
      'base64',
    ),
    trackedFiles: snapshotFiles(cwd, ['ls-files', '-z']),
    untrackedFiles: snapshotFiles(cwd, [
      'ls-files',
      '--others',
      '--exclude-standard',
      '-z',
    ]),
    status: git(cwd, 'status', '--porcelain=v1', '--untracked-files=all'),
    stagedPatch: git(cwd, 'diff', '--cached', '--binary'),
    unstagedPatch: git(cwd, 'diff', '--binary'),
    protectedBytes: readFileSync(path.join(cwd, PROTECTED_FILE)).toString(
      'base64',
    ),
    protectedStatus: git(
      cwd,
      'status',
      '--porcelain=v1',
      '--untracked-files=all',
      '--',
      PROTECTED_FILE,
    ),
  }
}

function expectUnmutated(
  cwd: string,
  before: ReturnType<typeof snapshotRepository>,
) {
  expect(snapshotRepository(cwd)).toEqual(before)
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
    const protectedFile = path.join(cwd, PROTECTED_FILE)

    const result = release(cwd, '1.4.2')

    expect(result.status).toBe(0)
    expect(readFileSync(protectedFile, 'utf8')).toBe(PROTECTED_CONTENT)
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
    writeFileSync(path.join(cwd, 'README.md'), 'dirty tracked file\n')
    if (staged) git(cwd, 'add', 'README.md')
    const before = snapshotRepository(cwd)

    const result = release(cwd, '1.4.2')

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('tracked working tree must be clean')
    expectUnmutated(cwd, before)
  })

  it.each([
    ['main', (cwd: string) => git(cwd, 'switch', 'main')],
    [
      'feature branch',
      (cwd: string) => git(cwd, 'switch', '-c', 'feature/release-test'),
    ],
    ['detached HEAD', (cwd: string) => git(cwd, 'switch', '--detach')],
  ])('catches mutation from %s instead of dev', (_name, selectBranch) => {
    const cwd = createRepository()
    selectBranch(cwd)
    const before = snapshotRepository(cwd)

    const result = release(cwd, '1.4.2')

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('current branch must be exactly dev')
    expectUnmutated(cwd, before)
  })

  it('catches mutation when local main is not an ancestor of dev', () => {
    const cwd = createRepository()
    git(cwd, 'switch', 'main')
    writeFileSync(path.join(cwd, 'main-only.txt'), 'divergent main\n')
    git(cwd, 'add', 'main-only.txt')
    git(cwd, 'commit', '-m', 'test: diverge main')
    git(cwd, 'switch', 'dev')
    const before = snapshotRepository(cwd)

    const result = release(cwd, '1.4.2')

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('local main must be an ancestor of dev')
    expectUnmutated(cwd, before)
  })

  it('catches mutation when the required local main branch does not exist', () => {
    const cwd = createRepository()
    git(cwd, 'branch', '-D', 'main')
    const before = snapshotRepository(cwd)

    const result = release(cwd, '1.4.2')

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('local main branch does not exist')
    expectUnmutated(cwd, before)
  })

  it.each([
    ['1.4.0', 'strictly greater than current version 1.4.0'],
    ['1.2.2', 'strictly greater than current version 1.4.0'],
    ['1.5.0', 'even minor number'],
    ['v1.4.2', 'numeric version X.Y.Z'],
  ])('catches mutation for invalid target %s', (target, message) => {
    const cwd = createRepository()
    const before = snapshotRepository(cwd)

    const result = release(cwd, target)

    expect(result.status).toBe(1)
    expect(result.stderr).toContain(message)
    expect(git(cwd, 'tag', '--list', target)).toBe('')
    expectUnmutated(cwd, before)
  })

  it('catches mutation when package and lockfile baseline versions disagree', () => {
    const cwd = createRepository()
    const lockfilePath = path.join(cwd, 'package-lock.json')
    const lockfile = JSON.parse(readFileSync(lockfilePath, 'utf8'))
    lockfile.packages[''].version = '1.2.0'
    writeFileSync(lockfilePath, `${JSON.stringify(lockfile, null, 2)}\n`)
    git(cwd, 'add', 'package-lock.json')
    git(cwd, 'commit', '-m', 'test: mismatched lock baseline')
    const before = snapshotRepository(cwd)

    const result = release(cwd, '1.4.2')

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('packages[""].version must equal 1.4.0')
    expectUnmutated(cwd, before)
  })

  it('rejects an odd-minor current baseline before repository mutation', () => {
    const cwd = createRepository()
    writeManifests(cwd, '1.5.0')
    git(cwd, 'add', 'package.json', 'package-lock.json')
    git(cwd, 'commit', '-m', 'test: odd preview baseline')
    const before = snapshotRepository(cwd)

    const result = release(cwd, '1.6.0')

    expect(result.status).toBe(1)
    expect(result.stderr).toContain(
      'Production version must use an even minor number: 1.5.0',
    )
    expectUnmutated(cwd, before)
  })

  it('catches mutation when the target tag already exists', () => {
    const cwd = createRepository()
    git(cwd, 'tag', '-a', '1.4.2', '-m', 'existing target tag')
    const before = snapshotRepository(cwd)

    const result = release(cwd, '1.4.2')

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('tag already exists: 1.4.2')
    expectUnmutated(cwd, before)
  })

  it('catches npm version lifecycle scripts that can mutate untracked files or invoke a push', () => {
    const cwd = createRepository()
    const manifestPath = path.join(cwd, 'package.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    manifest.scripts = {
      preversion: 'node hostile-lifecycle.mjs preversion',
      version: 'node hostile-lifecycle.mjs version',
      postversion: 'node hostile-lifecycle.mjs postversion',
    }
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
    writeFileSync(
      path.join(cwd, 'hostile-lifecycle.mjs'),
      [
        "import { appendFileSync, rmSync } from 'node:fs'",
        "import { spawnSync } from 'node:child_process'",
        "appendFileSync('lifecycle-ran.txt', `${process.argv[2]}\\n`)",
        `rmSync('${PROTECTED_FILE}', { force: true })`,
        "spawnSync('git', ['push', 'origin', 'dev'])",
        '',
      ].join('\n'),
    )
    git(cwd, 'add', 'package.json', 'hostile-lifecycle.mjs')
    git(cwd, 'commit', '-m', 'test: hostile version lifecycle')
    const fakePushMarker = path.join(cwd, 'fake-push-ran.txt')
    const wrapperEnvironment = createGitWrapper([
      '#!/bin/sh',
      'if [ "$1" = "push" ]; then',
      '  printf "push invoked\\n" > "$VMDE_FAKE_PUSH_MARKER"',
      '  exit 0',
      'fi',
      'exec "$VMDE_REAL_GIT" "$@"',
    ])

    const result = release(cwd, '1.4.2', {
      ...wrapperEnvironment,
      VMDE_FAKE_PUSH_MARKER: fakePushMarker,
    })

    expect(result.status).toBe(0)
    expect(existsSync(path.join(cwd, PROTECTED_FILE))).toBe(true)
    expect(readFileSync(path.join(cwd, PROTECTED_FILE), 'utf8')).toBe(
      PROTECTED_CONTENT,
    )
    expect(existsSync(path.join(cwd, 'lifecycle-ran.txt'))).toBe(false)
    expect(existsSync(fakePushMarker)).toBe(false)
    expect(manifestVersions(cwd)).toEqual({
      package: '1.4.2',
      lockfile: '1.4.2',
      lockfileRoot: '1.4.2',
    })
    expect(
      git(cwd, 'diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD')
        .split('\n')
        .sort(),
    ).toEqual(['package-lock.json', 'package.json'])
  })

  it.skipIf(process.platform === 'win32')(
    'passes one empty temporary hooks path to every Git and npm child and removes it',
    () => {
      const cwd = createRepository()
      const bin = mkdtempSync(
        path.join(tmpdir(), 'vmde-release-child-wrapper-'),
      )
      fixtures.push(bin)
      const observations = path.join(bin, 'observations.txt')
      const wrapper = (name: 'git' | 'npm', realCommand: string) => {
        writeFileSync(
          path.join(bin, name),
          [
            '#!/bin/sh',
            '[ -d "$GIT_CONFIG_VALUE_0" ] || exit 91',
            '[ -z "$(find "$GIT_CONFIG_VALUE_0" -mindepth 1 -print -quit)" ] || exit 92',
            `printf '${name}|%s|%s|%s\\n' "$GIT_CONFIG_COUNT" "$GIT_CONFIG_KEY_0" "$GIT_CONFIG_VALUE_0" >> "$VMDE_HOOK_OBSERVATIONS"`,
            `exec "${realCommand}" "$@"`,
            '',
          ].join('\n'),
          { mode: 0o755 },
        )
      }
      wrapper('git', run('which', ['git'], REPO_ROOT))
      wrapper('npm', run('which', ['npm'], REPO_ROOT))

      const result = release(cwd, '1.4.2', {
        PATH: `${bin}:${process.env.PATH}`,
        VMDE_HOOK_OBSERVATIONS: observations,
      })

      expect(result.status, result.stderr).toBe(0)
      const observed = readFileSync(observations, 'utf8')
        .trim()
        .split('\n')
        .map((line) => line.split('|'))
      expect(new Set(observed.map(([command]) => command))).toEqual(
        new Set(['git', 'npm']),
      )
      expect(
        observed.every(
          ([, count, key]) => count === '1' && key === 'core.hooksPath',
        ),
      ).toBe(true)
      const hooksPaths = new Set(observed.map(([, , , hooksPath]) => hooksPath))
      expect(hooksPaths.size).toBe(1)
      const hooksPath = [...hooksPaths][0]
      expect(hooksPath).toBeDefined()
      if (!hooksPath) throw new Error('hooks path was not observed')
      expect(path.basename(hooksPath)).toMatch(
        /^vmde-production-release-hooks-/,
      )
      expect(existsSync(hooksPath)).toBe(false)
    },
  )

  it.skipIf(process.platform === 'win32')(
    'disables hostile post-commit and reference-transaction hooks without invoking push',
    () => {
      const cwd = createRepository()
      const hooks = path.join(cwd, '.git', 'hooks')
      mkdirSync(hooks, { recursive: true })
      const marker = path.join(cwd, 'hostile-hook-ran.txt')
      const fakePushMarker = path.join(cwd, 'fake-push-ran.txt')
      const fakePush = path.join(cwd, 'fake-push')
      writeFileSync(
        fakePush,
        `#!/bin/sh\nprintf 'push invoked\\n' > '${fakePushMarker}'\n`,
        { mode: 0o755 },
      )
      for (const hookName of ['post-commit', 'reference-transaction']) {
        writeFileSync(
          path.join(hooks, hookName),
          [
            '#!/bin/sh',
            `printf '${hookName}\\n' >> '${marker}'`,
            `rm -f '${path.join(cwd, PROTECTED_FILE)}'`,
            `'${fakePush}'`,
            '',
          ].join('\n'),
          { mode: 0o755 },
        )
      }

      const result = release(cwd, '1.4.2')

      expect(result.status, result.stderr).toBe(0)
      expect(readFileSync(path.join(cwd, PROTECTED_FILE), 'utf8')).toBe(
        PROTECTED_CONTENT,
      )
      expect(existsSync(marker)).toBe(false)
      expect(existsSync(fakePushMarker)).toBe(false)
    },
  )

  it('catches a non-CAS main update and preserves the visible post-commit recovery state without tagging', () => {
    const cwd = createRepository()
    const wrapperEnvironment = createGitWrapper([
      '#!/bin/sh',
      'if [ "$1" = "commit" ]; then',
      '  "$VMDE_REAL_GIT" "$@"',
      '  code=$?',
      '  if [ "$code" -eq 0 ]; then',
      '    old=$("$VMDE_REAL_GIT" rev-parse refs/heads/main)',
      '    tree=$("$VMDE_REAL_GIT" rev-parse refs/heads/main^{tree})',
      '    raced=$(printf "concurrent main update\\n" | "$VMDE_REAL_GIT" commit-tree "$tree" -p refs/heads/main)',
      '    "$VMDE_REAL_GIT" update-ref refs/heads/main "$raced" "$old"',
      '  fi',
      '  exit "$code"',
      'fi',
      'exec "$VMDE_REAL_GIT" "$@"',
    ])

    const result = release(cwd, '1.4.2', wrapperEnvironment)

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

  it('catches post-CAS main movement during annotated tag creation and reports the tagged recovery state', () => {
    const cwd = createRepository()
    const wrapperEnvironment = createGitWrapper([
      '#!/bin/sh',
      'if [ "$1" = "tag" ] && [ "$2" = "--annotate" ]; then',
      '  "$VMDE_REAL_GIT" "$@"',
      '  code=$?',
      '  if [ "$code" -eq 0 ]; then',
      '    old=$("$VMDE_REAL_GIT" rev-parse refs/heads/main)',
      '    tree=$("$VMDE_REAL_GIT" rev-parse refs/heads/main^{tree})',
      '    raced=$(printf "post-tag main movement\\n" | "$VMDE_REAL_GIT" commit-tree "$tree" -p "$old")',
      '    "$VMDE_REAL_GIT" update-ref refs/heads/main "$raced" "$old"',
      '  fi',
      '  exit "$code"',
      'fi',
      'exec "$VMDE_REAL_GIT" "$@"',
    ])

    const result = release(cwd, '1.4.2', wrapperEnvironment)

    expect(result.status).toBe(1)
    expect(result.stderr).toContain(
      'dev and main must both equal the release commit',
    )
    expect(result.stderr).toContain('No automatic rollback was attempted')
    expect(result.stderr).toContain('tag 1.4.2=')
    const releaseCommit = git(cwd, 'rev-parse', 'dev')
    expect(git(cwd, 'show', '-s', '--format=%s', 'main')).toBe(
      'post-tag main movement',
    )
    expect(git(cwd, 'cat-file', '-t', 'refs/tags/1.4.2')).toBe('tag')
    expect(git(cwd, 'rev-list', '-n', '1', 'refs/tags/1.4.2')).toBe(
      releaseCommit,
    )
    expect(git(cwd, 'branch', '--show-current')).toBe('dev')
    expect(manifestVersions(cwd)).toEqual({
      package: '1.4.2',
      lockfile: '1.4.2',
      lockfileRoot: '1.4.2',
    })
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
    const productionVersionInputs = tasksConfig.inputs.filter(
      (input: { id?: string }) => input.id === 'productionVersion',
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
    expect(productionVersionInputs).toEqual([
      {
        id: 'productionVersion',
        type: 'promptString',
        description:
          'Exact production version (X.Y.Z, even minor, greater than current)',
      },
    ])
  })
})
