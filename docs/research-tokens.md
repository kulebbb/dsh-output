# DSH「产出物」右栏 tab：token / 面板观感 / 图标 调研

> 调研对象：DeepSeek Harness 0.2.1-rc.5（本机安装包）
> 产出：`docs/tokens.css`（可直接 `<link>`）、`docs/tokens-demo.html`（浅/深并排校验）、本文
> 结论一句话：**深色主题是 `<body>` 上的布尔属性 `data-ds-dark-theme`，不是 `[data-theme]`/`.dark`，也不是媒体查询；token 原样抽自 `dsh-client-ui-theme/lib/client.js:1413`。**

---

## 0. 结论先看

1. **主题机制**：`document.body.toggleAttribute('data-ds-dark-theme', dark)`（`dsh-client-ui-theme/lib/index.js:158`）。默认偏好是 `system`（`lib/index.js:17`），`system` 时用 `matchMedia('(prefers-color-scheme: dark)')` 解析一次（`lib/index.js:152-156`、`lib/client.js:1666/1849`）。媒体查询只用于「首帧前给画布上底色」和 `system` 的解析，**不是** token 的挂载方式。
2. **token 宿主**：DSH 把 **static 色板 + alias 语义变量都定义在 `body`** 上，深色块是 `body[data-ds-dark-theme]`（`lib/client.js:1413`）。本文档的 `tokens.css` 把浅色挂 `:root`、深色挂 `[data-ds-dark-theme]`（不限标签），既保住真实机制，也能在原型里给任意容器单独开深色做并排小样。
3. **颜色纪律**：不要自创色。蓝色只用于 `--dsw-alias-link` / `--dsw-alias-brand-primary-new-colorprimary-new-color` / `state-business-primary`；**主按钮不是蓝的**——`--dsw-alias-button-primary-fill` 在浅色是近黑（`neutral-bluish-1000`）、深色是近白（`bluish-50`）。
4. **面板本身不画框**：右侧栏 tab body 的背景就是 `--dsw-alias-bg-base`，tab strip 由 DSH 提供（38px 高）。新 tab 里只需要一个 38px 的子 header + 列表，不要卡片墙、不要阴影。
5. **图标别引字体**：DSH 的文件类型图标是 inline SVG（28×28 实心页面 + 白色符号），本文第 5 节给了逐字路径，可整段内联。

---

## 1. 主题切换机制（结论 + 证据）

### 1.1 结论

| 常见猜测 | DSH 实际 | 证据 |
| --- | --- | --- |
| `[data-theme="dark"]` | ❌ 不存在 | 全量 grep `data-theme` 在 `dsh-client-ui-*/lib/client.js` 无命中 |
| `.dark` class | ❌ 不存在 | 无 `classList` 切主题代码；只有 `dataset.pluginCss` 等无关 class |
| `data-appearance` | ❌ 不存在 | 只有 i18n key `appearance.dark`（`theme/lib/client.js:61/1466/1494`），不是 DOM 属性 |
| 纯 `prefers-color-scheme` 媒体查询 | ⚠️ 只用于首帧/`system` 解析 | `theme/lib/index.js:139-142` 的 boot 样式；`theme/lib/client.js:1666`、`1849` |
| **`body` 布尔属性 `data-ds-dark-theme`** | ✅ 真实机制 | `theme/lib/index.js:158`；CSS 选择器 `theme/lib/client.js:1413` |

### 1.2 证据链（可直接对照源码）

1. `dsh-client-ui-theme/lib/index.js:139-142` —— 首帧前注入的 canvas 底色：
   ```js
   const LIGHT_BACKGROUND = "#fff";
   const DARK_BACKGROUND = "#151517";
   // light: :root{color-scheme:light} body{background-color:#fff;--dsh-boot-bg:#fff}
   // dark : :root{color-scheme:dark}  body{background-color:#151517;--dsh-boot-bg:#151517}
   // system: light + @media(prefers-color-scheme:dark){dark}
   ```
2. `dsh-client-ui-theme/lib/index.js:148-158` —— body 启动脚本（真正的切换）：
   ```js
   const systemDark = preference === 'system' && matchMedia('(prefers-color-scheme: dark)').matches
   const dark = preference === 'dark' || systemDark
   document.documentElement.dataset.dsThemeSource = preference   // light | dark | system
   document.body.toggleAttribute('data-ds-dark-theme', dark)      // ← 主题开关
   ```
3. `dsh-client-ui-theme/lib/index.js:17` —— `DEFAULT_PREFERENCE = "system"`：**默认跟系统**。
4. `dsh-client-ui-theme/lib/client.js:1666`（`matchMedia`）、`:1679`（监听 change，仅 `system` 生效）、`:1849`（`preference === "system" ? media.matches ? "dark" : "light" : preference`）。
5. `dsh-client-ui-theme/lib/client.js:1413` —— token 的两个宿主：
   ```
   body{ --dsw-static-* … --dsw-alias-* … }
   body[data-ds-dark-theme]{ --dsw-static-* … --dsw-alias-* … }
   html[data-platform=darwin] body{ --dsw-specific-menu:#f8f9faf0 }
   html[data-platform=darwin] body[data-ds-dark-theme]{ --dsw-specific-menu:#303136f0 }
   ```
6. 组件里的深色写法也印证：`body[data-ds-dark-theme] .card{…}`（`dsh-client-ui-deliverables/lib/client.js:1300`）、`[data-platform=darwin] [data-ds-dark-theme] .sidebarCol{…}`（`dsh-client-ui-layout/lib/client.js:73`）。**属性可以挂在任意祖先上**，所以原型里给单个容器开深色是安全的。

### 1.3 `docs/tokens.css` 的映射方式

```css
:root{ /* 浅色 static + alias */ }
[data-ds-dark-theme]{ /* 深色 static + alias */ }   /* DSH 自己挂在 body；特异性高于 :root */
```

真实应用里照抄 DSH 一行即可：

```js
document.body.toggleAttribute('data-ds-dark-theme', dark)
```

### 1.4 如果你还想要 `prefers-color-scheme` 自动跟随

**不要**在 CSS 里直接写 `@media (prefers-color-scheme: dark){ :root{深色} }` —— 会覆盖用户在设置里的显式「浅色」。照 DSH 的做法，在 JS 里解析一次（等价于 `lib/index.js:148-158`）：

