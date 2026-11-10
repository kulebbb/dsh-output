/**
 * 宿主半路由单测：OutputsService.handle / ingest / invalidate。
 * 全部依赖注入 mock（readSession / statPath / now / logger），不碰真实磁盘与会话日志。
 * 被测：src/host/service.ts（只读，不改 src）。
 */
import { describe, expect, it, vi } from 'vitest'
import { OutputsService, type SessionSnapshotLike, type StatResult } from '../src/host/service.ts'
import type { SessionEventLike } from '../src/shared/rules.ts'
import type { Deliverable, OutputsErrorPayload, OutputsPayload } from '../src/shared/types.ts'
import {
  CREATED_AT,
  CWD,
  PRESENT_PATH,
  REPLY_PATH,
  SAMPLE_OUTPUTS_EVENTS,
  WRITE_PATH,
  assistantText,
  presentedEvent,
  turnEnd,
  turnStart,
  writeCall,
} from './fixtures/events.ts'

const NOW = CREATED_AT + 10_000
const SIX_HOURS = 6 * 60 * 60 * 1000
const SESSION_ID = 's1'
const LIST_URL = 'http://localhost/api/outputs.list'

function statOf(mtimeMs: number, size = 10): StatResult {
  return { isFile: true, size, mtimeMs }
}

/** service.spec 默认的三条交付物：present html / write csv / reply md。 */
function baseStat(): Map<string, StatResult | null> {
  return new Map<string, StatResult | null>([
    [PRESENT_PATH, statOf(CREATED_AT + 3_000, 123)],
    [WRITE_PATH, statOf(CREATED_AT + 2_000, 456)],
    [REPLY_PATH, statOf(CREATED_AT + 4_000, 789)],
  ])
}

interface HarnessOptions {
  events?: readonly SessionEventLike[]
  createdAt?: number
  stat?: Map<string, StatResult | null>
  now?: number
}

function makeHarness(options: HarnessOptions = {}) {
  const events = options.events ?? SAMPLE_OUTPUTS_EVENTS
  const createdAt = options.createdAt ?? CREATED_AT
  const stat = options.stat ?? baseStat()
  const readSession = vi.fn(async (_sessionId: string): Promise<SessionSnapshotLike> => ({
    session: { cwd: CWD, createdAt },
    events,
  }))
  const statPath = vi.fn(async (path: string): Promise<StatResult | null> => stat.get(path) ?? null)
  const logger = { warn: vi.fn() }
  const service = new OutputsService({ readSession, statPath, now: () => options.now ?? NOW, logger })
  return { service, readSession, statPath, logger, stat }
}

/** 构造认证路由请求（与宿主注册时收到的 Request 同构）。 */
function listRequest(query = ''): Request {
  return new Request(`${LIST_URL}${query}`)
}

async function jsonOf<T>(response: Response): Promise<T> {
  return (await response.json()) as T
}

function expectDeliverableShape(deliverable: Deliverable): void {
  for (const key of ['path', 'rel', 'name', 'ext', 'kind', 'source', 'size', 'mtime', 'exists'] as const) {
    expect(deliverable).toHaveProperty(key)
  }
  expect(deliverable.exists).toBe(true)
  expect(typeof deliverable.size).toBe('number')
  expect(typeof deliverable.mtime).toBe('number')
}

