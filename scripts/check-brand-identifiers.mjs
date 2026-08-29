import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

const FORMER_SHORT_NAME = ['v', 'markd'].join('')
const FORMER_EXTENSION_NAME = ['visual', 'markdown', 'editor'].join('')
const FORMER_REPOSITORY_NAME = ['visual', 'markdown', 'editor'].join('-')
const FORBIDDEN = new RegExp(
  `${FORMER_SHORT_NAME}(?!own)|${FORMER_EXTENSION_NAME}|${FORMER_REPOSITORY_NAME}`,
  'gi',
)

const PREFIX_EXCLUSIONS = [
  {
    prefix: 'tasks/done/',
    reason: 'completed task records are immutable historical evidence',
  },
  {
    prefix: 'docs/superpowers/',
    reason: 'approved design and implementation records are immutable history',
  },
]

const ROOT_ACTIVE_FILES = new Set([
  'AGENTS.md',
  'CHANGELOG.md',
  'CLAUDE.md',
  'DEVELOPMENT.md',
  'README.md',
  'build.mjs',
  'package-lock.json',
  'package.json',
  'skills-lock.json',
])

const ACTIVE_PREFIXES = [
  '.agents/',
  '.claude/',
  '.github/',
  'docs/',
  'media-src/e2e/',
  'media-src/scripts/',
  'media-src/src/',
  'media/markdown-themes/',
  'scripts/',
  'src/',
  'test/',
  'tasks/',
]

const ACTIVE_EXACT_FILES = new Set([
  'media-src/build.mjs',
  'media-src/esbuild-shared.mjs',
  'media-src/package-lock.json',
  'media-src/package.json',
  'media-src/vendor/vendored-assets.mjs',
])

const ACTIVE_GENERATED_PREFIXES = [
  // These generated PlantUML stdlib bundles ship extension-owned browser globals. The fetch script
  // owns their contents, but the residual gate still checks the emitted runtime contract.
  'media-src/vendor/plantuml-stdlib/',
]

const BINARY_SUFFIXES = ['.gif', '.ico', '.jpg', '.jpeg', '.png', '.vsix', '.wasm', '.zip']

const CHANGELOG_ALLOW_START = '<!-- brand-check: former-brand-explanation-start -->'
const CHANGELOG_ALLOW_END = '<!-- brand-check: former-brand-explanation-end -->'

function isExcluded(file) {
  return PREFIX_EXCLUSIONS.find(({ prefix }) => file.startsWith(prefix))?.reason
}

function isActive(file) {
  if (!file.includes('/')) return ROOT_ACTIVE_FILES.has(file)
  if (ACTIVE_EXACT_FILES.has(file)) return true
  if (ACTIVE_PREFIXES.some((prefix) => file.startsWith(prefix))) return true
  if (ACTIVE_GENERATED_PREFIXES.some((prefix) => file.startsWith(prefix))) return true
  return file === `media/${FORMER_SHORT_NAME}.png`
}

function changelogAllowedLines(lines) {
  const allowed = new Set()
  let inside = false
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (line === CHANGELOG_ALLOW_START) {
      if (inside) throw new Error('CHANGELOG.md has nested former-brand explanation markers')
      inside = true
      allowed.add(index + 1)
      continue
    }
    if (line === CHANGELOG_ALLOW_END) {
      if (!inside) throw new Error('CHANGELOG.md has an unmatched explanation end marker')
      allowed.add(index + 1)
      inside = false
      continue
    }
    if (inside) allowed.add(index + 1)
  }
  if (inside) throw new Error('CHANGELOG.md has an unterminated former-brand explanation block')
  return allowed
}

function compactMatch(line, matchIndex, matchLength) {
  const start = Math.max(0, matchIndex - 30)
  const end = Math.min(line.length, matchIndex + matchLength + 30)
  return line.slice(start, end).replaceAll('\t', ' ')
}

const gitFiles = spawnSync(
  'git',
  ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
  { encoding: 'utf8' },
)
// Managed sandboxes can attach EPERM metadata to a completed child process. The exit status and
// output remain authoritative; this mirrors quality.mjs and keeps the gate usable locally and CI.
if (gitFiles.status !== 0) {
  throw new Error(`git ls-files failed: ${gitFiles.stderr || gitFiles.error?.message || 'unknown error'}`)
}
const trackedFiles = gitFiles.stdout.split('\0').filter(Boolean)

const violations = []
for (const file of trackedFiles) {
  if (!existsSync(file) || isExcluded(file) || !isActive(file)) continue

  FORBIDDEN.lastIndex = 0
  const pathMatch = FORBIDDEN.exec(file)
  if (pathMatch) {
    violations.push({ file, line: 0, token: pathMatch[0], excerpt: '<path>' })
  }

  if (BINARY_SUFFIXES.some((suffix) => file.toLowerCase().endsWith(suffix))) continue
  const bytes = readFileSync(file)
  const lines = bytes.toString('utf8').split(/\r?\n/)
  const allowedLines = file === 'CHANGELOG.md' ? changelogAllowedLines(lines) : new Set()

  for (let index = 0; index < lines.length; index += 1) {
    if (allowedLines.has(index + 1)) continue
    const line = lines[index]
    FORBIDDEN.lastIndex = 0
    for (const match of line.matchAll(FORBIDDEN)) {
      violations.push({
        file,
        line: index + 1,
        token: match[0],
        excerpt: compactMatch(line, match.index, match[0].length),
      })
    }
  }
}

if (violations.length > 0) {
  console.error(`Former-brand identifier check failed with ${violations.length} violation(s).`)
  for (const violation of violations.slice(0, 80)) {
    const location = violation.line === 0 ? violation.file : `${violation.file}:${violation.line}`
    console.error(`${location}: ${violation.token}: ${violation.excerpt}`)
  }
  if (violations.length > 80) {
    console.error(`... ${violations.length - 80} additional violation(s) omitted`)
  }
  process.exit(1)
}

console.log(`Former-brand identifier check passed across ${trackedFiles.length} tracked paths.`)
