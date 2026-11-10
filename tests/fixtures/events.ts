/**
 * 测试事件夹具（给 rules.spec / present-exemption.spec / service.spec 共用）。
 *
 * 来源：参照 DSH 会话日志的事件形状手工构造的边界用例。
 *   - 形状照 DSH 会话日志：
 *     v0 `session.jsonl.zstd` 用于 tool/call 与 assistant/message，
 *     v3 `session.v3.jsonl.zstd` 用于 deliverables/presented；
 *   - 所有路径、描述、命令都是占位用的假数据（统一用 /work/demo），
 *     不含任何真实的用户目录、文件名或会话内容；
 *   - 时间戳用固定常量，保证测试不依赖当前时钟。
 *
 * 真实事件形状（脱敏后）：
 *   { type: 'turn/start',        seq, time, data: { turn } }
 *   { type: 'tool/call',         seq, time, data: { turn, step, callId, name, arguments: '<JSON 字符串>' } }
 *   { type: 'assistant/message', seq, time, data: { turn, step, message: { role, content: [{ type: 'text' | 'reasoning', text }] } } }
 *   { type: 'deliverables/presented', seq, time, data: { turn, callId, files: [{ path, description }] } }
 *   { type: 'turn/end',          seq, time, data: { turn } }
 */
import type { SessionEventLike } from '../../src/shared/rules.ts'

/** 假会话工作目录（所有夹具路径都在它下面）。 */
export const CWD = '/work/demo'
/** 假会话创建时间（固定值，便于 mtime 保鲜期断言）。 */
export const CREATED_AT = 1_700_000_000_000
export const SESSION_ID = 'session-fixture-1'

/** 夹具默认事件时间：会话开始后 1 分钟。 */
const DEFAULT_TIME = CREATED_AT + 60_000

export interface EventOptions {
  time?: number
  seq?: number
  turn?: number
}

/** 通用事件构造：补齐 type / time，可选 seq。 */
export function event(type: string, data: Record<string, unknown>, options: EventOptions = {}): SessionEventLike {
  return {
    type,
    ...(options.seq === undefined ? {} : { seq: options.seq }),
    time: options.time ?? DEFAULT_TIME,
    data: { ...data, ...(options.turn === undefined ? {} : { turn: options.turn }) },
  }
}

export function turnStart(turn = 1, options: EventOptions = {}): SessionEventLike {
  return event('turn/start', {}, { ...options, turn })
}

export function turnEnd(turn = 1, options: EventOptions = {}): SessionEventLike {
  return event('turn/end', {}, { ...options, turn })
}

/** 工具调用：真实日志里 data.arguments 是 JSON 字符串，不是对象。 */
export function toolCall(
  name: string,
  args: Record<string, unknown>,
  options: EventOptions = {},
): SessionEventLike {
  return event(
    'tool/call',
    { step: 1, callId: `call-${name}`, name, arguments: JSON.stringify(args) },
    { ...options, turn: options.turn ?? 1 },
  )
}

/** write 工具调用（目标路径在 arguments.file_path）。 */
export function writeCall(filePath: string, options: EventOptions = {}): SessionEventLike {
  return toolCall('write', { file_path: filePath, content: '（夹具内容，省略）' }, options)
}

/** edit 工具调用（与 write 同一 target 字段）。 */
export function editCall(filePath: string, options: EventOptions = {}): SessionEventLike {
  return toolCall('edit', { file_path: filePath, old_string: 'a', new_string: 'b' }, options)
}

/** bash 工具调用（命令里的绝对路径会被 extractBashPaths 抓取）。 */
export function bashCall(command: string, options: EventOptions = {}): SessionEventLike {
  return toolCall('bash', { command, description: '夹具命令' }, options)
}

/** 助手消息：content 里只有 text part 会被当作收尾回复候选。 */
export function assistantText(text: string, options: EventOptions = {}): SessionEventLike {
  return event(
    'assistant/message',
    { step: 1, message: { role: 'assistant', content: [{ type: 'text', text }] } },
    { ...options, turn: options.turn ?? 1 },
  )
}

/** present 显式交付：data.files[] = { path, description }。 */
export function presentedEvent(
  files: Array<{ path: string; description?: string }>,
  options: EventOptions = {},
): SessionEventLike {
  return event(
    'deliverables/presented',
    { callId: 'call-present', files },
    { ...options, turn: options.turn ?? 1 },
  )
}

// ---------------------------------------------------------------------------
// service.spec 用的固定会话：1 个 present + 1 个 write + 1 条收尾回复（各 1 个文件）。
// ---------------------------------------------------------------------------

export const PRESENT_PATH = '/work/demo/report.html'
export const WRITE_PATH = '/work/demo/tables/summary.csv'
export const REPLY_PATH = '/work/demo/reply.md'

/** 时间：write(+2s) < present(+3s) < reply(+4s)，service 里按磁盘 mtime 倒序断言。 */
export const SAMPLE_OUTPUTS_EVENTS: SessionEventLike[] = [
  turnStart(1, { seq: 1, time: CREATED_AT + 1_000 }),
  presentedEvent([{ path: PRESENT_PATH, description: '阶段 2 方案文档' }], {
    seq: 2,
    time: CREATED_AT + 3_000,
  }),
  writeCall(WRITE_PATH, { seq: 3, time: CREATED_AT + 2_000 }),
  assistantText(`表格已生成，方案见 ${REPLY_PATH}。`, { seq: 4, time: CREATED_AT + 4_000 }),
  turnEnd(1, { seq: 5, time: CREATED_AT + 4_100 }),
]