```js
const mq = matchMedia('(prefers-color-scheme: dark)')
const apply = (pref) => document.body.toggleAttribute(
  'data-ds-dark-theme',
  pref === 'dark' || (pref === 'system' && mq.matches),
)
apply('system')              // 或 localStorage 里存的 'light' | 'dark' | 'system'
mq.addEventListener('change', () => apply(currentPreference))
```

原型若只能静态 HTML，最省事的做法是：默认浅色 + 一个切换按钮写 body 属性；并在演示页里并排展示两套。

---

## 2. token 抽取方式与覆盖清单

### 2.1 抽取方法

`dsh-client-ui-theme/lib/client.js` 把 CSS 存成 JS 字符串常量（`*_css_default`）。抽取步骤（可复现）：

1. 正则抓 `var <name>_css_default = "…";`，`JSON.parse` 还原成 CSS 文本（8 段：base / design_platform / scrollbar / focus / corner_shape / gradient_shadow_text / onboarding / shiki）。
2. 按顶层 `{…}` 切成规则，得到 design_platform 的 6 条规则：static 浅、static 深、alias 浅、alias 深、darwin 浅、darwin 深。
3. 逐条落进 `docs/tokens.css`，**没有改任何色值**；唯一改动是选择器宿主（`body` → `:root` / `[data-ds-dark-theme]`）并补了第 10 节的基础排版。

关键行号（`dsh-client-ui-theme/lib/client.js`）：

| 常量 | 行号 | 内容 |
| --- | --- | --- |
| `base_css_default` | 1407 | 字体栈、等宽字体栈、缓动/时长、圆角 |
| `design_platform_css_default` | 1413 | static 色板 + alias 语义变量（light/dark） |
| `focus_css_default` | 1416 | 焦点环宽度与颜色 |
| `scrollbar_css_default` | 1422 | 滚动条宽度 5px / 胶囊 thumb |
| `gradient_shadow_text_css_default` | 1425 | 阴影 `--dsw-shadow-lv1..3`、elevation、字号预设 `--dsw-font-*` |

### 2.2 `docs/tokens.css` 覆盖清单（333 个 token 名，663 行）

| 组 | 数量 | 说明 |
| --- | --- | --- |
| `--dsw-static-*` 原始色板 | 77（浅）+ 77（深） | 两套几乎相同，**只有 `--dsw-static-neutral-bluish-60` 不同**：浅 `#f5f6f7` / 深 `#f9fafb`。只抄一套会让深色的 count 徽标、搜索框底色偏色 |
| `--dsw-alias-*` 语义 | 103（101 语义 + 2 个 settings-card） | bg / label / border / interactive / button / state / markdown / scrollbar / tooltip / brand / link 等，深浅各一份 |
| `--dsw-specific-*` 组件专用 | 11 | `sidebar-fill`、`sidebar-nav-item-*`、`menu`、`selector`、`bubble*`、`input-major`、`tip` |
| 阴影 / elevation / 线性渐变 | 13 | `--dsw-shadow-lv1..3`、`--dsw-elevation-stroke/panel/prominent/soft`、`--dsw-menu-backdrop-filter`、`--dsw-linear-gradient-think` / `--dsw-linear-think-select`（深浅各一份） |
| 字体 / 圆角 / 缓动 | 116 | 字体栈 + 13 组 `--dsw-font-*` 排版预设 + 6 档圆角 + 4 个时长/曲线 |
| 滚动条 | 5 | `--dsh-scrollbar-*` + 全局 `::-webkit-scrollbar` 规则 |
| 焦点环 | 2 | `--dsw-focus-ring-width: 2px`、`:focus-visible` |
| 内容字号 | 4 | `--dsh-content-font-*` / `--dsh-code-font-*` 的 delta 表达式 |
| 其他 | 2 | `--ds-font-family-code`（等宽字体别名）、`--dsw-menu-surface-fill`（macOS 菜单材质底色） |

为原型直接列出、我逐条核对存在的必须项（全部命中）：

`bg-base` / `bg-layer-1..3` / `bg-module-platform` / `label-primary|secondary|tertiary|caption|dimmed|primary-foreground` / `border-l1..l4` / `interactive-bg-hover|active|hover-solid` / `state-success|error|warn|business|idle-primary` / `brand-primary` / `brand-primary-new-colorprimary-new-color` / `link` / `scrollbar-bg-l1|l2` / `scrollbar-hover-l1|l2` / `radius-xs|sm|md|lg|xl|panel` / `tooltip-bg` / `tooltip-key-bg` / `markdown-tag` / `button-primary-fill|hover`。

### 2.3 两个容易踩的坑（原样保留，未改名）

- `--dsw-alias-brand-primary-new-colorprimary-new-color`：**就是这个名字**（变量名在构建时被拼坏了），颜色 `#4176e6`（浅）/ `--dsw-static-deepseek-450`（深）。DSH 自己的 dockkit 也是用这个长名字引用的，改名会让 token 对不上。
- `--dsw-alias-brand-primary` 不是品牌蓝，是「反色」：浅色近黑 / 深色近白（用于主按钮底）。**别拿它当强调色。**

### 2.4 基础排版块

`dsh-web-frontend/dist/assets/index-BNyAYEM7.css` 里 DSH 的 body 规则（已收进 `tokens.css` 第 10 节）：

```css
body{
  font-family: var(--dsw-font-family, -apple-system, …);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  color: var(--dsw-alias-label-primary, #0f1115);
  background: var(--dsw-alias-bg-base, #fff);
  text-autospace: normal;
}
```

字号没有写死在 body 上（由组件自己定），原型建议正文 14/22、面板内 13/20（见第 4 节）。

---

## 3. 右侧栏面板观感参考

> 重点：右侧栏是一个 **tab 宿主（dockkit）**，tab strip 由 DSH 画；tab body 里放业务面板。业务面板**不拥有外框**，只填满 body。

### 3.1 右栏宽度与三列布局（`dsh-client-ui-layout/lib/client.js`）

| 事实 | 值 | 出处 |
| --- | --- | --- |
| 右栏宽度 clamp | **300 ~ 420px**（上限还受 `viewport*0.7` 约束） | `layout:14`（`RIGHTBAR_MAX_RATIO=.7`）、`:45` |
| 首次打开默认宽 | `viewport * 0.45` | `layout:16`、`:240` |
| 左侧栏 clamp | 264 ~ 420，收起 56 | `layout:39-45` |
| 中间列最小 | 400（右栏让位） | `layout:42` |
| 右栏列背景 | `--dsw-alias-bg-base`（darwin 下） | `layout:73`（`.rightbarCol`） |

