/**
 * 「会话运行中」自动刷新决策。
 *
 * 只做一件事：每 ~3s 检查一次会话是否在运行，决定这次要不要静默拉一次缓存态列表。
 * 关键边界：会话从 running 变成 not running 的那一拍也要拉一次——最后 ≤3s 内到达的
 * present/write 可能已经进了宿主缓存，但如果直接跳过这次请求，列表会停在旧状态，
 * 直到用户手动刷新。面板用 `createAutoRefresher` 挂定时器，测试用假定时器覆盖这个转换。
 */

export interface AutoRefreshState {
  /** 当前会话是否正在运行（用于面板显示运行中小圆点）。 */
  running: boolean
  /** 这一拍是否应该静默拉一次缓存态列表。 */
  shouldLoad: boolean
}

export interface AutoRefresherOptions {
  intervalMs: number
  isRunning(): boolean
  onTick(state: AutoRefreshState): void
  /** 可注入的定时器，便于测试（默认 window.setInterval / clearInterval）。 */
  setInterval?: (handler: () => void, timeout: number) => number
  clearInterval?: (handle: number) => void
}

export interface AutoRefresher {
  start(): void
  stop(): void
  /** 手动跑一拍（visibilitychange / focus 时也可以直接用）。 */
  tick(): AutoRefreshState
}

export function createAutoRefresher(options: AutoRefresherOptions): AutoRefresher {
  // 用 globalThis 而不是 window：客户端 bundle 里等价，Node 测试环境（无 window）也能跑。
  const schedule =
    options.setInterval ?? ((handler: () => void, timeout: number) => globalThis.setInterval(handler, timeout) as unknown as number)
  const cancel = options.clearInterval ?? ((handle: number) => globalThis.clearInterval(handle))
  let handle: number | null = null
  let previousRunning = safeIsRunning(options)

  return {
    start() {
      if (handle !== null) return
      handle = schedule(() => this.tick(), options.intervalMs)
    },
    stop() {
      if (handle !== null) {
        cancel(handle)
        handle = null
      }
    },
    tick() {
      const running = safeIsRunning(options)
      // running 时每拍都拉（拿到最新增量）；true→false 的那一拍补拉一次。
      const shouldLoad = running || (previousRunning && !running)
      previousRunning = running
      const state = { running, shouldLoad }
      options.onTick(state)
      return state
    },
  }
}

function safeIsRunning(options: AutoRefresherOptions): boolean {
  try {
    return options.isRunning() === true
  } catch {
    return false
  }
}
