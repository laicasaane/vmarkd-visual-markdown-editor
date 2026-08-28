export interface AutoWrapConfig {
  enabled: boolean
  delayMs: number
  column: number
}

export interface AutoWrapInput {
  inputType: string
  isComposing: boolean
}

export interface AutoWrapController {
  updateConfig(config: AutoWrapConfig): void
  cancel(): void
  dispose(): void
  handleInput(event: AutoWrapInput): void
  handleCompositionStart(): void
  handleCompositionEnd(): void
}

interface AutoWrapControllerDeps<Target> {
  captureTarget(): Target | null
  isTargetCurrent(target: Target): boolean
  apply(target: Target, config: AutoWrapConfig): void | Promise<void>
  onError(error: unknown): void
}

const DEFAULT_CONFIG: AutoWrapConfig = {
  enabled: false,
  delayMs: 500,
  column: 80,
}

function normalizedConfig(config: AutoWrapConfig): AutoWrapConfig {
  return {
    enabled: config.enabled === true,
    delayMs: Math.min(5000, Math.max(100, Math.round(config.delayMs || 500))),
    column:
      Number.isFinite(config.column) && config.column > 0
        ? Math.floor(config.column)
        : 80,
  }
}

export function createAutoWrapController<Target>(
  deps: AutoWrapControllerDeps<Target>,
): AutoWrapController {
  let config = DEFAULT_CONFIG
  let timer: ReturnType<typeof setTimeout> | undefined
  let disposed = false
  let composing = false
  let composedInput = false
  let applying = false

  const cancel = () => {
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
  }

  const schedule = () => {
    if (disposed || applying || composing || !config.enabled) return
    const target = deps.captureTarget()
    if (target == null) return
    cancel()
    timer = setTimeout(() => {
      timer = undefined
      if (
        disposed ||
        applying ||
        !config.enabled ||
        !deps.isTargetCurrent(target)
      ) {
        return
      }
      applying = true
      Promise.resolve()
        .then(() => deps.apply(target, config))
        .catch((error: unknown) => deps.onError(error))
        .finally(() => {
          applying = false
        })
    }, config.delayMs)
  }

  return {
    updateConfig(nextConfig) {
      const next = normalizedConfig(nextConfig)
      if (
        config.enabled !== next.enabled ||
        config.delayMs !== next.delayMs ||
        config.column !== next.column
      ) {
        cancel()
      }
      config = next
    },
    cancel,
    dispose() {
      disposed = true
      cancel()
    },
    handleInput(event) {
      if (disposed || applying || !config.enabled) return
      if (composing || event.isComposing) {
        if (event.inputType === 'insertText') composedInput = true
        return
      }
      if (event.inputType !== 'insertText') {
        cancel()
        return
      }
      schedule()
    },
    handleCompositionStart() {
      composing = true
      composedInput = false
      cancel()
    },
    handleCompositionEnd() {
      composing = false
      if (!composedInput) return
      composedInput = false
      schedule()
    },
  }
}