**给原型的结论**：320~420px 是真实区间，**360~380 最稳**（默认 0.45×1440≈648 会被 420 夹住，所以实际常见 400+；但内容型面板 360-380 更舒服，且与 DSH 的 guide 卡片 `width:380` 对齐）。

### 3.2 tab strip（dockkit，打包在 web dist，源码包未随安装发布）

来源：`dsh-web-frontend/dist/assets/index-BNyAYEM7.css`（类名 hash `_…_6nhg2_*`）。关键规则原样摘录：

```css
/* 整条 strip：高 28 + 上内边距 10 = 实际 38px */
._tabStrip_6nhg2_237{display:flex;flex:none;gap:4px;align-items:center;height:28px;
  padding:10px 6px 0 var(--dsh-dockkit-strip-inline-start,10px)}
/* 单个 tab */
._tab_6nhg2_134{position:relative;display:flex;flex:0 1 auto;align-items:center;
  min-width:80px;max-width:170px;height:28px;padding:0 10px;
  color:var(--dsw-alias-label-secondary);font-size:var(--dsh-content-font-size-secondary,13px);
  line-height:1;white-space:nowrap;border-radius:var(--dsw-radius-sm);cursor:pointer}
._tab_6nhg2_134:hover{background:var(--dsw-alias-interactive-bg-hover)}
._tabActive_6nhg2_346{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-markdown-tag)}
/* 右侧工具按钮 */
._iconButton_6nhg2_511{display:inline-flex;flex:none;align-items:center;justify-content:center;
  width:28px;height:28px;padding:6px;color:var(--dsw-alias-label-secondary);line-height:1;
  background:transparent;border:none;border-radius:var(--dsw-radius-sm);cursor:pointer}
._iconButton_6nhg2_511 svg{width:15px;height:15px}
/* tab 内容区：滚动条用 l2 一档 */
._paneBody_6nhg2_318{position:relative;flex:1 1 auto;min-width:0;min-height:0;overflow:auto;
  --dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);
  --dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2)}
```

另外 `body` 里的 tab 切换器样式（`dsh-client-ui-sidebar-right/lib/client.js:1258`）：tab body `.P3OORG_tabBody{display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden}`；工具栏按钮 `.P3OORG_iconButton{28×28; radius-sm; color:label-secondary; hover:interactive-bg-hover} svg{15×15}`。

### 3.3 文件面板（`dsh-client-ui-sidebar-files/lib/client.js:420`）——最接近「产出物列表」的既有面板

```css
.root{height:100%;color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.5;display:flex;flex-direction:column}
.header{height:38px;padding:0 6px 0 16px;border-bottom:.5px solid var(--dsw-alias-border-l3);align-items:center;gap:4px}
.body{padding:8px 0 8px 8px;overflow:auto;scrollbar-gutter:stable;margin-right:2px}
/* 列表行：不是卡片，没有边框/分割线 */
.row{width:100%;text-align:left;border-radius:var(--dsw-radius-md);cursor:pointer;
  background:0 0;border:0;align-items:center;gap:6px;padding:5px 10px;display:flex}
.row:hover{background:var(--dsw-alias-interactive-bg-hover)}
.icon{color:var(--dsw-alias-label-tertiary);flex:none}
.fileIcon{flex:none}                     /* FileTypeIcon size=16 */
.name{white-space:nowrap;text-overflow:ellipsis;min-width:0;overflow:hidden}
.note{color:var(--dsw-alias-label-tertiary);padding:3px 10px;font-size:12px}
.status{padding:12px 10px;font-size:13px;line-height:1.6;color:var(--dsw-alias-label-secondary)}
.tool{width:28px;height:28px;padding:6px;border-radius:var(--dsw-radius-sm);color:var(--dsw-alias-label-secondary)}
```

`IconFolderOpen/Close`、`FileTypeIcon` 都是 inline SVG 组件（见第 5 节），行内图标 `size: 16`（`:530-533`）。

### 3.4 git-tree 面板（`dsh-git-tree/lib/client.js:984-1035`）——右栏内容型面板的范式

```css
.pane{height:100%;display:flex;flex-direction:column;color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px}
.statusbar{padding:6px 12px;border-bottom:1px solid var(--dsw-alias-border-l1);
  font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);gap:8px}
.searchrow{padding:6px 12px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.search{flex:1;height:26px;padding:0 10px;border-radius:8px;
  border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-module-platform);
  color:var(--dsw-alias-label-primary);font-size:12px;line-height:20px}
.search::placeholder{color:var(--dsw-alias-label-tertiary)}
.search:hover{border-color:var(--dsw-alias-border-l3)}
.search:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-border-l3)}
.pill{height:20px;padding:0 7px;border-radius:6px;background:var(--dsw-alias-bg-module-platform);
  font-family:var(--ds-font-family-code);font-size:11px}
.action{width:24px;height:24px;border-radius:999px;color:var(--dsw-alias-label-tertiary)}
.action:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}
/* 空状态 */
.message{padding:32px 24px;text-align:center;color:var(--dsw-alias-label-tertiary);
  font-size:13px;line-height:20px;display:flex;flex-direction:column;gap:12px;align-items:center}
/* 浮层/提示 */
.tooltip{padding:10px 12px;border-radius:10px;background:var(--dsw-alias-bg-layer-2);
  border:1px solid var(--dsw-alias-border-l2);box-shadow:var(--dsw-shadow-lv3);font-size:12px;line-height:18px}
```

图形常量（`:118-130`）：**`ROW_H = 40`（两行行高）、`LANE_W=24`、`LABEL_FONT_SIZE=13`、`DATE_FONT_SIZE=11`、左内边距 18、上内边距 14**。列表水平内边距 `padding:8px 12px 10px`（`:1006`）。

### 3.5 「产出物」在 DSH 里已有实现（重要上下文）

`@deepseek-ai/dsh-client-ui-deliverables` 是**聊天尾部**的产出卡（不是右栏 tab），但它的视觉密度就是「产出物」该有的密度，新 tab 应复用：

