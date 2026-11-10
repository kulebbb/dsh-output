/**
 * 客户端（浏览器半）入口：注册右栏「产出物」tab 的类型、正文、文案与快捷键。
 *
 * 接线完全照 dsh-git-tree：
 *   - `ctx.sidebarRightTabs.register(...)` 注册 tab 类型 + 右栏 guide 引导卡；
 *   - `ctx.slots.inject("sidebar.right.pane.tab", ...)` 把正文挂到 keyed slot（key = tab id）；
 *   - `ctx.inject(["shortcuts"], ...)` 可选注册 ⌘⇧O（宿主没有 shortcuts 服务时不注册，不报错）。
 */
import type { ClientContext, ShortcutsService, Translate } from './dsh.ts'
import { createOutputsApi } from './api.ts'
import { OutputsPanel } from './panel.tsx'
import { NS, en, zh } from './locales.ts'
import { PANEL_CSS } from './styles.ts'

/** tab 类型 id，同时是右栏持久化 tab 记录与 slot key 的身份。 */
export const TAB_ID = '@kulebbb/dsh-output'
/** tab 类型判别符，`sidebarRight.openTab("outputs")` 用。 */
export const TAB_KIND = 'outputs'
/** 快捷键命令 id（guide 卡片的 commandId 也指向它）。 */
export const COMMAND_ID = 'outputs.open'

export const SHORTCUT_DEFAULTS = {
  'desktop:macos': { code: 'KeyO', modifiers: ['meta', 'shift'] },
  'desktop:windows': { code: 'KeyO', modifiers: ['control', 'shift'] },
  'desktop:linux': { code: 'KeyO', modifiers: ['control', 'shift'] },
}

export const inject = [
  'slots',
  'sessions',
  'locale',
  'sidebarRight',
  'sidebarRightTabs',
  'remote',
  'remote.session',
]

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-output: dictionaries')

  if (typeof document !== 'undefined') {
    const style = document.createElement('style')
    style.setAttribute('data-plugin', 'dsh-output')
    style.setAttribute('data-plugin-css', 'dsh-output/panel.css')
    style.textContent = PANEL_CSS
    document.head.append(style)
    ctx.effect(() => () => style.remove(), 'dsh-output: styles')
  }

  const sidebarRight = ctx.sidebarRight
  const sidebarRightTabs = ctx.sidebarRightTabs
  // 没有右栏服务就没有入口：宁可不出现，也不要死按钮。
  if (!sidebarRight || !sidebarRightTabs) return

  const t = ctx.locale.bind(NS)

  ctx.effect(
    () =>
      sidebarRightTabs.register({
        id: TAB_ID,
        kind: TAB_KIND,
        priority: 'extension',
        title: () => t('panel.title'),
        guide: [
          {
            id: TAB_ID,
            order: 40,
            title: () => t('panel.title'),
            description: () => t('panel.guideDescription'),
            commandId: COMMAND_ID,
          },
        ],
      }),
    'dsh-output: tab type',
  )

  ctx.effect(
    () =>
      ctx.slots.inject('sidebar.right.pane.tab', () =>
        ctx.slots.register(
          {
            name: 'sidebar.right.pane.tab',
            key: TAB_ID,
            locale: NS,
            inject: (sessionId: string) => ({
              sessionId: String(sessionId),
              api: createOutputsApi(ctx, String(sessionId)),
            }),
          },
          (props: any) => (
            <OutputsPanel t={props.t as Translate} sessionId={String(props.sessionId)} api={props.api} />
          ),
        ),
      ),
    'dsh-output: tab body',
  )

  // 可选快捷键：与 dsh-git-tree 一样用 scoped inject，宿主没有 shortcuts 服务时静默跳过。
  if (typeof sidebarRight.openTabFromTarget === 'function' && typeof ctx.inject === 'function') {
    ctx.inject(['shortcuts'], (scope) => {
      const shortcuts = (scope as unknown as { shortcuts?: ShortcutsService }).shortcuts
      if (!shortcuts) return
      scope.effect(() => {
        try {
          return shortcuts.register({
            id: COMMAND_ID,
            label: () => t('shortcut.open'),
            aliases: ['outputs', 'deliverables', '产出物'],
            defaults: SHORTCUT_DEFAULTS,
            regions: ['page', 'editable'],
            modals: [],
            resolve: ({ target: element }: { target: unknown }) => {
              const target = sidebarRight.commandTarget?.(element)
              if (target === undefined) return { status: 'blocked', reason: t('shortcut.noSession') }
              return {
                status: 'handled',
                run: () => {
                  sidebarRight.openTabFromTarget?.(TAB_KIND, target)
                },
              }
            },
          })
        } catch (error) {
          ctx.logger?.warn?.('[dsh-output] shortcut registration failed:', error)
          return undefined
        }
      }, 'dsh-output: shortcut')
    })
  }
}