// ---------------------------------------------------------------------------
// 正常路径
// ---------------------------------------------------------------------------
describe('OutputsService.handle 正常路径', () => {
  it('返回 200、字段完整、按磁盘 mtime 倒序（不是事件时间）', async () => {
    const { service, readSession, statPath } = makeHarness()
    const response = await service.handle(listRequest(`?sessionId=${SESSION_ID}`))

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(response.headers.get('cache-control')).toBe('no-store')

    const body = await jsonOf<OutputsPayload>(response)
    expect(body.sessionId).toBe(SESSION_ID)
    expect(body.cwd).toBe(CWD)
    expect(body.generatedAt).toBe(new Date(NOW).toISOString())
    expect(body.total).toBe(3)
    // mtime：reply(+4s) > present(+3s) > write(+2s)
    expect(body.deliverables.map((d) => d.path)).toEqual([REPLY_PATH, PRESENT_PATH, WRITE_PATH])
    expect(readSession).toHaveBeenCalledTimes(1)
    expect(readSession).toHaveBeenCalledWith(SESSION_ID)
    // stat 收到的是折叠后的绝对路径
    expect(statPath).toHaveBeenCalledWith(PRESENT_PATH)

    body.deliverables.forEach(expectDeliverableShape)

    const present = body.deliverables[1]
    expect(present).toMatchObject({
      path: PRESENT_PATH,
      rel: 'report.html',
      name: 'report.html',
      ext: 'html',
      kind: 'doc',
      source: 'presented',
      description: '阶段 2 方案文档',
      exists: true,
      size: 123,
      mtime: CREATED_AT + 3_000,
    })
    // 普通交付类型（非源码）不出现 isSource
    expect(present?.isSource).toBeUndefined()

    const write = body.deliverables[2]
    expect(write).toMatchObject({
      path: WRITE_PATH,
      rel: 'tables/summary.csv',
      name: 'summary.csv',
      ext: 'csv',
      kind: 'sheet',
      source: 'write',
      size: 456,
      mtime: CREATED_AT + 2_000,
    })

    const reply = body.deliverables[0]
    expect(reply).toMatchObject({
      path: REPLY_PATH,
      rel: 'reply.md',
      name: 'reply.md',
      ext: 'md',
      kind: 'doc',
      source: 'reply',
      size: 789,
    })
  })

  it('磁盘上不存在的文件被过滤（statPath 返回 null 或 isFile=false）', async () => {
    const stat = baseStat()
    stat.delete(WRITE_PATH)
    // 另一个候选：磁盘上是目录而不是普通文件
    stat.set(REPLY_PATH, { isFile: false, size: 0, mtimeMs: CREATED_AT + 4_000 })
    const { service } = makeHarness({ stat })

    const body = await jsonOf<OutputsPayload>(await service.handle(listRequest(`?sessionId=${SESSION_ID}`)))
    expect(body.total).toBe(1)
    expect(body.deliverables.map((d) => d.path)).toEqual([PRESENT_PATH])
  })

  it('statPath 抛错时该条被跳过，不影响整个响应', async () => {
    const { service, statPath } = makeHarness()
    statPath.mockImplementation(async (path: string): Promise<StatResult | null> => {
      if (path === WRITE_PATH) throw new Error('EACCES')
      return { isFile: true, size: 1, mtimeMs: CREATED_AT + 2_000 }
    })

    const response = await service.handle(listRequest(`?sessionId=${SESSION_ID}`))
    expect(response.status).toBe(200)
    const body = await jsonOf<OutputsPayload>(response)
    expect(body.total).toBe(2)
    expect(body.deliverables.map((d) => d.path)).not.toContain(WRITE_PATH)
  })
})

// ---------------------------------------------------------------------------
// 回复来源的 mtime 保鲜期
// ---------------------------------------------------------------------------
describe('reply 来源的 mtime 保鲜期', () => {
  it('mtime 早于会话 createdAt 6 小时被过滤，晚于则保留', async () => {
    const OLD = `${CWD}/old.md`
    const NEW = `${CWD}/new.md`
    const events: SessionEventLike[] = [
      turnStart(1, { time: CREATED_AT }),
      assistantText(`旧文件 \`${OLD}\`，新文件 \`${NEW}\`。`, { time: CREATED_AT + 1_000 }),
      turnEnd(1, { time: CREATED_AT + 1_100 }),
    ]
    const stat = new Map<string, StatResult | null>([
      // 刚好早于窗口 1ms：过滤
      [OLD, statOf(CREATED_AT - SIX_HOURS - 1)],
      // 刚好晚于窗口 1ms：保留
      [NEW, statOf(CREATED_AT - SIX_HOURS + 1)],
    ])
    const { service } = makeHarness({ events, stat })

    const body = await jsonOf<OutputsPayload>(await service.handle(listRequest(`?sessionId=${SESSION_ID}`)))
    expect(body.total).toBe(1)
    expect(body.deliverables[0]?.path).toBe(NEW)
    expect(body.deliverables[0]?.source).toBe('reply')
  })

  it('write/present 来源不受保鲜期限制（旧文件也展示）', async () => {
    const OLD_WRITE = `${CWD}/deliverables/old.html`
    const events: SessionEventLike[] = [writeCall(OLD_WRITE, { time: CREATED_AT })]
    const stat = new Map<string, StatResult | null>([[OLD_WRITE, statOf(CREATED_AT - 30 * 24 * 60 * 60 * 1000)]])
    const { service } = makeHarness({ events, stat })

    const body = await jsonOf<OutputsPayload>(await service.handle(listRequest(`?sessionId=${SESSION_ID}`)))
    expect(body.total).toBe(1)
    expect(body.deliverables[0]?.source).toBe('write')
  })
})

