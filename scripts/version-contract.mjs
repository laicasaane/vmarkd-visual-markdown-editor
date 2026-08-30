#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const NUMERIC_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
const POSITIVE_INTEGER = /^[1-9]\d*$/

function parseComponent(value, name) {
  const number = Number(value)
  if (!Number.isSafeInteger(number)) {
    throw new Error(`${name} must be a safe integer: ${value}`)
  }
  return number
}

export function parseNumericVersion(version) {
  if (typeof version !== 'string') {
    throw new Error(`Expected numeric version X.Y.Z: ${String(version)}`)
  }
  const match = NUMERIC_VERSION.exec(version)
  if (!match) throw new Error(`Expected numeric version X.Y.Z: ${version}`)
  return {
    major: parseComponent(match[1], 'major version'),
    minor: parseComponent(match[2], 'minor version'),
    patch: parseComponent(match[3], 'patch version'),
  }
}

export function compareNumericVersions(left, right) {
  const a = parseNumericVersion(left)
  const b = parseNumericVersion(right)
  for (const component of ['major', 'minor', 'patch']) {
    if (a[component] < b[component]) return -1
    if (a[component] > b[component]) return 1
  }
  return 0
}

export function validateProductionVersion(version) {
  const parsed = parseNumericVersion(version)
  if (parsed.minor % 2 !== 0) {
    throw new Error(`Production version must use an even minor number: ${version}`)
  }
  return parsed
}

export function derivePreviewVersion(productionVersion, buildId) {
  const production = validateProductionVersion(productionVersion)
  if (typeof buildId !== 'string' || !POSITIVE_INTEGER.test(buildId)) {
    throw new Error(`Preview requires a positive numeric build ID: ${String(buildId)}`)
  }
  const patch = parseComponent(buildId, 'build ID')
  return `${production.major}.${production.minor + 1}.${patch}`
}

function escapedRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function nextPreviewArtifactCounter(files, packageName, productionVersion) {
  const production = validateProductionVersion(productionVersion)
  const prefix = `${escapedRegExp(packageName)}-${production.major}.${production.minor + 1}.`
  const pattern = new RegExp(`^${prefix}([1-9]\\d*)-preview\\.vsix$`)
  let highest = 0
  for (const file of files) {
    const match = pattern.exec(file)
    if (!match) continue
    highest = Math.max(highest, parseComponent(match[1], 'preview artifact counter'))
  }
  if (highest === Number.MAX_SAFE_INTEGER) {
    throw new Error('Preview artifact counter exceeds safe integer range')
  }
  return highest + 1
}

export function validateLockfileRootVersion(lockfile, expectedVersion) {
  parseNumericVersion(expectedVersion)
  if (lockfile?.version !== expectedVersion) {
    throw new Error(
      `package-lock.json version must equal ${expectedVersion}: ${String(lockfile?.version)}`,
    )
  }
  if (lockfile?.packages?.['']?.version !== expectedVersion) {
    throw new Error(
      `package-lock.json packages[""].version must equal ${expectedVersion}: ${String(lockfile?.packages?.['']?.version)}`,
    )
  }
}

export function validateProductionBaseline(manifest, lockfile) {
  const parsed = validateProductionVersion(manifest?.version)
  validateLockfileRootVersion(lockfile, manifest.version)
  return parsed
}

export function validateProductionTag(tag, manifest, lockfile) {
  validateProductionBaseline(manifest, lockfile)
  const parsed = validateProductionVersion(tag)
  if (tag !== manifest.version) {
    throw new Error(
      `Production tag ${tag} does not match package.json version ${String(manifest.version)}`,
    )
  }
  return parsed
}

function formatOutput(version, azure) {
  return azure
    ? `##vso[task.setvariable variable=VMDE_VERSION;isReadOnly=true]${version}`
    : version
}

export function runVersionContractCli(args, readJson = readFileSync) {
  const azure = args.at(-1) === '--azure'
  const values = azure ? args.slice(0, -1) : args
  const [command, ...rest] = values
  if (command === 'preview' && rest.length === 3) {
    const [packagePath, lockfilePath, buildId] = rest
    const manifest = JSON.parse(readJson(packagePath, 'utf8'))
    const lockfile = JSON.parse(readJson(lockfilePath, 'utf8'))
    validateProductionBaseline(manifest, lockfile)
    return formatOutput(derivePreviewVersion(manifest.version, buildId), azure)
  }
  if (command === 'production' && rest.length === 1) {
    validateProductionVersion(rest[0])
    return formatOutput(rest[0], azure)
  }
  if (command === 'release' && rest.length === 3) {
    const [tag, packagePath, lockfilePath] = rest
    const manifest = JSON.parse(readJson(packagePath, 'utf8'))
    const lockfile = JSON.parse(readJson(lockfilePath, 'utf8'))
    validateProductionTag(tag, manifest, lockfile)
    return formatOutput(tag, azure)
  }
  throw new Error(
    'Usage: version-contract.mjs <preview|production|release> ... [--azure]',
  )
}

const isDirectRun =
  process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])

if (isDirectRun) {
  try {
    console.log(runVersionContractCli(process.argv.slice(2)))
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
