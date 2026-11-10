#!/usr/bin/env node
/**
 * 用 Chrome DevTools Protocol 截任意页面（比 `--screenshot` 稳：等页面加载完再截）。
 *
 * 用法：
 *   node scripts/screenshot.mjs <url> <out.png> [--width=1440] [--height=900] [--wait=8000]
 *
 * 用途：原型截图 / 真实 DSH Web 实例加载验证截图。只依赖本机 Chrome 与 Node 22 内置 fetch/WebSocket。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'

// 默认 macOS 的 Chrome 路径；其他平台或自定义安装位置用 CHROME 环境变量指定
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = 9444

const args = process.argv.slice(2)
const url = args[0]
const out = args[1]
if (!url || !out) {
  console.error('usage: node scripts/screenshot.mjs <url> <out.png> [--width=1440] [--height=900] [--wait=8000]')
  process.exit(2)
}
const flag = (name, fallback) => {
  const found = args.find((arg) => arg.startsWith(`--${name}=`))
  return found === undefined ? fallback : Number(found.slice(name.length + 3))
}
const width = flag('width', 1440)
const height = flag('height', 900)
const waitMs = flag('wait', 8000)

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-shot-'))

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${userDataDir}`,
    `--window-size=${width},${height}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
)

async function waitForDebugger() {
  for (let i = 0; i < 100; i++) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/json/version`)
      if (response.ok) return
    } catch {}
    await sleep(100)
  }
  throw new Error('Chrome debugging port 没起来')
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl)
    ws.addEventListener('open', () => resolve(ws), { once: true })
    ws.addEventListener('error', reject, { once: true })
  })
}

async function main() {
  await waitForDebugger()
  const target = await (
    await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })
  ).json()
  const ws = await connect(target.webSocketDebuggerUrl)
  let nextId = 0
  const pending = new Map()
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    if (!message.id) return
    const item = pending.get(message.id)
    if (!item) return
    pending.delete(message.id)
    message.error ? item.reject(new Error(JSON.stringify(message.error))) : item.resolve(message.result)
  })
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++nextId
      pending.set(id, { resolve, reject })
      ws.send(JSON.stringify({ id, method, params }))
    })

  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
  await send('Page.enable')
  await sleep(waitMs)
  const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  fs.writeFileSync(out, Buffer.from(data, 'base64'))
  console.log(`saved ${out} (${width}x${height})`)
  ws.close()
}

main()
  .catch((error) => {
    console.error('screenshot failed:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    chrome.kill('SIGKILL')
    await sleep(300)
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true })
    } catch {}
  })
