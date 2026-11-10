/**
 * dsh-output 的跨半边契约：宿主折叠出的交付物、客户端面板消费的载荷。
 * 这里只放类型与纯常量，不 import 任何 node 内置模块，客户端 bundle 也能安全引用。
 */

/** 交付物来源（优先级 presented > write/edit > bash > reply）。 */
export type DeliverableSource = 'presented' | 'write' | 'edit' | 'bash' | 'reply'

/** 面板顶部的类型筛选维度。 */
export type DeliverableKind = 'doc' | 'sheet' | 'image' | 'other'

/** 折叠阶段产出的候选（还没校验磁盘、还没有大小/mtime）。 */
export interface DeliverableCandidate {
  /** 绝对路径（present 的相对路径已按会话 cwd 绝对化）。 */
  path: string
  /** 相对会话 cwd 的路径；文件在 cwd 之外时等于绝对路径。 */
  rel: string
  name: string
  /** 小写扩展名，不含点。 */
  ext: string
  kind: DeliverableKind
  source: DeliverableSource
  /** present 事件里的 description，仅 presented 来源有。 */
  description?: string
  /** 最后一次命中的事件时间（毫秒）。 */
  time: number
  /** 命中的轮次（能取到的话）。 */
  turn?: number
  /** present 显式交付、但扩展名不属于交付白名单的源码类文件。 */
  isSource?: boolean
}

/** 路由返回给客户端的交付物（已 stat 磁盘）。 */
export interface Deliverable extends DeliverableCandidate {
  /** 磁盘上是否存在且是普通文件；不存在的条目不会出现在列表里。 */
  exists: true
  size: number
  /** 文件修改时间（毫秒）。 */
  mtime: number
}

/** `GET /api/outputs.list?sessionId=...` 的成功响应。 */
export interface OutputsPayload {
  sessionId: string
  /** 会话工作目录；宿主读不到时为 null。 */
  cwd: string | null
  /** 生成时间（ISO 字符串）。 */
  generatedAt: string
  /** 交付物总数（截断前）。 */
  total: number
  /** 超过上限被截断时为 true（默认上限 2000 条）。 */
  truncated?: boolean
  /** 按 mtime 倒序。 */
  deliverables: Deliverable[]
}

/** 错误响应体（HTTP 状态码同时表达类别）。 */
export interface OutputsErrorPayload {
  error: {
    code: 'invalid-request' | 'session-not-found' | 'session-unreadable' | 'internal'
    message: string
  }
}

/** 宿主路由注册用的绝对路径。 */
export const OUTPUTS_ROUTE = '/api/outputs.list'
/** 客户端 fetch 用的相对路径：不写死前导 /，兼容子路径挂载 / 反向代理。 */
export const OUTPUTS_ROUTE_RELATIVE = OUTPUTS_ROUTE.replace(/^\/+/, '')

/** 交付类型白名单（20 项，与阶段 1 定稿一致）。 */
export const DELIVERABLE_EXTS: readonly string[] = [
  'html',
  'htm',
  'pdf',
  'docx',
  'xlsx',
  'pptx',
  'csv',
  'md',
  'txt',
  'zip',
  'png',
  'jpg',
  'jpeg',
  'webp',
  'gif',
  'svg',
  'mp4',
  'mov',
  'mp3',
  'wav',
]

/** 源码类扩展名：present 显式声明的这些文件也展示，并在行上标「源码」。 */
export const SOURCE_EXTS: readonly string[] = [
  'ts',
  'tsx',
  'js',
  'jsx',
  'mjs',
  'cjs',
  'json',
  'jsonc',
  'yaml',
  'yml',
  'toml',
  'ini',
  'sh',
  'bash',
  'zsh',
  'fish',
  'ps1',
  'py',
  'rb',
  'go',
  'rs',
  'java',
  'kt',
  'kts',
  'c',
  'h',
  'cc',
  'cpp',
  'hpp',
  'cs',
  'swift',
  'php',
  'sql',
  'css',
  'scss',
  'less',
  'vue',
  'svelte',
  'lua',
  'pl',
  'r',
  'dart',
]

export const KIND_BY_EXT: Readonly<Record<string, DeliverableKind>> = {
  html: 'doc',
  htm: 'doc',
  md: 'doc',
  txt: 'doc',
  pdf: 'doc',
  docx: 'doc',
  pptx: 'doc',
  xlsx: 'sheet',
  csv: 'sheet',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  webp: 'image',
  gif: 'image',
  svg: 'image',
  zip: 'other',
  mp4: 'other',
  mov: 'other',
  mp3: 'other',
  wav: 'other',
}