// ---------------------------------------------------------------------------
// 缓存与增量
// ---------------------------------------------------------------------------
describe('缓存与增量', () => {
  it('同一 sessionId 连续两次 handle 只读一次 session；?refresh=1 再读一次', async () => {
    const { service, readSession } = makeHarness()

    const first = await service.handle(listRequest(`?sessionId=${SESSION_ID}`))
    const second = await service.handle(listRequest(`?sessionId=${SESSION_ID}`))
    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(readSession).toHaveBeenCalledTimes(1)

    // 强制刷新：重新读日志（丢掉缓存）
    const refreshed = await service.handle(listRequest(`?sessionId=${SESSION_ID}&refresh=1`))
    expect(refreshed.status).toBe(200)
    expect(readSession).toHaveBeenCalledTimes(2)
  })

  it('ingest 推送 presented/write 事件后，下一次 handle 立刻可见且不重新读日志', async () => {
    const NEW_HTML = `${CWD}/deliverables/incremental.html`
    const NEW_TS = `${CWD}/deliverables/incremental.ts`
    const { service, readSession, stat } = makeHarness()
    stat.set(NEW_HTML, statOf(CREATED_AT + 5_000, 11))
    stat.set(NEW_TS, statOf(CREATED_AT + 6_000, 12))

    const before = await jsonOf<OutputsPayload>(await service.handle(listRequest(`?sessionId=${SESSION_ID}`)))
    expect(before.total).toBe(3)

    // session/event 推送：一个 write + 一个 present（present 的源码类文件带 isSource）
    service.ingest(SESSION_ID, writeCall(NEW_HTML, { time: CREATED_AT + 5_000 }))
    service.ingest(SESSION_ID, presentedEvent([{ path: NEW_TS, description: '增量源码' }], { time: CREATED_AT + 6_000 }))

    const after = await jsonOf<OutputsPayload>(await service.handle(listRequest(`?sessionId=${SESSION_ID}`)))
    expect(after.total).toBe(5)
    expect(after.deliverables.map((d) => d.path)).toContain(NEW_HTML)
    expect(after.deliverables.map((d) => d.path)).toContain(NEW_TS)
    expect(readSession).toHaveBeenCalledTimes(1)

    const sourceDeliverable = after.deliverables.find((d) => d.path === NEW_TS)
    expect(sourceDeliverable?.source).toBe('presented')
    expect(sourceDeliverable?.isSource).toBe(true)
    // 源码类交付物同样要有完整路由字段（含 isSource）
    for (const key of ['path', 'rel', 'name', 'ext', 'kind', 'source', 'isSource', 'size', 'mtime', 'exists'] as const) {
      expect(sourceDeliverable).toHaveProperty(key)
    }
    // 增量条目同样带上磁盘信息并按 mtime 排序（NEW_TS +6s 最上面）
    expect(after.deliverables[0]?.path).toBe(NEW_TS)
    expect(sourceDeliverable?.size).toBe(12)
  })

  it('B2 回归：冷读窗口内到达的 session/event 不会丢，读完后按 seq 补放', async () => {
    const RACE_PATH = `${CWD}/deliverables/race-cold.md`
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const readSession = vi.fn(async (): Promise<SessionSnapshotLike> => {
      await gate
      return { session: { cwd: CWD, createdAt: CREATED_AT }, events: SAMPLE_OUTPUTS_EVENTS }
    })
    const statPath = vi.fn(async (path: string): Promise<StatResult | null> => {
      if (path === RACE_PATH) return statOf(CREATED_AT + 5_000, 11)
      return baseStat().get(path) ?? null
    })
    const service = new OutputsService({ readSession, statPath, now: () => NOW })

    // 冷读开始（readSession 挂起），此时 live 事件到达。
    const pending = service.handle(listRequest(`?sessionId=${SESSION_ID}`))
    service.ingest(SESSION_ID, writeCall(RACE_PATH, { seq: 100, time: CREATED_AT + 5_000 }))
    release()
    const body = await jsonOf<OutputsPayload>(await pending)

    expect(readSession).toHaveBeenCalledTimes(1)
    // 这条事件不在日志快照里，只有在缓冲回放后才可能出现。
    expect(body.deliverables.map((d) => d.path)).toContain(RACE_PATH)
  })

  it('B2 回归：强制刷新窗口内到达的 session/event 也会补放，且 seq 已覆盖的跳过', async () => {
    const RACE_PATH = `${CWD}/deliverables/race-refresh.md`
    let release!: () => void
    let gate: Promise<void> | null = null
    const readSession = vi.fn(async (): Promise<SessionSnapshotLike> => {
      if (gate) await gate
      return { session: { cwd: CWD, createdAt: CREATED_AT }, events: SAMPLE_OUTPUTS_EVENTS }
    })
    const statPath = vi.fn(async (path: string): Promise<StatResult | null> => {
      if (path === RACE_PATH) return statOf(CREATED_AT + 6_000, 12)
      return baseStat().get(path) ?? null
    })
    const service = new OutputsService({ readSession, statPath, now: () => NOW })
    await service.handle(listRequest(`?sessionId=${SESSION_ID}`))
    expect(readSession).toHaveBeenCalledTimes(1)

    // 强制刷新：readSession 第二跳挂起，期间到达两条事件，其中 seq=5 已在快照里。
    gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const pending = service.handle(listRequest(`?sessionId=${SESSION_ID}&refresh=1`))
    service.ingest(SESSION_ID, writeCall(`${CWD}/deliverables/old.md`, { seq: 5, time: CREATED_AT + 2_000 }))
    service.ingest(SESSION_ID, writeCall(RACE_PATH, { seq: 6, time: CREATED_AT + 6_000 }))
    release()
    const body = await jsonOf<OutputsPayload>(await pending)

    expect(readSession).toHaveBeenCalledTimes(2)
    expect(body.deliverables.map((d) => d.path)).toContain(RACE_PATH)
    // seq=5 已被快照覆盖：不应出现（没有 stat 的 old.md 本来就会被过滤，这里断言的是去重逻辑没把缓存搞坏）。
    expect(body.total).toBe(4)
  })

  it('S9：交付物超过上限时截断并标 truncated，total 仍是截断前的总数', async () => {
    const readSession = vi.fn(async (): Promise<SessionSnapshotLike> => ({
      session: { cwd: CWD, createdAt: CREATED_AT },
      events: SAMPLE_OUTPUTS_EVENTS,
    }))
    const stat = baseStat()
    const statPath = vi.fn(async (path: string): Promise<StatResult | null> => stat.get(path) ?? null)
    const service = new OutputsService({ readSession, statPath, now: () => NOW, maxDeliverables: 2 })
    const body = await jsonOf<OutputsPayload>(await service.handle(listRequest(`?sessionId=${SESSION_ID}`)))

    expect(body.total).toBe(3)
    expect(body.truncated).toBe(true)
    expect(body.deliverables).toHaveLength(2)
  })

  it('invalidate(sessionId) 与 invalidate() 都会让下次 handle 重新读日志', async () => {
    const { service, readSession } = makeHarness()
    await service.handle(listRequest(`?sessionId=${SESSION_ID}`))
    expect(readSession).toHaveBeenCalledTimes(1)

    service.invalidate(SESSION_ID)
    await service.handle(listRequest(`?sessionId=${SESSION_ID}`))
    expect(readSession).toHaveBeenCalledTimes(2)

    service.invalidate()
    await service.handle(listRequest(`?sessionId=${SESSION_ID}`))
    expect(readSession).toHaveBeenCalledTimes(3)
  })
})

