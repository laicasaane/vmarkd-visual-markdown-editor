import { convertForUpload } from './image-convert'
import { formatTimestamp } from '../util/format-timestamp'
import { sanitizeUploadName } from './upload-name'
import { fileToBase64 } from '../util/utils'
import '../util/vscode-api'

// The Vditor upload hook — fired when a File is pasted/dropped. Split out of main.ts (task 191
// §5.4) so the e2e harness can drive the REAL handler instead of a copy. Image files are converted/
// scaled per the vmde.image.* settings (task 74: original or WebP + optional max-width downscale;
// convertForUpload passes non-images through and falls back to the original bytes on any failure),
// then posts ONE {command:'upload'} carrying the base64 + a sanitized, timestamp-prefixed name
// (sanitizeUploadName — task 191 P1-18) for the host to write into the assets folder.
export function createUploadHandler(
  getImageOptions: () =>
    | { imageFormat?: string; imageQuality?: number; imageMaxWidth?: number }
    | undefined,
) {
  return async function handler(files: File[]) {
    const opts = getImageOptions() ?? {}
    const fileInfos = await Promise.all(
      files.map(async (f) => {
        const { blob, name } = await convertForUpload(f, {
          // imageFormat is the raw setting string; convertForUpload treats any non-'webp'
          // value as 'original' (safe degrade), so the cast is sound.
          format: opts.imageFormat as 'original' | 'webp' | undefined,
          quality: opts.imageQuality,
          maxWidth: opts.imageMaxWidth,
        })
        return {
          base64: await fileToBase64(blob),
          name: sanitizeUploadName(`${formatTimestamp(new Date())}_${name}`),
        }
      }),
    )
    vscode.postMessage({ command: 'upload', files: fileInfos })
  }
}

// The RETURN half of the same feature (task 435 item 2): the host writes the file, replies
// {command:'uploaded', files:[href]}, and the webview inserts markup for it. That mapping used to
// be an inline `.wav`-vs-everything-else `if` inside message-router's generic dispatcher. Embed
// kinds remain table-driven here; the explicit image-extension allowlist distinguishes image
// markup from the ordinary Markdown-link fallback.
//
// Extensions are matched case-INSENSITIVELY, which the old `endsWith('.wav')` was not — a `.WAV`
// upload used to come back as an image link.
const EMBED_BY_EXT: Record<string, (src: string) => string> = {
  '.wav': (src) => `<audio controls="controls" src="${src}"></audio>`,
}

const IMAGE_EXTENSIONS = new Set([
  '.apng',
  '.avif',
  '.bmp',
  '.gif',
  '.ico',
  '.jfif',
  '.jpeg',
  '.jpg',
  '.png',
  '.svg',
  '.tif',
  '.tiff',
  '.webp',
])

function uploadPath(href: string): string {
  const query = href.indexOf('?')
  const fragment = href.indexOf('#')
  const end = Math.min(
    query < 0 ? href.length : query,
    fragment < 0 ? href.length : fragment,
  )
  return href.slice(0, end)
}

function uploadedExtension(href: string): string {
  const path = uploadPath(href)
  const slash = path.lastIndexOf('/')
  const dot = path.lastIndexOf('.')
  return dot > slash ? path.slice(dot).toLowerCase() : ''
}

function uploadedFileLabel(href: string): string {
  const path = uploadPath(href)
  const label = path.slice(path.lastIndexOf('/') + 1) || 'file'
  return label
    .replace(/\\/g, '\\\\')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
}

/** The markup to insert for one uploaded file href, blank lines included. */
export function uploadedMarkup(href: string): string {
  const extension = uploadedExtension(href)
  const markup =
    EMBED_BY_EXT[extension]?.(href) ??
    (IMAGE_EXTENSIONS.has(extension)
      ? `![](${href})`
      : `[${uploadedFileLabel(href)}](${href})`)
  return `\n\n${markup}\n\n`
}
