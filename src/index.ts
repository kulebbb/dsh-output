/**
 * 宿主（node 半）入口。
 *
 * 注册一条认证路由 `GET /api/outputs.list?sessionId=...`，返回该会话折叠后的交付物列表；
 * 同时订阅 `session/event`，让运行中的会话无需重复读日志就能增量更新。
 *
 * 插件只依赖 DSH 宿主已有的两个服务：
 *   - `connection`：认证路由（与内置 deliverables 插件同一套写法）；
 *   - `sessionQuery`：`readSession()` 一次读出会话全量日志（冷会话不激活 Agent）。
 */
import { stat } from 'node:fs/promises'
import { OutputsService, type SessionSnapshotLike, type StatResult } from './host/service.ts'
import { OUTPUTS_ROUTE } from './shared/types.ts'
import type { SessionEventLike } from './shared/rules.ts'

export const name = '@kulebbb/dsh-output'
export const inject = ['connection', 'sessionQuery']

interface ConnectionRoute {
  path: string
  methods: string[]
  requestBody: 'buffered'
  fetch: (request: Request) => Promise<Response>
}

interface HostContext {
  connection: {
    fetch: {
      register(route: ConnectionRoute): () => void
    }
  }
  sessionQuery: {
    readSession(sessionId: string): Promise<SessionSnapshotLike>
  }
  logger?: {
    warn?(...args: unknown[]): void
    debug?(...args: unknown[]): void
  }
  effect(factory: () => (() => void) | void, label?: string): () => void
  on(
    event: 'session/event',
    listener: (session: { id?: unknown }, event: SessionEventLike) => void,
  ): () => void
}

/** 只关心「是不是普通文件 / 大小 / mtime」，其余一律当作不存在。 */
async function statFile(path: string): Promise<StatResult | null> {
  try {
    const info = await stat(path)
    if (!info.isFile()) return null
    return { isFile: true, size: info.size, mtimeMs: info.mtimeMs }
  } catch {
    return null
  }
}

export function apply(ctx: HostContext): void {
  const service = new OutputsService({
    readSession: (sessionId) => ctx.sessionQuery.readSession(sessionId),
    statPath: statFile,
    logger: ctx.logger,
  })

  ctx.effect(
    () =>
      ctx.connection.fetch.register({
        path: OUTPUTS_ROUTE,
        methods: ['GET'],
        requestBody: 'buffered',
        fetch: (request) => service.handle(request),
      }),
    'dsh-output: outputs route',
  )

  ctx.effect(
    () =>
      ctx.on('session/event', (session, event) => {
        const sessionId = session?.id === undefined ? '' : String(session.id)
        if (sessionId) service.ingest(sessionId, event)
      }),
    'dsh-output: live session events',
  )
}
