#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  closeSync,
  constants,
  copyFileSync,
  existsSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  derivePreviewVersion,
  nextPreviewArtifactCounter,
  validateLockfileRootVersion,
  validateProductionVersion,
} from './version-contract.mjs'

const COMMITTED_HEAD = 'Committed HEAD'
const INCLUDE_LOCAL_EDITS = 'Include local edits'
const TEMP_PREFIX = 'vmde-local-preview-'
const MAX_COMMAND_BUFFER = 1024 * 1024 * 1024
const MAX_MANIFEST_BYTES = 2 * 1024 * 1024
const require = createRequire(import.meta.url)
const yauzl = require('yauzl')

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

function runProcess(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    input: options.input,
    encoding: options.encoding ?? null,
    maxBuffer: MAX_COMMAND_BUFFER,
  })
  if (result.error) throw result.error
  const allowedStatuses = options.allowedStatuses ?? [0]
  if (!allowedStatuses.includes(result.status)) {
    const stderr = Buffer.isBuffer(result.stderr)
      ? result.stderr.toString('utf8').trim()
      : String(result.stderr ?? '').trim()
    throw new Error(
      `${options.label ?? `${command} ${args.join(' ')}`} failed${stderr ? `: ${stderr}` : ''}`,
    )
  }
  return result
}

function gitEnvironment() {
  return {
    ...process.env,
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'core.hooksPath',
    GIT_CONFIG_VALUE_0: '/dev/null',
  }
}

function runGit(repoRoot, args, options = {}) {
  return runProcess('git', args, {
    ...options,
    cwd: repoRoot,
    env: gitEnvironment(),
    label: options.label ?? `git ${args.join(' ')}`,
  })
}

function stdoutBuffer(result) {
  return Buffer.isBuffer(result.stdout)
    ? result.stdout
    : Buffer.from(result.stdout ?? '')
}

function splitNul(buffer) {
  const values = []
  let start = 0
  for (let index = 0; index < buffer.length; index += 1) {
    if (buffer[index] !== 0) continue
    values.push(buffer.subarray(start, index).toString('utf8'))
    start = index + 1
  }
  if (start < buffer.length)
    values.push(buffer.subarray(start).toString('utf8'))
  return values.filter(Boolean)
}

function sameStat(left, right) {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.mode === right.mode &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs
  )
}

function readStableFile(file) {
  const flags = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)
  const descriptor = openSync(file, flags)
  try {
    const before = fstatSync(descriptor, { bigint: true })
    if (!before.isFile())
      throw new Error(`Untracked input is not a regular file: ${file}`)
    const bytes = readFileSync(descriptor)
    const after = fstatSync(descriptor, { bigint: true })
    if (!sameStat(before, after)) {
      throw new Error(`Untracked input changed while it was captured: ${file}`)
    }
    return bytes
  } finally {
    closeSync(descriptor)
  }
}

function captureUntracked(repoRoot) {
  const listed = stdoutBuffer(
    runGit(repoRoot, ['ls-files', '--others', '--exclude-standard', '-z']),
  )
  return splitNul(listed).map((relativePath) => {
    const absolutePath = path.join(repoRoot, relativePath)
    const stat = lstatSync(absolutePath)
    if (stat.isFile()) {
      return {
        path: relativePath,
        kind: 'file',
        mode: stat.mode,
        bytes: readStableFile(absolutePath),
      }
    }
    if (stat.isSymbolicLink()) {
      return {
        path: relativePath,
        kind: 'symlink',
        mode: stat.mode,
        bytes: Buffer.from(readlinkSync(absolutePath)),
      }
    }
    return {
      path: relativePath,
      kind: 'other',
      mode: stat.mode,
      bytes: Buffer.alloc(0),
    }
  })
}

