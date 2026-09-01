import { expect, test } from './coverage-fixture'
import { caretToEnd, getValue, gotoMouseops, setDoc } from './mouseops-helpers'

// NET (task 191 P1-17) + PROBE-4 — drag & drop into the editor. A dropped image File must
// route to the upload wire exactly like a paste (dropEvent → paste() files branch); a
// text/plain-only drop is a no-op (Vditor's drop only reacts to Files / text/html). Drives
// the real dropEvent with a synthetic DragEvent carrying a DataTransfer.

const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

function uploadPosts(page: import('@playwright/test').Page) {
  return page.evaluate(() =>
    ((window as any).__posted as any[]).filter((m) => m.command === 'upload'),
  )
}

test('P1-17: dropping an image File posts one upload with a sanitized, timestamped name', async ({
  page,
}) => {
  await gotoMouseops(page, 'ir')
  await setDoc(page, 'Drop target body.\n')
  await caretToEnd(page)
  await page.evaluate((b64) => {
    const el = (window as any).__modeEl() as HTMLElement
    el.focus()
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    const dt = new DataTransfer()
    dt.items.add(new File([bytes], 'dropped.png', { type: 'image/png' }))
    el.dispatchEvent(
      new DragEvent('drop', {
        dataTransfer: dt,
        bubbles: true,
        cancelable: true,
      }),
    )
  }, PNG_B64)

  await expect
    .poll(async () => (await uploadPosts(page)).length, {
      timeout: 8_000,
      intervals: [100, 200, 400],
    })
    .toBe(1)
  const { name } = (await uploadPosts(page))[0].files[0]
  expect(name).toMatch(/^\d{8}_\d{6}_.+\.(webp|png)$/)
  expect(name).not.toContain('..')
})

// PROBE-4 (documented behaviour): a text/plain-only drop reaches dropEvent but its guard only
// fires for Files / text/html, so nothing is inserted and no upload is posted — the drop is a
// silent no-op. Pinned so a future drop-handling change is a conscious decision.
test('PROBE-4: a text/plain-only drop is a no-op (no upload, document unchanged)', async ({
  page,
}) => {
  await gotoMouseops(page, 'ir')
  await setDoc(page, 'Only this line.\n')
  await caretToEnd(page)
  const before = await getValue(page)
  await page.evaluate(() => {
    const el = (window as any).__modeEl() as HTMLElement
    el.focus()
    const dt = new DataTransfer()
    dt.setData('text/plain', 'dropped text')
    el.dispatchEvent(
      new DragEvent('drop', {
        dataTransfer: dt,
        bubbles: true,
        cancelable: true,
      }),
    )
  })
  await page.waitForTimeout(400)
  expect(await uploadPosts(page)).toHaveLength(0)
  expect(await getValue(page)).toBe(before)
})

test('dropping a non-image File returns as a normal Markdown link', async ({
  page,
}) => {
  await gotoMouseops(page, 'ir')
  await setDoc(page, 'Drop ordinary file here.\n')
  await caretToEnd(page)
  await page.evaluate(() => {
    const editor = (window as any).__modeEl() as HTMLElement
    const transfer = new DataTransfer()
    transfer.items.add(
      new File(['plain file body'], 'notes.txt', { type: 'text/plain' }),
    )
    editor.dispatchEvent(
      new DragEvent('drop', {
        dataTransfer: transfer,
        bubbles: true,
        cancelable: true,
      }),
    )
  })
  await expect.poll(async () => (await uploadPosts(page)).length).toBe(1)
  const name = (await uploadPosts(page))[0].files[0].name as string
  const href = `assets/${name}`

  await page.evaluate(
    (uploadedHref) => (window as any).__applyUploaded(uploadedHref),
    href,
  )
  await expect.poll(() => getValue(page)).toContain(`[${name}](${href})`)
  expect(await getValue(page)).not.toContain(`![](${href})`)
})
