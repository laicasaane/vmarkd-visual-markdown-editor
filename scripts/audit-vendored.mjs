#!/usr/bin/env node
import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const VALID_ECOSYSTEMS = new Set(['npm', 'Go', 'Maven'])
const REVIEW_DATE = /^\d{4}-\d{2}-\d{2}$/

function validateComponent(component, source) {
  if (!component || typeof component !== 'object') {
    throw new Error(`${source}: component must be an object`)
  }
  const { ecosystem, name, version } = component
  if (!VALID_ECOSYSTEMS.has(ecosystem)) {
    throw new Error(`${source}: unsupported component ecosystem ${ecosystem}`)
  }
  if (typeof name !== 'string' || !name.trim()) {
    throw new Error(`${source}: component name must be non-empty`)
  }
  if (
    typeof version !== 'string' ||
    !version.trim() ||
    /[\s*^~<>=|]/.test(version)
  ) {
    throw new Error(`${source}: component ${name} must use one exact version`)
  }
  return { ecosystem, name, version }
}

function validateUnscannable(decision, source) {
  if (
    decision?.kind !== 'unscannable' ||
    typeof decision.reason !== 'string' ||
    !decision.reason.trim() ||
    typeof decision.reviewedAt !== 'string' ||
    !REVIEW_DATE.test(decision.reviewedAt)
  ) {
    throw new Error(
      `${source}: advisoryAudit must declare kind=unscannable, reason, and YYYY-MM-DD reviewedAt`,
    )
  }
  return {
    source,
    reason: decision.reason,
    reviewedAt: decision.reviewedAt,
  }
}

export async function collectVendorComponents(root) {
  const entries = (await fs.readdir(root, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name))
  const componentMap = new Map()
  const unscannable = []

  for (const entry of entries) {
    const sourcePath = path.join(root, entry.name, 'source.json')
    let source
    try {
      source = JSON.parse(await fs.readFile(sourcePath, 'utf8'))
    } catch (error) {
      if (error?.code === 'ENOENT') continue
      throw new Error(`${entry.name}: cannot parse source.json: ${error.message}`)
    }
    const components = source.components ?? []
    if (!Array.isArray(components)) {
      throw new Error(`${entry.name}: components must be an array`)
    }
    if (components.length === 0 && !source.advisoryAudit) {
      throw new Error(
        `${entry.name}: executable vendor metadata needs exact components or an unscannable decision`,
      )
    }
    for (const raw of components) {
      const component = validateComponent(raw, entry.name)
      const key = `${component.ecosystem}\0${component.name}\0${component.version}`
      const existing = componentMap.get(key)
      if (existing) {
        if (!existing.sources.includes(entry.name)) existing.sources.push(entry.name)
      } else {
        componentMap.set(key, { ...component, sources: [entry.name] })
      }
    }
    if (source.advisoryAudit) {
      unscannable.push(validateUnscannable(source.advisoryAudit, entry.name))
    }
  }

  const components = [...componentMap.values()]
    .map((component) => ({
      ...component,
      sources: component.sources.sort(),
    }))
    .sort((a, b) =>
      `${a.ecosystem}\0${a.name}\0${a.version}`.localeCompare(
        `${b.ecosystem}\0${b.name}\0${b.version}`,
      ),
    )
  unscannable.sort((a, b) => a.source.localeCompare(b.source))
  return { components, unscannable }
}

export async function queryOsv(components, fetchImpl = fetch) {
  const response = await fetchImpl('https://api.osv.dev/v1/querybatch', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      queries: components.map(({ ecosystem, name, version }) => ({
        package: { ecosystem, name },
        version,
      })),
    }),
  })
  if (!response.ok) throw new Error(`OSV query failed: ${response.status}`)
  return response.json()
}

export function summarizeOsvFindings(components, response) {
  if (!Array.isArray(response?.results) || response.results.length !== components.length) {
    throw new Error(
      `OSV result count mismatch: expected ${components.length}, received ${response?.results?.length ?? 'invalid'}`,
    )
  }
  return components.flatMap((component, index) => {
    const vulnerabilities = response.results[index]?.vulns ?? []
    if (vulnerabilities.length === 0) return []
    return [
      {
        ...component,
        vulnerabilities: vulnerabilities.map(({ id, summary }) => ({
          id,
          summary,
        })),
      },
    ]
  })
}

async function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const root = path.join(repoRoot, 'media-src/vendor')
  const { components, unscannable } = await collectVendorComponents(root)
  const response = await queryOsv(components)
  const findings = summarizeOsvFindings(components, response)

  console.log(
    `Vendor advisory audit: ${components.length} exact components across ${new Set(components.flatMap((component) => component.sources)).size} vendor sources.`,
  )
  for (const decision of unscannable) {
    console.log(
      `UNSCANNABLE ${decision.source} (reviewed ${decision.reviewedAt}): ${decision.reason}`,
    )
  }
  if (findings.length === 0) {
    console.log('No OSV advisories affect the declared exact vendor components.')
    return
  }
  for (const finding of findings) {
    console.error(
      `AFFECTED ${finding.ecosystem}:${finding.name}@${finding.version} (${finding.sources.join(', ')}): ${finding.vulnerabilities.map((vulnerability) => vulnerability.id).join(', ')}`,
    )
  }
  process.exitCode = 1
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
