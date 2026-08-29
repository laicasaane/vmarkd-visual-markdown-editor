#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'

const PKG = '@mermaid-js/layout-elk'
const RELEASES = {
  '0.2.3': {
    commit: '293b1c153a6f94c3a4a1d9cd5eae4dde609f1ec4',
    mermaid: '11.17.2',
  },
}
const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const vendorDir = path.resolve(scriptDir, '../vendor/mermaid-layout-elk')
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

async function fetchSource(commit, name) {
  const url = `https://raw.githubusercontent.com/mermaid-js/mermaid/${commit}/packages/mermaid-layout-elk/src/${name}.ts`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`source fetch failed for ${name}: ${response.status}`)
  return response.text()
}

async function main() {
  const version = process.argv[2]
  const release = RELEASES[version]
  if (!release) {
    throw new Error(
      `unsupported layout-elk version ${version}; record its exact source commit before fetching`,
    )
  }

  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'vmde-layout-elk-'))
  try {
    const tarball = execFileSync(
      'npm',
      [
        'pack',
        `${PKG}@${version}`,
        '--pack-destination',
        temporary,
        '--silent',
      ],
      { encoding: 'utf8' },
    ).trim()
    execFileSync('tar', ['xzf', tarball, '-C', temporary], { cwd: temporary })
    const packageRoot = path.join(temporary, 'package')
    const manifest = JSON.parse(
      await fs.readFile(path.join(packageRoot, 'package.json'), 'utf8'),
    )
    if (manifest.name !== PKG || manifest.version !== version) {
      throw new Error(
        `packed manifest mismatch: expected ${PKG}@${version}, received ${manifest.name}@${manifest.version}`,
      )
    }

    const sourceDir = path.join(temporary, 'src')
    await fs.mkdir(sourceDir)
    for (const name of [
      'layouts',
      'render',
      'geometry',
      'find-common-ancestor',
    ]) {
      await fs.writeFile(
        path.join(sourceDir, `${name}.ts`),
        await fetchSource(release.commit, name),
      )
    }
    const mermaidShim = path.join(sourceDir, 'mermaid-shim.ts')
    await fs.writeFile(
      mermaidShim,
      `const internals = window.__esbuild_esm_mermaid_nm?.mermaid
if (!internals?.createCommonLayoutRenderer || !window.mermaid) {
  throw new Error('Mermaid ${release.mermaid} common-layout API is unavailable')
}
export const createCommonLayoutRenderer = internals.createCommonLayoutRenderer
export default window.mermaid
`,
    )
    execFileSync(
      'npm',
      [
        'install',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '--package-lock=false',
        'd3@7.9.0',
      ],
      { cwd: temporary, stdio: 'pipe' },
    )
    const result = await esbuild.build({
      entryPoints: [path.join(sourceDir, 'layouts.ts')],
      alias: { mermaid: mermaidShim },
      bundle: true,
      external: ['elkjs/lib/elk.bundled.js'],
      format: 'esm',
      minify: true,
      platform: 'browser',
      write: false,
    })
    const runtime = Buffer.from(result.outputFiles[0].contents)
    const runtimeText = runtime.toString('utf8')
    if (
      !runtimeText.includes('elkjs/lib/elk.bundled.js') ||
      !runtimeText.includes('createCommonLayoutRenderer')
    ) {
      throw new Error('bounded layout-elk build lost its external ELK or Mermaid API seam')
    }

    await fs.rm(vendorDir, { recursive: true, force: true })
    await fs.mkdir(vendorDir, { recursive: true })
    await fs.writeFile(
      path.join(vendorDir, 'mermaid-layout-elk.core.mjs'),
      runtime,
    )
    await fs.copyFile(
      path.join(packageRoot, 'LICENSE'),
      path.join(vendorDir, 'LICENSE'),
    )
    await fs.writeFile(
      path.join(vendorDir, 'source.json'),
      `${JSON.stringify(
        {
          package: PKG,
          version,
          fetchedFrom: `npm pack ${PKG}@${version}`,
          sourceCommit: release.commit,
          mermaidApiVersion: release.mermaid,
          license: 'MIT',
          components: [{ ecosystem: 'npm', name: PKG, version }],
          files: {
            'mermaid-layout-elk.core.mjs': { sha256: sha256(runtime) },
          },
          note:
            'Built from the exact tagged source with Mermaid common-layout APIs supplied by the already-loaded pinned Mermaid runtime and elkjs left for the shared main-thread alias. This avoids the npm artifact accidentally embedding a second full Mermaid runtime.',
        },
        null,
        2,
      )}\n`,
    )
    console.log(
      `[fetch-mermaid-layout-elk] pinned ${PKG}@${version} from ${release.commit.slice(0, 12)} (${Math.ceil(runtime.length / 1024)} KB)`,
    )
  } finally {
    await fs.rm(temporary, { recursive: true, force: true })
  }
}

await main()
