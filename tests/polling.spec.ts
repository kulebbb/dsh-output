/**
 * 自动刷新决策单测（`src/client/polling.ts`）。
 *
 * 覆盖审查阻断项 B1 的边界：会话从 running 变成 not running 的那一拍必须补拉一次，
 * 否则最后 ≤3s 内到达的 present/write 会永远停在旧列表里。用假定时器模拟真实 3s 拍子。
 */
import { describe, expect, it, vi } from 'vitest'
import { createAutoRefresher } from '../src/client/polling.ts'

describe('createAutoRefresher', () => {
  it('running 期间每拍都拉；true→false 那一拍补拉一次；之后不再拉', () => {
    vi.useFakeTimers()
    try {
      let running = true
      const onTick = vi.fn()
      const refresher = createAutoRefresher({
        intervalMs: 3000,
        isRunning: () => running,
        onTick,
      })
      refresher.start()

      vi.advanceTimersByTime(3000)
      expect(onTick).toHaveBeenCalledTimes(1)
      expect(onTick.mock.calls[0]?.[0]).toEqual({ running: true, shouldLoad: true })

      // 会话结束时最后一批事件已进宿主缓存：这一拍 running 变 false，但仍要补拉。
      running = false
      vi.advanceTimersByTime(3000)
      expect(onTick).toHaveBeenCalledTimes(2)
      expect(onTick.mock.calls[1]?.[0]).toEqual({ running: false, shouldLoad: true })

      // 之后保持静止：不运行就不发请求。
      vi.advanceTimersByTime(9000)
      expect(onTick).toHaveBeenCalledTimes(5)
      expect(onTick.mock.calls[4]?.[0]).toEqual({ running: false, shouldLoad: false })

      refresher.stop()
      vi.advanceTimersByTime(9000)
      expect(onTick).toHaveBeenCalledTimes(5)
    } finally {
      vi.useRealTimers()
    }
  })

  it('start 幂等；stop 后可以再 start', () => {
    vi.useFakeTimers()
    try {
      const onTick = vi.fn()
      const refresher = createAutoRefresher({ intervalMs: 1000, isRunning: () => false, onTick })
      refresher.start()
      refresher.start()
      vi.advanceTimersByTime(1000)
      expect(onTick).toHaveBeenCalledTimes(1)
      refresher.stop()
      refresher.start()
      vi.advanceTimersByTime(1000)
      expect(onTick).toHaveBeenCalledTimes(2)
      refresher.stop()
    } finally {
      vi.useRealTimers()
    }
  })

  it('isRunning 抛错时当作未运行，不把面板打崩', () => {
    const onTick = vi.fn()
    const refresher = createAutoRefresher({
      intervalMs: 3000,
      isRunning: () => {
        throw new Error('boom')
      },
      onTick,
    })
    const state = refresher.tick()
    expect(state.running).toBe(false)
    // 初始 previousRunning 也是 false，因此第一拍不需要拉。
    expect(state.shouldLoad).toBe(false)
    expect(onTick).toHaveBeenCalledTimes(1)
  })
})
