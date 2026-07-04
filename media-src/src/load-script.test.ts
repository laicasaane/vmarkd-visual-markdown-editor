// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest'
import { loadScript } from './load-script'

afterEach(() => {
  for (const s of Array.from(document.head.querySelectorAll('script'))) {
    s.remove()
  }
})

// The task-347 fix: concurrent callers for the SAME id must all wait for the real load, not resolve
// early on the half-created <script> tag (which let a 2nd PlantUML block read an unpopulated stdlib map).
test('concurrent loadScript for the same id create ONE tag and share the load', async () => {
  const p1 = loadScript('a.js', 'dup')
  const p2 = loadScript('b.js', 'dup') // in-flight → shares p1, must NOT resolve on the existing tag
  expect(document.querySelectorAll('script#dup').length).toBe(1) // only one tag created

  let resolved = 0
  void p1.then(() => {
    resolved++
  })
  void p2.then(() => {
    resolved++
  })
  await Promise.resolve()
  await Promise.resolve()
  expect(resolved).toBe(0) // neither resolved before the script actually loads

  const tag = document.getElementById('dup') as HTMLScriptElement
  tag.onload?.(new Event('load')) // the real load completes
  await Promise.all([p1, p2])
  expect(resolved).toBe(2) // both resolve together, once the load is done
})

test('a call after the load resolves immediately without creating a second tag', async () => {
  const p = loadScript('x.js', 'once')
  ;(document.getElementById('once') as HTMLScriptElement).onload?.(
    new Event('load'),
  )
  await p
  // tag present + not in flight → a later call resolves without appending another <script>
  await loadScript('x.js', 'once')
  expect(document.querySelectorAll('script#once').length).toBe(1)
})

test('onerror resolves too — a missing asset never hangs the caller', async () => {
  const p = loadScript('bad.js', 'err')
  ;(document.getElementById('err') as HTMLScriptElement).onerror?.(
    new Event('error'),
  )
  await expect(p).resolves.toBeUndefined()
})