| 元素 | 值 | 出处 |
| --- | --- | --- |
| 卡片 | 高 60、`radius-lg`、`.5px solid border-l1`、bg `static-neutral-50`（深 `neutral-850`） | `deliverables/client.js:1300` |
| 图标底框 | 40×40、radius 10、`.5px border-l1`、白 50% / 深 5% | 同上 |
| 图标 | `FileTypeIcon size=20` | `:1566` |
| 文件名 | 13px / 500 / 20px | 同上 |
| 说明 | **10px** / 16px / label-tertiary | 同上 |
| 改动文件行 | 11px/18px 等宽、`padding:7px 18px 7px 14px`、hover `interactive-bg-hover` | 同上 |
| 单文件标题 | 13/20 + 12/18 统计（等宽、success/error 色） | `:1300` |

**结论**：产出物的典型信息层级 = 图标 + 文件名（13/500）+ 副信息（10-11px 等宽 tertiary）；不要放大成 16px 标题。

### 3.6 右栏 guide（空 tab 时的引导卡，`sidebar-right/client.js:354`）

`width:380px; min-height:56px; padding:14px 20px; border:.5px solid border-l3; border-radius:radius-xl; background:bg-layer-1; gap:14px`；标题 14px、描述 11px tertiary、图标 26px。可作「产出物为空时」的替代空态。

---

## 4. 字体 / 字号 / 圆角 / 间距

### 4.1 字体栈（`theme/lib/client.js:1407`）

```
文本: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB",
      "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif
等宽: "SF Mono", "JetBrains Mono", "Fira Code", Consolas, "Liberation Mono", Menlo, Courier,
      "PingFang SC", "Microsoft YaHei"
品牌: "Montserrat" + 文本栈
```
系统里还允许用户在设置里覆盖（`--dsh-font-family-text` / `--dsh-font-family-code`，由 `theme/lib/index.js:145-158` 注入 body 内联样式）。

### 4.2 字号 / 行高（`--dsw-font-*` 预设）

| token | 字号/行高/字重 | 典型用途 |
| --- | --- | --- |
| `--dsw-font-xl-24` | 24/32 600 | 页面级大标题 |
| `--dsw-font-l-20` | 20/28 500 | 面板大标题（少用） |
| `--dsw-font-m-18` | **16/28 500**（名字是 18，值是 16） | 区块标题 |
| `--dsw-font-base-16` | 16/24 400 | 大正文 |
| `--dsw-font-s-14` | **14/22 400** | 正文（对话内容） |
| `--dsw-font-s-strong-14` | 14/22 500 | 正文强调 |
| `--dsw-font-xs-13` | **13/20 400** | 面板正文 / tab 标题 |
| `--dsw-font-xs-strong-13` | 13/20 500 | 列表主标题 |
| `--dsw-font-xxs-12` | 12/18 400 | 辅助说明 / 搜索框 |
| `--dsw-font-xxxs-11` | 11/14 400 | 计数、路径、时间（配等宽字体） |
| `--dsh-content-font-size` | 14（用户可调 10-22） | 对话正文基准 |
| `--dsh-content-font-size-secondary` | `min(size-1, max(13, size-2))` → 13 | 面板次级字号 |
| `--dsh-code-font-size` | 11（用户可调 10-16） | 代码块 |
| `--dsh-terminal-font-size` | 13 | 终端 |

### 4.3 圆角（`--dsw-radius-*`）

| token | 值 | 典型用途 |
| --- | --- | --- |
| `--dsw-radius-xs` | 4px | kbd、极小标签 |
| `--dsw-radius-sm` | **8px** | tab、按钮、搜索框、28px 图标按钮 |
| `--dsw-radius-md` | **12px** | 列表行、菜单项 |
| `--dsw-radius-lg` | **16px** | 卡片、diff header |
| `--dsw-radius-xl` | 20px | guide 卡、大容器 |
| `--dsw-radius-panel` | 28px | 浮动面板 / 拖拽浮层 |

补充：`@supports (corner-shape:superellipse(1.5))` 时 DSH 给所有元素加 `corner-shape:var(--dsw-corner-shape)`（`client.js:1410`），Chrome 156 已支持的话会呈现「超椭圆」圆角，原型里无需自己写，用 DSH 的 radius 即可。

### 4.4 间距惯例（从组件实测归纳，DSH 没有 spacing token）

| 值 | 出现位置 |
| --- | --- |
| 3px / 4px | tab 之间 gap、kbd 内边距 |
| 6px | 列表行 gap、header 内 `padding:0 6px` |
| 8px | 搜索行内边距、列表区块 padding、行 gap |
| 10px | tab 横向 padding、列表行横向 padding |
| 12px | 面板左右内边距、空态上下 padding |
| 14px | guide 卡 padding、图标底框 gap |
| 16px | header 左内边距、区块 padding |
| 18/20/24/32 | 空态 padding、区块间距 |

---

## 5. 图标方案

### 5.1 现状：`dsh-client-ui-primitives` 不可直接读

- 很多包 `require("@deepseek-ai/dsh-client-ui-primitives").FileTypeIcon`（如 `sidebar-files/lib/client.js:9、530`、`deliverables/lib/client.js:1566`）。
- 但该包**没有随 npm 安装包发布**：`dsh-web-frontend/package.json` 里它只是 `devDependencies`，`node_modules/@deepseek-ai/` 下没有 `dsh-client-ui-primitives` 目录。
- 实现被打进 `dsh-web-frontend/dist/assets/index-BXV-oxvX.js`（压缩单行）：`FileTypeIcon` 导出在字符偏移约 **860902**，其 switch 实现函数 `WA` 在约 **759605**。

### 5.2 实现结论

- 图标是 **inline `<svg>`，不是 icon font**（`FileTypeIcon` → `WA(type,size,className)` 返回 React `<svg>`），所以可以逐字取出 path 内联进原型。
- 文件类型图标结构（28×28 viewBox）：
  1. 文档主体 path，`fill: currentColor`（颜色来自类型 class）；
  2. 折角 path，`fill: var(--dsw-static-neutral-00)` + `fill-opacity:.7`；
  3. 白色符号 `<g color="var(--dsw-static-neutral-00)">`，部分类型带固定缩放 transform。
- 默认 `size = 28`；DSH 卡片里用 `size: 20`，文件列表行用 `size: 16`。
- 类型色（`dsh-web-frontend/dist/assets/index-BNYAYEM7.css`，`.fic-*` 同款规则）：

