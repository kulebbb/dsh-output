/**
 * 交付物折叠规则（宿主半）。
 *
 * 阶段 1 定稿规则：
 *   来源优先级：deliverables/presented > write/edit > bash > 每轮收尾回复
 *   过滤：扩展名白名单 + 噪声目录 + 项目元文件 + 隐藏路径 + 临时目录 + 必须在会话 cwd 内 + 磁盘存在
 *   去重：同一绝对路径只留一条，来源取最高优先级，时间取最后一次
 *
 * 阶段 2 拍板调整（老板确认）：
 *   - `deliverables/presented` 显式声明的文件，即使是 .ts/.js/.json 等源码类扩展名也展示，
 *     并标记 `isSource: true`（UI 标「源码」徽标）；
 *   - present 文件同时豁免「临时目录」和「必须在 cwd 内」两条（显式交付最权威）。
 *   其余规则不变。
 */
import { basename, isAbsolute, join, normalize, relative } from 'node:path'
import {
  DELIVERABLE_EXTS,
  KIND_BY_EXT,
  SOURCE_EXTS,
  type DeliverableCandidate,
  type DeliverableKind,
  type DeliverableSource,
} from './types.ts'

/** 会话事件的最小结构（v0/v3/v4 日志与 session/event 推送共用）。 */
export interface SessionEventLike {
  type?: string
  seq?: number
  time?: number
  // 事件 data 的形状随 type 变化，调用点各自收窄。
  data?: any
}

const DELIVERABLE_EXT_SET = new Set(DELIVERABLE_EXTS)
const SOURCE_EXT_SET = new Set(SOURCE_EXTS)

/** 排除目录：依赖 / 版本库 / 构建产物 / 隐藏工具目录 / agent 工作流过程目录。 */
const NOISE_DIR =
  /(^|\/)(node_modules|\.git|\.worktrees|dist|build|out|coverage|\.next|\.nuxt|\.venv|venv|__pycache__|\.cache|\.idea|\.vscode|\.claude|\.agents|superpowers)(\/|$)/

/** 项目元文件：改这些不算交付给用户的成果。 */
const META_NAMES = new Set([
  'agents.md',
  'readme.md',
  'claude.md',
  'license',
  'license.md',
  'changelog.md',
  'contributing.md',
  'intend.md',
  'package.json',
  'requirements.txt',
  '.gitignore',
])

const TEMP_DIRS = ['/tmp', '/private/tmp', '/var/folders']

const SOURCE_RANK: Record<DeliverableSource, number> = {
  presented: 3,
  write: 2,
  edit: 2,
  bash: 1,
  reply: 0,
}

/** 从命令文本里抓绝对路径（含 `~/`），与阶段 1 脚本一致。 */
const BASH_PATH_RE =
  /(?:\/|~\/)[^\s"'`;|&<>()]+?\.(?:html|htm|pdf|docx|xlsx|pptx|csv|md|txt|zip|png|jpg|jpeg|webp|gif|svg|mp4|mov|mp3|wav|ts|tsx|js|jsx|mjs|cjs|json|yaml|yml|toml|sh|py|go|rs|java|c|cpp|h|hpp|css|scss|sql|rb|php|swift|kt)/gi

/** 收尾回复里的行内代码路径 / 绝对路径。 */
const REPLY_PATH_RE =
  /`([^`\n]+?\.[A-Za-z0-9]+)`|((?:\/|~\/)[^\s)'"`，,；;]+?\.[A-Za-z0-9]+)/g

export interface ClassifyOptions {
  cwd: string
  source: DeliverableSource
  time: number
  turn?: number
  description?: string
}

export type ClassifyResult =
  | { ok: true; candidate: DeliverableCandidate }
  | { ok: false; reason: string }

function hasHiddenSegment(path: string): boolean {
  return path
    .split('/')
    .some((segment) => segment.length > 1 && segment.startsWith('.'))
}

function isUnderTempDir(path: string): boolean {
  return TEMP_DIRS.some((dir) => path === dir || path.startsWith(dir + '/'))
}

