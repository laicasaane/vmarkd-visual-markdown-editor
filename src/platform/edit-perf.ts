import type { RendererEditPerf } from '../shared/protocol'

type EditPerfStatus = 'pending' | 'complete' | 'cancelled' | 'failed'
export type EditPerfValues = Record<string, number | string | boolean>

export interface EditPerfSample {
  id: string
  renderer?: RendererEditPerf
  host: EditPerfValues
  followers?: EditPerfValues
  status: EditPerfStatus
}

interface InternalSample extends EditPerfSample {
  receivedAt?: number
}

/** Bounded, source-free Task 538 correlation store. The singleton below is enabled only in E2E. */
export class EditPerfCollector {
  private readonly samples = new Map<string, InternalSample>()

  constructor(private readonly maxSamples = 100) {}

  private ensure(id: string): InternalSample {
    let sample = this.samples.get(id)
    if (sample) return sample
    sample = { id, host: {}, status: 'pending' }
    this.samples.set(id, sample)
    while (this.samples.size > this.maxSamples) {
      const oldest = this.samples.keys().next().value
      if (oldest === undefined) break
      this.samples.delete(oldest)
    }
    return sample
  }

  begin(renderer: RendererEditPerf, receivedAt: number): void {
    const sample = this.ensure(renderer.id)
    sample.renderer = { ...sample.renderer, ...renderer }
    sample.receivedAt = receivedAt
  }

  rendererPost(
    id: string,
    postMessageMs: number,
    state: 'posted' | 'cancelled',
  ): void {
    const sample = this.ensure(id)
    if (sample.renderer) sample.renderer.postMessageMs = postMessageMs
    if (state === 'cancelled') sample.status = 'cancelled'
  }

  host(id: string, values: EditPerfValues): boolean {
    const sample = this.samples.get(id)
    if (!sample) return false
    Object.assign(sample.host, values)
    return true
  }

  followers(id: string, values: EditPerfValues): boolean {
    const sample = this.samples.get(id)
    if (!sample) return false
    sample.followers ??= {}
    Object.assign(sample.followers, values)
    return true
  }

  finish(id: string, status: 'complete' | 'failed'): boolean {
    const sample = this.samples.get(id)
    if (!sample) return false
    sample.status = status
    return true
  }

  receivedAt(id: string): number | undefined {
    return this.samples.get(id)?.receivedAt
  }

  clear(): void {
    this.samples.clear()
  }

  snapshot(): EditPerfSample[] {
    return [...this.samples.values()].map((sample) => ({
      id: sample.id,
      ...(sample.renderer ? { renderer: { ...sample.renderer } } : {}),
      host: { ...sample.host },
      ...(sample.followers ? { followers: { ...sample.followers } } : {}),
      status: sample.status,
    }))
  }
}

const collector = new EditPerfCollector()
let activeId: string | undefined

const enabled = (): boolean => process.env.VMDE_E2E === '1'
const publish = (): void => {
  if (!enabled()) return
  ;(globalThis as any).__vmdeEditPerfSamples = collector.snapshot()
}

export function beginEditPerf(
  renderer: RendererEditPerf | undefined,
  receivedAt = performance.now(),
): string | undefined {
  if (!enabled() || !renderer) return undefined
  collector.begin(renderer, receivedAt)
  publish()
  return renderer.id
}

export function rendererPostPerf(
  id: string,
  postMessageMs: number,
  state: 'posted' | 'cancelled',
): void {
  if (!enabled()) return
  collector.rendererPost(id, postMessageMs, state)
  publish()
}

export function hostEditPerf(
  id: string | undefined,
  values: EditPerfValues,
): void {
  if (!id || !enabled()) return
  collector.host(id, values)
  publish()
}

export function followerEditPerf(
  id: string | undefined,
  values: EditPerfValues,
): void {
  if (!id || !enabled()) return
  collector.followers(id, values)
  publish()
}

export function finishEditPerf(
  id: string | undefined,
  status: 'complete' | 'failed',
): void {
  if (!id || !enabled()) return
  collector.finish(id, status)
  publish()
}

export function editPerfReceivedAt(id: string | undefined): number | undefined {
  return id && enabled() ? collector.receivedAt(id) : undefined
}

export function setActiveEditPerf(id: string | undefined): void {
  if (!enabled()) return
  activeId = id
}

export function activeEditPerf(): string | undefined {
  return enabled() ? activeId : undefined
}

export function clearEditPerf(): void {
  if (!enabled()) return
  collector.clear()
  activeId = undefined
  publish()
}

export function snapshotEditPerf(): EditPerfSample[] {
  return enabled() ? collector.snapshot() : []
}
