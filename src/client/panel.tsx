/**
 * 「产出物」右栏 tab 的列表面板。
 *
 * 面板是 DSH 右栏 tab 的 body：外框、tab strip、背景都由宿主提供，这里只画
 * 面板头 / 类型筛选 / 搜索 / 四行制列表 / 空态 / 底注，并在行内提供两个原生动作。
 * 点击行本身不在这里预览，而是交给 `api.openPreview`（DSH 文档预览 tab 的职责）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { createAutoRefresher } from './polling.ts'
import type { Deliverable, DeliverableKind, OutputsPayload } from '../shared/types.ts'
import {
  AlertIcon,
  CloseIcon,
  FileTypeIcon,
  InfoIcon,
  OpenIcon,
  RefreshIcon,
  RevealIcon,
  SearchIcon,
  fileTypeFromExt,
} from './icons.tsx'

export interface OutputsApi {
  /** 拉取/刷新（refresh=true 时要求宿主重扫该会话）。 */
  load(options?: { refresh?: boolean; signal?: AbortSignal }): Promise<OutputsPayload>
  /** 会话是否正在运行（运行中面板每 ~3s 自动刷新一次）。 */
  isRunning(): boolean
  /** 点行：在右栏打开该文件的文档预览（相对路径）。 */
  openPreview(rel: string): void
  /** 行内动作：默认应用打开 / 在 Finder 中显示；返回是否成功。 */
  openNative(rel: string, action: 'open' | 'reveal'): Promise<boolean>
  /** 宿主有没有桌面能力；false 时整组隐藏原生动作。 */
  canOpenDesktop(): Promise<boolean>
}

export interface OutputsPanelProps {
  sessionId: string
  /** DSH i18n 函数（locale 由 index.tsx 注册，dict 见 locales.ts）。 */
  t: (key: string, vars?: Record<string, string | number>) => string
  api: OutputsApi
}

/** 顶部筛选维度：`all` + 宿主定义的四种交付类型。 */
type Filter = 'all' | DeliverableKind

const FILTERS: readonly Filter[] = ['all', 'doc', 'sheet', 'image', 'other']

type Translate = OutputsPanelProps['t']

type LoadStatus = 'loading' | 'ready' | 'error'

interface ToastState {
  key: string
  /** 递增序号：同一句提示连续出现时也能重放入场动画。 */
  seq: number
}

const AUTO_REFRESH_MS = 3000
const TOAST_MS = 2500

function pad2(value: number): string {
  return value < 10 ? '0' + value : String(value)
}

/** 文件大小：与原型的 fmtSize 一致。 */
function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return ''
  if (bytes < 1024) return bytes + ' B'
  const kb = bytes / 1024
  if (kb < 1000) return (kb < 10 ? kb.toFixed(1) : String(Math.round(kb))) + ' KB'
  return (kb / 1024).toFixed(1) + ' MB'
}

/** 列表行里的短时间：今天/昨天 + 时分，同年省年份。 */
function formatTime(ms: number, t: Translate): string {
  if (!ms) return ''
  const date = new Date(ms)
  if (Number.isNaN(date.getTime())) return ''
  const now = new Date()
  const time = pad2(date.getHours()) + ':' + pad2(date.getMinutes())
  if (date.toDateString() === now.toDateString()) return t('time.today', { time })
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return t('time.yesterday', { time })
  if (date.getFullYear() === now.getFullYear()) {
    return t('time.sameYear', { month: date.getMonth() + 1, day: date.getDate(), time })
  }
  return t('time.otherYear', { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() })
}

/** hover 时展示的完整时间（不参与 i18n，纯数字）。 */
function formatAbsolute(ms: number): string {
  if (!ms) return ''
  const date = new Date(ms)
  if (Number.isNaN(date.getTime())) return ''
  return (
    date.getFullYear() +
    '/' +
    (date.getMonth() + 1) +
    '/' +
    date.getDate() +
    ' ' +
    pad2(date.getHours()) +
    ':' +
    pad2(date.getMinutes())
  )
}

/** 类型文案：优先走 dict 的 `type.<ext>`，缺 key 时退回大写扩展名。 */
function formatTypeLabel(ext: string, t: Translate): string {
  const normalized = ext.toLowerCase()
  const key = 'type.' + normalized
  const translated = t(key)
  return translated === key ? normalized.toUpperCase() : translated
}

/** 来源文案：`source.<source>`，缺 key 时退回原始枚举值。 */
function formatSourceLabel(source: Deliverable['source'], t: Translate): string {
  const key = 'source.' + source
  const translated = t(key)
  return translated === key ? source : translated
}

function readRunning(api: OutputsApi): boolean {
  try {
    return api.isRunning()
  } catch {
    return false
  }
}

