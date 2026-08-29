#!/usr/bin/env node
import { readFileSync, readdirSync } from 'node:fs'
import vm from 'node:vm'

const [oldPath, newPath, ...requestedFiles] = process.argv.slice(2)
if (!oldPath || !newPath) {
  throw new Error(
    'usage: node scripts/compare-lute-roundtrip.mjs <old-lute.min.js> <new-lute.min.js>',
  )
}

function loadLute(file) {
  const sandbox = {
    TextDecoder,
    TextEncoder,
    clearInterval,
    clearTimeout,
    console,
    setInterval,
    setTimeout,
  }
  vm.createContext(sandbox)
  vm.runInContext(readFileSync(file, 'utf8'), sandbox, { filename: file })
  const lute = sandbox.Lute.New()
  lute.SetVditorWYSIWYG(true)
  lute.SetSpin(true)
  return lute
}

const oldLute = loadLute(oldPath)
const newLute = loadLute(newPath)
const excludedRoots = [
  '.git/',
  '.vscode-test/',
  'node_modules/',
  'media/',
  'coverage/',
  'test-results/',
]
const files = (
  requestedFiles.length > 0 ? requestedFiles : readdirSync('.', { recursive: true })
)
  .filter(
    (file) =>
      file.endsWith('.md') &&
      !excludedRoots.some(
        (root) => file.startsWith(root) || file.includes(`/${root}`),
      ),
  )
  .sort()

const constructRules = [
  ['callout', /^> \[!/m],
  ['comment', /<!--/],
  ['wiki', /\[\[/],
  ['list', /^(?:\s*[-+*]|\s*\d+[.)])\s/m],
  ['table', /^\s*\|.+\|\s*$/m],
  ['fence', /^```/m],
  ['soft-break', /[^\n]\n[^\n]/],
  ['link', /\[[^\]]+\]\([^)]+\)|\[[^\]]+\]\[[^\]]*\]/],
]
const classify = (markdown) =>
  constructRules
    .filter(([, pattern]) => pattern.test(markdown))
    .map(([name]) => name)

const normalizeTail = (value) => value.replace(/\n+$/, '')
const diffPreview = (before, after) => {
  let index = 0
  while (index < before.length && before[index] === after[index]) index += 1
  const start = Math.max(0, index - 60)
  return {
    index,
    before: before.slice(start, index + 120),
    after: after.slice(start, index + 120),
  }
}
const roundTrip = (lute, markdown, mode) =>
  normalizeTail(
    mode === 'ir'
      ? lute.VditorIRDOM2Md(lute.Md2VditorIRDOM(markdown))
      : lute.VditorDOM2Md(lute.Md2VditorDOM(markdown)),
  )

const changes = []
const errors = []
for (const file of files) {
  const markdown = readFileSync(file, 'utf8')
  try {
    const oldIr = roundTrip(oldLute, markdown, 'ir')
    const newIr = roundTrip(newLute, markdown, 'ir')
    const oldWysiwyg = roundTrip(oldLute, markdown, 'wysiwyg')
    const newWysiwyg = roundTrip(newLute, markdown, 'wysiwyg')
    if (oldIr !== newIr || oldWysiwyg !== newWysiwyg) {
      changes.push({
        file,
        constructs: classify(markdown),
        irChanged: oldIr !== newIr,
        wysiwygChanged: oldWysiwyg !== newWysiwyg,
        irWhitespaceOnly:
          oldIr.replace(/\s/g, '') === newIr.replace(/\s/g, ''),
        wysiwygWhitespaceOnly:
          oldWysiwyg.replace(/\s/g, '') ===
          newWysiwyg.replace(/\s/g, ''),
        oldIrLength: oldIr.length,
        newIrLength: newIr.length,
        oldWysiwygLength: oldWysiwyg.length,
        newWysiwygLength: newWysiwyg.length,
        irDiff: oldIr === newIr ? undefined : diffPreview(oldIr, newIr),
        wysiwygDiff:
          oldWysiwyg === newWysiwyg
            ? undefined
            : diffPreview(oldWysiwyg, newWysiwyg),
      })
    }
  } catch (error) {
    errors.push({ file, error: error instanceof Error ? error.message : String(error) })
  }
}

const byConstruct = {}
for (const change of changes) {
  for (const construct of change.constructs) {
    byConstruct[construct] = (byConstruct[construct] ?? 0) + 1
  }
}
console.log(
  JSON.stringify(
    {
      filesCompared: files.length,
      changedFiles: changes.length,
      errors: errors.length,
      byConstruct,
      changesWithoutTables: changes
        .filter((change) => !change.constructs.includes('table'))
        .map((change) => change.file),
      nonWhitespaceChanges: changes
        .filter(
          (change) =>
            !change.irWhitespaceOnly || !change.wysiwygWhitespaceOnly,
        )
        .map((change) => change.file),
      changes,
      errorDetails: errors,
    },
    null,
    2,
  ),
)
