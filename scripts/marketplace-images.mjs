#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export function marketplaceImagesBaseFromManifest(manifest) {
  const repository =
    typeof manifest.repository === 'string'
      ? manifest.repository
      : manifest.repository?.url
  const match =
    typeof repository === 'string' &&
    /^https:\/\/github\.com\/([^/]+)\/([^/#]+?)(?:\.git)?$/.exec(repository)
  if (!match) {
    throw new Error(
      'package.json repository.url must be an HTTPS GitHub repository',
    )
  }
  return `https://github.com/${match[1]}/${match[2]}/raw/HEAD`
}

const TRUSTED_SVG_HOSTS = new Set([
  'api.travis-ci.com',
  'app.fossa.io',
  'badge.buildkite.com',
  'badge.fury.io',
  'badgen.net',
  'badges.frapsoft.com',
  'badges.gitter.im',
  'cdn.travis-ci.com',
  'ci.appveyor.com',
  'circleci.com',
  'cla.opensource.microsoft.com',
  'codacy.com',
  'codeclimate.com',
  'codecov.io',
  'coveralls.io',
  'david-dm.org',
  'deepscan.io',
  'dev.azure.com',
  'docs.rs',
  'flat.badgen.net',
  'gitlab.com',
  'godoc.org',
  'goreportcard.com',
  'img.shields.io',
  'isitmaintained.com',
  'marketplace.visualstudio.com',
  'nodesecurity.io',
  'opencollective.com',
  'snyk.io',
  'travis-ci.com',
  'visualstudio.com',
  'vsmarketplacebadges.dev',
])

const MARKDOWN_IMAGE =
  /!\[[^\]]*\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+["'][^"']*["'])?\s*\)/g
const HTML_IMAGE = /<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi
const INLINE_SVG = /<svg(?:\s|>)/i
const GITHUB_WORKFLOW_BADGE =
  /^https:\/\/github\.com\/[^/]+\/[^/]+\/(?:actions\/)?workflows\/.*badge\.svg(?:$|[?#])/i

function imageTargets(markdown) {
  const targets = []
  for (const match of markdown.matchAll(MARKDOWN_IMAGE)) {
    targets.push(match[1] ?? match[2])
  }
  for (const match of markdown.matchAll(HTML_IMAGE)) targets.push(match[1])
  return targets
}

function isApprovedSvg(url) {
  return (
    TRUSTED_SVG_HOSTS.has(url.hostname.toLowerCase()) ||
    GITHUB_WORKFLOW_BADGE.test(url.href)
  )
}

function resolveImageTarget(target, documentName, baseImagesUrl) {
  if (/^data:image\/svg/i.test(target)) {
    throw new Error(`${documentName}: SVG data URLs are not allowed: ${target}`)
  }
  if (target.startsWith('//')) {
    throw new Error(`${documentName}: image URLs must use HTTPS: ${target}`)
  }

  let url
  try {
    url = new URL(target, `${baseImagesUrl}/`)
  } catch {
    throw new Error(`${documentName}: invalid image URL: ${target}`)
  }

  const relative = !/^[a-z][a-z\d+.-]*:/i.test(target)
  if (!relative && url.protocol !== 'https:') {
    throw new Error(`${documentName}: image URLs must use HTTPS: ${target}`)
  }

  if (/\.svg$/i.test(url.pathname) && (relative || !isApprovedSvg(url))) {
    throw new Error(
      `${documentName}: SVG images require an approved badge provider: ${target}`,
    )
  }
  return url.href
}

export function validateMarketplaceImages(
  markdown,
  documentName,
  baseImagesUrl,
) {
  if (!baseImagesUrl?.startsWith('https://')) {
    throw new Error(`${documentName}: Marketplace image base must use HTTPS`)
  }
  if (INLINE_SVG.test(markdown)) {
    throw new Error(`${documentName}: inline SVG tags are not allowed`)
  }
  return imageTargets(markdown).map((target) =>
    resolveImageTarget(target, documentName, baseImagesUrl),
  )
}

export function validateMarketplaceImageFiles(
  files = ['README.md', 'CHANGELOG.md'],
  baseImagesUrl,
) {
  return files.flatMap((file) =>
    validateMarketplaceImages(
      readFileSync(file, 'utf8'),
      file,
      baseImagesUrl,
    ),
  )
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  const manifest = JSON.parse(readFileSync('package.json', 'utf8'))
  const baseImagesUrl = marketplaceImagesBaseFromManifest(manifest)
  const images = validateMarketplaceImageFiles(undefined, baseImagesUrl)
  console.log(
    `Marketplace image check passed: ${images.length} image reference(s), HTTPS after rewrite.`,
  )
}
