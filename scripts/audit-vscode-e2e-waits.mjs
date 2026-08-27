#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { parseSync } from 'oxc-parser'

const SKIPPED_METHODS = new Set(['skip', 'fixme'])
const NON_TEST_METHODS = new Set([
  'afterAll',
  'afterEach',
  'beforeAll',
  'beforeEach',
  'describe',
  'setTimeout',
  'slow',
  'step',
  'use',
])

const isNode = (value) =>
  value !== null && typeof value === 'object' && typeof value.type === 'string'

const childNodes = (node) => {
  const children = []
  for (const [key, value] of Object.entries(node ?? {})) {
    if (['end', 'loc', 'raw', 'start', 'type'].includes(key)) continue
    if (Array.isArray(value)) {
      for (const item of value) if (isNode(item)) children.push(item)
    } else if (isNode(value)) children.push(value)
  }
  return children
}

const walk = (node, visit, ancestors = []) => {
  if (!isNode(node)) return
  visit(node, ancestors)
  const next = [...ancestors, node]
  for (const child of childNodes(node)) walk(child, visit, next)
}

const unwrap = (node) => {
  let current = node
  while (
    current &&
    [
      'ChainExpression',
      'ParenthesizedExpression',
      'TSAsExpression',
      'TSNonNullExpression',
      'TSSatisfiesExpression',
      'TSTypeAssertion',
    ].includes(current.type)
  ) {
    current = current.expression
  }
  return current
}

const identifierName = (node) => {
  const current = unwrap(node)
  return current?.type === 'Identifier' ? current.name : null
}

const memberName = (node) => {
  const current = unwrap(node)
  if (current?.type !== 'MemberExpression' || current.computed) return null
  return identifierName(current.property)
}

const numericValue = (node, constants) => {
  const current = unwrap(node)
  if (current?.type === 'Literal' && typeof current.value === 'number')
    return current.value
  const name = identifierName(current)
  return name ? (constants.get(name) ?? null) : null
}

const staticTitle = (node) => {
  const current = unwrap(node)
  if (current?.type === 'Literal' && typeof current.value === 'string')
    return current.value
  if (
    current?.type === 'TemplateLiteral' &&
    current.expressions.length === 0 &&
    current.quasis.length === 1
  )
    return current.quasis[0].value.cooked ?? current.quasis[0].value.raw
  return '<dynamic title>'
}

const functionNode = (node) =>
  ['ArrowFunctionExpression', 'FunctionExpression'].includes(node?.type)

const promiseContext = (ancestors) => {
  for (let index = ancestors.length - 1; index >= 0; index--) {
    const node = ancestors[index]
    if (
      node.type === 'NewExpression' &&
      identifierName(node.callee) === 'Promise' &&
      functionNode(node.arguments?.[0])
    )
      return node.arguments[0]
  }
  return null
}

const resolverCallCount = (promiseCallback) => {
  const resolver = identifierName(promiseCallback?.params?.[0])
  if (!resolver) return 0
  let count = 0
  walk(promiseCallback.body, (node) => {
    if (
      node.type === 'CallExpression' &&
      identifierName(node.callee) === resolver
    )
      count++
  })
  return count
}

const isConditionalTimeout = (call, ancestors) => {
  const promiseCallback = promiseContext(ancestors)
  if (!promiseCallback) return true
  const callback = unwrap(call.arguments?.[0])
  if (identifierName(callback)) return false
  return resolverCallCount(promiseCallback) > 1
}

const functionNameAndNode = (node) => {
  if (node.type === 'FunctionDeclaration' && node.id)
    return { name: node.id.name, fn: node }
  if (
    node.type === 'VariableDeclarator' &&
    node.id?.type === 'Identifier' &&
    functionNode(node.init)
  )
    return { name: node.id.name, fn: node.init }
  return null
}

const isNumberParameter = (parameter) => {
  const type = parameter?.typeAnnotation?.typeAnnotation?.type
  return type === 'TSNumberKeyword'
}

const discoverConstants = (program) => {
  const constants = new Map()
  walk(program, (node) => {
    if (node.type !== 'VariableDeclarator' || node.id?.type !== 'Identifier')
      return
    const value = unwrap(node.init)
    if (value?.type === 'Literal' && typeof value.value === 'number')
      constants.set(node.id.name, value.value)
  })
  return constants
}

const discoverWrappers = (program) => {
  const wrappers = new Map()
  walk(program, (node) => {
    const named = functionNameAndNode(node)
    if (!named) return
    const timeouts = []
    walk(named.fn.body, (child, ancestors) => {
      if (
        child.type === 'CallExpression' &&
        identifierName(child.callee) === 'setTimeout'
      )
        timeouts.push({ call: child, ancestors })
    })
    if (timeouts.length === 0) return

    let parameterIndex = named.fn.params.findIndex((parameter) => {
      const name = identifierName(parameter)
      return (
        name &&
        timeouts.some(
          ({ call }) => identifierName(call.arguments?.[1]) === name,
        )
      )
    })
    if (parameterIndex < 0)
      parameterIndex = named.fn.params.findIndex(
        (parameter) =>
          isNumberParameter(parameter) ||
          /^(delay|duration|ms|timeout|t)$/i.test(
            identifierName(parameter) ?? '',
          ),
      )
    if (parameterIndex < 0) return
    wrappers.set(named.name, {
      parameterIndex,
      conditional: timeouts.every(({ call, ancestors }) =>
        isConditionalTimeout(call, ancestors),
      ),
    })
  })
  return wrappers
}

