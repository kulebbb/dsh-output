/**
 * 客户端预览地址拼法（`src/client/api.ts`）的单测。
 * 规则来自 DSH 内置实现：绝对路径先按 cwd 压成相对路径，保证同一文件只有一个 contentId。
 */
import { describe, expect, it } from 'vitest'
import { fileAddressFor, sessionFileAddress } from '../src/client/api.ts'
import { OUTPUTS_ROUTE, OUTPUTS_ROUTE_RELATIVE } from '../src/shared/types.ts'

describe('客户端路由形式', () => {
  it('客户端用相对路径（无前导 /），宿主注册仍是绝对路径', () => {
    // S3：不写死 /api/...，避免子路径挂载 / 反向代理时绕过前缀。
    expect(OUTPUTS_ROUTE_RELATIVE.startsWith('/')).toBe(false)
    expect(OUTPUTS_ROUTE_RELATIVE).toBe('api/outputs.list')
    expect(OUTPUTS_ROUTE).toBe('/api/outputs.list')
  })
})

describe('sessionFileAddress', () => {
  it('拼出 dsh-resource://file/session/<id>/<path>', () => {
    expect(sessionFileAddress('s1', 'docs/a b.html')).toBe('dsh-resource://file/session/s1/docs/a%20b.html')
  })

  it('去掉 ./ 前缀、把反斜杠归一成 /', () => {
    expect(sessionFileAddress('s1', './docs\\a.html')).toBe('dsh-resource://file/session/s1/docs/a.html')
  })
})

describe('fileAddressFor', () => {
  it('cwd 内的绝对路径压成相对路径', () => {
    expect(fileAddressFor('s1', '/work/demo', '/work/demo/docs/a.md')).toBe(
      'dsh-resource://file/session/s1/docs/a.md',
    )
  })

  it('相对路径原样拼', () => {
    expect(fileAddressFor('s1', '/work/demo', 'docs/a.md')).toBe('dsh-resource://file/session/s1/docs/a.md')
  })

  it('cwd 之外的绝对路径保留绝对路径（内置实现的表示法：path 段以 / 开头，地址里出现 //）', () => {
    // 与 DSH 内置 sessionFileAddress 一致：绝对路径 split('/') 后首段为空，解析时会还原成 /tmp/x.pdf
    expect(fileAddressFor('s1', '/work/demo', '/tmp/x.pdf')).toBe('dsh-resource://file/session/s1//tmp/x.pdf')
  })

  it('cwd 末尾斜杠不影响结果', () => {
    expect(fileAddressFor('s1', '/work/demo/', '/work/demo/a.md')).toBe('dsh-resource://file/session/s1/a.md')
  })

  it('cwd 未知时直接拼绝对路径（同上，保留绝对路径表示法）', () => {
    expect(fileAddressFor('s1', null, '/work/demo/a.md')).toBe(
      'dsh-resource://file/session/s1//work/demo/a.md',
    )
  })
})
