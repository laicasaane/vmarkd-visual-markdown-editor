import { convertForUpload } from './image-convert'
import { formatTimestamp } from './format-timestamp'
import { sanitizeUploadName } from './upload-name'
import { fileToBase64 } from './utils'
import './vscode-api'

// The Vditor upload hook — fired when an image File is pasted/dropped. Split out of main.ts
// (task 191 §5.4) so the e2e harness can drive the REAL handler instead of a copy. Converts/
// scales each file per the vmarkd.image.* settings (task 74: original or WebP + optional
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
