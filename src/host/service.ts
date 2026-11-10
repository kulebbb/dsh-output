/**
 * 宿主半：把一次会话日志折叠成交付物列表，并通过认证路由提供给客户端。
 *
 * 数据来源是 `ctx.sessionQuery.readSession(sessionId)` —— 一次读出该会话**全量**日志，
 * 不依赖客户端可以翻多少页；运行中的会话通过 `session/event` 推送增量喂给折叠器，
 * 同一个会话重复请求直接命中缓存，不重复解压/回放日志。
 */
import type {
  Deliverable,
  OutputsErrorPayload,
  OutputsPayload,
} from '../shared/types.ts'
import { DeliverableFolder, type SessionEventLike } from '../shared/rules.ts'

/** `sessionQuery.readSession()` 返回值里我们用到的最小结构。 */
export interface SessionSnapshotLike {
  session?: { cwd?: string; createdAt?: number } | null
  events: readonly SessionEventLike[]
}

export interface StatResult {
  isFile: boolean
  size: number
  mtimeMs: number
}

/** 依赖注入：生产环境接 DSH 服务，测试里用 mock。 */
export interface OutputsServiceDeps {
  readSession(sessionId: string): Promise<SessionSnapshotLike>
  statPath(path: string): Promise<StatResult | null>
  now?(): number
  /** 列表条数上限（默认 2000），超出时返回 truncated 标记。 */
  maxDeliverables?: number
  logger?: {
    warn?(...args: unknown[]): void
    debug?(...args: unknown[]): void
  }
}

interface CacheEntry {
  sessionId: string
  cwd: string | null
  createdAt: number
  /** 已回放/已推送到的最后事件 seq，便于诊断与后续增量。 */
  lastSeq: number
  folder: DeliverableFolder
}

const REPLY_FRESHNESS_WINDOW_MS = 6 * 60 * 60 * 1000
const STAT_CONCURRENCY = 12
/** 单次响应最多返回多少条交付物；超出的截断并标 truncated。 */
const DEFAULT_MAX_DELIVERABLES = 2000
/** 冷读期间最多缓冲多少条 live 事件（防止极端会话无限增长）。 */
const MAX_INGRESS_EVENTS = 2000

/** 已知的「会话不存在 / 日志不可读」错误码，避免把它们变成 500。 */
const NOT_FOUND_CODES = new Set(['SESSION_QUERY_SESSION_NOT_FOUND', 'session/not-found'])
const UNREADABLE_CODE_PREFIX = 'SESSION_QUERY_'

function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' ? code : undefined
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}

function errorResponse(status: number, code: OutputsErrorPayload['error']['code'], message: string): Response {
  return jsonResponse({ error: { code, message } } satisfies OutputsErrorPayload, status)
}

/** 简易并发池：交付物一般只有几条到几十条，限制并发避免一次打开太多 fd。 */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = cursor++
      if (index >= items.length) return
      results[index] = await mapper(items[index] as T, index)
    }
  })
  await Promise.all(workers)
  return results
}

export class OutputsService {
  private readonly deps: OutputsServiceDeps
  private readonly cache = new Map<string, CacheEntry>()
  private readonly pending = new Map<string, Promise<CacheEntry>>()
  /**
   * 冷读/强制刷新窗口内到达的 live 事件：先按会话缓冲，日志读完、缓存建立后
   * 再按 seq > lastSeq 回放。否则 readSession 返回后到 cache.set 之间的事件会被丢掉且永不补。
   */
  private readonly ingress = new Map<string, SessionEventLike[]>()

  constructor(deps: OutputsServiceDeps) {
    this.deps = deps
  }