| 类型 | token | 值 |
| --- | --- | --- |
| `code` | `--dsw-static-deepseek-500` | `#4176e6` |
| `html` | `--dsw-static-deepseek-500` | `#4176e6` |
| `markdown` | `--dsw-static-deepseek-500` | `#4176e6` |
| `word` | `--dsw-static-deepseek-450` | `#5686fe` |
| `excel` | `--dsw-static-green-500` | `#22c55e` |
| `folder` | `--dsw-static-amber-400` | `#f7ad31` |
| `ppt` | `--dsw-static-amber-500` | `#f59e0b` |
| `pdf` | `--dsw-static-red-600` | `#ec1313` |
| `image` | `--dsh-file-type-violet` | `rgb(139,118,246)`（**不是 theme token，来自 web 产物**） |
| `video` | `--dsh-file-type-violet` | 同上 |
| `other` | `--dsw-static-neutral-bluish-300` | `#cfd3d6`（折角改用 `neutral-400`） |

- 扩展名 → 类型（`dsh-web-frontend` bundle 内 `RA` 表）：`doc/docx/rtf/odt/pages→word`；`xls/xlsx/xlsm/xlsb/xlt/xltx/xltm/ods/ots/fods/numbers/csv/tsv→excel`；`ppt/pptx/key→ppt`；`pdf→pdf`；`png/jpg/jpeg/gif/svg/webp/avif/bmp/ico/tif/tiff/heic/heif→image`；`mp4/mov/m4v/webm/mkv/avi/mpg/mpeg→video`；`md/mdx/markdown→markdown`；`html/htm→html`；其余代码后缀（ts/js/py/go/rs/… 共 49 种）→`code`；读不到→`other`。

### 5.3 压缩包图标（需求里的 zip/rar）

**DSH 的文件类型图标里没有 archive/zip**，`classifyFileType("a.zip")` 的返回值就是 `other`（中性灰页面）。建议：

- 首选：直接用 `other`，压缩包的事实由副信息里的后缀（`ZIP`）表达；
- 次选：用 DSH 的线性 UI 图标 `IconArchiveOutlineRegular`（15px 场合使用），但它同样只在 web 打包产物里，**没有可读源码路径**，不建议为此去抠压缩代码。

**不要**为了压缩包引入新图标库/icon font——会立刻不像 DSH（DSH 是实心彩色页面 + 描边线性 UI 图标混用，且线性图标统一 15px/1.2-ish stroke）。

### 5.4 可直接内联的代码（逐字取自 bundle，28×28）

