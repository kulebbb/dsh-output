# @kulebbb/dsh-output

[![CI](https://github.com/kulebbb/dsh-output/actions/workflows/ci.yml/badge.svg)](https://github.com/kulebbb/dsh-output/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

[DSH（DeepSeek Harness）](https://github.com/deepseek-ai) 桌面端插件：在**右侧栏新增「产出物」tab**，汇总当前这次对话交付给用户的文件。点条目在右栏直接打开文档预览，或用系统默认应用打开、在 Finder 中定位。

会话里聊了半天产出的文档、表格、图片散落在磁盘各处，找起来要翻对话记录、抄路径。这个插件把「这次对话到底给了你哪些文件」集中到一个面板里：跟随当前会话，按交付类型筛选，点一下就能看。

> **平台**：DSH 桌面端（需要带右侧栏的版本；Web 端可用，但「用默认应用打开 / 在 Finder 中显示」只在桌面端出现）。目前仅在 macOS 上做过端到端验证。

仓库：<https://github.com/kulebbb/dsh-output>

## 功能

- 右栏 tab「产出物」，跟随当前会话；右栏开始页有引导卡片，也可按 `⌘⇧O`（Windows / Linux 为 `Ctrl+Shift+O`）进入。快捷键只在**桌面端**注册，不抢占 Web 端内置 open-in-app 已占用的组合键。
- 面板顶部：交付物总数、类型筛选（一条分段槽，**只显示有内容的类型**，0 计数的类别隐藏，选中项始终保留）、文件名 / 路径搜索。
- 列表行：DSH 文件类型图标、文件名、相对会话工作目录的路径、来源说明（`present` 的 `description`）、来源徽标、类型、大小、修改时间；`present` 显式交付的源码类文件额外标「源码」。
- 点击行 → 右栏打开文档预览，由 DSH 文档预览插件渲染 Markdown / 代码 / 图片 / PDF / Office / HTML。
- 行内动作：**用默认应用打开**、**在 Finder 中显示**。纯 Web 部署（无桌面能力）时整组隐藏，只保留预览；失败会提示可重试，不静默吞。
- 加载中 / 无交付物 / 无匹配 / 请求失败四种状态都有界面，不白屏。
- 深色 / 浅色跟随 DSH 主题（token 驱动），窄面板 320px 起排版不崩；类型多于可用宽度时分段槽内部横向滚动。

## 安装

本包是 DSH **bundle**（`package.json` 的 `dsh.bundle.patch` 指向自带的 `cordis.patch.yml`），可以被 DSH 桌面端的「插件」页直接安装、启用和卸载，不需要手工改 profile 配置。构建产物 `lib/` 已随仓库提供，从 GitHub 安装无需本地构建。

1. 侧边栏打开「插件」页 → 安装，填入：

   ```
   https://github.com/kulebbb/dsh-output
   ```

2. 安装完成后按提示**重启 DeepSeek Harness**（桌面端没有 HMR，重启后新插件才生效）。
3. 重启后展开右侧栏，点「＋」打开开始页 → 点「产出物」卡片；或在任意会话里按 `⌘⇧O`。

也可以用 agent 的 `plugin_manager` 工具安装：`action: install_bundle`，`target` 填上面的地址。

### 本地开发时安装

```bash
# 1. 安装依赖并构建（产物：lib/index.js 宿主半 + lib/client.js 客户端半）
pnpm install
pnpm build

# 2. 完全退出 DSH 桌面端（Electron 进程全部结束），再执行：
dsh plugin --profile desktop add /绝对路径/到/dsh-output

# 3. 重新打开 DSH 桌面端，右栏会出现「产出物」tab
```

> 不要在 DSH 运行中安装 / 替换插件（Electron 已加载的模块不会热替换，容易看到旧版本或半加载状态）。
> 卸载用 `dsh plugin --profile desktop remove @kulebbb/dsh-output`，同样先退出桌面端。

## 实现概要

### 宿主半（`src/index.ts` + `src/host/service.ts`）

- 注册认证路由 `GET /api/outputs.list?sessionId=<id>[&refresh=1]`。
- 数据来源：`ctx.sessionQuery.readSession(sessionId)` 一次读出**该会话全量日志**再折叠，不依赖客户端能翻多少页。会话不存在返回 404 `session-not-found`，日志不可读返回 422 `session-unreadable`，其余异常 500 `internal`（响应体不泄露堆栈）。
- 缓存：同一会话只回放一次；运行中的会话由 `ctx.on("session/event")` 把增量事件喂给增量折叠器，轮询命中缓存不重复解压。`refresh=1` 强制重读。
- 磁盘校验：每条候选都 `stat`，不存在的文件不返回；`reply` 来源额外要求文件 mtime 不早于会话开始前 6 小时（排除被提到但早就存在的旧文件）。

### 折叠规则（`src/shared/rules.ts`，纯函数 + 增量折叠器）

来源优先级（同一路径取最高优先级，时间取最后一次）：

1. `deliverables/presented`（`present` 工具显式交付）→「显式交付」，保留 `description`；
2. `write` / `edit` 工具目标路径 →「本次对话生成」；
3. `bash` / `run_code` 命令里的绝对路径 →「脚本生成」；
4. 每轮收尾回复（`turn/end` 前最后一条 assistant 文本）里的路径 →「对话中提到的文件」（含 6 小时 mtime 保鲜）。

过滤（宁可少列，不要噪声）：

- 交付类型白名单 20 项：`html htm pdf docx xlsx pptx csv md txt zip png jpg jpeg webp gif svg mp4 mov mp3 wav`；
- **present 豁免**：`present` 显式声明的源码类文件（`.ts/.js/.json/.py/...`，见 `SOURCE_EXTS`）也展示并标「源码」；present 同时豁免「临时目录」和「必须在会话 cwd 内」两条。注意 present 仍受噪声目录 / 隐藏路径 / 项目元文件过滤（present 的 `README.md`、`dist/app.js` 不会展示）；
- 排除目录：`node_modules`、`.git`、`dist`、`build`、`out`、`coverage`、`.next` 等构建 / 依赖目录，以及 `.venv`、`__pycache__`、`.cache`、`.idea`、`.vscode`、`.claude` 等工具目录（完整清单见 `src/shared/rules.ts` 的 `NOISE_DIR`）；
- 排除项目元文件：`README.md`、`AGENTS.md`、`CLAUDE.md`、`LICENSE`、`CHANGELOG.md`、`CONTRIBUTING.md`、`package.json`、`requirements.txt`、`intend.md`、`.gitignore`；
- 排除隐藏路径（按相对 cwd 的路径段判断）、`/tmp`、`/private/tmp`、`/var/folders`（present 除外）、会话 cwd 之外的文件（present 除外）；
- 同一绝对路径去重，按 mtime 倒序。

### 客户端半（`src/client/`）

- `index.tsx`：注册右栏 tab 类型 + guide 引导卡 + `sidebar.right.pane.tab` slot 正文 + `⌘⇧O` 快捷键 + locale 注册 + 样式注入。
- `panel.tsx`：React 面板（loading / error / empty / ready、筛选、搜索、行内动作、toast、运行中 3s 静默刷新、`@container` 窄面板适配）。
- `api.ts`：拉列表、拼预览资源地址（绝对路径先按 cwd 压相对路径）、原生打开 / 定位与桌面能力探测。
- `styles.ts` / `icons.tsx` / `locales.ts`：DSH token 样式、DSH 文件类型 inline SVG 图标、中英文案。
- `locale/zh.json`、`locale/en.json`：插件清单展示用的 meta。

## 开发与测试

```bash
pnpm install
pnpm typecheck   # tsc --noEmit
pnpm test        # vitest：117 条（折叠规则 / 白名单与 present 豁免 / 路由层与竞态 / 自动刷新 / 预览地址）
pnpm build       # tsdown 双入口 → lib/index.js + lib/client.js
pnpm check       # 上面三步一起跑
```

测试夹具在 `tests/fixtures/events.ts`（参照 DSH 会话日志的事件形状手工构造的边界用例，路径统一用 `/work/demo` 假路径）。

截图工具（可选，需要本机 Chrome；非 macOS 或自定义安装位置用 `CHROME` 环境变量指定路径）：`node scripts/screenshot.mjs "<url>" out.png --wait=10000`。

## 交互设计稿

![面板顶部控件：改前 / 改后（深色）/ 改后（浅色）](prototype/screenshots/24-ui-v2-before-after.png)

[`prototype/ui-v2.html`](prototype/ui-v2.html) 是交互原型，浏览器直接打开即可切换主题、面板宽度（320 / 360 / 400）与示例数据，用来对比面板顶部控件的三种布局方向。它无需构建，但页面以相对路径引用 [`docs/tokens.css`](docs/tokens.css) 和 `prototype/icons.js`，复制时请连同这两个文件一起。

> 截图与原型里的数据都是构造的示例，不是真实会话内容。

### 设计依据

- [`docs/research-tokens.md`](docs/research-tokens.md)：DSH 主题 token、右栏面板尺寸与排版规范的调研
- [`docs/tokens.css`](docs/tokens.css)：从 DSH 主题包提炼的 token 表（浅 / 深两套）
- [`docs/tokens-demo.html`](docs/tokens-demo.html)：浅 / 深并排校验页

## 已知限制

- **被移动 / 重命名过的文件可能漏**：最终路径必须出现在 present / write / reply 任一条来源里；`write` 后用 `mv` 改名（尤其命令里用变量）的文件不会进列表。
- **`present` 里的非常见扩展名**（如 `.bin`、`.log`）不展示；只豁免 `SOURCE_EXTS` 里的源码类扩展名。
- **`reply` 来源会收进仓库文档**：模型在收尾回复里提到的 `docs/` 等文件会以「对话中提到的文件」出现；如果只想要「明确交付」，后续可加「隐藏 reply-only」开关。
- **显示的是当前磁盘版本**：文件被后续会话改过时，mtime 与内容以当前磁盘为准。
- **行是四行制**（文件名 / 路径 / 来源说明 / meta），比 DSH 文件面板的两行制信息密度低；这是为了把 `present` 的 description 展示出来，可后续改成可折叠。
- 窄面板隐藏类型文字用 CSS 容器查询（Chromium 105+）。
- 运行中会话的增量刷新依赖宿主 `session/event`；面板在会话运行中每 3s 静默刷新一次，会话停止的那一拍会再补拉一次；标签页重新可见 / 聚焦时也会补刷。
- 列表单次最多返回 2000 条（`truncated: true` + 面板提示「仅显示前 N 条」）；客户端请求 30s 超时，超时给可重试错误。
- **未做**：折叠缓存没有 LRU 上限（长时间运行、很多会话时会持续占用内存）；`readSession` 调用没有透传 AbortSignal；`write/edit` 的路径只解析工具参数、没有对齐 host 记录的 `meta.path`。
- **仅在 macOS 验证过**：Windows 路径处理（盘符、反斜杠）未做端到端验证。

## 背景

- DSH：DeepSeek Harness 桌面端。
- 同类插件参考：[dsh-git-tree](https://github.com/kulebbb/dsh-git-tree)（右栏 tab 注册 / 快捷键 / locale 接线）、[dsh-superagent](https://github.com/kulebbb/dsh-superagent)（TS + tsdown + vitest 工程结构）。

## 许可证

[MIT](LICENSE) © 2026 kulebbb