/** 把事件里的路径写法（相对/绝对/`~/`/file URI/带引号）解析成绝对路径；无效返回 null。 */
export function resolveCandidatePath(raw: unknown, cwd: string): string | null {
  if (typeof raw !== 'string') return null
  let path = raw.trim()
  if (!path) return null
  path = path.replace(/^[("'`]+|[)"'`]+$/g, '')
  if (path.startsWith('file://')) {
    try {
      path = decodeURIComponent(path.slice(7))
    } catch {
      return null
    }
  }
  if (path === '~' || path.startsWith('~/')) {
    const home = process.env.HOME
    if (!home) return null
    path = join(home, path.slice(1))
  }
  if (!isAbsolute(path)) {
    if (!cwd) return null
    path = join(cwd, path)
  }
  path = normalize(path)
  if (/[*?{}]/.test(path)) return null
  return path
}

/**
 * 判定一条路径是否属于「交付给用户的文件」。
 * 纯函数、不碰磁盘（磁盘校验在路由层做）。
 */
export function classifyPath(raw: unknown, options: ClassifyOptions): ClassifyResult {
  const { cwd, source, time, turn, description } = options
  const presented = source === 'presented'
  const absolute = resolveCandidatePath(raw, cwd)
  if (!absolute) return { ok: false, reason: 'invalid-path' }

  const ext = /\.([A-Za-z0-9]+)$/.exec(absolute)?.[1]?.toLowerCase()
  if (!ext) return { ok: false, reason: 'no-extension' }

  const rel = cwd ? relative(cwd, absolute) : absolute
  const insideCwd = !!cwd && rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
  const relPath = insideCwd ? rel : absolute

  if (hasHiddenSegment(relPath)) return { ok: false, reason: 'hidden-path' }
  if (NOISE_DIR.test(absolute)) return { ok: false, reason: 'noise-dir' }
  if (META_NAMES.has(basename(absolute).toLowerCase())) return { ok: false, reason: 'project-meta-file' }
  if (!presented && isUnderTempDir(absolute)) return { ok: false, reason: 'temp-dir' }
  if (!presented && !insideCwd) return { ok: false, reason: 'outside-session-cwd' }

  let isSource = false
  let kind: DeliverableKind
  if (DELIVERABLE_EXT_SET.has(ext)) {
    kind = KIND_BY_EXT[ext] ?? 'other'
  } else if (presented && SOURCE_EXT_SET.has(ext)) {
    // present 显式交付的源码类文件：展示并标「源码」
    kind = 'other'
    isSource = true
  } else {
    return { ok: false, reason: 'ext-not-deliverable' }
  }

  return {
    ok: true,
    candidate: {
      path: absolute,
      rel: insideCwd ? rel : absolute,
      name: basename(absolute),
      ext,
      kind,
      source,
      time,
      ...(turn === undefined ? {} : { turn }),
      ...(description ? { description } : {}),
      ...(isSource ? { isSource } : {}),
    },
  }
}

/** 从 bash/run_code 命令里抓候选路径。 */
export function extractBashPaths(command: unknown): string[] {
  if (typeof command !== 'string' || !command) return []
  const found: string[] = []
  BASH_PATH_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = BASH_PATH_RE.exec(command))) found.push(match[0])
  return found
}

/** 从收尾回复文本里抓候选路径。 */
export function extractReplyPaths(text: unknown): string[] {
  if (typeof text !== 'string' || !text) return []
  const found: string[] = []
  REPLY_PATH_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = REPLY_PATH_RE.exec(text))) found.push(match[1] ?? match[2] ?? '')
  return found.filter(Boolean)
}

function textOfAssistantMessage(data: any): string {
  const content = data?.message?.content
  if (!Array.isArray(content)) return ''
  return content
    .filter((part: any) => part?.type === 'text' && typeof part.text === 'string')
    .map((part: any) => part.text as string)
    .join('\n')
    .trim()
}

