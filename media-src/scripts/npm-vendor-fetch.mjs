import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as esbuild from 'esbuild'

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

async function firstExisting(root, candidates) {
  for (const candidate of candidates) {
    const absolute = path.join(root, candidate)
    try {
      const stat = await fs.lstat(absolute)
      if (stat.isSymbolicLink()) {
        throw new Error(`refusing symlink in packed runtime: ${candidate}`)
      }
      if (stat.isFile()) return absolute
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
  }
  throw new Error(`none of the packed paths exist: ${candidates.join(', ')}`)
}

export async function fetchNpmRuntime({
  packageName,
  version,
  vendorDir,
  runtimeFiles,
  licenseCandidates = ['LICENSE', 'LICENSE.md', 'LICENSE.txt'],
  license = 'LICENSE',
  description,
  origin,
  bundle,
  additionalComponents = [],
}) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`expected an exact semver, received: ${version}`)
  }
  const temporary = await fs.mkdtemp(
    path.join(os.tmpdir(), `vmarkd-${packageName.replace(/\W/g, '-')}-`),
  )
  try {
    const tarball = execFileSync(
      'npm',
      [
        'pack',
        `${packageName}@${version}`,
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
    if (manifest.name !== packageName || manifest.version !== version) {
      throw new Error(
        `packed manifest mismatch: expected ${packageName}@${version}, received ${manifest.name}@${manifest.version}`,
      )
    }

    const selected = []
    if (bundle) {
      execFileSync(
        'npm',
        [
          'install',
          '--ignore-scripts',
          '--no-audit',
          '--no-fund',
          '--package-lock=false',
        ],
        { cwd: packageRoot, stdio: 'pipe' },
      )
      for (const component of additionalComponents) {
        const installed = JSON.parse(
          await fs.readFile(
            path.join(packageRoot, 'node_modules', component.name, 'package.json'),
            'utf8',
          ),
        )
        if (installed.version !== component.version) {
          throw new Error(
            `bundled component mismatch: expected ${component.name}@${component.version}, received ${installed.version}`,
          )
        }
      }
      const result = await esbuild.build({
        entryPoints: [path.join(packageRoot, bundle.entry)],
        bundle: true,
        minify: true,
        format: 'iife',
        globalName: bundle.globalName,
        platform: 'browser',
        write: false,
      })
      selected.push({
        bytes: Buffer.from(result.outputFiles[0].contents),
        destination: bundle.destination,
      })
    } else {
      for (const runtime of runtimeFiles) {
        selected.push({
          destination: runtime.destination,
          source: await firstExisting(packageRoot, runtime.candidates),
        })
      }
    }
    const licenseSource = await firstExisting(packageRoot, licenseCandidates)

    await fs.rm(vendorDir, { recursive: true, force: true })
    await fs.mkdir(vendorDir, { recursive: true })
    const files = {}
    for (const runtime of selected) {
      const bytes = runtime.bytes ?? (await fs.readFile(runtime.source))
      const destination = path.join(vendorDir, runtime.destination)
      await fs.mkdir(path.dirname(destination), { recursive: true })
      await fs.writeFile(destination, bytes)
      files[runtime.destination] = { sha256: sha256(bytes) }
    }
    await fs.copyFile(licenseSource, path.join(vendorDir, license))
    const source = {
      package: packageName,
      version,
      fetchedFrom: `npm pack ${packageName}@${version}`,
      description,
      origin,
      license: manifest.license,
      components: [
        { ecosystem: 'npm', name: packageName, version },
        ...additionalComponents.map((component) => ({
          ecosystem: 'npm',
          ...component,
        })),
      ],
      files,
    }
    await fs.writeFile(
      path.join(vendorDir, 'source.json'),
      `${JSON.stringify(source, null, 2)}\n`,
    )
    return source
  } finally {
    await fs.rm(temporary, { recursive: true, force: true })
  }
}