const testCall = (node) => {
  if (node.type !== 'CallExpression') return null
  const direct = identifierName(node.callee)
  if (direct === 'test') return { skipped: false }
  const current = unwrap(node.callee)
  if (current?.type !== 'MemberExpression') return null
  if (identifierName(current.object) !== 'test') return null
  const method = memberName(current)
  if (!method || NON_TEST_METHODS.has(method)) return null
  return { skipped: SKIPPED_METHODS.has(method) }
}

const lineAt = (source, offset) =>
  source.slice(0, offset).split('\n').length

const nearestDisposition = (comments, source, offset) => {
  const line = lineAt(source, offset)
  const candidates = comments
    .filter(
      (comment) =>
        comment.end <= offset &&
        /task\s*(?:419|451|512)\b/i.test(comment.value) &&
        line - lineAt(source, comment.end) <= 8,
    )
    .sort((left, right) => right.end - left.end)
  return candidates[0]?.value.trim() ?? null
}

const callShape = (call, constants, wrappers, ancestors) => {
  const direct = identifierName(call.callee)
  if (direct === 'setTimeout') {
    const delay = numericValue(call.arguments?.[1], constants)
    if (delay === null || isConditionalTimeout(call, ancestors)) return null
    return { delay, shape: 'setTimeout' }
  }
  if (memberName(call.callee) === 'waitForTimeout') {
    const delay = numericValue(call.arguments?.[0], constants)
    return delay === null ? null : { delay, shape: 'waitForTimeout' }
  }
  if (direct === 'settle') {
    const delay = numericValue(call.arguments?.at(-1), constants)
    return delay === null ? null : { delay, shape: 'settle' }
  }
  const wrapper = direct ? wrappers.get(direct) : null
  if (!wrapper || wrapper.conditional) return null
  const delay = numericValue(
    call.arguments?.[wrapper.parameterIndex],
    constants,
  )
  return delay === null ? null : { delay, shape: `wrapper:${direct}` }
}

export function auditSource(filename, source) {
  if (/spike/i.test(path.basename(filename))) return []
  const parsed = parseSync(filename, source, {
    lang: filename.endsWith('.tsx') ? 'tsx' : 'ts',
    sourceType: 'module',
  })
  if (parsed.errors.length)
    throw new Error(
      `Could not parse ${filename}: ${parsed.errors.map((error) => error.message).join('; ')}`,
    )
  const constants = discoverConstants(parsed.program)
  const wrappers = discoverWrappers(parsed.program)
  const waits = []
  const testRanges = []

  walk(parsed.program, (node) => {
    const test = testCall(node)
    if (!test) return
    const title = staticTitle(node.arguments?.[0])
    const callback = [...(node.arguments ?? [])].reverse().find(functionNode)
    if (!callback) return
    testRanges.push({
      start: callback.body.start,
      end: callback.body.end,
      title,
      excluded: test.skipped || /@(?:probe|visual)\b/i.test(title),
    })
  })

  walk(parsed.program, (node, ancestors) => {
    if (node.type !== 'CallExpression') return
    const containing = testRanges
      .filter((range) => range.start <= node.start && node.end <= range.end)
      .sort((left, right) => right.start - left.start)[0]
    if (containing?.excluded) return
    const shape = callShape(node, constants, wrappers, ancestors)
    if (!shape) return
    waits.push({
      file: filename,
      line: lineAt(source, node.start),
      delay: shape.delay,
      shape: shape.shape,
      testTitle: containing?.title ?? '<shared helper>',
      disposition: nearestDisposition(parsed.comments, source, node.start),
    })
  })

  return waits.sort((left, right) => left.line - right.line)
}

export const findMissingDispositions = (rows) =>
  rows.filter((wait) => wait.delay > 1000 && !wait.disposition)

const discoveredFilesFrom = (input) =>
  [...input.matchAll(/(?:^|\n)\s*([^:\n]+\.spec\.ts):\d+:\d+/g)].map(
    (match) => match[1],
  )

const resolveSpec = (candidate) => {
  const direct = path.resolve(candidate)
  if (existsSync(direct)) return direct
  return path.resolve('test/vscode-e2e', candidate)
}

const readStdin = async () => {
  if (process.stdin.isTTY) return ''
  let input = ''
  for await (const chunk of process.stdin) input += chunk
  return input
}

async function main() {
  const flags = new Set(process.argv.slice(2).filter((arg) => arg.startsWith('--')))
  let files = process.argv.slice(2).filter((arg) => !arg.startsWith('--'))
  if (files.length === 0) files = discoveredFilesFrom(await readStdin())
  files = [...new Set(files.map(resolveSpec))].filter(existsSync)
  if (files.length === 0)
    throw new Error(
      'No spec files supplied. Pipe `npx playwright test --list` into this command or pass spec paths.',
    )

  const waits = files.flatMap((file) =>
    auditSource(path.relative(process.cwd(), file), readFileSync(file, 'utf8')),
  )
  const byFile = new Map()
  for (const wait of waits) {
    const row = byFile.get(wait.file) ?? {
      file: wait.file,
      calls: 0,
      milliseconds: 0,
      waits: [],
    }
    row.calls++
    row.milliseconds += wait.delay
    row.waits.push(wait)
    byFile.set(wait.file, row)
  }
  const rows = [...byFile.values()].sort(
    (left, right) =>
      right.milliseconds - left.milliseconds ||
      left.file.localeCompare(right.file),
  )
  const missing = findMissingDispositions(waits)
  const output = {
    summary: {
      discoveredFiles: files.length,
      filesWithWaits: rows.length,
      calls: waits.length,
      milliseconds: waits.reduce((sum, wait) => sum + wait.delay, 0),
      missingDispositions: missing.length,
    },
    rows,
  }
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`)
  if (flags.has('--verify-dispositions') && missing.length) process.exitCode = 1
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
