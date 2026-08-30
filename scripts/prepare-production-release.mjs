#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  compareNumericVersions,
  validateProductionBaseline,
  validateProductionTag,
  validateProductionVersion,
} from './version-contract.mjs'

const MANIFEST_PATHS = ['package.json', 'package-lock.json']
const EXPECTED_BRANCH = 'dev'
const HOOKS_TEMP_PREFIX = 'vmde-production-release-hooks-'
let childEnvironment = process.env

function run(command, args, cwd, description) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: childEnvironment,
  })
  if (result.error) {
    throw new Error(`${description}: ${result.error.message}`)
  }
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim()
    throw new Error(detail ? `${description}: ${detail}` : description)
  }
  return result.stdout.trim()
}

function status(command, args, cwd, description) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: childEnvironment,
  })
  if (result.error) {
    throw new Error(`${description}: ${result.error.message}`)
  }
  if (result.status === null) throw new Error(description)
  return result
}

function git(cwd, ...args) {
  return run('git', args, cwd, `git ${args.join(' ')} failed`)
}

function readJson(cwd, file) {
  return JSON.parse(readFileSync(path.join(cwd, file), 'utf8'))
}

function nulSeparatedPaths(value) {
  return value.split('\0').filter(Boolean).sort()
}

function assertExactPaths(actual, expected, label) {
  const wanted = [...expected].sort()
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new Error(
      `${label} must contain exactly ${wanted.join(', ')}; found ${actual.join(', ') || '(none)'}`,
    )
  }
}

function assertBranch(cwd) {
  const branch = git(cwd, 'branch', '--show-current')
  if (branch !== EXPECTED_BRANCH) {
    throw new Error(
      `current branch must be exactly ${EXPECTED_BRANCH}; found ${branch || '(detached HEAD)'}`,
    )
  }
}

function assertTrackedTreeClean(cwd) {
  const trackedStatus = git(cwd, 'status', '--porcelain', '--untracked-files=no')
  if (trackedStatus) {
    throw new Error(`tracked working tree must be clean; found:\n${trackedStatus}`)
  }
}

function assertTagAbsent(cwd, target) {
  const result = status(
    'git',
    ['show-ref', '--verify', '--quiet', `refs/tags/${target}`],
    cwd,
    `could not inspect tag ${target}`,
  )
  if (result.status === 0) throw new Error(`tag already exists: ${target}`)
  if (result.status !== 1) throw new Error(`could not inspect tag ${target}`)
}

function validateManifestVersions(cwd, expected) {
  const manifest = readJson(cwd, 'package.json')
  const lockfile = readJson(cwd, 'package-lock.json')
  validateProductionTag(expected, manifest, lockfile)
  return { manifest, lockfile }
}

function assertReleaseRepositoryState(cwd, target, releaseCommit) {
  assertBranch(cwd)
  if (
    git(cwd, 'rev-parse', 'refs/heads/dev') !== releaseCommit ||
    git(cwd, 'rev-parse', 'refs/heads/main') !== releaseCommit
  ) {
    throw new Error('dev and main must both equal the release commit')
  }
  validateManifestVersions(cwd, target)
  assertTrackedTreeClean(cwd)
}

function assertAnnotatedReleaseTag(cwd, target, releaseCommit) {
  if (git(cwd, 'cat-file', '-t', `refs/tags/${target}`) !== 'tag') {
    throw new Error(`release tag ${target} is not annotated`)
  }
  if (git(cwd, 'rev-list', '-n', '1', `refs/tags/${target}`) !== releaseCommit) {
    throw new Error(`release tag ${target} does not target the release commit`)
  }
}

function preflight(cwd, target) {
  validateProductionVersion(target)
  const manifest = readJson(cwd, 'package.json')
  const lockfile = readJson(cwd, 'package-lock.json')
  validateProductionBaseline(manifest, lockfile)
  if (compareNumericVersions(target, manifest.version) <= 0) {
    throw new Error(
      `target version ${target} must be strictly greater than current version ${manifest.version}`,
    )
  }

  assertBranch(cwd)
  assertTrackedTreeClean(cwd)

  const mainResult = status(
    'git',
    ['rev-parse', '--verify', '--quiet', 'refs/heads/main'],
    cwd,
    'could not inspect local main branch',
  )
  if (mainResult.status === 1) {
    throw new Error('local main branch does not exist')
  }
  if (mainResult.status !== 0) {
    throw new Error('could not inspect local main branch')
  }
  const oldMain = mainResult.stdout.trim()

  const ancestor = status(
    'git',
    ['merge-base', '--is-ancestor', 'refs/heads/main', 'refs/heads/dev'],
    cwd,
    'could not compare local main and dev',
  )
  if (ancestor.status === 1) {
    throw new Error('local main must be an ancestor of dev')
  }
  if (ancestor.status !== 0) {
    throw new Error('could not compare local main and dev')
  }

  assertTagAbsent(cwd, target)
  return oldMain
}