```html
<script>
// DSH FileTypeIcon 复刻：28x28 实心页面 + 折角 + 白色符号，路径逐字取自 DSH web 打包产物
const DSH_ICON = {
  body: 'M8.48924 28H19.5108C21.6479 28 22.7165 28 23.5594 27.6509C24.6833 27.1853 25.5762 26.2924 26.0417 25.1685C26.3909 24.3256 26.3909 23.257 26.3909 21.1199V8.79443C26.3909 8.32877 26.3909 8.09593 26.3471 7.87507C26.2887 7.58058 26.173 7.30042 26.0067 7.05048C25.882 6.86303 25.7177 6.69799 25.3893 6.36792L20.0611 1.01354C19.7304 0.681235 19.5651 0.515081 19.3769 0.38885C19.126 0.220541 18.8443 0.103463 18.5481 0.0443412C18.3259 0 18.0915 0 17.6226 0H8.48924C6.35209 0 5.28351 0 4.4406 0.349145C3.31672 0.814671 2.4238 1.70759 1.95828 2.83147C1.60913 3.67438 1.60913 4.74296 1.60913 6.88011V21.1199C1.60913 23.257 1.60913 24.3256 1.95828 25.1685C2.4238 26.2924 3.31672 27.1853 4.4406 27.6509C5.28351 28 6.35209 28 8.48924 28Z',
  fold: 'M26.3909 7.37445L19.0525 0V3.77445C19.0525 4.89271 19.0525 5.45184 19.2352 5.89289C19.4788 6.48096 19.946 6.94818 20.5341 7.19176C20.9751 7.37445 21.5342 7.37445 22.6525 7.37445H26.3909Z',
  folder: 'M2.80078 10.2112C2.80078 9.52802 2.80078 9.18642 2.85314 8.866C2.98648 8.05 3.36942 7.29538 3.94925 6.70595C4.17694 6.4745 4.45264 6.2728 5.00404 5.86939C5.29197 5.65874 5.43594 5.55342 5.58711 5.46632C5.97089 5.24521 6.39638 5.10618 6.83667 5.05803C7.01011 5.03906 7.18849 5.03906 7.54524 5.03906H11.6543C12.4669 5.03906 12.8732 5.03906 13.2599 5.13697C13.3882 5.16945 13.5143 5.20986 13.6375 5.25795C14.0091 5.40294 14.3398 5.63902 15.0012 6.1112L16.2632 7.01224C16.5526 7.21881 16.6972 7.3221 16.8598 7.38553C16.9137 7.40657 16.9689 7.42425 17.025 7.43846C17.1942 7.4813 17.372 7.4813 17.7275 7.4813H19.8008C22.0506 7.4813 23.1755 7.4813 23.9641 8.05425C24.2188 8.23928 24.4428 8.46326 24.6278 8.71794C25.2008 9.50654 25.2008 10.6315 25.2008 12.8813V18.7283C25.2008 20.9781 25.2008 22.1031 24.6278 22.8917C24.4428 23.1463 24.2188 23.3703 23.9641 23.5554C23.1755 24.1283 22.0506 24.1283 19.8008 24.1283H8.20077C5.95094 24.1283 4.82602 24.1283 4.03743 23.5554C3.78274 23.3703 3.55877 23.1463 3.37373 22.8917C2.80078 22.1031 2.80078 20.9781 2.80078 18.7283V10.2112Z',
  excelMark: 'M14 11.5H11.4C10.5599 11.5 10.1399 11.5 9.81901 11.6635C9.53677 11.8073 9.3073 12.0368 9.16349 12.319C9 12.6399 9 13.0599 9 13.9V16.5M14 11.5H16.6C17.4401 11.5 17.8601 11.5 18.181 11.6635C18.4632 11.8073 18.6927 12.0368 18.8365 12.319C19 12.6399 19 13.0599 19 13.9V16.5M14 11.5V21.5M14 21.5H16.6C17.4401 21.5 17.8601 21.5 18.181 21.3365C18.4632 21.1927 18.6927 20.9632 18.8365 20.681C19 20.3601 19 19.9401 19 19.1V16.5M14 21.5H11.4C10.5599 21.5 10.1399 21.5 9.81901 21.3365C9.53677 21.1927 9.3073 20.9632 9.16349 20.681C9 20.3601 9 19.9401 9 19.1V16.5M19 16.5H9',
  mark: {
    word: { transform: 'translate(14 16) scale(1.22) translate(-14 -16)', path: '<path d="M10.5118 20.5L8.24179 13.5H10.2818L12.1918 19.56H11.1618L13.1718 13.5H14.9918L16.8918 19.56H15.9018L17.8718 13.5H19.7618L17.4918 20.5H15.3718L13.7518 15.35H14.3218L12.6318 20.5H10.5118Z" fill="currentColor"/>' },
    pdf: { transform: 'translate(14 16) scale(1.22) translate(-14 -16)', path: '<path d="M6.80616 19.5V14.6H9.04616C9.49416 14.6 9.87916 14.6723 10.2012 14.817C10.5278 14.9617 10.7798 15.1717 10.9572 15.447C11.1345 15.7177 11.2232 16.0397 11.2232 16.413C11.2232 16.7817 11.1345 17.1013 10.9572 17.372C10.7798 17.6427 10.5278 17.8527 10.2012 18.002C9.87916 18.1467 9.49416 18.219 9.04616 18.219H7.57616L8.19216 17.617V19.5H6.80616ZM8.19216 17.764L7.57616 17.127H8.96216C9.2515 17.127 9.46616 17.064 9.60616 16.938C9.75083 16.812 9.82316 16.637 9.82316 16.413C9.82316 16.1843 9.75083 16.007 9.60616 15.881C9.46616 15.755 9.2515 15.692 8.96216 15.692H7.57616L8.19216 15.055V17.764ZM11.8989 19.5V14.6H14.2159C14.7573 14.6 15.2333 14.7003 15.6439 14.901C16.0546 15.1017 16.3743 15.384 16.6029 15.748C16.8363 16.112 16.9529 16.546 16.9529 17.05C16.9529 17.5493 16.8363 17.9833 16.6029 18.352C16.3743 18.716 16.0546 18.9983 15.6439 19.199C15.2333 19.3997 14.7573 19.5 14.2159 19.5H11.8989ZM13.2849 18.394H14.1599C14.4399 18.394 14.6826 18.3427 14.8879 18.24C15.0979 18.1327 15.2613 17.9787 15.3779 17.778C15.4946 17.5727 15.5529 17.33 15.5529 17.05C15.5529 16.7653 15.4946 16.5227 15.3779 16.322C15.2613 16.1213 15.0979 15.9697 14.8879 15.867C14.6826 15.7597 14.4399 15.706 14.1599 15.706H13.2849V18.394ZM17.6821 19.5V14.6H21.5251V15.671H19.0681V19.5H17.6821ZM18.9701 17.82V16.749H21.2311V17.82H18.9701Z" fill="currentColor"/>' },
    ppt: { transform: 'translate(14 16) scale(1.22) translate(-14 -16)', path: '<path d="M11.0132 20.5V13.5H14.2132C14.8532 13.5 15.4032 13.6033 15.8632 13.81C16.3299 14.0167 16.6899 14.3167 16.9432 14.71C17.1966 15.0967 17.3232 15.5567 17.3232 16.09C17.3232 16.6167 17.1966 17.0733 16.9432 17.46C16.6899 17.8467 16.3299 18.1467 15.8632 18.36C15.4032 18.5667 14.8532 18.67 14.2132 18.67H12.1132L12.9932 17.81V20.5H11.0132ZM12.9932 18.02L12.1132 17.11H14.0932C14.5066 17.11 14.8132 17.02 15.0132 16.84C15.2199 16.66 15.3232 16.41 15.3232 16.09C15.3232 15.7633 15.2199 15.51 15.0132 15.33C14.8132 15.15 14.5066 15.06 14.0932 15.06H12.1132L12.9932 14.15V18.02Z" fill="currentColor"/>' },
    image: { transform: 'translate(14 16) scale(1.12) translate(-14 -16)', path: '<path d="M10.4212 15.9204C10.5756 15.6558 10.9579 15.6558 11.1123 15.9204L13.6493 20.2696C13.8048 20.5362 13.6125 20.8711 13.3037 20.8711H8.22974C7.92102 20.8711 7.72868 20.5362 7.88423 20.2696L10.4212 15.9204Z" fill="currentColor"/><path d="M15.4981 13.186C15.6505 12.9117 16.0451 12.9117 16.1975 13.186L20.1368 20.2769C20.2849 20.5435 20.0922 20.8711 19.7872 20.8711H11.9084C11.6034 20.8711 11.4107 20.5435 11.5588 20.2769L15.4981 13.186Z" fill="currentColor"/><path d="M11.8603 11.3997C11.8603 12.286 11.1418 13.0045 10.2555 13.0045C9.36924 13.0045 8.65076 12.286 8.65076 11.3997C8.65076 10.5134 9.36924 9.79492 10.2555 9.79492C11.1418 9.79492 11.8603 10.5134 11.8603 11.3997Z" fill="currentColor"/>' },
    video: { transform: 'translate(14 16) scale(1.12) translate(-14 -16)', path: '<path d="M17.5 14.634C18.1667 15.0189 18.1667 15.9811 17.5 16.366L11.5 19.8301C10.8333 20.215 10 19.7339 10 18.9641L10 12.0359C10 11.2661 10.8333 10.785 11.5 11.1699L17.5 14.634Z" fill="currentColor"/>' },
    code: { transform: '', path: '<path d="M10.0053 13.126L7.0236 16.3788C6.96052 16.4476 6.96052 16.5532 7.0236 16.622L10.0053 19.8748" stroke="currentColor" stroke-width="1.35"/><path d="M17.9941 13.126L20.9759 16.3788C21.039 16.4476 21.039 16.5532 20.9759 16.622L17.9941 19.8748" stroke="currentColor" stroke-width="1.35"/><path d="M15.2652 12.957L12.7344 20.0433" stroke="currentColor" stroke-width="1.35"/>' },
    markdown: { transform: 'translate(14 16) scale(1.22) translate(-14 -16)', path: '<path d="M8.7588 19.5V14.6H9.8998L11.9298 17.932H11.3278L13.3018 14.6H14.4428L14.4568 19.5H13.1828L13.1688 16.539H13.3858L11.9088 19.017H11.2928L9.7738 16.539H10.0398V19.5H8.7588ZM15.4375 19.5V14.6H17.7545C18.2958 14.6 18.7718 14.7003 19.1825 14.901C19.5932 15.1017 19.9128 15.384 20.1415 15.748C20.3748 16.112 20.4915 16.546 20.4915 17.05C20.4915 17.5493 20.3748 17.9833 20.1415 18.352C19.9128 18.716 19.5932 18.9983 19.1825 19.199C18.7718 19.3997 18.2958 19.5 17.7545 19.5H15.4375ZM16.8235 18.394H17.6985C17.9785 18.394 18.2212 18.3427 18.4265 18.24C18.6365 18.1327 18.7998 17.9787 18.9165 17.778C19.0332 17.5727 19.0915 17.33 19.0915 17.05C19.0915 16.7653 19.0332 16.5227 18.9165 16.322C18.7998 16.1213 18.6365 15.9697 18.4265 15.867C18.2212 15.7597 17.9785 15.706 17.6985 15.706H16.8235V18.394Z" fill="currentColor"/>' },
    html: { transform: 'translate(14 16) scale(1.12) translate(-14 -16)', path: '<path fill-rule="evenodd" clip-rule="evenodd" d="M13.9994 9.68298C17.212 9.68298 19.8167 12.2872 19.8168 15.4997C19.8168 18.7123 17.2121 21.3171 13.9994 21.3171C10.7869 21.3169 8.18274 18.7122 8.18274 15.4997C8.1829 12.2873 10.787 9.68315 13.9994 9.68298ZM9.26213 16.0247C9.47025 17.9241 10.7936 19.4876 12.5639 20.0463C12.42 19.7977 12.2952 19.5152 12.1879 19.2116C11.885 18.3541 11.693 17.2434 11.6424 16.0247H9.26213ZM16.3565 16.0247C16.3059 17.2434 16.1145 18.3542 15.8116 19.2116C15.7044 19.5151 15.5788 19.7971 15.435 20.0456C17.2054 19.487 18.5293 17.9242 18.7374 16.0247H16.3565ZM12.6938 16.0247C12.7439 17.1459 12.9212 18.1334 13.1784 18.8616C13.332 19.2962 13.503 19.61 13.6686 19.805C13.834 19.9996 13.9473 20.0256 13.9994 20.0258C14.0514 20.0258 14.1651 20.0002 14.331 19.805C14.4966 19.61 14.6676 19.2962 14.8211 18.8616C15.0784 18.1334 15.2557 17.1459 15.3058 16.0247H12.6938ZM13.9994 10.733C13.9473 10.7331 13.834 10.7598 13.6686 10.9545C13.503 11.1494 13.3319 11.4633 13.1784 11.8978C12.903 12.6777 12.7188 13.7545 12.6849 14.9747H15.3147C15.2808 13.7545 15.0966 12.6777 14.8211 11.8978C14.6676 11.4633 14.4965 11.1494 14.331 10.9545C14.1651 10.7593 14.0514 10.733 13.9994 10.733ZM15.5888 11.0051C15.6701 11.1756 15.7444 11.3576 15.8116 11.5478C16.1343 12.4613 16.3308 13.6619 16.3647 14.9747H18.7374C18.5352 13.1307 17.2817 11.6036 15.5888 11.0051ZM12.4101 11.0051C10.7174 11.6037 9.46428 13.1308 9.26213 14.9747H11.6349C11.6688 13.6619 11.8652 12.4613 12.1879 11.5478C12.2551 11.3577 12.3288 11.1756 12.4101 11.0051Z" fill="currentColor"/>' },
  }
};
function dshFileIcon(type, size = 16) {
  const head = `<svg class="fic fic-${type}" width="${size}" height="${size}" viewBox="0 0 28 28" fill="none" aria-hidden="true">`;
  if (type === 'folder') return head + `<path d="${DSH_ICON.folder}" fill="currentColor"/>` +
    '<g color="var(--dsw-static-neutral-00)" transform="translate(14 13.0693) scale(1.12) translate(-14 -13.0693)">' +
    '<path d="M6.31445 13.0693H21.6893" stroke="currentColor" stroke-width="2.38"/></g></svg>';
  const fold = type === 'other'
    ? `<path d="${DSH_ICON.fold}" fill="var(--dsw-static-neutral-400)"/>`
    : `<path d="${DSH_ICON.fold}" fill="var(--dsw-static-neutral-00)" fill-opacity=".7"/>`;
  let mark = '';
  if (type === 'excel') mark = `<g color="var(--dsw-static-neutral-00)"><path d="${DSH_ICON.excelMark}" stroke="currentColor" stroke-width="1.2" fill="none"/></g>`;
  else if (type !== 'other') mark = `<g color="var(--dsw-static-neutral-00)" transform="${DSH_ICON.mark[type].transform}">${DSH_ICON.mark[type].path}</g>`;
  return head + `<path d="${DSH_ICON.body}" fill="currentColor"/>` + fold + mark + '</svg>';
}
</script>

<style>
.fic{--dsh-file-type-violet:rgb(139,118,246);color:var(--dsh-file-type-icon-color,var(--dsh-file-type-default-color));flex:none}
.fic-code{--dsh-file-type-default-color:var(--dsw-static-deepseek-500)}
.fic-excel{--dsh-file-type-default-color:var(--dsw-static-green-500)}
.fic-folder{--dsh-file-type-default-color:var(--dsw-static-amber-400)}
.fic-html{--dsh-file-type-default-color:var(--dsw-static-deepseek-500)}
.fic-image{--dsh-file-type-default-color:var(--dsh-file-type-violet)}
.fic-markdown{--dsh-file-type-default-color:var(--dsw-static-deepseek-500)}
.fic-other{--dsh-file-type-default-color:var(--dsw-static-neutral-bluish-300)}
.fic-pdf{--dsh-file-type-default-color:var(--dsw-static-red-600)}
.fic-ppt{--dsh-file-type-default-color:var(--dsw-static-amber-500)}
.fic-video{--dsh-file-type-default-color:var(--dsh-file-type-violet)}
.fic-word{--dsh-file-type-default-color:var(--dsw-static-deepseek-450)}
</style>
```

