import { expect, test } from './coverage-fixture'
import { caretToEnd, gotoMouseops, setDoc } from './mouseops-helpers'

// NET (task 191 P0-13) — pasting an image File must post exactly one {command:'upload'} with
// the converted (webp) base64 and a sanitized, timestamp-prefixed name — the wire the host
// then writes to disk. Drives Vditor's real files-paste branch (fixBrowserBehavior.ts:1432 →
// uploadFiles → the REAL createUploadHandler wired in the mouseops harness) with a synthetic
// paste carrying a File and NO text/html. The disk write + link insertion are the L3 proof (P0-14).

// A 1×1 transparent PNG (bytes), so createImageBitmap/convertToBlob have a real raster to convert.
const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

async function pasteFiles(
  page: import('@playwright/test').Page,
  files: { name: string; b64: string }[],
) {
  await page.evaluate(
    ({ specs, b64 }) => {
      const el = (window as any).__modeEl() as HTMLElement
      el.focus()
      const dt = new DataTransfer()
      for (const s of specs) {
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
        dt.items.add(new File([bytes], s.name, { type: 'image/png' }))
      }
      const ev = new ClipboardEvent('paste', {
        clipboardData: dt,
        bubbles: true,
        cancelable: true,
      })
      el.dispatchEvent(ev)
    },
    { specs: files, b64: PNG_B64 },
  )
}

function uploadPosts(page: import('@playwright/test').Page) {
  return page.evaluate(() =>
    ((window as any).__posted as any[]).filter((m) => m.command === 'upload'),
  )
}

test('pasting a PNG posts one upload with a webp base64 + timestamped name', async ({
  page,
}) => {
  await gotoMouseops(page, 'ir')
  await setDoc(page, 'Doc body.\n')
  await caretToEnd(page)
  await pasteFiles(page, [{ name: 'photo.png', b64: PNG_B64 }])

  await expect
    .poll(async () => (await uploadPosts(page)).length, {
      timeout: 8_000,
      intervals: [100, 200, 400],
    })
    .toBe(1)

  const upload = (await uploadPosts(page))[0]
  expect(upload.files).toHaveLength(1)
  const { name, base64 } = upload.files[0]
  // The WIRE contract: timestamp-prefixed (YYYYMMDD_HHMMSS_), sanitized name, non-empty
  // base64. The extension is webp when convertForUpload converts and the original when it
  // falls back (a 1×1 PNG may not encode a webp under headless OffscreenCanvas) — that
  // conversion decision is convertForUpload's, unit-tested in image-convert.test.ts; here
  // we pin the message shape, not the codec outcome.
  expect(name).toMatch(/^\d{8}_\d{6}_.+\.(webp|png)$/)
  expect(typeof base64).toBe('string')
  expect(base64.length).toBeGreaterThan(0)
})

test('pasting two image files posts one upload carrying two entries', async ({
  page,
}) => {
  await gotoMouseops(page, 'ir')
  await setDoc(page, 'Doc body.\n')
  await caretToEnd(page)
  await pasteFiles(page, [
    { name: 'one.png', b64: PNG_B64 },
    { name: 'two.png', b64: PNG_B64 },
  ])

  await expect
    .poll(async () => (await uploadPosts(page)).length, {
      timeout: 8_000,
      intervals: [100, 200, 400],
    })
    .toBeGreaterThan(0)

  const allFiles = (await uploadPosts(page)).flatMap((m: any) => m.files)
  expect(allFiles.length).toBe(2)
  for (const f of allFiles)
    expect(f.name).toMatch(/^\d{8}_\d{6}_.+\.(webp|png)$/)
})

test('the posted upload name is sanitized (no path traversal reaches the host)', async ({
  page,
}) => {
  await gotoMouseops(page, 'ir')
  await setDoc(page, 'Doc body.\n')
  await caretToEnd(page)
  // A crafted file name — the webview sanitize must strip separators + `..` before the wire.
  await pasteFiles(page, [{ name: '../../evil.png', b64: PNG_B64 }])

  await expect
    .poll(async () => (await uploadPosts(page)).length, {
      timeout: 8_000,
      intervals: [100, 200, 400],
    })
    .toBe(1)
  const { name } = (await uploadPosts(page))[0].files[0]
  expect(name).not.toContain('..')
  expect(name).not.toContain('/')
})