function capturePrimaryState(repoRoot, knownHead) {
  const head = stdoutBuffer(
    runGit(repoRoot, ['rev-parse', '--verify', 'HEAD^{commit}']),
  )
  if (knownHead && head.toString('utf8').trim() !== knownHead) {
    throw new Error(
      `Primary HEAD changed during capture: expected ${knownHead}`,
    )
  }
  return {
    head,
    branch: stdoutBuffer(
      runGit(repoRoot, ['symbolic-ref', '--quiet', 'HEAD'], {
        allowedStatuses: [0, 1],
      }),
    ),
    status: stdoutBuffer(
      runGit(repoRoot, [
        'status',
        '--porcelain=v2',
        '-z',
        '--untracked-files=all',
        '--ignored=no',
      ]),
    ),
    staged: stdoutBuffer(
      runGit(repoRoot, [
        'diff',
        '--cached',
        '--binary',
        '--full-index',
        '--no-ext-diff',
        '--no-textconv',
        '--no-renames',
        '--src-prefix=a/',
        '--dst-prefix=b/',
      ]),
    ),
    unstaged: stdoutBuffer(
      runGit(repoRoot, [
        'diff',
        '--binary',
        '--full-index',
        '--no-ext-diff',
        '--no-textconv',
        '--no-renames',
        '--src-prefix=a/',
        '--dst-prefix=b/',
      ]),
    ),
    refs: stdoutBuffer(
      runGit(repoRoot, [
        'for-each-ref',
        '--format=%(refname)%00%(objectname)%00%(symref)',
      ]),
    ),
    untracked: captureUntracked(repoRoot),
  }
}

function assertBufferEqual(name, actual, expected) {
  if (!actual.equals(expected)) {
    throw new Error(
      `Primary Git-visible ${name} changed during preview packaging`,
    )
  }
}

function assertPrimaryStateEqual(repoRoot, expected) {
  const actual = capturePrimaryState(repoRoot)
  for (const name of [
    'head',
    'branch',
    'status',
    'staged',
    'unstaged',
    'refs',
  ]) {
    assertBufferEqual(name, actual[name], expected[name])
  }
  if (actual.untracked.length !== expected.untracked.length) {
    throw new Error(
      'Primary Git-visible untracked paths changed during preview packaging',
    )
  }
  for (let index = 0; index < expected.untracked.length; index += 1) {
    const before = expected.untracked[index]
    const after = actual.untracked[index]
    if (
      before.path !== after.path ||
      before.kind !== after.kind ||
      before.mode !== after.mode ||
      !before.bytes.equals(after.bytes)
    ) {
      throw new Error(
        `Primary Git-visible untracked bytes changed during preview packaging: ${before.path}`,
      )
    }
  }
}

function parseSelection(value) {
  if (value === COMMITTED_HEAD || value === INCLUDE_LOCAL_EDITS) return value
  throw new Error(
    `Expected preview input "${COMMITTED_HEAD}" or "${INCLUDE_LOCAL_EDITS}": ${String(value)}`,
  )
}

function resolveRepositoryRoot() {
  const root = stdoutBuffer(
    runProcess('git', ['rev-parse', '--show-toplevel'], {
      cwd: process.cwd(),
      env: gitEnvironment(),
      label: 'Resolve repository root',
    }),
  )
    .toString('utf8')
    .trim()
  if (!root) throw new Error('Git repository root is empty')
  return realpathSync(root)
}

function validateDependencies(repoRoot) {
  const dependencies = [
    path.join(repoRoot, 'node_modules'),
    path.join(repoRoot, 'media-src', 'node_modules'),
  ]
  for (const dependencyPath of dependencies) {
    if (
      !existsSync(dependencyPath) ||
      !statSync(dependencyPath).isDirectory()
    ) {
      throw new Error(
        `Installed dependencies are not reusable: ${dependencyPath}`,
      )
    }
  }
  return dependencies
}

function isIgnored(repoRoot, relativePath, includeTracked = false) {
  const result = runGit(
    repoRoot,
    [
      'check-ignore',
      '--quiet',
      ...(includeTracked ? ['--no-index'] : []),
      '--',
      relativePath,
    ],
    { allowedStatuses: [0, 1] },
  )
  return result.status === 0
}

function captureIgnoredArtifactNames(repoRoot) {
  const artifacts = path.join(repoRoot, 'artifacts')
  if (!existsSync(artifacts)) return []
  if (!statSync(artifacts).isDirectory()) {
    throw new Error(`Primary artifact path is not a directory: ${artifacts}`)
  }
  return readdirSync(artifacts, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => isIgnored(repoRoot, path.posix.join('artifacts', name)))
}

