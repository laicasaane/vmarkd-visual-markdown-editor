import * as NodePath from 'node:path'

export interface CopyFilesDestinationContext {
  documentPath: string
  workspaceFolderPath?: string
  workspaceFolderPaths: string[]
  fileName: string
  now?: Date
  onTransformError?: (pattern: string, replacement: string) => void
}

const slash = (value: string) => value.replace(/\\/g, '/')
const escapeRegex = (value: string) =>
  value.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')

function starToken(glob: string, index: number) {
  if (glob[index] !== '*') return undefined
  if (glob[index + 1] !== '*') return { source: '[^/]*', next: index }
  if (glob[index + 2] === '/') {
    return { source: '(?:.*/)?', next: index + 2 }
  }
  return { source: '.*', next: index + 1 }
}

function braceToken(glob: string, index: number) {
  if (glob[index] !== '{') return undefined
  const end = glob.indexOf('}', index + 1)
  if (end <= index) return undefined
  const alternatives = glob
    .slice(index + 1, end)
    .split(',')
    .map(escapeRegex)
  return { source: `(?:${alternatives.join('|')})`, next: end }
}

function classToken(glob: string, index: number) {
  if (glob[index] !== '[') return undefined
  const end = glob.indexOf(']', index + 1)
  if (end <= index + 1) return undefined
  const body = glob.slice(index + 1, end)
  return {
    source: `[${body.startsWith('!') ? `^${body.slice(1)}` : body}]`,
    next: end,
  }
}

function globRegex(glob: string): RegExp {
  let source = '^'
  for (let index = 0; index < glob.length; index++) {
    const char = glob[index]
    const star = starToken(glob, index)
    if (star) {
      source += star.source
      index = star.next
      continue
    }
    if (char === '?') {
      source += '[^/]'
      continue
    }
    const brace = braceToken(glob, index)
    if (brace) {
      source += brace.source
      index = brace.next
      continue
    }
    const characterClass = classToken(glob, index)
    if (characterClass) {
      source += characterClass.source
      index = characterClass.next
      continue
    }
    source += escapeRegex(char)
  }
  return new RegExp(`${source}$`)
}

function globCandidates(
  glob: string,
  workspaceFolderPaths: string[],
): string[] {
  const normalized = slash(glob)
  if (normalized.startsWith('/')) {
    return workspaceFolderPaths.map((folder) =>
      NodePath.posix.join(slash(folder), normalized),
    )
  }
  return normalized.startsWith('**') ? [normalized] : [`**/${normalized}`]
}

function matchesGlob(documentPath: string, candidate: string): boolean {
  try {
    return globRegex(candidate).test(documentPath)
  } catch {
    return false
  }
}

function expandDestination(
  template: string,
  context: CopyFilesDestinationContext,
): string {
  const documentPath = slash(context.documentPath)
  const documentDir = NodePath.posix.dirname(documentPath)
  const documentFile = NodePath.posix.basename(documentPath)
  const documentExt = NodePath.posix.extname(documentFile)
  const workspace = context.workspaceFolderPath
    ? slash(context.workspaceFolderPath)
    : undefined
  const now = context.now ?? new Date()
  const variables = new Map<string, string>([
    ['documentDirName', documentDir],
    [
      'documentRelativeDirName',
      workspace ? NodePath.posix.relative(workspace, documentDir) : documentDir,
    ],
    ['documentFileName', documentFile],
    [
      'documentBaseName',
      documentFile.slice(0, documentFile.length - documentExt.length),
    ],
    ['documentExtName', documentExt.replace(/^\./, '')],
    ['documentFilePath', documentPath],
    [
      'documentRelativeFilePath',
      workspace
        ? NodePath.posix.relative(workspace, documentPath)
        : documentPath,
    ],
    ['documentWorkspaceFolder', workspace ?? documentDir],
    ['fileName', context.fileName],
    [
      'fileExtName',
      NodePath.posix.extname(context.fileName).replace(/^\./, ''),
    ],
    ['unixTime', now.getTime().toString()],
    ['isoTime', now.toISOString()],
  ])

  const variable =
    /(\\\$)|(?<!\\)\$\{(\w+)(?:\/((?:\\\/|[^}/])+)\/((?:\\\/|[^}/])*)\/)?\}/g
  return template.replace(
    variable,
    (match, escaped, name, pattern, replacement) => {
      if (escaped) return '$'
      const value = variables.get(name)
      if (value === undefined) return match
      if (pattern && replacement) {
        const normalizedPattern = pattern.replace(/\\\//g, '/')
        const normalizedReplacement = replacement.replace(/\\\//g, '/')
        try {
          return value.replace(
            new RegExp(normalizedPattern),
            normalizedReplacement,
          )
        } catch {
          context.onTransformError?.(normalizedPattern, normalizedReplacement)
        }
      }
      return value
    },
  )
}

/** Resolve the first VS Code Markdown copy-destination rule that matches this document. */
export function resolveCopyFilesDestination(
  destinations: Record<string, string> | undefined,
  context: CopyFilesDestinationContext,
): string | undefined {
  if (!destinations || typeof destinations !== 'object') return undefined
  const documentPath = slash(context.documentPath)
  for (const [glob, configuredDestination] of Object.entries(destinations)) {
    const matches = globCandidates(glob, context.workspaceFolderPaths).some(
      (candidate) => matchesGlob(documentPath, candidate),
    )
    if (!matches || typeof configuredDestination !== 'string') continue

    let destination = configuredDestination.trim() || '${fileName}'
    if (destination.startsWith('/')) {
      destination = `\${documentWorkspaceFolder}/${destination.slice(1)}`
    }
    if (destination.endsWith('/')) destination += '${fileName}'
    const expanded = expandDestination(destination, context)
    return NodePath.posix.resolve(
      NodePath.posix.dirname(documentPath),
      expanded,
    )
  }
  return undefined
}
