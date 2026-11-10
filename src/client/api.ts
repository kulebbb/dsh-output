/**
 * 客户端半的数据与系统动作桥：
 *   - 拉取 `GET /api/outputs.list`（宿主半折叠好的列表）；
 *   - 拼文档预览资源地址 `dsh-resource://file/session/<id>/<path>`；
 *   - 调 `ctx.remote.session.openWorkspacePath` / `canOpenWorkspacePath`（桌面能力探测）。
 *
 * 资源地址与打开动作的写法照抄 DSH 内置实现：
 *   - 地址：`$B/dsh-client-ui-deliverables/lib/client.js` 的 `sessionFileAddress` / `fileAddressFor`
 *   - 打开：`$B/dsh-client-ui-open-in-app/lib/client.js` 的 `OpenInAppPathController`
 */
import type { OutputsPayload } from '../shared/types.ts'
import { OUTPUTS_ROUTE_RELATIVE } from '../shared/types.ts'
import type { OutputsApi } from './panel.tsx'
import type { ClientContext } from './dsh.ts'

const FILE_ADDRESS_PREFIX = 'dsh-resource://file/'
/** 客户端请求超时：超过这个时间给可重试错误，而不是一直转圈。 */
export const FETCH_TIMEOUT_MS = 30_000

function encodeSegment(segment: string): string {
  // 保留盘符冒号（与内置实现一致）
  return encodeURIComponent(segment).replace(/%3A/gi, ':')
}

function isAbsoluteWorkspacePath(path: string): boolean {
  return path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path)
}

/** `dsh-resource://file/session/<sessionId>/<相对 path>` */
export function sessionFileAddress(sessionId: string, path: string): string {
  const normalized = path.replace(/\\/g, '/').replace(/^(?:\.\/)+/, '')
  const encodedPath = normalized.split('/').map(encodeSegment).join('/')
  return `${FILE_ADDRESS_PREFIX}session/${encodeSegment(sessionId)}/${encodedPath}`
}

/** 绝对路径先按会话 cwd 压成相对路径，保证同一文件只有一个 contentId。 */
export function fileAddressFor(sessionId: string, cwd: string | null, path: string): string {
  const normalized = path.replace(/\\/g, '/')
  if (!isAbsoluteWorkspacePath(normalized)) return sessionFileAddress(sessionId, normalized)
  const root = (cwd ?? '').replace(/\\/g, '/').replace(/\/+$/, '')
  if (root !== '' && normalized === root) return sessionFileAddress(sessionId, '')
  if (root !== '' && normalized.startsWith(`${root}/`)) return sessionFileAddress(sessionId, normalized.slice(root.length + 1))
  return sessionFileAddress(sessionId, normalized)
}

export class OutputsRequestError extends Error {
  readonly code: string
  readonly status: number

  constructor(message: string, code: string, status: number) {
    super(message)
    this.name = 'OutputsRequestError'
    this.code = code
    this.status = status
  }
}

interface ErrorBody {
  error?: { code?: string; message?: string }
}

/**
 * 为一个会话创建面板用的 api。闭包持有最近一次 payload 的 cwd，用来把相对路径还原成绝对路径。
 */
export function createOutputsApi(ctx: ClientContext, sessionId: string): OutputsApi {
  let lastCwd: string | null = null

  const absoluteOf = (relOrAbsolute: string): string => {
    if (isAbsoluteWorkspacePath(relOrAbsolute)) return relOrAbsolute
    const root = (lastCwd ?? '').replace(/[/\\]+$/, '')
    if (!root) return relOrAbsolute
    return `${root}/${relOrAbsolute.replace(/^[/\\]+/, '')}`
  }

  return {
    async load(options) {
      const query = `sessionId=${encodeURIComponent(sessionId)}${options?.refresh ? '&refresh=1' : ''}`
      const timeout = new AbortController()
      const timer = setTimeout(() => timeout.abort(), FETCH_TIMEOUT_MS)
      const signal = options?.signal ? AbortSignal.any([options.signal, timeout.signal]) : timeout.signal
      let response: Response
      try {
        // 相对路径（不带前导 /）：DSH Web 可能挂在子路径 / 反向代理后面，绝对路径会绕过它。
        response = await fetch(`${OUTPUTS_ROUTE_RELATIVE}?${query}`, {
          signal,
          credentials: 'same-origin',
          headers: { accept: 'application/json' },
        })
      } catch (error) {
        if (options?.signal?.aborted) throw error
        if (timeout.signal.aborted) {
          throw new OutputsRequestError('Request timed out.', 'timeout', 0)
        }
        throw error
      } finally {
        clearTimeout(timer)
      }
      const body = (await response.json().catch(() => null)) as OutputsPayload | ErrorBody | null
      if (!response.ok) {
        const error = (body as ErrorBody | null)?.error
        throw new OutputsRequestError(
          error?.message ?? `outputs request failed (${response.status})`,
          error?.code ?? 'internal',
          response.status,
        )
      }
      const payload = body as OutputsPayload
      lastCwd = payload.cwd
      return payload
    },

    isRunning() {
      const row = ctx.sessions.list.getSnapshot().byId[sessionId]
      return row?.running === true
    },

    openPreview(rel) {
      const address = fileAddressFor(sessionId, lastCwd, rel)
      ctx.sidebarRight?.openResource(address)
    },

    async openNative(rel, action) {
      const session = ctx.remote?.session
      if (!session) return false
      const path = absoluteOf(rel)
      try {
        const result = await session.openWorkspacePath(action === 'reveal' ? { path, action } : { path })
        // 浏览器侧拿到的是 typert RemoteResult（{ ok, value }），不是 .d.ts 里声明的裸值
        return result?.ok === true
      } catch {
        return false
      }
    },

    async canOpenDesktop() {
      const session = ctx.remote?.session
      if (!session) return false
      try {
        const result = await session.canOpenWorkspacePath()
        return result?.ok === true && result.value === true
      } catch {
        return false
      }
    },
  }
}
