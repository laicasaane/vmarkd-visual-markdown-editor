#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

function systemCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      const text = chunk.toString()
      stdout += text
      if (options.passthrough) process.stdout.write(text)
    })
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString()
      stderr += text
      if (options.passthrough) process.stderr.write(text)
    })
    child.on('error', reject)
    child.on('exit', (code) => resolve({ code: code ?? 1, stdout, stderr }))
  })
}

const systemRunner = {
  command: systemCommand,
  copyFile: fs.copyFile,
  async ensureGo(tempDir, version) {
    if (process.env.GO_PREBUILT) {
      return path.join(process.env.GO_PREBUILT, 'bin/go')
    }
    try {
      const existing = await systemCommand('go', ['version'])
      if (existing.code === 0) return 'go'
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
    const platform = { linux: 'linux', darwin: 'darwin' }[process.platform]
    const architecture = { x64: 'amd64', arm64: 'arm64' }[process.arch]
    if (!platform || !architecture) {
      throw new Error(
        `No pinned Go download mapping for ${process.platform}/${process.arch}`,
      )
    }
    const archiveName = `${version}.${platform}-${architecture}.tar.gz`
    const response = await fetch(`https://go.dev/dl/${archiveName}`)
    if (!response.ok) {
      throw new Error(`Go toolchain download failed: ${response.status}`)
    }
    const archivePath = path.join(tempDir, archiveName)
    await fs.writeFile(archivePath, Buffer.from(await response.arrayBuffer()))
    await requireSuccess(
      await systemCommand('tar', ['-C', tempDir, '-xzf', archivePath]),
      'Go toolchain extract',
    )
    return path.join(tempDir, 'go/bin/go')
  },
}

async function requireSuccess(result, label) {
  if (result.code !== 0) {
    throw new Error(
      `${label} failed with ${result.code}\n${result.stdout}${result.stderr}`,
    )
  }
  return result
}

export async function readD2Commit(repoRoot) {
  const script = await fs.readFile(
    path.join(repoRoot, 'media-src/vendor/d2/build/build-d2-wasm.sh'),
    'utf8',
  )
  const commit = /^D2_COMMIT=([a-f0-9]+)(?:\s+#.*)?$/m.exec(script)?.[1]
  if (!commit) throw new Error('D2_COMMIT not found in build-d2-wasm.sh')
  return commit
}

async function readGoVersion(repoRoot) {
  const script = await fs.readFile(
    path.join(repoRoot, 'media-src/vendor/d2/build/build-d2-wasm.sh'),
    'utf8',
  )
  const version = /^GO_VER=(go\d+\.\d+\.\d+)(?:\s+#.*)?$/m.exec(script)?.[1]
  if (!version) throw new Error('GO_VER not found in build-d2-wasm.sh')
  return version
}

export async function auditD2Go({
  repoRoot,
  tempBase = os.tmpdir(),
  runner = systemRunner,
} = {}) {
  const resolvedRoot = repoRoot ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const commit = await readD2Commit(resolvedRoot)
  const goVersion = await readGoVersion(resolvedRoot)
  const tempDir = await fs.mkdtemp(path.join(tempBase, 'vmde-d2-go-audit-'))
  const checkout = path.join(tempDir, 'd2')
  const buildDir = path.join(resolvedRoot, 'media-src/vendor/d2/build')
  try {
    await requireSuccess(
      await runner.command('git', [
        'clone',
        '--filter=blob:none',
        '--no-checkout',
        'https://github.com/terrastruct/d2',
        checkout,
      ]),
      'D2 clone',
    )
    await requireSuccess(
      await runner.command('git', ['-C', checkout, 'checkout', commit]),
      'D2 checkout',
    )
    const head = await requireSuccess(
      await runner.command('git', ['-C', checkout, 'rev-parse', 'HEAD']),
      'D2 rev-parse',
    )
    if (!head.stdout.trim().startsWith(commit)) {
      throw new Error(
        `D2 checkout mismatch: expected ${commit}, got ${head.stdout.trim()}`,
      )
    }
    const status = await requireSuccess(
      await runner.command('git', ['-C', checkout, 'status', '--porcelain']),
      'D2 clean-check',
    )
    if (status.stdout.trim()) {
      throw new Error(`D2 checkout is dirty before audit:\n${status.stdout}`)
    }

    await runner.copyFile(
      path.join(buildDir, 'stub-d2fonts_embed_wasm.go'),
      path.join(checkout, 'd2renderers/d2fonts/d2fonts_embed_wasm.go'),
    )
    await runner.copyFile(
      path.join(buildDir, 'stub-latex_embed_wasm.go'),
      path.join(checkout, 'd2renderers/d2latex/latex_embed_wasm.go'),
    )
    const textMeasureDir = path.join(checkout, 'lib/textmeasure')
    for (const entry of await fs.readdir(textMeasureDir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.go')) {
        await fs.rm(path.join(textMeasureDir, entry.name))
      }
    }
    await runner.copyFile(
      path.join(buildDir, 'stub-textmeasure.go'),
      path.join(textMeasureDir, 'stub-textmeasure.go'),
    )
    const entryDir = path.join(checkout, 'd2compileonly')
    await fs.mkdir(entryDir, { recursive: true })
    await runner.copyFile(
      path.join(buildDir, 'main.go'),
      path.join(entryDir, 'main.go'),
    )

    const goCommand = runner.ensureGo
      ? await runner.ensureGo(tempDir, goVersion)
      : 'go'
    const goBinDir = path.dirname(goCommand)
    const toolBinDir = path.join(tempDir, 'go-bin')
    await fs.mkdir(toolBinDir, { recursive: true })
    await requireSuccess(
      await runner.command(
        goCommand,
        ['install', 'golang.org/x/vuln/cmd/govulncheck@latest'],
        {
          cwd: checkout,
          env: {
            GOBIN: toolBinDir,
            PATH: `${goBinDir}${path.delimiter}${process.env.PATH}`,
          },
          passthrough: true,
        },
      ),
      'govulncheck install',
    )
    const result = await runner.command(
      path.join(toolBinDir, 'govulncheck'),
      ['./d2compileonly'],
      {
        cwd: checkout,
        env: {
          GOOS: 'js',
          GOARCH: 'wasm',
          PATH: `${goBinDir}${path.delimiter}${process.env.PATH}`,
        },
        passthrough: true,
      },
    )
    return { ...result, commit, goVersion }
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true })
  }
}

async function main() {
  const result = await auditD2Go()
  process.exitCode = result.code
}

const isDirect =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
if (isDirect) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