  /** 认证路由的 handler；直接交给 `ctx.connection.fetch.register({ fetch })`。 */
  async handle(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url)
      const sessionId = url.searchParams.get('sessionId')?.trim()
      if (!sessionId) return errorResponse(400, 'invalid-request', 'Missing sessionId.')
      const refresh = url.searchParams.get('refresh') === '1'
      const payload = await this.buildPayload(sessionId, refresh)
      return jsonResponse(payload)
    } catch (error) {
      const code = errorCode(error)
      if (code && NOT_FOUND_CODES.has(code)) {
        return errorResponse(404, 'session-not-found', 'Session not found.')
      }
      if (code && code.startsWith(UNREADABLE_CODE_PREFIX)) {
        this.deps.logger?.warn?.('[dsh-output] session unreadable:', code)
        return errorResponse(422, 'session-unreadable', 'Session log is unreadable.')
      }
      this.deps.logger?.warn?.('[dsh-output] outputs request failed:', error)
      return errorResponse(500, 'internal', 'Failed to build output list.')
    }
  }

  /**
   * `session/event` 推送：
   *   - 已有缓存 → 直接增量折叠；
   *   - 正在冷读/强制刷新 → 先放进该会话的缓冲，读完日志后补放（不丢事件）；
   *   - 从没请求过的会话 → 忽略（下次冷读会读到全量日志，包含这条事件）。
   */
  ingest(sessionId: string, event: SessionEventLike): void {
    const entry = this.cache.get(sessionId)
    if (entry) {
      this.applyToEntry(entry, event)
      return
    }
    if (this.pending.has(sessionId)) {
      const buffer = this.ingress.get(sessionId) ?? []
      buffer.push(event)
      // 有界：极端情况丢最旧的，保证内存可控。
      if (buffer.length > MAX_INGRESS_EVENTS) buffer.splice(0, buffer.length - MAX_INGRESS_EVENTS)
      this.ingress.set(sessionId, buffer)
    }
  }

  private applyToEntry(entry: CacheEntry, event: SessionEventLike): void {
    try {
      entry.folder.apply(event)
      if (typeof event.seq === 'number' && event.seq > entry.lastSeq) entry.lastSeq = event.seq
    } catch (error) {
      this.deps.logger?.warn?.('[dsh-output] incremental fold failed:', error)
    }
  }

  /** 手动失效（测试或会话被重置时用）。 */
  invalidate(sessionId?: string): void {
    if (sessionId === undefined) this.cache.clear()
    else this.cache.delete(sessionId)
  }

  private async buildPayload(sessionId: string, refresh: boolean): Promise<OutputsPayload> {
    const cached = refresh ? undefined : this.cache.get(sessionId)
    const entry = cached ?? (await this.loadEntry(sessionId, refresh))

    const candidates = entry.folder.snapshot()
    const statted = await mapWithConcurrency(candidates, STAT_CONCURRENCY, async (candidate) => {
      const stat = await this.deps.statPath(candidate.path).catch(() => null)
      if (!stat || !stat.isFile) return null
      // 「对话中提到的文件」额外要求：文件修改时间不早于会话开始（留 6 小时缓冲）。
      if (
        candidate.source === 'reply' &&
        entry.createdAt > 0 &&
        stat.mtimeMs < entry.createdAt - REPLY_FRESHNESS_WINDOW_MS
      ) {
        return null
      }
      const deliverable: Deliverable = {
        ...candidate,
        exists: true,
        size: stat.size,
        mtime: stat.mtimeMs,
      }
      return deliverable
    })

    const deliverables = statted
      .filter((item): item is Deliverable => item !== null)
      .sort((a, b) => b.mtime - a.mtime)

    const limit = this.deps.maxDeliverables ?? DEFAULT_MAX_DELIVERABLES
    const limited = deliverables.length > limit ? deliverables.slice(0, limit) : deliverables
    const now = this.deps.now?.() ?? Date.now()
    return {
      sessionId,
      cwd: entry.cwd,
      generatedAt: new Date(now).toISOString(),
      total: deliverables.length,
      truncated: deliverables.length > limit,
      deliverables: limited,
    }
  }

  private loadEntry(sessionId: string, refresh: boolean): Promise<CacheEntry> {
    const pending = this.pending.get(sessionId)
    if (pending) return pending
    const task = (async () => {
      // refresh 时先删旧缓存，避免读日志失败后回退到过期数据；缓冲从空开始。
      if (refresh) this.cache.delete(sessionId)
      this.ingress.set(sessionId, [])
      try {
        const snapshot = await this.deps.readSession(sessionId)
        const cwd = typeof snapshot.session?.cwd === 'string' && snapshot.session.cwd ? snapshot.session.cwd : null
        const createdAt = typeof snapshot.session?.createdAt === 'number' ? snapshot.session.createdAt : 0
        const folder = new DeliverableFolder({ cwd: cwd ?? '' })
        let lastSeq = 0
        for (const event of snapshot.events) {
          folder.apply(event)
          if (typeof event.seq === 'number' && event.seq > lastSeq) lastSeq = event.seq
        }
        folder.finalize()
        const entry: CacheEntry = { sessionId, cwd, createdAt, lastSeq, folder }
        // 回放冷读期间缓冲的 live 事件：seq 已包含在快照里的跳过（去重）。
        const buffered = this.ingress.get(sessionId) ?? []
        for (const event of buffered) {
          if (typeof event.seq === 'number' && event.seq <= lastSeq) continue
          this.applyToEntry(entry, event)
        }
        this.cache.set(sessionId, entry)
        return entry
      } finally {
        this.ingress.delete(sessionId)
      }
    })()
    this.pending.set(sessionId, task)
    task.finally(() => this.pending.delete(sessionId)).catch(() => {})
    return task
  }
}