function isSafeUntrackedPath(relativePath) {
  if (
    !relativePath ||
    relativePath.includes('\\') ||
    path.posix.isAbsolute(relativePath) ||
    path.win32.isAbsolute(relativePath) ||
    path.posix.normalize(relativePath) !== relativePath
  ) {
    return false
  }
  const segments = relativePath.split('/')
  if (
    segments.some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    return false
  }
  if (relativePath === 'LOCAL_AGENT_TASK.md') return false
  if (segments[0] === 'artifacts') return false
  if (segments.includes('node_modules')) return false
  if (
    segments[0].startsWith(`.${TEMP_PREFIX}`) ||
    segments[0].startsWith('.vmde-preview-')
  ) {
    return false
  }
  return true
}

function applyPatch(repoRoot, patch, staged) {
  if (patch.length === 0) return
  runGit(
    repoRoot,
    [
      'apply',
      '--binary',
      '--whitespace=nowarn',
      ...(staged ? ['--index'] : []),
      '-',
    ],
    {
      input: patch,
      label: staged ? 'Apply staged snapshot' : 'Apply unstaged snapshot',
    },
  )
}

function ensureSafeParents(worktreePath, relativePath) {
  const segments = relativePath.split('/')
  let current = worktreePath
  for (const segment of segments.slice(0, -1)) {
    current = path.join(current, segment)
    if (existsSync(current)) {
      if (!lstatSync(current).isDirectory()) {
        throw new Error(
          `Unsafe untracked parent in selected snapshot: ${relativePath}`,
        )
      }
    } else {
      mkdirSync(current)
    }
  }
}

function materializeUntracked(worktreePath, entries) {
  for (const entry of entries) {
    if (entry.kind !== 'file' || !isSafeUntrackedPath(entry.path)) continue
    ensureSafeParents(worktreePath, entry.path)
    const target = path.resolve(worktreePath, entry.path)
    const boundary = `${path.resolve(worktreePath)}${path.sep}`
    if (!target.startsWith(boundary) || existsSync(target)) {
      throw new Error(`Unsafe or conflicting untracked path: ${entry.path}`)
    }
    writeFileSync(target, entry.bytes, { flag: 'wx', mode: entry.mode & 0o777 })
    chmodSync(target, entry.mode & 0o777)
  }
}

function linkDependencies(worktreePath, dependencyPaths) {
  const links = [
    path.join(worktreePath, 'node_modules'),
    path.join(worktreePath, 'media-src', 'node_modules'),
  ]
  for (let index = 0; index < links.length; index += 1) {
    const link = links[index]
    if (existsSync(link)) {
      throw new Error(
        `Selected snapshot already contains dependency path: ${link}`,
      )
    }
    mkdirSync(path.dirname(link), { recursive: true })
    symlinkSync(
      dependencyPaths[index],
      link,
      process.platform === 'win32' ? 'junction' : 'dir',
    )
  }
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    throw new Error(
      `Invalid JSON in selected snapshot ${file}: ${errorMessage(error)}`,
    )
  }
}

function readSelectedBaseline(worktreePath) {
  const manifest = readJson(path.join(worktreePath, 'package.json'))
  const lockfile = readJson(path.join(worktreePath, 'package-lock.json'))
  validateProductionVersion(manifest.version)
  validateLockfileRootVersion(lockfile, manifest.version)
  if (manifest.name !== 'vmde') {
    throw new Error(
      `Selected package.json name must equal vmde: ${String(manifest.name)}`,
    )
  }
  return { packageName: manifest.name, productionVersion: manifest.version }
}

function updateTemporaryVersion(worktreePath, previewVersion) {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  runProcess(
    npm,
    ['version', previewVersion, '--no-git-tag-version', '--ignore-scripts'],
    { cwd: worktreePath, label: 'Update temporary preview version' },
  )
  const manifest = readJson(path.join(worktreePath, 'package.json'))
  const lockfile = readJson(path.join(worktreePath, 'package-lock.json'))
  if (manifest.version !== previewVersion) {
    throw new Error(
      `Temporary package.json version must equal ${previewVersion}: ${String(manifest.version)}`,
    )
  }
  validateLockfileRootVersion(lockfile, previewVersion)
}

function packageTemporaryVsix(worktreePath, output) {
  runProcess(
    process.execPath,
    ['scripts/package-vsix.mjs', '--pre-release', '--out', output],
    { cwd: worktreePath, label: 'Preview package command' },
  )
}

