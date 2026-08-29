import { convertForUpload } from './image-convert'
import { formatTimestamp } from '../util/format-timestamp'
import { sanitizeUploadName } from './upload-name'
import { fileToBase64 } from '../util/utils'
import '../util/vscode-api'

// The Vditor upload hook — fired when an image File is pasted/dropped. Split out of main.ts
// (task 191 §5.4) so the e2e harness can drive the REAL handler instead of a copy. Converts/
// scales each file per the vmde.image.* settings (task 74: original or WebP + optional
// max-width downscale; convertForUpload falls back to the original bytes on any failure),
// then posts ONE {command:'upload'} carrying the base64 + a sanitized, timestamp-prefixed
// name (sanitizeUploadName — task 191 P1-18) for the host to write into the assets folder.
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
// be an inline `.wav`-vs-everything-else `if` inside message-router's generic dispatcher — the one
// per-file-type special case sitting in the command switch, i.e. exactly the seam that would
// accrete an `if` per embeddable kind. It lives here instead, next to the outgoing path, as a
// table: a new kind (video, other audio containers) is a row.
//
// Extensions are matched case-INSENSITIVELY, which the old `endsWith('.wav')` was not — a `.WAV`
// upload used to come back as an image link.
const EMBED_BY_EXT: Record<string, (src: string) => string> = {
  '.wav': (src) => `<audio controls="controls" src="${src}"></audio>`,
}

/** The markup to insert for one uploaded file href, blank lines included. */
export function uploadedMarkup(href: string): string {
  const dot = href.lastIndexOf('.')
  const ext = dot === -1 ? '' : href.slice(dot).toLowerCase()
  return `\n\n${EMBED_BY_EXT[ext]?.(href) ?? `![](${href})`}\n\n`
}
