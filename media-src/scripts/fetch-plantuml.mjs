#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const RELEASES = {
  '1.2026.7': {
    archiveSha256:
      '0c0388929dbb2a3670fe19b3b05cb03d4269f67bc79ba9a4a1743b55f6b569e0',
    vizVersion: '3.24.0',
  },
}
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const scriptDir = path.dirname(fileURLToPath(import.meta.url))

const version = process.argv[2]
const release = RELEASES[version]
if (!release) {
  throw new Error(
    `unsupported PlantUML release ${version}; record and review its archive digest before fetching`,
  )
}

const artifact = `js-plantuml-${version}.zip`
const releaseUrl = `https://github.com/plantuml/plantuml/releases/download/v${version}/${artifact}`
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'vmarkd-plantuml-'))
try {
  const response = await fetch(releaseUrl)
  if (!response.ok) {
    throw new Error(`PlantUML release download failed: ${response.status}`)
  }
  const archive = Buffer.from(await response.arrayBuffer())
  const archiveSha256 = sha256(archive)
  if (archiveSha256 !== release.archiveSha256) {
    throw new Error(
      `PlantUML archive digest mismatch: expected ${release.archiveSha256}, received ${archiveSha256}`,
    )
  }
  const archivePath = path.join(temporary, artifact)
  await fs.writeFile(archivePath, archive)
  const extract = (name) =>
    execFileSync('unzip', ['-p', archivePath, name], {
      encoding: 'buffer',
      maxBuffer: 16 * 1024 * 1024,
    })
  const plantuml = extract('plantuml.js')
  const viz = extract('viz-global.js')
  if (!plantuml.toString('utf8').includes(version)) {
    throw new Error(`plantuml.js does not identify release ${version}`)
  }
  if (!viz.toString('utf8').includes(`Viz.js ${release.vizVersion}`)) {
    throw new Error(
      `viz-global.js does not identify Viz.js ${release.vizVersion}`,
    )
  }

  const sourceUrl = `https://github.com/plantuml/plantuml/releases/tag/v${version}`
  const plantumlDir = path.resolve(scriptDir, '../vendor/plantuml')
  const vizDir = path.resolve(scriptDir, '../vendor/viz')
  await fs.writeFile(path.join(plantumlDir, 'plantuml.js'), plantuml)
  await fs.writeFile(path.join(vizDir, 'viz-global.js'), viz)
  await fs.writeFile(
    path.join(plantumlDir, 'source.json'),
    `${JSON.stringify(
      {
        version,
        source: sourceUrl,
        artifact,
        archiveSha256,
        license: 'MIT — plantuml.js (plantuml/plantuml-mit)',
        components: [
          {
            ecosystem: 'Maven',
            name: 'net.sourceforge.plantuml:plantuml',
            version,
          },
        ],
        files: { 'plantuml.js': { sha256: sha256(plantuml) } },
        notes:
          'plantuml.js and viz-global.js were extracted together from the one SHA-256-verified release archive.',
      },
      null,
      2,
    )}\n`,
  )
  await fs.writeFile(
    path.join(vizDir, 'source.json'),
    `${JSON.stringify(
      {
        version: release.vizVersion,
        description:
          'Viz.js Graphviz WASM/JS shared by offline PlantUML and Graphviz rendering.',
        origin: 'https://github.com/mdaines/viz-js',
        source: sourceUrl,
        artifact,
        archiveSha256,
        license: 'MIT — @viz-js/viz',
        components: [
          {
            ecosystem: 'npm',
            name: '@viz-js/viz',
            version: release.vizVersion,
          },
        ],
        files: { 'viz-global.js': { sha256: sha256(viz) } },
        notes:
          'Extracted with plantuml.js from the same SHA-256-verified PlantUML release archive.',
      },
      null,
      2,
    )}\n`,
  )
  console.log(
    `[fetch-plantuml] pinned PlantUML ${version} + Viz.js ${release.vizVersion} from ${archiveSha256}`,
  )
} finally {
  await fs.rm(temporary, { recursive: true, force: true })
}
