/**
 * 客户端半用到的 DSH 服务的最小结构声明。
 *
 * 只声明我们真正调用的方法（而不是把 DSH 的类型包作为依赖拉进来），
 * 每个方法都标了来源包，方便核对版本升级：
 *   - locale / slots / sessions：client 基础服务；
 *   - sidebarRight / sidebarRightTabs：`@deepseek-ai/dsh-client-ui-sidebar-right`；
 *   - remote.session：`@deepseek-ai/dsh-api-session-controller`（经 typert Remote 包装）。
 */

export type Translate = (key: string, vars?: Record<string, string | number>) => string

export interface LocaleService {
  register(namespace: string, dictionaries: { zh: Record<string, string>; en: Record<string, string> }): () => void
  bind(namespace: string): Translate
}

export interface SessionListRow {
  cwd?: string
  displayTitle?: string
  running?: boolean
  retainedBy?: Record<string, number>
}

export interface SessionListSnapshot {
  byId: Record<string, SessionListRow | undefined>
}

export interface SessionsService {
  list: {
    getSnapshot(): SessionListSnapshot
  }
}

export interface SlotsRegisterDefinition {
  name: string
  key?: string
  id?: string
  order?: number
  locale?: string
  label?: () => string
  inject?: (sessionId: string) => Record<string, unknown>
}

export interface SlotsService {
  inject(name: string, factory: () => unknown): (() => void) | void
  register(definition: SlotsRegisterDefinition, component: (props: any) => unknown): unknown
}

export interface GuideEntry {
  id: string
  order?: number
  title: () => string
  description?: () => string
  commandId?: string
}

export interface TabDefinition {
  id: string
  kind: string
  priority?: 'extension' | 'builtin' | 'fallback'
  title: (address: string) => string
  guide?: readonly GuideEntry[]
}

export interface SidebarRightTabsService {
  register(definition: TabDefinition): () => void
}

export interface SidebarRightService {
  openResource(address: string, options?: Record<string, unknown>): void
  openTab?(kind: string, options?: Record<string, unknown>): void
  openTabFromTarget?(kind: string, target: unknown): void
  commandTarget?(element: unknown): unknown
}

/** typert Remote 的返回包装：`{ok:true,value}` / `{ok:false,error}`。 */
export interface RemoteResult<T> {
  ok: boolean
  value?: T
  error?: unknown
}

export interface RemoteSessionService {
  openWorkspacePath(request: { path: string; action?: 'reveal'; application?: string }): Promise<RemoteResult<unknown>>
  canOpenWorkspacePath(): Promise<RemoteResult<boolean>>
}

export interface RemoteService {
  session: RemoteSessionService
}

export interface ShortcutDefinition {
  id: string
  label: () => string
  aliases?: string[]
  defaults: Record<string, { code: string; modifiers: string[] }>
  regions: string[]
  modals: string[]
  resolve: (context: { target: unknown }) => unknown
}

export interface ShortcutsService {
  register(definition: ShortcutDefinition): () => void
}

export interface ClientContext {
  locale: LocaleService
  slots: SlotsService
  sessions: SessionsService
  sidebarRight?: SidebarRightService
  sidebarRightTabs?: SidebarRightTabsService
  remote?: RemoteService
  logger?: { warn?(...args: unknown[]): void; debug?(...args: unknown[]): void }
  effect(factory: () => (() => void) | void, label?: string): () => void
  inject(services: string[], callback: (scope: ClientContext) => void): void
}
