/**
 * 交付物折叠规则单测：白名单 / 过滤 / 路径解析 / 来源与优先级 / 去重与排序。
 * 被测：src/shared/rules.ts + src/shared/types.ts（只读，不改 src）。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DeliverableFolder,
  classifyPath,
  extractBashPaths,
  extractReplyPaths,
  foldEvents,
  resolveCandidatePath,
  type ClassifyOptions,
  type SessionEventLike,
} from '../src/shared/rules.ts'
import {
  DELIVERABLE_EXTS,
  KIND_BY_EXT,
  SOURCE_EXTS,
  type DeliverableCandidate,
  type DeliverableSource,
} from '../src/shared/types.ts'
import {
  CWD,
  assistantText,
  bashCall,
  editCall,
  presentedEvent,
  turnEnd,
  turnStart,
  writeCall,
} from './fixtures/events.ts'

const T = 1_700_000_000_000
/** 注意：不要用 `out/` 目录放夹具路径 —— `out` 在噪声目录里。 */
const DIR = '/work/demo/deliverables'

function classify(
  raw: unknown,
  source: DeliverableSource = 'write',
  extra: Partial<ClassifyOptions> = {},
): ReturnType<typeof classifyPath> {
  return classifyPath(raw, { cwd: CWD, time: T, source, ...extra })
}

/** 断言通过并返回候选；失败时把 reason 带进错误消息，便于定位。 */
function expectOk(raw: unknown, source: DeliverableSource = 'write'): DeliverableCandidate {
  const result = classify(raw, source)
  if (!result.ok) throw new Error(`expected ok, got reason=${result.reason} for ${String(raw)}`)
  return result.candidate
}

/** 断言被拒并返回拒绝原因。 */
function expectRejected(raw: unknown, source: DeliverableSource = 'write'): string {
  const result = classify(raw, source)
  if (result.ok) throw new Error(`expected rejected, got ${result.candidate.path}`)
  return result.reason
}

const fold = (events: SessionEventLike[]): DeliverableCandidate[] => foldEvents(events, { cwd: CWD })

afterEach(() => {
  vi.unstubAllEnvs()
})

// ---------------------------------------------------------------------------
// 1. 白名单
// ---------------------------------------------------------------------------
describe('扩展名白名单', () => {
  it('白名单是 20 项、无重复，且包含阶段 1 定稿的关键类型', () => {
    expect(DELIVERABLE_EXTS).toHaveLength(20)
    expect(new Set(DELIVERABLE_EXTS).size).toBe(20)
    // 文档 / 表格 / 图片 / 其它 四类都至少有一个代表
    for (const ext of ['html', 'md', 'pdf', 'xlsx', 'csv', 'png', 'zip', 'mp4']) {
      expect(DELIVERABLE_EXTS).toContain(ext)
    }
  })

  // 20 项逐个过：路径、扩展名、类型映射、来源都要正确
  it.each([...DELIVERABLE_EXTS])('白名单扩展名 .%s 通过并被正确分类', (ext) => {
    const candidate = expectOk(`${DIR}/report.${ext}`)
    expect(candidate.path).toBe(`${DIR}/report.${ext}`)
    expect(candidate.rel).toBe(`deliverables/report.${ext}`)
    expect(candidate.name).toBe(`report.${ext}`)
    expect(candidate.ext).toBe(ext)
    expect(candidate.kind).toBe(KIND_BY_EXT[ext])
    expect(candidate.source).toBe('write')
    expect(candidate.isSource).toBeUndefined()
  })

  it('源码类扩展名不在白名单，非 present 来源一律拒绝', () => {
    // 阶段 2 拍板：只有 present 显式交付才放行源码类；write/edit/bash/reply 都不行
    for (const ext of ['ts', 'js', 'json', 'py']) {
      expect(SOURCE_EXTS).toContain(ext)
      for (const source of ['write', 'edit', 'bash', 'reply'] as const) {
        expect(expectRejected(`${DIR}/tool.${ext}`, source)).toBe('ext-not-deliverable')
      }
    }
  })

  it('未知扩展名、无扩展名、非文件路径被拒', () => {
    for (const ext of ['bin', 'exe', 'parquet', 'log', 'app']) {
      expect(expectRejected(`${DIR}/artifact.${ext}`)).toBe('ext-not-deliverable')
    }
    // 无扩展名（Makefile / LICENSE）在扩展名校验这一步就出局
    expect(expectRejected(`${CWD}/Makefile`)).toBe('no-extension')
    expect(expectRejected(`${CWD}/LICENSE`)).toBe('no-extension')
    // 目录路径本身也没有扩展名
    expect(expectRejected(`${CWD}/src`)).toBe('no-extension')
  })
})