function updateMain(cwd, releaseCommit, oldMain) {
  const result = status(
    'git',
    ['update-ref', 'refs/heads/main', releaseCommit, oldMain],
    cwd,
    'main compare-and-swap failed',
  )
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim()
    throw new Error(
      detail
        ? `main compare-and-swap failed: ${detail}`
        : 'main compare-and-swap failed',
    )
  }
}

function describeRecoveryState(cwd, target) {
  const observe = (args, fallback) => {
    const result = spawnSync('git', args, {
      cwd,
      encoding: 'utf8',
      env: childEnvironment,
    })
    return result.status === 0 && result.stdout.trim()
      ? result.stdout.trim()
      : fallback
  }
  const branch = observe(['branch', '--show-current'], '(detached or unknown)')
  const head = observe(['rev-parse', '--verify', 'HEAD'], 'unknown')
  const main = observe(['rev-parse', '--verify', 'refs/heads/main'], 'absent')
  const tag = observe(
    ['rev-list', '-n', '1', `refs/tags/${target}`],
    'absent',
  )
  const tracked = observe(
    ['status', '--porcelain', '--untracked-files=no'],
    'clean',
  ).replaceAll('\n', ' | ')
  return `branch=${branch}; HEAD=${head}; main=${main}; tag ${target}=${tag}; tracked tree=${tracked}`
}

function prepareProductionRelease(cwd, target, state) {
  const oldMain = preflight(cwd, target)

  state.mutationStarted = true
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  run(
    npmCommand,
    ['version', target, '--no-git-tag-version', '--ignore-scripts'],
    cwd,
    `npm version ${target} failed`,
  )
  validateManifestVersions(cwd, target)

  assertExactPaths(
    nulSeparatedPaths(git(cwd, 'diff', '--name-only', '-z')),
    MANIFEST_PATHS,
    'npm version tracked changes',
  )
  assertExactPaths(
    nulSeparatedPaths(git(cwd, 'diff', '--cached', '--name-only', '-z')),
    [],
    'pre-stage inventory',
  )

  git(cwd, 'add', '--', ...MANIFEST_PATHS)
  assertExactPaths(
    nulSeparatedPaths(git(cwd, 'diff', '--cached', '--name-only', '-z')),
    MANIFEST_PATHS,
    'staged inventory',
  )
  assertExactPaths(
    nulSeparatedPaths(git(cwd, 'diff', '--name-only', '-z')),
    [],
    'unstaged tracked inventory',
  )

  const message = `release: ${target}`
  git(cwd, 'commit', '-m', message)
  const releaseCommit = git(cwd, 'rev-parse', 'HEAD')
  if (git(cwd, 'show', '-s', '--format=%s', releaseCommit) !== message) {
    throw new Error('release commit message verification failed')
  }
  assertExactPaths(
    git(
      cwd,
      'diff-tree',
      '--no-commit-id',
      '--name-only',
      '-r',
      '-z',
      releaseCommit,
    )
      .split('\0')
      .filter(Boolean)
      .sort(),
    MANIFEST_PATHS,
    'release commit paths',
  )

  updateMain(cwd, releaseCommit, oldMain)
  assertReleaseRepositoryState(cwd, target, releaseCommit)

  assertTagAbsent(cwd, target)
  git(cwd, 'tag', '--annotate', target, releaseCommit, '--message', message)
  assertAnnotatedReleaseTag(cwd, target, releaseCommit)
  assertReleaseRepositoryState(cwd, target, releaseCommit)

  console.log(`Prepared local production release ${target} at ${releaseCommit}`)
}

const state = { mutationStarted: false }
const args = process.argv.slice(2)
const target = args[0] ?? '(missing)'
let hooksPath

try {
  if (args.length !== 1) {
    throw new Error(
      'Usage: node scripts/prepare-production-release.mjs <exact-version-X.Y.Z>',
    )
  }
  hooksPath = mkdtempSync(path.join(tmpdir(), HOOKS_TEMP_PREFIX))
  childEnvironment = {
    ...process.env,
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'core.hooksPath',
    GIT_CONFIG_VALUE_0: hooksPath,
  }
  prepareProductionRelease(process.cwd(), target, state)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  if (state.mutationStarted) {
    console.error(
      'Release preparation stopped after repository mutation. No automatic rollback was attempted.',
    )
    console.error(`Recovery state: ${describeRecoveryState(process.cwd(), target)}`)
  }
  process.exitCode = 1
} finally {
  if (hooksPath) {
    try {
      rmSync(hooksPath, { recursive: true, force: true })
    } catch (error) {
      console.error(
        `Temporary hooks directory remains at: ${hooksPath} (${error instanceof Error ? error.message : String(error)})`,
      )
      process.exitCode = 1
    }
  }
}