function parseToolArguments(data: any): any {
  const raw = data?.arguments
  if (typeof raw !== 'string') return raw ?? {}
  try {
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

function pathOfToolArguments(data: any): unknown {
  const args = parseToolArguments(data)
  return args?.file_path ?? args?.path ?? args?.filePath
}

/**
 * 增量折叠器：喂事件、随时快照。宿主半对同一会话只维护一个实例，
 * 冷启动时全量回放，运行中由 `session/event` 逐条追加。
 */
export class DeliverableFolder {
  private readonly cwd: string
  private readonly merged = new Map<string, DeliverableCandidate>()
  private turn = 0
  private turnText: { text: string; time: number; turn: number } | null = null

  constructor(options: { cwd: string }) {
    this.cwd = options.cwd
  }

  apply(event: SessionEventLike): void {
    if (!event || typeof event.type !== 'string') return
    const data = event.data ?? {}
    const time = typeof event.time === 'number' ? event.time : Date.now()

    switch (event.type) {
      case 'turn/start': {
        const next = typeof data.turn === 'number' ? data.turn : this.turn + 1
        this.turn = next
        this.turnText = null
        return
      }
      case 'tool/call': {
        const toolName = typeof data.name === 'string' ? data.name : ''
        const turn = typeof data.turn === 'number' ? data.turn : this.turn
        if (toolName === 'write' || toolName === 'edit' || toolName === 'str_replace_editor') {
          const source: DeliverableSource = toolName === 'edit' ? 'edit' : 'write'
          this.add(classifyPath(pathOfToolArguments(data), { cwd: this.cwd, source, time, turn }))
          return
        }
        if (toolName === 'bash' || toolName === 'run_code') {
          const args = parseToolArguments(data)
          const command = args?.command ?? args?.code ?? ''
          for (const raw of extractBashPaths(command)) {
            this.add(classifyPath(raw, { cwd: this.cwd, source: 'bash', time, turn }))
          }
        }
        return
      }
      case 'assistant/message': {
        const text = textOfAssistantMessage(data)
        if (!text) return
        this.turnText = { text, time, turn: typeof data.turn === 'number' ? data.turn : this.turn }
        return
      }
      case 'turn/end': {
        this.flushTurnText()
        return
      }
      case 'deliverables/presented': {
        const files = Array.isArray(data.files) ? data.files : []
        const turn = typeof data.turn === 'number' ? data.turn : undefined
        for (const file of files) {
          const path = file?.path ?? file?.filePath ?? file?.file
          const description = typeof file?.description === 'string' ? file.description : undefined
          this.add(classifyPath(path, { cwd: this.cwd, source: 'presented', time, turn, description }))
        }
        return
      }
      default:
        return
    }
  }

  /**
   * 收尾回复提取只在 turn/end 时做；但日志可能在最后一轮没有 turn/end（中断/旧格式），
   * 冷启动回放结束后调用一次 `finalize()` 补上最后一条回复。
   */
  finalize(): void {
    this.flushTurnText()
  }

  snapshot(): DeliverableCandidate[] {
    return [...this.merged.values()].sort((a, b) => b.time - a.time)
  }

  get lastEventTime(): number {
    let latest = 0
    for (const candidate of this.merged.values()) {
      if (candidate.time > latest) latest = candidate.time
    }
    return latest
  }

  private flushTurnText(): void {
    if (!this.turnText) return
    const { text, time, turn } = this.turnText
    this.turnText = null
    for (const raw of extractReplyPaths(text)) {
      this.add(classifyPath(raw, { cwd: this.cwd, source: 'reply', time, turn }))
    }
  }

  private add(result: ClassifyResult): void {
    if (!result.ok) return
    const candidate = result.candidate
    const previous = this.merged.get(candidate.path)
    if (!previous) {
      this.merged.set(candidate.path, candidate)
      return
    }
    if (SOURCE_RANK[candidate.source] > SOURCE_RANK[previous.source]) {
      previous.source = candidate.source
    }
    if (candidate.description && (previous.source === 'presented' || candidate.source === 'presented')) {
      previous.description = candidate.description
    }
    if (candidate.isSource) previous.isSource = true
    if (candidate.time >= previous.time) {
      previous.time = candidate.time
      if (candidate.turn !== undefined) previous.turn = candidate.turn
    }
  }
}

/** 一次性回放（冷会话 / 测试用）。 */
export function foldEvents(events: readonly SessionEventLike[], options: { cwd: string }): DeliverableCandidate[] {
  const folder = new DeliverableFolder(options)
  for (const event of events) folder.apply(event)
  folder.finalize()
  return folder.snapshot()
}