// ---------------------------------------------------------------------------
// 2. 过滤：噪声目录 / 项目元文件 / 隐藏路径 / 临时目录 / cwd 之外
// ---------------------------------------------------------------------------
describe('过滤规则', () => {
  it.each([
    'node_modules',
    'dist',
    'build',
    'out',
    'coverage',
    'venv',
    '__pycache__',
    'superpowers',
  ])('噪声目录 %s 下的文件被拒（reason=noise-dir）', (dir) => {
    expect(expectRejected(`${CWD}/${dir}/pkg/report.md`)).toBe('noise-dir')
  })

  it('噪声目录 docs/superpowers 也被拒（按路径段匹配任意层级）', () => {
    expect(expectRejected(`${CWD}/docs/superpowers/plan.md`)).toBe('noise-dir')
    // .git 同时命中隐藏路径，先被 hidden-path 拦下，但结论一样是拒绝
    expect(expectRejected(`${CWD}/.git/COMMIT_EDITMSG.md`)).toBe('hidden-path')
  })

  it.each(['README.md', 'AGENTS.md', 'CLAUDE.md', 'CHANGELOG.md', 'CONTRIBUTING.md', 'package.json', 'requirements.txt', 'intend.md', 'LICENSE.md'])(
    '项目元文件 %s 被拒（reason=project-meta-file）',
    (name) => {
      expect(expectRejected(`${CWD}/${name}`)).toBe('project-meta-file')
      // 大小写不敏感：readme.md 同样拒绝
      expect(expectRejected(`${CWD}/${name.toLowerCase()}`)).toBe('project-meta-file')
    },
  )

  it('隐藏路径被拒（隐藏目录与以点开头的文件都算）', () => {
    expect(expectRejected(`${CWD}/.config/notes.md`)).toBe('hidden-path')
    expect(expectRejected(`${CWD}/deliverables/.draft.md`)).toBe('hidden-path')
    expect(expectRejected(`${CWD}/.cache/report.html`)).toBe('hidden-path')
  })

  it.each([`/tmp/report.md`, '/private/tmp/report.html', '/var/folders/ab/x/report.pdf'])(
    '临时目录 %s 下的非 present 文件被拒（reason=temp-dir）',
    (path) => {
      expect(expectRejected(path)).toBe('temp-dir')
    },
  )

  it('不在会话 cwd 内的非 present 文件被拒（reason=outside-session-cwd）', () => {
    expect(expectRejected('/work/other-project/report.md')).toBe('outside-session-cwd')
    // 前缀相似的兄弟目录也不能误判成 cwd 内
    expect(expectRejected('/work/demo-sibling/report.md')).toBe('outside-session-cwd')
  })

  it('reject reason 能区分「不是交付物」的几类原因（便于日志排查）', () => {
    expect(expectRejected('')).toBe('invalid-path')
    expect(expectRejected(`${CWD}/Makefile`)).toBe('no-extension')
    expect(expectRejected(`${CWD}/file.bin`)).toBe('ext-not-deliverable')
    expect(expectRejected(`${CWD}/README.md`)).toBe('project-meta-file')
    expect(expectRejected(`${CWD}/node_modules/x.md`)).toBe('noise-dir')
    expect(expectRejected('/tmp/x.md')).toBe('temp-dir')
    expect(expectRejected('/elsewhere/x.md')).toBe('outside-session-cwd')
  })
})