用法：`dshFileIcon('pdf', 20)` 返回 SVG 字符串；列表行用 16，卡片图标底框（40×40）用 20，文件图标展示用 28。**前提：页面已加载 `docs/tokens.css`**（类型色引用 `--dsw-static-*`，不加载会退化成黑色）。

---

## 6. 「照这个做」的落地建议

1. **宽度与容器**：右栏实际范围 300–420px（默认约 45% 视口），原型做 **360–380px** 最稳。tab strip 由 DSH 提供（38px 高、tab 28px、激活底 `--dsw-alias-markdown-tag`），**不要再画一层标题栏/外框**；tab body 背景直接 `--dsw-alias-bg-base`。若原型是独立浮层，用 `border-radius: var(--dsw-radius-lg)` + `.5px solid var(--dsw-alias-border-l3)` + `--dsw-shadow-lv2`，仅此一层。
2. **头 + 搜索**：子 header 精确照 `sidebar-files`：`height:38px; padding:0 6px 0 16px; border-bottom:.5px solid var(--dsw-alias-border-l3)`；标题 13/20/500 + 计数 11px 等宽 tertiary；右侧 28×28 icon button（`radius-sm`，`hover: interactive-bg-hover`，svg 15×15）。搜索行 `padding:6px 12px`，输入框 `height:26px; radius 8px; 1px solid border-l2; background: module-platform; font 12/20`，placeholder tertiary。
3. **列表行（核心）**：两行制行高 **40px**（或单行 32px），`padding:5px 10px`、`border-radius: var(--dsw-radius-md)`、`gap:8px`，**只有 hover 背景 `--dsw-alias-interactive-bg-hover`（浅 `#2631480f` / 深 `#ffffff14`），不加边框、不加阴影、不做位移**。文件名 13/20 primary 单行省略；副信息（类型 · 大小 · 时间）11/16 `--ds-font-family-code` + `font-variant-numeric: tabular-nums` tertiary；图标 16px（用第 5 节 SVG）。行间**不画分割线**，靠间距；只有分组之间用 `.5px solid var(--dsw-alias-border-l1)`（更弱）或 `border-l2`。
4. **颜色纪律**：主按钮 = `--dsw-alias-button-primary-fill`（浅近黑/深近白）+ `--dsw-alias-label-primary-foreground`，hover 用 `button-primary-hover`；蓝色只出现在 `--dsw-alias-link`、`state-business-primary`、选中态；状态用 `state-success/error/warn-primary`；深色一律 `body[data-ds-dark-theme]` 切换，**禁止** CSS 里用 `prefers-color-scheme` 写死深色（会覆盖用户显式选择）。
5. **空态与密度**：空态照 git-tree `.message`：`padding:32px 24px`、居中、`gap:12px`、图标 24–28px（`label-caption` 或 `label-tertiary`）、标题 13/500 secondary、说明 12/18 tertiary。参考 3.5 节：文件名 13/500、说明 10–11px——**产出物是信息密度型面板，不是营销卡片**；列表不要做成「每行一张带边框圆角卡片」的卡片墙（DSH 的卡片只出现在聊天流里，不在侧栏列表）。

