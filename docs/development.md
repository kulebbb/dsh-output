# 开发说明

面向想改代码、跑测试或参与贡献的人。用户向的说明见 [README](../README.md)。

## 本地开发与安装

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

## 开发与测试

```bash
pnpm install
pnpm typecheck   # tsc --noEmit
pnpm test        # vitest：117 条（折叠规则 / 白名单与 present 豁免 / 路由层与竞态 / 自动刷新 / 预览地址）
pnpm build       # tsdown 双入口 → lib/index.js + lib/client.js
pnpm check       # 上面三步一起跑
```

测试夹具在 `tests/fixtures/events.ts`（参照 DSH 会话日志的事件形状手工构造的边界用例，路径统一用 `/work/demo` 假路径）。

CI 会额外校验 `lib/` 构建产物与 `src/` 一致（`pnpm build && git diff --exit-code lib`），改了源码记得把构建产物一起提交。

截图工具（可选，需要本机 Chrome；非 macOS 或自定义安装位置用 `CHROME` 环境变量指定路径）：`node scripts/screenshot.mjs "<url>" out.png --wait=10000`。

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

## 已知实现限制

- 行是四行制（文件名 / 路径 / 来源说明 / meta），比 DSH 文件面板的两行制信息密度低；这是为了把 `present` 的 description 展示出来，可后续改成可折叠。
- 窄面板隐藏类型文字用 CSS 容器查询（Chromium 105+）。
- 运行中会话的增量刷新依赖宿主 `session/event`；面板在会话运行中每 3s 静默刷新一次，会话停止的那一拍会再补拉一次；标签页重新可见 / 聚焦时也会补刷。
- 列表单次最多返回 2000 条（`truncated: true` + 面板提示「仅显示前 N 条」）；客户端请求 30s 超时，超时给可重试错误。
- **未做**：折叠缓存没有 LRU 上限（长时间运行、很多会话时会持续占用内存）；`readSession` 调用没有透传 AbortSignal；`write/edit` 的路径只解析工具参数、没有对齐 host 记录的 `meta.path`。

## 交互设计稿

![面板顶部控件：改前 / 改后（深色）/ 改后（浅色）](../prototype/screenshots/24-ui-v2-before-after.png)

[`prototype/ui-v2.html`](../prototype/ui-v2.html) 是交互原型，浏览器直接打开即可切换主题、面板宽度（320 / 360 / 400）与示例数据，用来对比面板顶部控件的三种布局方向。它无需构建，但页面以相对路径引用 [`docs/tokens.css`](tokens.css) 和 `../prototype/icons.js`，复制时请连同这两个文件一起。

> 截图与原型里的数据都是构造的示例，不是真实会话内容。

### 设计依据

- [`docs/research-tokens.md`](research-tokens.md)：DSH 主题 token、右栏面板尺寸与排版规范的调研
- [`docs/tokens.css`](tokens.css)：从 DSH 主题包提炼的 token 表（浅 / 深两套）
- [`docs/tokens-demo.html`](tokens-demo.html)：浅 / 深并排校验页

## 背景

- DSH：DeepSeek Harness 桌面端。
- 同类插件参考：[dsh-git-tree](https://github.com/kulebbb/dsh-git-tree)（右栏 tab 注册 / 快捷键 / locale 接线）、[dsh-superagent](https://github.com/kulebbb/dsh-superagent)（TS + tsdown + vitest 工程结构）。