// ---------------------------------------------------------------------------
// 3. 路径解析
// ---------------------------------------------------------------------------
describe('路径解析（resolveCandidatePath / classifyPath）', () => {
  it('相对路径按会话 cwd 绝对化，rel 保留相对写法', () => {
    expect(resolveCandidatePath('deliverables/report.md', CWD)).toBe(`${DIR}/report.md`)
    const candidate = expectOk('deliverables/report.md')
    expect(candidate.path).toBe(`${DIR}/report.md`)
    expect(candidate.rel).toBe('deliverables/report.md')
    expect(candidate.name).toBe('report.md')
  })

  it('绝对路径原样保留；`./` 与 `..` 会被 normalize', () => {
    expect(resolveCandidatePath(`${DIR}/report.md`, CWD)).toBe(`${DIR}/report.md`)
    expect(resolveCandidatePath(`${CWD}/./deliverables/../deliverables/a.md`, CWD)).toBe(`${DIR}/a.md`)
  })

  it('`~/x` 按 $HOME 展开（present 时即使展开到 cwd 外也放行）', () => {
    vi.stubEnv('HOME', '/home/tester')
    expect(resolveCandidatePath('~/notes/brief.md', CWD)).toBe('/home/tester/notes/brief.md')
    // 阶段 2：present 豁免 cwd 约束，所以展开后的外部路径也能通过
    const candidate = expectOk('~/notes/brief.md', 'presented')
    expect(candidate.path).toBe('/home/tester/notes/brief.md')
    expect(candidate.rel).toBe('/home/tester/notes/brief.md')
  })

  it('去掉外层引号 / 反引号', () => {
    expect(resolveCandidatePath('"/work/demo/deliverables/quoted.html"', CWD)).toBe(`${DIR}/quoted.html`)
    expect(resolveCandidatePath("'/work/demo/deliverables/single.html'", CWD)).toBe(`${DIR}/single.html`)
    expect(resolveCandidatePath('`/work/demo/deliverables/backtick.html`', CWD)).toBe(`${DIR}/backtick.html`)
    expect(expectOk('`deliverables/backtick.html`').path).toBe(`${DIR}/backtick.html`)
  })

  it('file:// 前缀被剥掉并解码 URI', () => {
    expect(resolveCandidatePath('file:///work/demo/deliverables/plain.html', CWD)).toBe(`${DIR}/plain.html`)
    expect(resolveCandidatePath('file:///work/demo/deliverables/encoded%20name.html', CWD)).toBe(
      `${DIR}/encoded name.html`,
    )
    expect(expectOk('file:///work/demo/deliverables/encoded%20name.html').name).toBe('encoded name.html')
  })

  it('含通配符 * ? { } 的路径被拒', () => {
    for (const pattern of [`${DIR}/*.html`, `${DIR}/report?.html`, `${DIR}/report{1,2}.html`]) {
      expect(resolveCandidatePath(pattern, CWD)).toBeNull()
      expect(expectRejected(pattern)).toBe('invalid-path')
    }
  })

  it('非字符串 / 空串 / cwd 为空时的相对路径 → invalid-path', () => {
    expect(resolveCandidatePath(null, CWD)).toBeNull()
    expect(resolveCandidatePath(undefined, CWD)).toBeNull()
    expect(resolveCandidatePath(42, CWD)).toBeNull()
    expect(resolveCandidatePath('', CWD)).toBeNull()
    expect(resolveCandidatePath('   ', CWD)).toBeNull()
    // 没有 cwd 就无法解析相对路径（冷读会话失败时会走到这条）
    expect(resolveCandidatePath('relative/report.md', '')).toBeNull()
    expect(classifyPath('relative/report.md', { cwd: '', source: 'write', time: T }).ok).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 4. 来源与优先级
// ---------------------------------------------------------------------------
describe('来源与优先级', () => {
  it('同一路径先 write 后 present：source 升为 presented，description 保留', () => {
    const path = `${DIR}/report.html`
    const candidates = fold([
      turnStart(1, { time: T }),
      writeCall(path, { time: T + 1_000 }),
      presentedEvent([{ path, description: '定稿版' }], { time: T + 2_000 }),
      turnEnd(1, { time: T + 2_100 }),
    ])
    expect(candidates).toHaveLength(1)
    expect(candidates[0]).toMatchObject({
      path,
      source: 'presented',
      description: '定稿版',
      time: T + 2_000,
    })
  })

  it('present 后 write 不降级，description 不丢', () => {
    const path = `${DIR}/report.html`
    const candidates = fold([
      presentedEvent([{ path, description: '定稿版' }], { time: T + 1_000 }),
      writeCall(path, { time: T + 2_000 }),
    ])
    expect(candidates).toHaveLength(1)
    expect(candidates[0]?.source).toBe('presented')
    expect(candidates[0]?.description).toBe('定稿版')
    // 时间仍取最后一次命中
    expect(candidates[0]?.time).toBe(T + 2_000)
  })

  it('edit 与 write 同级：先出现的来源胜出，不互相覆盖', () => {
    const path = `${DIR}/notes.md`
    const writeFirst = fold([writeCall(path, { time: T + 1_000 }), editCall(path, { time: T + 2_000 })])
    expect(writeFirst[0]?.source).toBe('write')
    const editFirst = fold([editCall(path, { time: T + 1_000 }), writeCall(path, { time: T + 2_000 })])
    expect(editFirst[0]?.source).toBe('edit')
  })

  it('bash 命令里的绝对路径被抓成 bash 来源；相对路径不抓', () => {
    const path = `${DIR}/chart.png`
    const candidates = fold([
      turnStart(1, { time: T }),
      bashCall(`python3 ${path} --format png`, { time: T + 1_000 }),
      turnEnd(1, { time: T + 1_100 }),
    ])
    expect(candidates).toHaveLength(1)
    expect(candidates[0]).toMatchObject({ path, source: 'bash', ext: 'png', kind: 'image' })
    // 阶段 1 规则只抓命令里的绝对路径（相对路径噪声太大）
    expect(extractBashPaths('cp chart.png dest/')).toEqual([])
  })

  it('extractBashPaths 一条命令里抓多个绝对路径', () => {
    expect(extractBashPaths('python3 /work/demo/a.md && open /work/demo/deliverables/b.pdf')).toEqual([
      '/work/demo/a.md',
      '/work/demo/deliverables/b.pdf',
    ])
    expect(extractBashPaths(null)).toEqual([])
    expect(extractBashPaths('')).toEqual([])
  })

  it('收尾回复里的行内代码路径与绝对路径都抓成 reply 来源', () => {
    const inline = `${DIR}/inline.md`
    const absolute = `${DIR}/absolute.pdf`
    const candidates = fold([
      turnStart(1, { time: T }),
      assistantText(`方案见 \`${inline}\`，另见 ${absolute}。`, { time: T + 1_000 }),
      turnEnd(1, { time: T + 1_100 }),
    ])
    // 按文本里出现顺序收集：行内代码在前、裸绝对路径在后
    expect(candidates.map((c) => [c.path, c.source])).toEqual([
      [inline, 'reply'],
      [absolute, 'reply'],
    ])
    expect(extractReplyPaths('没有路径的一段话')).toEqual([])
  })

  it('每轮只取 turn/end 前最后一条 assistant 文本（旧回复不生效）', () => {
    const oldPath = `${DIR}/old.md`
    const newPath = `${DIR}/new.md`
    const candidates = fold([
      turnStart(1, { time: T }),
      assistantText(`旧版本在这里 \`${oldPath}\``, { time: T + 1_000 }),
      assistantText(`最终版本在这里 \`${newPath}\``, { time: T + 2_000 }),
      turnEnd(1, { time: T + 2_100 }),
    ])
    expect(candidates).toHaveLength(1)
    expect(candidates[0]?.path).toBe(newPath)
    // reply 的时间取 assistant 消息时间，不是 turn/end 时间
    expect(candidates[0]?.time).toBe(T + 2_000)
  })

  it('finalize() 补最后一轮没有 turn/end 的回复', () => {
    const folder = new DeliverableFolder({ cwd: CWD })
    const path = `${DIR}/tail.md`
    folder.apply(turnStart(1, { time: T }))
    folder.apply(assistantText(`收尾：\`${path}\``, { time: T + 500 }))
    // 还没 finalize：turn 没结束，收尾回复尚未生效
    expect(folder.snapshot()).toEqual([])
    folder.finalize()
    expect(folder.snapshot()).toHaveLength(1)
    expect(folder.snapshot()[0]).toMatchObject({ path, source: 'reply' })
  })

  it('foldEvents 冷回放会自动 finalize 最后一轮回复', () => {
    const path = `${DIR}/cold-replay.md`
    const candidates = fold([turnStart(1, { time: T }), assistantText(`冷回放 \`${path}\``, { time: T + 1_000 })])
    expect(candidates.map((c) => c.path)).toEqual([path])
  })
})

// ---------------------------------------------------------------------------
// 5. 去重与排序
// ---------------------------------------------------------------------------
describe('去重与排序', () => {
  it('同一路径多次出现只留一条，时间取最后一次', () => {
    const path = `${DIR}/same.md`
    const candidates = fold([writeCall(path, { time: T + 1_000 }), writeCall(path, { time: T + 5_000 })])
    expect(candidates).toHaveLength(1)
    expect(candidates[0]?.time).toBe(T + 5_000)
  })

  it('snapshot() 按事件时间倒序（不是按命中顺序）', () => {
    const first = `${DIR}/first.md`
    const middle = `${DIR}/middle.html`
    const last = `${DIR}/last.pdf`
    const candidates = fold([
      writeCall(first, { time: T + 1_000 }),
      presentedEvent([{ path: middle }], { time: T + 3_000 }),
      writeCall(last, { time: T + 2_000 }),
    ])
    expect(candidates.map((c) => c.path)).toEqual([middle, last, first])
  })

  it('lastEventTime 取所有候选里最新的时间', () => {
    const folder = new DeliverableFolder({ cwd: CWD })
    folder.apply(writeCall(`${DIR}/a.md`, { time: T + 1_000 }))
    folder.apply(writeCall(`${DIR}/b.md`, { time: T + 4_000 }))
    expect(folder.lastEventTime).toBe(T + 4_000)
  })

  it('present 的 description 取最近一次 present', () => {
    const path = `${DIR}/desc.md`
    const candidates = fold([
      presentedEvent([{ path, description: '旧描述' }], { time: T + 1_000 }),
      presentedEvent([{ path, description: '新描述' }], { time: T + 2_000 }),
    ])
    expect(candidates).toHaveLength(1)
    expect(candidates[0]?.description).toBe('新描述')
  })
})