function readArchiveEntries(file, requestedNames) {
  return new Promise((resolvePromise, reject) => {
    yauzl.open(file, { lazyEntries: true }, (openError, zipFile) => {
      if (openError || !zipFile) {
        reject(openError ?? new Error(`Could not open VSIX archive: ${file}`))
        return
      }
      const entries = new Map()
      let settled = false
      const fail = (error) => {
        if (settled) return
        settled = true
        zipFile.close()
        reject(error)
      }
      zipFile.once('error', fail)
      zipFile.once('end', () => {
        if (settled) return
        settled = true
        resolvePromise(entries)
      })
      zipFile.on('entry', (entry) => {
        if (!requestedNames.has(entry.fileName)) {
          zipFile.readEntry()
          return
        }
        if (entries.has(entry.fileName)) {
          fail(new Error(`VSIX contains duplicate entry: ${entry.fileName}`))
          return
        }
        if (entry.uncompressedSize > MAX_MANIFEST_BYTES) {
          fail(
            new Error(
              `VSIX manifest entry is unexpectedly large: ${entry.fileName}`,
            ),
          )
          return
        }
        zipFile.openReadStream(entry, (streamError, stream) => {
          if (streamError || !stream) {
            fail(
              streamError ??
                new Error(`Could not read VSIX entry: ${entry.fileName}`),
            )
            return
          }
          const chunks = []
          let size = 0
          stream.on('data', (chunk) => {
            size += chunk.length
            if (size > MAX_MANIFEST_BYTES) {
              stream.destroy(
                new Error(
                  `VSIX manifest entry is too large: ${entry.fileName}`,
                ),
              )
              return
            }
            chunks.push(Buffer.from(chunk))
          })
          stream.once('error', fail)
          stream.once('end', () => {
            entries.set(entry.fileName, Buffer.concat(chunks))
            zipFile.readEntry()
          })
        })
      })
      zipFile.readEntry()
    })
  })
}

function xmlAttribute(tag, name) {
  const match = new RegExp(
    `\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`,
    'i',
  ).exec(tag)
  return match?.[1] ?? match?.[2]
}

async function validateVsix(file, expectedVersion) {
  if (!existsSync(file) || !statSync(file).isFile()) {
    throw new Error(
      `Preview package command did not create the expected VSIX: ${file}`,
    )
  }
  const extensionPackage = 'extension/package.json'
  const vsixManifest = 'extension.vsixmanifest'
  const entries = await readArchiveEntries(
    file,
    new Set([extensionPackage, vsixManifest]),
  )
  for (const entry of [extensionPackage, vsixManifest]) {
    if (!entries.has(entry))
      throw new Error(`VSIX is missing required entry: ${entry}`)
  }

  const manifest = JSON.parse(entries.get(extensionPackage).toString('utf8'))
  if (manifest.version !== expectedVersion) {
    throw new Error(
      `VSIX extension/package.json version must equal ${expectedVersion}: ${String(manifest.version)}`,
    )
  }

  const xml = entries.get(vsixManifest).toString('utf8')
  const identity = /<Identity\b[^>]*>/i.exec(xml)?.[0]
  const identityVersion = identity
    ? xmlAttribute(identity, 'Version')
    : undefined
  if (identityVersion !== expectedVersion) {
    throw new Error(
      `VSIX manifest Identity Version must equal ${expectedVersion}: ${String(identityVersion)}`,
    )
  }
  const properties = xml.match(/<Property\b[^>]*>/gi) ?? []
  const prerelease = properties.find(
    (property) =>
      xmlAttribute(property, 'Id') === 'Microsoft.VisualStudio.Code.PreRelease',
  )
  if (
    !prerelease ||
    xmlAttribute(prerelease, 'Value')?.toLowerCase() !== 'true'
  ) {
    throw new Error('VSIX prerelease property must equal true')
  }
}

function removeOwnedPaths(repoRoot, worktreePath, tempRoot, worktreeAdded) {
  const errors = []
  if (worktreeAdded) {
    try {
      runGit(repoRoot, ['worktree', 'remove', '--force', worktreePath], {
        label: `Remove owned Git worktree ${worktreePath}`,
      })
    } catch (error) {
      errors.push(
        new Error(
          `Git worktree registration remains for: ${worktreePath} (${errorMessage(error)})`,
        ),
      )
    }
  }
  if (tempRoot) {
    try {
      rmSync(tempRoot, { recursive: true, force: true })
    } catch (error) {
      errors.push(
        new Error(
          `Temporary path remains at: ${tempRoot} (${errorMessage(error)})`,
        ),
      )
    }
  }
  return errors
}