// ---------------------------------------------------------------------------
// 错误处理
// ---------------------------------------------------------------------------
function makeErrorHarness(error: unknown) {
  const readSession = vi.fn(async (_sessionId: string): Promise<SessionSnapshotLike> => {
    throw error
  })
  const statPath = vi.fn(async (_path: string): Promise<StatResult | null> => null)
  const logger = { warn: vi.fn() }
  const service = new OutputsService({ readSession, statPath, logger })
  return { service, readSession, logger }
}

describe('OutputsService.handle 错误处理', () => {
  it('缺 sessionId → 400 invalid-request', async () => {
    const { service, readSession } = makeHarness()

    const missing = await service.handle(listRequest())
    expect(missing.status).toBe(400)
    const missingBody = await jsonOf<OutputsErrorPayload>(missing)
    expect(missingBody).toEqual({ error: { code: 'invalid-request', message: 'Missing sessionId.' } })

    // 只有空格也当作缺失
    const blank = await service.handle(listRequest('?sessionId=%20%20'))
    expect(blank.status).toBe(400)
    expect(readSession).not.toHaveBeenCalled()
  })

  it('SESSION_QUERY_SESSION_NOT_FOUND → 404 session-not-found', async () => {
    const { service, readSession } = makeErrorHarness({ code: 'SESSION_QUERY_SESSION_NOT_FOUND' })
    const response = await service.handle(listRequest(`?sessionId=missing`))

    expect(response.status).toBe(404)
    expect(await jsonOf<OutputsErrorPayload>(response)).toEqual({
      error: { code: 'session-not-found', message: 'Session not found.' },
    })
    expect(readSession).toHaveBeenCalledWith('missing')
  })

  it('SESSION_QUERY_REPLAY_INVALID → 422 session-unreadable（并记 warn 日志）', async () => {
    const { service, logger } = makeErrorHarness({ code: 'SESSION_QUERY_REPLAY_INVALID' })
    const response = await service.handle(listRequest(`?sessionId=${SESSION_ID}`))

    expect(response.status).toBe(422)
    expect(await jsonOf<OutputsErrorPayload>(response)).toEqual({
      error: { code: 'session-unreadable', message: 'Session log is unreadable.' },
    })
    expect(logger.warn).toHaveBeenCalled()
  })

  it('普通 Error → 500 internal，响应体不泄露堆栈/原始错误信息', async () => {
    const { service, logger } = makeErrorHarness(new Error('boom: /Users/secret/session.jsonl EACCES'))
    const response = await service.handle(listRequest(`?sessionId=${SESSION_ID}`))

    expect(response.status).toBe(500)
    const body = await jsonOf<OutputsErrorPayload>(response)
    // 只暴露 { error: { code, message } } 三个字段
    expect(Object.keys(body)).toEqual(['error'])
    expect(Object.keys(body.error).sort()).toEqual(['code', 'message'])
    expect(body.error).toEqual({ code: 'internal', message: 'Failed to build output list.' })

    const raw = JSON.stringify(body)
    expect(raw).not.toContain('boom')
    expect(raw).not.toContain('/Users/secret')
    expect(raw).not.toContain('stack')
    expect(raw).not.toContain('at ')
    expect(logger.warn).toHaveBeenCalled()
  })

  it('抛非 Error 值（字符串）也走 500 internal', async () => {
    const { service } = makeErrorHarness('unexpected throw')
    const response = await service.handle(listRequest(`?sessionId=${SESSION_ID}`))
    expect(response.status).toBe(500)
    expect((await jsonOf<OutputsErrorPayload>(response)).error.code).toBe('internal')
  })
})