---

## 7. 截图验证（`docs/tokens-demo.html`）

- 命令（本机 Chrome 156.0.8078.80，headless 可用）：
  ```bash
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu --no-sandbox \
    --hide-scrollbars --screenshot=/tmp/tokens-demo.png --window-size=1200,1320 \
    "file://$PWD/docs/tokens-demo.html"
  ```
- 结果：**Chrome 截图可用**，产物 `/tmp/tokens-demo.png`（1200×1320，浅/深两栏 380px 面板并排，含标题/正文/次要文字、搜索框、4 行列表含 1 行 hover、按钮、10 个文件类型图标、空状态、tooltip）。
- 截图后修掉/确认的问题：
  1. **深色 tooltip 一开始几乎看不见**：首版用了 `label-primary-inverted`（深色下 `#353638` 压在 `#43454a` 上）。核对 bundle 后 DSH 的全局 tooltip 是 `padding:3px 7px; radius-sm; background:tooltip-bg; color:var(--dsw-static-neutral-bluish-00); font 13/20` —— **tooltip 文字在两套主题下都是固定白色**，已改正。
  2. **深色色板不能只抄浅色**：`--dsw-static-neutral-bluish-60` 浅 `#f5f6f7` / 深 `#f9fafb`，影响 count 徽标、搜索底、`bg-module-platform`；已两套都写入。
  3. **文件类型图标必须带白色符号**：首版漏了 ppt/html 的符号、excel 的 transform 也套错了，截图里表现为「橙色/蓝色空白页面」。改成与 `WA` 逐字一致后正常（见 5.2/5.4）。
  4. 浅色下主按钮是黑底白字、count 徽标几乎与白底同色——这是 DSH 原样，**不要**为了显眼自己加深/换蓝。
- **额外验证了 body 级切换**（真实 DSH 的挂载方式）：`docs/tokens.css` + `<body data-ds-dark-theme>` 时，`getComputedStyle` 得到 `bg=rgb(21,21,23) / label-primary=#f9fafb`，浅色时为 `rgb(255,255,255) / #0f1115`；全屏渲染无白边（截图 `/tmp/body-dark2.png`、`/tmp/body-light.png`，用 `--window-size=500,300`）。
- **未验证项**：320px 窄宽、真实 DSH 内的 tab 注册与切换、Windows 标题栏形态、`prefers-color-scheme` 自动跟随（原型是静态 HTML，没有 Host 偏好）。这些需要在真实 DSH 里跑再确认。

---

## 8. 本次产出文件

| 文件 | 内容 |
| --- | --- |
| `docs/tokens.css` | 663 行，333 个 token；`:root` 浅色 / `[data-ds-dark-theme]` 深色；含字体栈、圆角、阴影、滚动条、焦点环、基础排版；末尾第 11 节是可删的工程化补丁（body 深色时给 html 补底色） |
| `docs/tokens-demo.html` | 单文件（tokens.css 已内联），浅/深并排校验 |
| `docs/research-tokens.md` | 本文 |
| `/tmp/tokens-demo.png` | Chrome headless 截图（仅本机 /tmp，未入库） |