function hasWorktreeRegistration(repoRoot, worktreePath) {
  const list = stdoutBuffer(
    runGit(repoRoot, ['worktree', 'list', '--porcelain']),
  ).toString('utf8')
  return list.split('\n').includes(`worktree ${worktreePath}`)
}

function throwCollectedErrors(errors) {
  if (errors.length === 0) return
  throw new Error(errors.map(errorMessage).join('\n'))
}

async function packageLocalPreview(selection) {
  const selectedInput = parseSelection(selection)
  const repoRoot = resolveRepositoryRoot()
  const head = stdoutBuffer(
    runGit(repoRoot, ['rev-parse', '--verify', 'HEAD^{commit}']),
  )
    .toString('utf8')
    .trim()
  const dependencies = validateDependencies(repoRoot)
  const capturedState = capturePrimaryState(repoRoot, head)
  const artifactNames = captureIgnoredArtifactNames(repoRoot)

  let tempRoot
  let worktreePath
  let worktreeAdded = false
  let completedArtifact
  const errors = []
  try {
    tempRoot = mkdtempSync(path.join(tmpdir(), TEMP_PREFIX))
    worktreePath = path.join(tempRoot, 'worktree')
    try {
      runGit(repoRoot, ['worktree', 'add', '--detach', worktreePath, head], {
        label: 'Create detached preview worktree',
      })
      worktreeAdded = true
    } catch (error) {
      worktreeAdded = hasWorktreeRegistration(repoRoot, worktreePath)
      throw error
    }

    if (selectedInput === INCLUDE_LOCAL_EDITS) {
      applyPatch(worktreePath, capturedState.staged, true)
      applyPatch(worktreePath, capturedState.unstaged, false)
      materializeUntracked(worktreePath, capturedState.untracked)
    }
    linkDependencies(worktreePath, dependencies)

    const baseline = readSelectedBaseline(worktreePath)
    const counter = nextPreviewArtifactCounter(
      artifactNames,
      baseline.packageName,
      baseline.productionVersion,
    )
    const previewVersion = derivePreviewVersion(
      baseline.productionVersion,
      String(counter),
    )
    const artifactName = `${baseline.packageName}-${previewVersion}-preview.vsix`
    const temporaryOutput = path.join(tempRoot, artifactName)
    const primaryRelativeOutput = path.posix.join('artifacts', artifactName)
    if (!isIgnored(repoRoot, primaryRelativeOutput, true)) {
      throw new Error(
        `Preview artifact output must be Git-ignored: ${primaryRelativeOutput}`,
      )
    }

    updateTemporaryVersion(worktreePath, previewVersion)
    packageTemporaryVsix(worktreePath, temporaryOutput)
    await validateVsix(temporaryOutput, previewVersion)

    const artifactDirectory = path.join(repoRoot, 'artifacts')
    mkdirSync(artifactDirectory, { recursive: true })
    completedArtifact = path.join(artifactDirectory, artifactName)
    copyFileSync(temporaryOutput, completedArtifact, constants.COPYFILE_EXCL)
  } catch (error) {
    errors.push(error)
  } finally {
    errors.push(
      ...removeOwnedPaths(repoRoot, worktreePath, tempRoot, worktreeAdded),
    )
    try {
      assertPrimaryStateEqual(repoRoot, capturedState)
    } catch (error) {
      errors.push(error)
    }
  }

  throwCollectedErrors(errors)
  console.log(`Local preview VSIX ready: ${completedArtifact}`)
}

const isDirectRun =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])

if (isDirectRun) {
  const selectedInput = process.argv[2]
  if (process.argv.length !== 3) {
    console.error(
      `Usage: package-local-preview.mjs "${COMMITTED_HEAD}|${INCLUDE_LOCAL_EDITS}"`,
    )
    process.exitCode = 1
  } else {
    try {
      await packageLocalPreview(selectedInput)
    } catch (error) {
      console.error(errorMessage(error))
      process.exitCode = 1
    }
  }
}