export function OutputsPanel(props: OutputsPanelProps): JSX.Element {
  const { sessionId, t, api } = props

  const [payload, setPayload] = useState<OutputsPayload | null>(null)
  const [status, setStatus] = useState<LoadStatus>('loading')
  const [running, setRunning] = useState(false)
  const [desktop, setDesktop] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [toast, setToast] = useState<ToastState | null>(null)

  const apiRef = useRef(api)
  const payloadRef = useRef<OutputsPayload | null>(null)
  const requestRef = useRef<AbortController | null>(null)
  const pendingRef = useRef(new Set<string>())
  const toastSeq = useRef(0)

  useEffect(() => {
    apiRef.current = api
  }, [api])

  const showToast = useCallback((key: string) => {
    toastSeq.current += 1
    setToast({ key, seq: toastSeq.current })
  }, [])

  /** 拉列表：silent 时不进 loading 态，也不把已有列表换成错误态。 */
  const load = useCallback(
    async (refresh = false, silent = false): Promise<void> => {
      requestRef.current?.abort()
      const controller = new AbortController()
      requestRef.current = controller
      if (!silent) setStatus('loading')
      try {
        const next = await apiRef.current.load(
          refresh ? { refresh: true, signal: controller.signal } : { signal: controller.signal },
        )
        if (controller.signal.aborted) return
        payloadRef.current = next
        setPayload(next)
        setStatus('ready')
      } catch {
        if (controller.signal.aborted) return
        // 后台自动刷新失败时保留已有列表；其余情况按有无数据分别给错误态 / 提示。
        if (silent && payloadRef.current !== null) return
        if (payloadRef.current === null) setStatus('error')
        else {
          // 手动刷新失败：必须退出 loading（否则 aria-busy 常驻），保留旧列表并提示。
          setStatus('ready')
          showToast('panel.loadError')
        }
      }
    },
    [showToast],
  )

  // 会话切换（或首次挂载）：清空旧数据重新加载，卸载/切会话时 abort 掉在途请求。
  useEffect(() => {
    payloadRef.current = null
    setPayload(null)
    setStatus('loading')
    setFilter('all')
    setQuery('')
    setToast(null)
    setRunning(readRunning(apiRef.current))
    void load(false)
    return () => {
      requestRef.current?.abort()
    }
  }, [sessionId, load])

  // 会话运行中每 ~3s 静默刷新一次；running 变 false 的那一拍也要补拉一次
  // （最后 ≤3s 内到达的 present/write 可能已进宿主缓存，不补拉就会停在旧列表）。
  // 全部是缓存态拉取（refresh=false）：宿主靠 session/event 增量更新，
  // 带 refresh=true 会强制重扫/回放全量日志，同一会话不该重复解压。
  useEffect(() => {
    const refresher = createAutoRefresher({
      intervalMs: AUTO_REFRESH_MS,
      isRunning: () => readRunning(apiRef.current),
      onTick: ({ running: active, shouldLoad }) => {
        setRunning(active)
        if (shouldLoad) void load(false, true)
      },
    })
    refresher.start()
    return () => {
      refresher.stop()
    }
  }, [sessionId, load])

  /** 探测桌面能力；失败不永久隐藏动作（focus/visibility 时会重试）。 */
  const desktopRequestRef = useRef<Promise<void> | null>(null)
  const refreshDesktop = useCallback((): Promise<void> => {
    if (desktopRequestRef.current) return desktopRequestRef.current
    const task = apiRef.current
      .canOpenDesktop()
      .then((available) => {
        setDesktop(Boolean(available))
      })
      .catch(() => {
        // 本次探测失败按无桌面处理（隐藏动作），但下次 focus/visibility 会再试。
      })
      .finally(() => {
        desktopRequestRef.current = null
      })
    desktopRequestRef.current = task
    return task
  }, [])

  // mount 时探测一次；候选动作在拿到结果前保持隐藏。
  useEffect(() => {
    void refreshDesktop()
  }, [refreshDesktop])

  // 切回标签页 / 窗口重新聚焦：补一次缓存态刷新（覆盖后台期间的变化）。
  useEffect(() => {
    const refreshWhenVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      setRunning(readRunning(apiRef.current))
      void load(false, true)
      void refreshDesktop()
    }
    document.addEventListener('visibilitychange', refreshWhenVisible)
    window.addEventListener('focus', refreshWhenVisible)
    return () => {
      document.removeEventListener('visibilitychange', refreshWhenVisible)
      window.removeEventListener('focus', refreshWhenVisible)
    }
  }, [load, refreshDesktop])


  useEffect(() => {
    if (toast === null) return
    const timer = window.setTimeout(() => setToast(null), TOAST_MS)
    return () => {
      window.clearTimeout(timer)
    }
  }, [toast])

  const sorted = useMemo<Deliverable[]>(() => {
    const items = payload?.deliverables ?? []
    return [...items].sort((a, b) => b.mtime - a.mtime)
  }, [payload])

  // 筛选计数按会话全量统计（不受搜索影响，和原型一致）。
  const counts = useMemo<Record<Filter, number>>(() => {
    const next: Record<Filter, number> = { all: sorted.length, doc: 0, sheet: 0, image: 0, other: 0 }
    for (const item of sorted) next[item.kind] += 1
    return next
  }, [sorted])

  // 只渲染有内容的类型：0 计数的类别点了也只会看到空列表，属于纯噪声。
  // 例外是当前选中的那一个——即便计数变成 0 也保留，否则选中态会凭空消失、无法切回。
  const shownFilters = useMemo<Filter[]>(
    () => FILTERS.filter((kind) => kind === 'all' || counts[kind] > 0 || kind === filter),
    [counts, filter],
  )

  const visible = useMemo<Deliverable[]>(() => {
    const keyword = query.trim().toLowerCase()
    return sorted.filter((item) => {
      if (filter !== 'all' && item.kind !== filter) return false
      if (keyword === '') return true
      return item.name.toLowerCase().includes(keyword) || item.rel.toLowerCase().includes(keyword)
    })
  }, [sorted, filter, query])

  const handleRefresh = useCallback(() => {
    void load(true)
  }, [load])

  const handleRetry = useCallback(() => {
    // 用户主动重试：允许宿主重扫这个会话。
    void load(true)
  }, [load])

  const clearFilters = useCallback(() => {
    setFilter('all')
    setQuery('')
  }, [])

  const openPreview = useCallback(
    (rel: string) => {
      try {
        apiRef.current.openPreview(rel)
      } catch {
        // 预览打开失败要告诉用户（不能静默），列表保持不动。
        showToast('action.previewError')
      }
    },
    [showToast],
  )

  const openNative = useCallback(
    async (rel: string, action: 'open' | 'reveal'): Promise<void> => {
      const key = action + ':' + rel
      if (pendingRef.current.has(key)) return
      pendingRef.current.add(key)
      let ok = false
      try {
        ok = await apiRef.current.openNative(rel, action)
      } catch {
        ok = false
      } finally {
        pendingRef.current.delete(key)
      }
      showToast(
        ok
          ? action === 'open'
            ? 'action.opened'
            : 'action.revealed'
          : action === 'open'
            ? 'action.openError'
            : 'action.revealError',
      )
    },
    [showToast],
  )

  const handleRowKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>, rel: string) => {
      // 行内动作按钮优先：键盘事件从按钮冒泡上来时不去开预览。
      if (event.target !== event.currentTarget) return
      if (event.key !== 'Enter' && event.key !== ' ') return
      event.preventDefault()
      openPreview(rel)
    },
    [openPreview],
  )

  const total = sorted.length
  const refreshing = status === 'loading'

  return (
    <div className="dsout-root">
      <div className="dsout-head">
        <span className="dsout-title">{t('panel.title')}</span>
        <span className="dsout-count-pill" title={t('panel.countTitle')}>
          {total}
        </span>
        {running ? (
          <span className="dsout-run-dot" role="img" aria-label={t('panel.running')} title={t('panel.running')} />
        ) : null}
        <span className="dsout-head-actions">
          <button
            type="button"
            className="dsout-iconbtn"
            title={t('panel.refresh')}
            aria-label={t('panel.refresh')}
            aria-busy={refreshing}
            disabled={refreshing && payload === null}
            onClick={handleRefresh}
          >
            <RefreshIcon size={15} />
          </button>
        </span>
      </div>

      <div className="dsout-filters">
        {shownFilters.map((kind) => (
          <button
            key={kind}
            type="button"
            className="dsout-chip"
            aria-pressed={filter === kind}
            onClick={() => setFilter(kind)}
          >
            {t('filter.' + kind)}
            <span className="dsout-chip-n">{counts[kind]}</span>
          </button>
        ))}
      </div>

      <div className="dsout-searchrow">
        <div className="dsout-searchbox">
          <SearchIcon size={13} />
          <input
            className="dsout-search"
            type="text"
            value={query}
            placeholder={t('panel.searchPlaceholder')}
            aria-label={t('panel.searchPlaceholder')}
            spellCheck={false}
            autoComplete="off"
            onChange={(event) => setQuery(event.target.value)}
          />
          {query !== '' ? (
            <button
              type="button"
              className="dsout-search-clear"
              title={t('panel.clearSearch')}
              aria-label={t('panel.clearSearch')}
              onClick={() => setQuery('')}
            >
              <CloseIcon size={11} />
            </button>
          ) : null}
        </div>
      </div>

      {payload === null ? (
        status === 'error' ? (
          <div className="dsout-state">
            <span className="dsout-state-icon-error">
              <AlertIcon size={28} />
            </span>
            <span className="dsout-state-title">{t('panel.loadError')}</span>
            <span className="dsout-state-desc">{t('panel.loadErrorHint')}</span>
            <button type="button" className="dsout-state-action" onClick={handleRetry}>
              {t('panel.retry')}
            </button>
          </div>
        ) : (
          <div className="dsout-state">
            <span className="dsout-spinner" aria-hidden="true" />
            <span className="dsout-state-title" role="status">
              {t('panel.loading')}
            </span>
          </div>
        )
      ) : total === 0 ? (
        <div className="dsout-state">
          <span className="dsout-state-icon">
            <FileTypeIcon type="other" size={28} />
          </span>
          <span className="dsout-state-title">{t('panel.emptyTitle')}</span>
          <span className="dsout-state-desc">{t('panel.emptyDesc')}</span>
          <button type="button" className="dsout-state-action" onClick={handleRefresh}>
            {t('panel.refresh')}
          </button>
        </div>
      ) : visible.length === 0 ? (
        <div className="dsout-state">
          <span className="dsout-state-icon">
            <SearchIcon size={28} />
          </span>
          <span className="dsout-state-title">
            {filter === 'all' ? t('panel.noMatches') : t('panel.noKindMatches', { kind: t('filter.' + filter) })}
          </span>
          <span className="dsout-state-desc">
            {filter === 'all' ? t('panel.noMatchesDesc') : t('panel.noKindMatchesDesc')}
          </span>
          <button type="button" className="dsout-state-action" onClick={clearFilters}>
            {t('panel.clearFilters')}
          </button>
        </div>
      ) : (
        <div className="dsout-list">
          {visible.map((item) => {
            const sourceText = formatSourceLabel(item.source, t)
            return (
              <div
                key={item.path}
                className="dsout-row"
                role="button"
                tabIndex={0}
                onClick={() => openPreview(item.rel)}
                onKeyDown={(event) => handleRowKeyDown(event, item.rel)}
              >
                <span className="dsout-row-icon">
                  <FileTypeIcon type={fileTypeFromExt(item.ext)} size={16} />
                </span>
                <span className="dsout-row-main">
                  <span className="dsout-row-name" title={item.name}>
                    {item.name}
                  </span>
                  <span className="dsout-row-path" title={item.rel}>
                    {item.rel}
                  </span>
                  {item.description ? (
                    <span className="dsout-row-desc" title={item.description}>
                      {item.description}
                    </span>
                  ) : null}
                  <span className="dsout-row-meta">
                    <span
                      className={'dsout-badge' + (item.source === 'presented' ? ' dsout-badge-explicit' : '')}
                      title={sourceText}
                    >
                      {sourceText}
                    </span>
                    {item.isSource ? (
                      <span className="dsout-badge dsout-badge-source" title={t('badge.source')}>
                        {t('badge.source')}
                      </span>
                    ) : null}
                    <span className="dsout-sep">·</span>
                    <span className="dsout-meta-type">
                      {formatTypeLabel(item.ext, t)}
                      <span className="dsout-sep">·</span>
                    </span>
                    <span>{formatSize(item.size)}</span>
                    <span className="dsout-sep">·</span>
                    <span className="dsout-meta-time" title={formatAbsolute(item.mtime)}>
                      {formatTime(item.mtime, t)}
                    </span>
                  </span>
                </span>
                {desktop ? (
                  <span className="dsout-row-actions">
                    <button
                      type="button"
                      className="dsout-mini"
                      title={t('action.open')}
                      aria-label={t('action.open')}
                      onClick={(event) => {
                        event.stopPropagation()
                        void openNative(item.rel, 'open')
                      }}
                    >
                      <OpenIcon size={14} />
                    </button>
                    <button
                      type="button"
                      className="dsout-mini"
                      title={t('action.reveal')}
                      aria-label={t('action.reveal')}
                      onClick={(event) => {
                        event.stopPropagation()
                        void openNative(item.rel, 'reveal')
                      }}
                    >
                      <RevealIcon size={14} />
                    </button>
                  </span>
                ) : null}
              </div>
            )
          })}
        </div>
      )}

      <div className="dsout-foot">
        <InfoIcon size={11} />
        <span className="dsout-foot-text" title={t('panel.footer')}>
          {t('panel.footer')}
        </span>
        <span className="dsout-foot-count" title={t('panel.footerCount', { count: payload?.total ?? total })}>
          {payload?.truncated
            ? t('panel.truncatedHint', { shown: total, total: payload.total })
            : t('panel.footerCount', { count: total })}
        </span>
      </div>

      {toast !== null ? (
        <div key={toast.seq} className="dsout-toast" role="status">
          {t(toast.key)}
        </div>
      ) : null}
    </div>
  )
}
