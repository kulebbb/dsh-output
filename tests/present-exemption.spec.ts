/**
 * 阶段 2 拍板调整的单测：present 显式交付的源码类文件也展示并标 `isSource`，
 * 同时豁免「临时目录」与「必须在会话 cwd 内」两条过滤。
 * 被测：src/shared/rules.ts（只读，不改 src）。
 */
import { describe, expect, it } from 'vitest'
import { classifyPath, foldEvents } from '../src/shared/rules.ts'
import type { DeliverableCandidate, DeliverableSource } from '../src/shared/types.ts'
import { CWD, presentedEvent, writeCall } from './fixtures/events.ts'

const T = 1_700_000_000_000
const DIR = '/work/demo/deliverables'

function present(raw: unknown): DeliverableCandidate {
  const result = classifyPath(raw, { cwd: CWD, source: 'presented', time: T })
  if (!result.ok) throw new Error(`expected present ok, got reason=${result.reason} for ${String(raw)}`)
  return result.candidate
}

function presentRejected(raw: unknown): string {
  const result = classifyPath(raw, { cwd: CWD, source: 'presented', time: T })
  if (result.ok) throw new Error(`expected present rejected, got ${result.candidate.path}`)
  return result.reason
}

// ---------------------------------------------------------------------------
// present 的源码类文件：通过 + isSource=true
// ---------------------------------------------------------------------------
describe('present 源码类豁免（阶段 2 拍板）', () => {
  it.each(['ts', 'js', 'json', 'py'])('present 的 .%s 文件通过且 isSource === true', (ext) => {
    const candidate = present(`${DIR}/tool.${ext}`)
    expect(candidate.path).toBe(`${DIR}/tool.${ext}`)
    expect(candidate.ext).toBe(ext)
    // 源码不属于文档/表格/图片三类，UI 归到「其它」并靠 isSource 标「源码」徽标
    expect(candidate.kind).toBe('other')
    expect(candidate.source).toBe('presented')
    expect(candidate.isSource).toBe(true)
    expect(candidate.rel).toBe(`deliverables/tool.${ext}`)
  })

  it('present 的 .tsx / .vue / .sql 等其余源码类扩展名同样放行', () => {
    for (const ext of ['tsx', 'mjs', 'yaml', 'sh', 'vue', 'sql', 'rs', 'go']) {
      expect(present(`${DIR}/file.${ext}`).isSource).toBe(true)
    }
  })

  it('present 的相对路径按 cwd 绝对化后再豁免', () => {
    const candidate = present('src/tool.ts')
    expect(candidate.path).toBe(`${CWD}/src/tool.ts`)
    expect(candidate.isSource).toBe(true)
  })

  it('present 的源码文件带 description 时保留', () => {
    const result = classifyPath(`${DIR}/verify.py`, {
      cwd: CWD,
      source: 'presented',
      time: T,
      description: '验证脚本',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.candidate.description).toBe('验证脚本')
  })

  it('同一路径先 write 后 present 源码：source 升级为 presented 且 isSource=true', () => {
    const path = `${DIR}/tool.ts`
    const candidates = foldEvents(
      [writeCall(path, { time: T + 1_000 }), presentedEvent([{ path, description: '工具源码' }], { time: T + 2_000 })],
      { cwd: CWD },
    )
    expect(candidates).toHaveLength(1)
    expect(candidates[0]).toMatchObject({
      path,
      source: 'presented',
      isSource: true,
      description: '工具源码',
    })
  })

  // 关键边界：write/edit/bash/reply 的源码文件仍然被拒（豁免只给 present）
  it('非 present 的 .ts 文件仍然被拒（豁免只给显式交付）', () => {
    for (const source of ['write', 'edit', 'bash', 'reply'] as DeliverableSource[]) {
      const result = classifyPath(`${DIR}/tool.ts`, { cwd: CWD, source, time: T })
      expect(result.ok).toBe(false)
    }
  })
})

// ---------------------------------------------------------------------------
// present 豁免「临时目录」与「必须在 cwd 内」
// ---------------------------------------------------------------------------
describe('present 的目录豁免', () => {
  it('present 在 /tmp 下的交付物通过', () => {
    const candidate = present('/tmp/report.html')
    expect(candidate.path).toBe('/tmp/report.html')
    expect(candidate.source).toBe('presented')
    // cwd 之外的路径 rel 等于绝对路径（契约见 types.ts）
    expect(candidate.rel).toBe('/tmp/report.html')
    expect(candidate.isSource).toBeUndefined()
  })

  it('present 在 /private/tmp 与 /var/folders 下也通过', () => {
    expect(present('/private/tmp/report.md').path).toBe('/private/tmp/report.md')
    expect(present('/var/folders/ab/x/report.pdf').path).toBe('/var/folders/ab/x/report.pdf')
  })

  it('present 在会话 cwd 之外通过', () => {
    const candidate = present('/work/shared/brief.md')
    expect(candidate.path).toBe('/work/shared/brief.md')
    expect(candidate.rel).toBe('/work/shared/brief.md')
    expect(candidate.kind).toBe('doc')
  })

  it('present 在 cwd 之外的源码文件也通过并标 isSource', () => {
    expect(present('/work/shared/tool.ts').isSource).toBe(true)
  })

  it('present 的未知扩展名（.bin）仍然拒绝（豁免只放宽目录，不放宽白名单）', () => {
    expect(presentRejected(`${DIR}/firmware.bin`)).toBe('ext-not-deliverable')
    expect(presentRejected('/tmp/blob.unknown')).toBe('ext-not-deliverable')
  })

  it('present 也不豁免噪声目录 / 隐藏路径（阶段 2 只放宽了临时目录和 cwd）', () => {
    expect(presentRejected(`${CWD}/node_modules/pkg/index.js`)).toBe('noise-dir')
    expect(presentRejected(`${CWD}/.hidden/tool.ts`)).toBe('hidden-path')
  })
})

// ---------------------------------------------------------------------------
// present 的普通交付类型：isSource 不能为 true
// ---------------------------------------------------------------------------
describe('present 普通交付类型的 isSource', () => {
  it.each(['html', 'md', 'xlsx', 'png'])('present 的 .%s 文件 isSource 不为 true', (ext) => {
    const candidate = present(`${DIR}/deliverable.${ext}`)
    expect(candidate.isSource).not.toBe(true)
    expect(candidate.isSource).toBeUndefined()
  })

  it('present 的 PDF / DOCX 等文档类型同样不带 isSource', () => {
    expect(present(`${DIR}/spec.pdf`).isSource).toBeUndefined()
    expect(present(`${DIR}/spec.docx`).isSource).toBeUndefined()
  })
})

describe('present 豁免边界：仍受 hidden / noise / 项目元文件过滤', () => {
  it('present 的 README.md 仍被过滤（项目元文件不因显式交付而展示）', () => {
    const result = foldEvents(
      [presentedEvent([{ path: `${CWD}/README.md`, description: '项目说明' }], { seq: 1 })],
      { cwd: CWD },
    )
    expect(result).toHaveLength(0)
  })

  it('present 的 dist/app.js 仍被过滤（构建产物目录）', () => {
    const result = foldEvents(
      [presentedEvent([{ path: `${CWD}/dist/app.js`, description: '构建产物' }], { seq: 1 })],
      { cwd: CWD },
    )
    expect(result).toHaveLength(0)
  })

  it('present 的隐藏路径仍被过滤', () => {
    const result = foldEvents(
      [presentedEvent([{ path: `${CWD}/.hidden/secret.json`, description: '隐藏目录' }], { seq: 1 })],
      { cwd: CWD },
    )
    expect(result).toHaveLength(0)
  })
})
