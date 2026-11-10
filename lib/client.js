window.__ModuleLoader__.load({
	id: "@kulebbb/dsh-output",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		/** 客户端 fetch 用的相对路径：不写死前导 /，兼容子路径挂载 / 反向代理。 */
		const OUTPUTS_ROUTE_RELATIVE = "/api/outputs.list".replace(/^\/+/, "");
		/** 源码类扩展名：present 显式声明的这些文件也展示，并在行上标「源码」。 */
		const SOURCE_EXTS = [
			"ts",
			"tsx",
			"js",
			"jsx",
			"mjs",
			"cjs",
			"json",
			"jsonc",
			"yaml",
			"yml",
			"toml",
			"ini",
			"sh",
			"bash",
			"zsh",
			"fish",
			"ps1",
			"py",
			"rb",
			"go",
			"rs",
			"java",
			"kt",
			"kts",
			"c",
			"h",
			"cc",
			"cpp",
			"hpp",
			"cs",
			"swift",
			"php",
			"sql",
			"css",
			"scss",
			"less",
			"vue",
			"svelte",
			"lua",
			"pl",
			"r",
			"dart"
		];
		// src/client/api.ts
		const FILE_ADDRESS_PREFIX = "dsh-resource://file/";
		/** 客户端请求超时：超过这个时间给可重试错误，而不是一直转圈。 */
		const FETCH_TIMEOUT_MS = 3e4;
		function encodeSegment(segment) {
			return encodeURIComponent(segment).replace(/%3A/gi, ":");
		}
		function isAbsoluteWorkspacePath(path) {
			return path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(path);
		}
		/** `dsh-resource://file/session/<sessionId>/<相对 path>` */
		function sessionFileAddress(sessionId, path) {
			const encodedPath = path.replace(/\\/g, "/").replace(/^(?:\.\/)+/, "").split("/").map(encodeSegment).join("/");
			return `${FILE_ADDRESS_PREFIX}session/${encodeSegment(sessionId)}/${encodedPath}`;
		}
		/** 绝对路径先按会话 cwd 压成相对路径，保证同一文件只有一个 contentId。 */
		function fileAddressFor(sessionId, cwd, path) {
			const normalized = path.replace(/\\/g, "/");
			if (!isAbsoluteWorkspacePath(normalized)) return sessionFileAddress(sessionId, normalized);
			const root = (cwd ?? "").replace(/\\/g, "/").replace(/\/+$/, "");
			if (root !== "" && normalized === root) return sessionFileAddress(sessionId, "");
			if (root !== "" && normalized.startsWith(`${root}/`)) return sessionFileAddress(sessionId, normalized.slice(root.length + 1));
			return sessionFileAddress(sessionId, normalized);
		}
		var OutputsRequestError = class extends Error {
			code;
			status;
			constructor(message, code, status) {
				super(message);
				this.name = "OutputsRequestError";
				this.code = code;
				this.status = status;
			}
		};
		/**
		* 为一个会话创建面板用的 api。闭包持有最近一次 payload 的 cwd，用来把相对路径还原成绝对路径。
		*/
		function createOutputsApi(ctx, sessionId) {
			let lastCwd = null;
			const absoluteOf = (relOrAbsolute) => {
				if (isAbsoluteWorkspacePath(relOrAbsolute)) return relOrAbsolute;
				const root = (lastCwd ?? "").replace(/[/\\]+$/, "");
				if (!root) return relOrAbsolute;
				return `${root}/${relOrAbsolute.replace(/^[/\\]+/, "")}`;
			};
			return {
				async load(options) {
					const query = `sessionId=${encodeURIComponent(sessionId)}${options?.refresh ? "&refresh=1" : ""}`;
					const timeout = new AbortController();
					const timer = setTimeout(() => timeout.abort(), FETCH_TIMEOUT_MS);
					const signal = options?.signal ? AbortSignal.any([options.signal, timeout.signal]) : timeout.signal;
					let response;
					try {
						response = await fetch(`${OUTPUTS_ROUTE_RELATIVE}?${query}`, {
							signal,
							credentials: "same-origin",
							headers: { accept: "application/json" }
						});
					} catch (error) {
						if (options?.signal?.aborted) throw error;
						if (timeout.signal.aborted) throw new OutputsRequestError("Request timed out.", "timeout", 0);
						throw error;
					} finally {
						clearTimeout(timer);
					}
					const body = await response.json().catch(() => null);
					if (!response.ok) {
						const error = body?.error;
						throw new OutputsRequestError(error?.message ?? `outputs request failed (${response.status})`, error?.code ?? "internal", response.status);
					}
					const payload = body;
					lastCwd = payload.cwd;
					return payload;
				},
				isRunning() {
					return ctx.sessions.list.getSnapshot().byId[sessionId]?.running === true;
				},
				openPreview(rel) {
					const address = fileAddressFor(sessionId, lastCwd, rel);
					ctx.sidebarRight?.openResource(address);
				},
				async openNative(rel, action) {
					const session = ctx.remote?.session;
					if (!session) return false;
					const path = absoluteOf(rel);
					try {
						return (await session.openWorkspacePath(action === "reveal" ? {
							path,
							action
						} : { path }))?.ok === true;
					} catch {
						return false;
					}
				},
				async canOpenDesktop() {
					const session = ctx.remote?.session;
					if (!session) return false;
					try {
						const result = await session.canOpenWorkspacePath();
						return result?.ok === true && result.value === true;
					} catch {
						return false;
					}
				}
			};
		}
		// src/client/polling.ts
		function createAutoRefresher(options) {
			const schedule = options.setInterval ?? ((handler, timeout) => globalThis.setInterval(handler, timeout));
			const cancel = options.clearInterval ?? ((handle) => globalThis.clearInterval(handle));
			let handle = null;
			let previousRunning = safeIsRunning(options);
			return {
				start() {
					if (handle !== null) return;
					handle = schedule(() => this.tick(), options.intervalMs);
				},
				stop() {
					if (handle !== null) {
						cancel(handle);
						handle = null;
					}
				},
				tick() {
					const running = safeIsRunning(options);
					const shouldLoad = running || previousRunning && !running;
					previousRunning = running;
					const state = {
						running,
						shouldLoad
					};
					options.onTick(state);
					return state;
				}
			};
		}
		function safeIsRunning(options) {
			try {
				return options.isRunning() === true;
			} catch {
				return false;
			}
		}
		// src/client/icons.tsx
		/**
		* 面板用到的全部 inline SVG 图标。
		*
		* - `FileTypeIcon`：DSH 文件类型图标（28×28 实心页面 + 折角 + 白色符号），路径逐字取自
		*   DSH web 打包产物，见 `prototype/icons.js` / `docs/research-tokens.md` §5。
		* - 其余是 16×16 线性小图标（搜索、关闭、刷新、信息、打开、定位），取自阶段 1 原型。
		*
		* 颜色全部走 CSS 类（`dsout-fic-*`）与 `currentColor`，主题由 DSH 的 token 自动切换。
		*/
		/** 28×28 实心页面主体（DSH FileTypeIcon 逐字路径）。 */
		const ICON_BODY = "M8.48924 28H19.5108C21.6479 28 22.7165 28 23.5594 27.6509C24.6833 27.1853 25.5762 26.2924 26.0417 25.1685C26.3909 24.3256 26.3909 23.257 26.3909 21.1199V8.79443C26.3909 8.32877 26.3909 8.09593 26.3471 7.87507C26.2887 7.58058 26.173 7.30042 26.0067 7.05048C25.882 6.86303 25.7177 6.69799 25.3893 6.36792L20.0611 1.01354C19.7304 0.681235 19.5651 0.515081 19.3769 0.38885C19.126 0.220541 18.8443 0.103463 18.5481 0.0443412C18.3259 0 18.0915 0 17.6226 0H8.48924C6.35209 0 5.28351 0 4.4406 0.349145C3.31672 0.814671 2.4238 1.70759 1.95828 2.83147C1.60913 3.67438 1.60913 4.74296 1.60913 6.88011V21.1199C1.60913 23.257 1.60913 24.3256 1.95828 25.1685C2.4238 26.2924 3.31672 27.1853 4.4406 27.6509C5.28351 28 6.35209 28 8.48924 28Z";
		/** 页面右上折角。 */
		const ICON_FOLD = "M26.3909 7.37445L19.0525 0V3.77445C19.0525 4.89271 19.0525 5.45184 19.2352 5.89289C19.4788 6.48096 19.946 6.94818 20.5341 7.19176C20.9751 7.37445 21.5342 7.37445 22.6525 7.37445H26.3909Z";
		const MARK_BY_TYPE = {
			html: {
				transform: "translate(14 16) scale(1.12) translate(-14 -16)",
				paths: [{
					d: "M13.9994 9.68298C17.212 9.68298 19.8167 12.2872 19.8168 15.4997C19.8168 18.7123 17.2121 21.3171 13.9994 21.3171C10.7869 21.3169 8.18274 18.7122 8.18274 15.4997C8.1829 12.2873 10.787 9.68315 13.9994 9.68298ZM9.26213 16.0247C9.47025 17.9241 10.7936 19.4876 12.5639 20.0463C12.42 19.7977 12.2952 19.5152 12.1879 19.2116C11.885 18.3541 11.693 17.2434 11.6424 16.0247H9.26213ZM16.3565 16.0247C16.3059 17.2434 16.1145 18.3542 15.8116 19.2116C15.7044 19.5151 15.5788 19.7971 15.435 20.0456C17.2054 19.487 18.5293 17.9242 18.7374 16.0247H16.3565ZM12.6938 16.0247C12.7439 17.1459 12.9212 18.1334 13.1784 18.8616C13.332 19.2962 13.503 19.61 13.6686 19.805C13.834 19.9996 13.9473 20.0256 13.9994 20.0258C14.0514 20.0258 14.1651 20.0002 14.331 19.805C14.4966 19.61 14.6676 19.2962 14.8211 18.8616C15.0784 18.1334 15.2557 17.1459 15.3058 16.0247H12.6938ZM13.9994 10.733C13.9473 10.7331 13.834 10.7598 13.6686 10.9545C13.503 11.1494 13.3319 11.4633 13.1784 11.8978C12.903 12.6777 12.7188 13.7545 12.6849 14.9747H15.3147C15.2808 13.7545 15.0966 12.6777 14.8211 11.8978C14.6676 11.4633 14.4965 11.1494 14.331 10.9545C14.1651 10.7593 14.0514 10.733 13.9994 10.733ZM15.5888 11.0051C15.6701 11.1756 15.7444 11.3576 15.8116 11.5478C16.1343 12.4613 16.3308 13.6619 16.3647 14.9747H18.7374C18.5352 13.1307 17.2817 11.6036 15.5888 11.0051ZM12.4101 11.0051C10.7174 11.6037 9.46428 13.1308 9.26213 14.9747H11.6349C11.6688 13.6619 11.8652 12.4613 12.1879 11.5478C12.2551 11.3577 12.3288 11.1756 12.4101 11.0051Z",
					fill: "currentColor",
					fillRule: "evenodd",
					clipRule: "evenodd"
				}]
			},
			markdown: {
				transform: "translate(14 16) scale(1.22) translate(-14 -16)",
				paths: [{
					d: "M8.7588 19.5V14.6H9.8998L11.9298 17.932H11.3278L13.3018 14.6H14.4428L14.4568 19.5H13.1828L13.1688 16.539H13.3858L11.9088 19.017H11.2928L9.7738 16.539H10.0398V19.5H8.7588ZM15.4375 19.5V14.6H17.7545C18.2958 14.6 18.7718 14.7003 19.1825 14.901C19.5932 15.1017 19.9128 15.384 20.1415 15.748C20.3748 16.112 20.4915 16.546 20.4915 17.05C20.4915 17.5493 20.3748 17.9833 20.1415 18.352C19.9128 18.716 19.5932 18.9983 19.1825 19.199C18.7718 19.3997 18.2958 19.5 17.7545 19.5H15.4375ZM16.8235 18.394H17.6985C17.9785 18.394 18.2212 18.3427 18.4265 18.24C18.6365 18.1327 18.7998 17.9787 18.9165 17.778C19.0332 17.5727 19.0915 17.33 19.0915 17.05C19.0915 16.7653 19.0332 16.5227 18.9165 16.322C18.7998 16.1213 18.6365 15.9697 18.4265 15.867C18.2212 15.7597 17.9785 15.706 17.6985 15.706H16.8235V18.394Z",
					fill: "currentColor"
				}]
			},
			word: {
				transform: "translate(14 16) scale(1.22) translate(-14 -16)",
				paths: [{
					d: "M10.5118 20.5L8.24179 13.5H10.2818L12.1918 19.56H11.1618L13.1718 13.5H14.9918L16.8918 19.56H15.9018L17.8718 13.5H19.7618L17.4918 20.5H15.3718L13.7518 15.35H14.3218L12.6318 20.5H10.5118Z",
					fill: "currentColor"
				}]
			},
			excel: {
				transform: "",
				paths: [{
					d: "M14 11.5H11.4C10.5599 11.5 10.1399 11.5 9.81901 11.6635C9.53677 11.8073 9.3073 12.0368 9.16349 12.319C9 12.6399 9 13.0599 9 13.9V16.5M14 11.5H16.6C17.4401 11.5 17.8601 11.5 18.181 11.6635C18.4632 11.8073 18.6927 12.0368 18.8365 12.319C19 12.6399 19 13.0599 19 13.9V16.5M14 11.5V21.5M14 21.5H16.6C17.4401 21.5 17.8601 21.5 18.181 21.3365C18.4632 21.1927 18.6927 20.9632 18.8365 20.681C19 20.3601 19 19.9401 19 19.1V16.5M14 21.5H11.4C10.5599 21.5 10.1399 21.5 9.81901 21.3365C9.53677 21.1927 9.3073 20.9632 9.16349 20.681C9 20.3601 9 19.9401 9 19.1V16.5M19 16.5H9",
					fill: "none",
					stroke: "currentColor",
					strokeWidth: 1.2
				}]
			},
			ppt: {
				transform: "translate(14 16) scale(1.22) translate(-14 -16)",
				paths: [{
					d: "M11.0132 20.5V13.5H14.2132C14.8532 13.5 15.4032 13.6033 15.8632 13.81C16.3299 14.0167 16.6899 14.3167 16.9432 14.71C17.1966 15.0967 17.3232 15.5567 17.3232 16.09C17.3232 16.6167 17.1966 17.0733 16.9432 17.46C16.6899 17.8467 16.3299 18.1467 15.8632 18.36C15.4032 18.5667 14.8532 18.67 14.2132 18.67H12.1132L12.9932 17.81V20.5H11.0132ZM12.9932 18.02L12.1132 17.11H14.0932C14.5066 17.11 14.8132 17.02 15.0132 16.84C15.2199 16.66 15.3232 16.41 15.3232 16.09C15.3232 15.7633 15.2199 15.51 15.0132 15.33C14.8132 15.15 14.5066 15.06 14.0932 15.06H12.1132L12.9932 14.15V18.02Z",
					fill: "currentColor"
				}]
			},
			pdf: {
				transform: "translate(14 16) scale(1.22) translate(-14 -16)",
				paths: [{
					d: "M6.80616 19.5V14.6H9.04616C9.49416 14.6 9.87916 14.6723 10.2012 14.817C10.5278 14.9617 10.7798 15.1717 10.9572 15.447C11.1345 15.7177 11.2232 16.0397 11.2232 16.413C11.2232 16.7817 11.1345 17.1013 10.9572 17.372C10.7798 17.6427 10.5278 17.8527 10.2012 18.002C9.87916 18.1467 9.49416 18.219 9.04616 18.219H7.57616L8.19216 17.617V19.5H6.80616ZM8.19216 17.764L7.57616 17.127H8.96216C9.2515 17.127 9.46616 17.064 9.60616 16.938C9.75083 16.812 9.82316 16.637 9.82316 16.413C9.82316 16.1843 9.75083 16.007 9.60616 15.881C9.46616 15.755 9.2515 15.692 8.96216 15.692H7.57616L8.19216 15.055V17.764ZM11.8989 19.5V14.6H14.2159C14.7573 14.6 15.2333 14.7003 15.6439 14.901C16.0546 15.1017 16.3743 15.384 16.6029 15.748C16.8363 16.112 16.9529 16.546 16.9529 17.05C16.9529 17.5493 16.8363 17.9833 16.6029 18.352C16.3743 18.716 16.0546 18.9983 15.6439 19.199C15.2333 19.3997 14.7573 19.5 14.2159 19.5H11.8989ZM13.2849 18.394H14.1599C14.4399 18.394 14.6826 18.3427 14.8879 18.24C15.0979 18.1327 15.2613 17.9787 15.3779 17.778C15.4946 17.5727 15.5529 17.33 15.5529 17.05C15.5529 16.7653 15.4946 16.5227 15.3779 16.322C15.2613 16.1213 15.0979 15.9697 14.8879 15.867C14.6826 15.7597 14.4399 15.706 14.1599 15.706H13.2849V18.394ZM17.6821 19.5V14.6H21.5251V15.671H19.0681V19.5H17.6821ZM18.9701 17.82V16.749H21.2311V17.82H18.9701Z",
					fill: "currentColor"
				}]
			},
			image: {
				transform: "translate(14 16) scale(1.12) translate(-14 -16)",
				paths: [
					{
						d: "M10.4212 15.9204C10.5756 15.6558 10.9579 15.6558 11.1123 15.9204L13.6493 20.2696C13.8048 20.5362 13.6125 20.8711 13.3037 20.8711H8.22974C7.92102 20.8711 7.72868 20.5362 7.88423 20.2696L10.4212 15.9204Z",
						fill: "currentColor"
					},
					{
						d: "M15.4981 13.186C15.6505 12.9117 16.0451 12.9117 16.1975 13.186L20.1368 20.2769C20.2849 20.5435 20.0922 20.8711 19.7872 20.8711H11.9084C11.6034 20.8711 11.4107 20.5435 11.5588 20.2769L15.4981 13.186Z",
						fill: "currentColor"
					},
					{
						d: "M11.8603 11.3997C11.8603 12.286 11.1418 13.0045 10.2555 13.0045C9.36924 13.0045 8.65076 12.286 8.65076 11.3997C8.65076 10.5134 9.36924 9.79492 10.2555 9.79492C11.1418 9.79492 11.8603 10.5134 11.8603 11.3997Z",
						fill: "currentColor"
					}
				]
			},
			video: {
				transform: "translate(14 16) scale(1.12) translate(-14 -16)",
				paths: [{
					d: "M17.5 14.634C18.1667 15.0189 18.1667 15.9811 17.5 16.366L11.5 19.8301C10.8333 20.215 10 19.7339 10 18.9641L10 12.0359C10 11.2661 10.8333 10.785 11.5 11.1699L17.5 14.634Z",
					fill: "currentColor"
				}]
			},
			code: {
				transform: "",
				paths: [
					{
						d: "M10.0053 13.126L7.0236 16.3788C6.96052 16.4476 6.96052 16.5532 7.0236 16.622L10.0053 19.8748",
						stroke: "currentColor",
						strokeWidth: 1.35
					},
					{
						d: "M17.9941 13.126L20.9759 16.3788C21.039 16.4476 21.039 16.5532 20.9759 16.622L17.9941 19.8748",
						stroke: "currentColor",
						strokeWidth: 1.35
					},
					{
						d: "M15.2652 12.957L12.7344 20.0433",
						stroke: "currentColor",
						strokeWidth: 1.35
					}
				]
			}
		};
		/** 交付白名单扩展名 → DSH 图标类型；白名单外的源码类文件走 `code`。 */
		const ICON_TYPE_BY_EXT = {
			html: "html",
			htm: "html",
			md: "markdown",
			docx: "word",
			xlsx: "excel",
			csv: "excel",
			pptx: "ppt",
			pdf: "pdf",
			png: "image",
			jpg: "image",
			jpeg: "image",
			webp: "image",
			gif: "image",
			svg: "image",
			mp4: "video",
			mov: "video",
			zip: "other",
			mp3: "other",
			wav: "other",
			txt: "other"
		};
		/** 扩展名（小写、不含点）→ 图标类型。 */
		function fileTypeFromExt(ext) {
			const normalized = ext.toLowerCase();
			return ICON_TYPE_BY_EXT[normalized] ?? (SOURCE_EXTS.includes(normalized) ? "code" : "other");
		}
		/** DSH 文件类型图标：实心页面 + 折角 + 白色符号。 */
		function FileTypeIcon({ type, size = 16 }) {
			const mark = type === "other" ? void 0 : MARK_BY_TYPE[type];
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				className: "dsout-fic dsout-fic-" + type,
				width: size,
				height: size,
				viewBox: "0 0 28 28",
				fill: "none",
				"aria-hidden": "true",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: ICON_BODY,
						fill: "currentColor"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: ICON_FOLD,
						fill: type === "other" ? "var(--dsw-static-neutral-400)" : "var(--dsw-static-neutral-00)",
						fillOpacity: type === "other" ? void 0 : .7
					}),
					mark ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("g", {
						color: "var(--dsw-static-neutral-00)",
						transform: mark.transform || void 0,
						children: mark.paths.map((path, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
							d: path.d,
							fill: path.fill,
							stroke: path.stroke,
							strokeWidth: path.strokeWidth,
							fillRule: path.fillRule,
							clipRule: path.clipRule
						}, index))
					}) : null
				]
			});
		}
		function SearchIcon({ size = 16 }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				width: size,
				height: size,
				viewBox: "0 0 16 16",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: 1.4,
				strokeLinecap: "round",
				"aria-hidden": "true",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
					cx: "7.1",
					cy: "7.1",
					r: "4.1"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "m10.2 10.2 2.6 2.6" })]
			});
		}
		function CloseIcon({ size = 16 }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
				width: size,
				height: size,
				viewBox: "0 0 16 16",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: 1.5,
				strokeLinecap: "round",
				"aria-hidden": "true",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M4.2 4.2l7.6 7.6M11.8 4.2l-7.6 7.6" })
			});
		}
		function RefreshIcon({ size = 16 }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				width: size,
				height: size,
				viewBox: "0 0 16 16",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: 1.4,
				strokeLinecap: "round",
				strokeLinejoin: "round",
				"aria-hidden": "true",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M13 8a5 5 0 1 1-1.46-3.54" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M13 2.7v2.9H10.1" })]
			});
		}
		function InfoIcon({ size = 16 }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				width: size,
				height: size,
				viewBox: "0 0 16 16",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: 1.3,
				strokeLinecap: "round",
				"aria-hidden": "true",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
					cx: "8",
					cy: "8",
					r: "5.8"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M8 7.4v3.4M8 5.2v.1" })]
			});
		}
		function AlertIcon({ size = 16 }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				width: size,
				height: size,
				viewBox: "0 0 16 16",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: 1.3,
				strokeLinecap: "round",
				"aria-hidden": "true",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
					cx: "8",
					cy: "8",
					r: "5.8"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M8 4.9v3.6M8 11.2v.1" })]
			});
		}
		function OpenIcon({ size = 16 }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				width: size,
				height: size,
				viewBox: "0 0 16 16",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: 1.4,
				strokeLinecap: "round",
				strokeLinejoin: "round",
				"aria-hidden": "true",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M9.4 2.8h3.8v3.8" }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M13.2 2.8 7.6 8.4" }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M12 9.4v2.7a1 1 0 0 1-1 1H3.8a1 1 0 0 1-1-1V4.8a1 1 0 0 1 1-1h2.8" })
				]
			});
		}
		function RevealIcon({ size = 16 }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				width: size,
				height: size,
				viewBox: "0 0 16 16",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: 1.4,
				strokeLinecap: "round",
				strokeLinejoin: "round",
				"aria-hidden": "true",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M2 4.9a1 1 0 0 1 1-1h3.1l1.2 1.4H13a1 1 0 0 1 1 1v5.2a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M6.2 9.5h3.6M8 7.9v3.2" })]
			});
		}
		// src/client/panel.tsx
		/**
		* 「产出物」右栏 tab 的列表面板。
		*
		* 面板是 DSH 右栏 tab 的 body：外框、tab strip、背景都由宿主提供，这里只画
		* 面板头 / 类型筛选 / 搜索 / 四行制列表 / 空态 / 底注，并在行内提供两个原生动作。
		* 点击行本身不在这里预览，而是交给 `api.openPreview`（DSH 文档预览 tab 的职责）。
		*/
		const FILTERS = [
			"all",
			"doc",
			"sheet",
			"image",
			"other"
		];
		const AUTO_REFRESH_MS = 3e3;
		const TOAST_MS = 2500;
		function pad2(value) {
			return value < 10 ? "0" + value : String(value);
		}
		/** 文件大小：与原型的 fmtSize 一致。 */
		function formatSize(bytes) {
			if (!Number.isFinite(bytes) || bytes < 0) return "";
			if (bytes < 1024) return bytes + " B";
			const kb = bytes / 1024;
			if (kb < 1e3) return (kb < 10 ? kb.toFixed(1) : String(Math.round(kb))) + " KB";
			return (kb / 1024).toFixed(1) + " MB";
		}
		/** 列表行里的短时间：今天/昨天 + 时分，同年省年份。 */
		function formatTime(ms, t) {
			if (!ms) return "";
			const date = new Date(ms);
			if (Number.isNaN(date.getTime())) return "";
			const now = /* @__PURE__ */ new Date();
			const time = pad2(date.getHours()) + ":" + pad2(date.getMinutes());
			if (date.toDateString() === now.toDateString()) return t("time.today", { time });
			const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
			if (date.toDateString() === yesterday.toDateString()) return t("time.yesterday", { time });
			if (date.getFullYear() === now.getFullYear()) return t("time.sameYear", {
				month: date.getMonth() + 1,
				day: date.getDate(),
				time
			});
			return t("time.otherYear", {
				year: date.getFullYear(),
				month: date.getMonth() + 1,
				day: date.getDate()
			});
		}
		/** hover 时展示的完整时间（不参与 i18n，纯数字）。 */
		function formatAbsolute(ms) {
			if (!ms) return "";
			const date = new Date(ms);
			if (Number.isNaN(date.getTime())) return "";
			return date.getFullYear() + "/" + (date.getMonth() + 1) + "/" + date.getDate() + " " + pad2(date.getHours()) + ":" + pad2(date.getMinutes());
		}
		/** 类型文案：优先走 dict 的 `type.<ext>`，缺 key 时退回大写扩展名。 */
		function formatTypeLabel(ext, t) {
			const normalized = ext.toLowerCase();
			const key = "type." + normalized;
			const translated = t(key);
			return translated === key ? normalized.toUpperCase() : translated;
		}
		/** 来源文案：`source.<source>`，缺 key 时退回原始枚举值。 */
		function formatSourceLabel(source, t) {
			const key = "source." + source;
			const translated = t(key);
			return translated === key ? source : translated;
		}
		function readRunning(api) {
			try {
				return api.isRunning();
			} catch {
				return false;
			}
		}
		function OutputsPanel(props) {
			const { sessionId, t, api } = props;
			const [payload, setPayload] = (0, react.useState)(null);
			const [status, setStatus] = (0, react.useState)("loading");
			const [running, setRunning] = (0, react.useState)(false);
			const [desktop, setDesktop] = (0, react.useState)(false);
			const [filter, setFilter] = (0, react.useState)("all");
			const [query, setQuery] = (0, react.useState)("");
			const [toast, setToast] = (0, react.useState)(null);
			const apiRef = (0, react.useRef)(api);
			const payloadRef = (0, react.useRef)(null);
			const requestRef = (0, react.useRef)(null);
			const pendingRef = (0, react.useRef)(/* @__PURE__ */ new Set());
			const toastSeq = (0, react.useRef)(0);
			(0, react.useEffect)(() => {
				apiRef.current = api;
			}, [api]);
			const showToast = (0, react.useCallback)((key) => {
				toastSeq.current += 1;
				setToast({
					key,
					seq: toastSeq.current
				});
			}, []);
			/** 拉列表：silent 时不进 loading 态，也不把已有列表换成错误态。 */
			const load = (0, react.useCallback)(async (refresh = false, silent = false) => {
				requestRef.current?.abort();
				const controller = new AbortController();
				requestRef.current = controller;
				if (!silent) setStatus("loading");
				try {
					const next = await apiRef.current.load(refresh ? {
						refresh: true,
						signal: controller.signal
					} : { signal: controller.signal });
					if (controller.signal.aborted) return;
					payloadRef.current = next;
					setPayload(next);
					setStatus("ready");
				} catch {
					if (controller.signal.aborted) return;
					if (silent && payloadRef.current !== null) return;
					if (payloadRef.current === null) setStatus("error");
					else {
						setStatus("ready");
						showToast("panel.loadError");
					}
				}
			}, [showToast]);
			(0, react.useEffect)(() => {
				payloadRef.current = null;
				setPayload(null);
				setStatus("loading");
				setFilter("all");
				setQuery("");
				setToast(null);
				setRunning(readRunning(apiRef.current));
				load(false);
				return () => {
					requestRef.current?.abort();
				};
			}, [sessionId, load]);
			(0, react.useEffect)(() => {
				const refresher = createAutoRefresher({
					intervalMs: AUTO_REFRESH_MS,
					isRunning: () => readRunning(apiRef.current),
					onTick: ({ running: active, shouldLoad }) => {
						setRunning(active);
						if (shouldLoad) load(false, true);
					}
				});
				refresher.start();
				return () => {
					refresher.stop();
				};
			}, [sessionId, load]);
			/** 探测桌面能力；失败不永久隐藏动作（focus/visibility 时会重试）。 */
			const desktopRequestRef = (0, react.useRef)(null);
			const refreshDesktop = (0, react.useCallback)(() => {
				if (desktopRequestRef.current) return desktopRequestRef.current;
				const task = apiRef.current.canOpenDesktop().then((available) => {
					setDesktop(Boolean(available));
				}).catch(() => {}).finally(() => {
					desktopRequestRef.current = null;
				});
				desktopRequestRef.current = task;
				return task;
			}, []);
			(0, react.useEffect)(() => {
				refreshDesktop();
			}, [refreshDesktop]);
			(0, react.useEffect)(() => {
				const refreshWhenVisible = () => {
					if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
					setRunning(readRunning(apiRef.current));
					load(false, true);
					refreshDesktop();
				};
				document.addEventListener("visibilitychange", refreshWhenVisible);
				window.addEventListener("focus", refreshWhenVisible);
				return () => {
					document.removeEventListener("visibilitychange", refreshWhenVisible);
					window.removeEventListener("focus", refreshWhenVisible);
				};
			}, [load, refreshDesktop]);
			(0, react.useEffect)(() => {
				if (toast === null) return;
				const timer = window.setTimeout(() => setToast(null), TOAST_MS);
				return () => {
					window.clearTimeout(timer);
				};
			}, [toast]);
			const sorted = (0, react.useMemo)(() => {
				return [...payload?.deliverables ?? []].sort((a, b) => b.mtime - a.mtime);
			}, [payload]);
			const counts = (0, react.useMemo)(() => {
				const next = {
					all: sorted.length,
					doc: 0,
					sheet: 0,
					image: 0,
					other: 0
				};
				for (const item of sorted) next[item.kind] += 1;
				return next;
			}, [sorted]);
			const shownFilters = (0, react.useMemo)(() => FILTERS.filter((kind) => kind === "all" || counts[kind] > 0 || kind === filter), [counts, filter]);
			const visible = (0, react.useMemo)(() => {
				const keyword = query.trim().toLowerCase();
				return sorted.filter((item) => {
					if (filter !== "all" && item.kind !== filter) return false;
					if (keyword === "") return true;
					return item.name.toLowerCase().includes(keyword) || item.rel.toLowerCase().includes(keyword);
				});
			}, [
				sorted,
				filter,
				query
			]);
			const handleRefresh = (0, react.useCallback)(() => {
				load(true);
			}, [load]);
			const handleRetry = (0, react.useCallback)(() => {
				load(true);
			}, [load]);
			const clearFilters = (0, react.useCallback)(() => {
				setFilter("all");
				setQuery("");
			}, []);
			const openPreview = (0, react.useCallback)((rel) => {
				try {
					apiRef.current.openPreview(rel);
				} catch {
					showToast("action.previewError");
				}
			}, [showToast]);
			const openNative = (0, react.useCallback)(async (rel, action) => {
				const key = action + ":" + rel;
				if (pendingRef.current.has(key)) return;
				pendingRef.current.add(key);
				let ok = false;
				try {
					ok = await apiRef.current.openNative(rel, action);
				} catch {
					ok = false;
				} finally {
					pendingRef.current.delete(key);
				}
				showToast(ok ? action === "open" ? "action.opened" : "action.revealed" : action === "open" ? "action.openError" : "action.revealError");
			}, [showToast]);
			const handleRowKeyDown = (0, react.useCallback)((event, rel) => {
				if (event.target !== event.currentTarget) return;
				if (event.key !== "Enter" && event.key !== " ") return;
				event.preventDefault();
				openPreview(rel);
			}, [openPreview]);
			const total = sorted.length;
			const refreshing = status === "loading";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "dsout-root",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsout-head",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dsout-title",
								children: t("panel.title")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dsout-count-pill",
								title: t("panel.countTitle"),
								children: total
							}),
							running ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dsout-run-dot",
								role: "img",
								"aria-label": t("panel.running"),
								title: t("panel.running")
							}) : null,
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dsout-head-actions",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "dsout-iconbtn",
									title: t("panel.refresh"),
									"aria-label": t("panel.refresh"),
									"aria-busy": refreshing,
									disabled: refreshing && payload === null,
									onClick: handleRefresh,
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RefreshIcon, { size: 15 })
								})
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dsout-filters",
						children: shownFilters.map((kind) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							className: "dsout-chip",
							"aria-pressed": filter === kind,
							onClick: () => setFilter(kind),
							children: [t("filter." + kind), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dsout-chip-n",
								children: counts[kind]
							})]
						}, kind))
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dsout-searchrow",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dsout-searchbox",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SearchIcon, { size: 13 }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									className: "dsout-search",
									type: "text",
									value: query,
									placeholder: t("panel.searchPlaceholder"),
									"aria-label": t("panel.searchPlaceholder"),
									spellCheck: false,
									autoComplete: "off",
									onChange: (event) => setQuery(event.target.value)
								}),
								query !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "dsout-search-clear",
									title: t("panel.clearSearch"),
									"aria-label": t("panel.clearSearch"),
									onClick: () => setQuery(""),
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CloseIcon, { size: 11 })
								}) : null
							]
						})
					}),
					payload === null ? status === "error" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsout-state",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dsout-state-icon-error",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AlertIcon, { size: 28 })
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dsout-state-title",
								children: t("panel.loadError")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dsout-state-desc",
								children: t("panel.loadErrorHint")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "dsout-state-action",
								onClick: handleRetry,
								children: t("panel.retry")
							})
						]
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsout-state",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "dsout-spinner",
							"aria-hidden": "true"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "dsout-state-title",
							role: "status",
							children: t("panel.loading")
						})]
					}) : total === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsout-state",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dsout-state-icon",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(FileTypeIcon, {
									type: "other",
									size: 28
								})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dsout-state-title",
								children: t("panel.emptyTitle")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dsout-state-desc",
								children: t("panel.emptyDesc")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "dsout-state-action",
								onClick: handleRefresh,
								children: t("panel.refresh")
							})
						]
					}) : visible.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsout-state",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dsout-state-icon",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SearchIcon, { size: 28 })
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dsout-state-title",
								children: filter === "all" ? t("panel.noMatches") : t("panel.noKindMatches", { kind: t("filter." + filter) })
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dsout-state-desc",
								children: filter === "all" ? t("panel.noMatchesDesc") : t("panel.noKindMatchesDesc")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "dsout-state-action",
								onClick: clearFilters,
								children: t("panel.clearFilters")
							})
						]
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dsout-list",
						children: visible.map((item) => {
							const sourceText = formatSourceLabel(item.source, t);
							return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "dsout-row",
								role: "button",
								tabIndex: 0,
								onClick: () => openPreview(item.rel),
								onKeyDown: (event) => handleRowKeyDown(event, item.rel),
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "dsout-row-icon",
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(FileTypeIcon, {
											type: fileTypeFromExt(item.ext),
											size: 16
										})
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: "dsout-row-main",
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: "dsout-row-name",
												title: item.name,
												children: item.name
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: "dsout-row-path",
												title: item.rel,
												children: item.rel
											}),
											item.description ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: "dsout-row-desc",
												title: item.description,
												children: item.description
											}) : null,
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
												className: "dsout-row-meta",
												children: [
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: "dsout-badge" + (item.source === "presented" ? " dsout-badge-explicit" : ""),
														title: sourceText,
														children: sourceText
													}),
													item.isSource ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: "dsout-badge dsout-badge-source",
														title: t("badge.source"),
														children: t("badge.source")
													}) : null,
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: "dsout-sep",
														children: "·"
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
														className: "dsout-meta-type",
														children: [formatTypeLabel(item.ext, t), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
															className: "dsout-sep",
															children: "·"
														})]
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: formatSize(item.size) }),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: "dsout-sep",
														children: "·"
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: "dsout-meta-time",
														title: formatAbsolute(item.mtime),
														children: formatTime(item.mtime, t)
													})
												]
											})
										]
									}),
									desktop ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: "dsout-row-actions",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: "dsout-mini",
											title: t("action.open"),
											"aria-label": t("action.open"),
											onClick: (event) => {
												event.stopPropagation();
												openNative(item.rel, "open");
											},
											children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(OpenIcon, { size: 14 })
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: "dsout-mini",
											title: t("action.reveal"),
											"aria-label": t("action.reveal"),
											onClick: (event) => {
												event.stopPropagation();
												openNative(item.rel, "reveal");
											},
											children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RevealIcon, { size: 14 })
										})]
									}) : null
								]
							}, item.path);
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsout-foot",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(InfoIcon, { size: 11 }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dsout-foot-text",
								title: t("panel.footer"),
								children: t("panel.footer")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dsout-foot-count",
								title: t("panel.footerCount", { count: payload?.total ?? total }),
								children: payload?.truncated ? t("panel.truncatedHint", {
									shown: total,
									total: payload.total
								}) : t("panel.footerCount", { count: total })
							})
						]
					}),
					toast !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dsout-toast",
						role: "status",
						children: t(toast.key)
					}, toast.seq) : null
				]
			});
		}
		// src/client/locales.ts
		/**
		* 面板文案（locale 命名空间 `dshOutput`）。
		*
		* `index.tsx` 在插件 apply 里 `ctx.locale.register(NS, { zh, en })`，并把
		* `ctx.locale.bind(NS)` 得到的 `t` 作为 props 传给 `OutputsPanel`。
		* key 是扁平字符串，`{name}` 会被 t 的第二个参数插值。
		*/
		/** locale 命名空间，与 `ctx.locale.register(NS, ...)`、slot 的 `locale` 保持一致。 */
		const NS = "dshOutput";
		/** 简体中文字典；也是 key 集合的单一真相源。 */
		const zh = {
			"panel.title": "产出物",
			"panel.refresh": "刷新列表",
			"panel.loading": "正在读取产出物…",
			"panel.countTitle": "交付文件数",
			"panel.running": "会话运行中，自动刷新",
			"panel.searchPlaceholder": "搜索文件名或路径",
			"panel.clearSearch": "清空搜索",
			"panel.emptyTitle": "这次对话还没有交付文件",
			"panel.emptyDesc": "生成报告、表格、图片或演示文稿后，会出现在这里。除显式交付外，源码、配置与临时目录不收录。",
			"panel.noMatches": "没有匹配的文件",
			"panel.noMatchesDesc": "试试别的文件名或路径关键词。",
			"panel.noKindMatches": "没有「{kind}」类型的文件",
			"panel.noKindMatchesDesc": "切换类型筛选，或清空搜索关键词后再试。",
			"panel.clearFilters": "清除筛选",
			"panel.loadError": "读取产出物失败",
			"panel.loadErrorHint": "请稍后重试；如果一直失败，可能是这个会话的日志不可读。",
			"panel.retry": "重试",
			"panel.footer": "仅显示交付类文件 · 除显式交付外，源码/配置/临时目录不收录",
			"panel.footerCount": "共 {count} 个",
			"panel.truncatedHint": "交付物过多，仅显示前 {shown} 条（共 {total} 条）",
			"filter.all": "全部",
			"filter.doc": "文档",
			"filter.sheet": "表格",
			"filter.image": "图片",
			"filter.other": "其它",
			"source.presented": "显式交付",
			"source.write": "本次对话生成",
			"source.edit": "本次对话生成",
			"source.bash": "脚本生成",
			"source.reply": "对话中提到的文件",
			"badge.source": "源码",
			"action.preview": "在右栏预览",
			"action.open": "用默认应用打开",
			"action.reveal": "在 Finder 中显示",
			"action.openError": "打开失败，请重试",
			"action.previewError": "预览打开失败，请重试",
			"action.revealError": "定位失败，请重试",
			"action.opened": "已用默认应用打开",
			"action.revealed": "已在 Finder 中显示",
			"guideDescription": "汇总当前会话交付给用户的文件，可在右栏预览、用默认应用打开或在 Finder 中定位。",
			"panel.guideDescription": "汇总当前会话交付给用户的文件，可在右栏预览、用默认应用打开或在 Finder 中定位。",
			"shortcut.open": "打开产出物",
			"shortcut.noSession": "请先选择会话",
			"type.html": "HTML",
			"type.htm": "HTML",
			"type.md": "Markdown",
			"type.txt": "文本",
			"type.pdf": "PDF",
			"type.docx": "Word",
			"type.xlsx": "Excel",
			"type.csv": "CSV",
			"type.pptx": "PPT",
			"type.png": "PNG",
			"type.jpg": "JPG",
			"type.jpeg": "JPEG",
			"type.webp": "WebP",
			"type.gif": "GIF",
			"type.svg": "SVG",
			"type.zip": "ZIP",
			"type.mp4": "MP4",
			"type.mov": "MOV",
			"type.mp3": "MP3",
			"type.wav": "WAV",
			"time.today": "今天 {time}",
			"time.yesterday": "昨天 {time}",
			"time.sameYear": "{month}月{day}日 {time}",
			"time.otherYear": "{year}年{month}月{day}日"
		};
		/** English dictionary, checked against the Chinese key set. */
		const en = {
			"panel.title": "Outputs",
			"panel.refresh": "Refresh list",
			"panel.loading": "Reading deliverables…",
			"panel.countTitle": "Deliverable count",
			"panel.running": "Conversation is running — auto-refreshing",
			"panel.searchPlaceholder": "Search file name or path",
			"panel.clearSearch": "Clear search",
			"panel.emptyTitle": "No deliverables yet",
			"panel.emptyDesc": "Reports, spreadsheets, images and presentations will show up here. Except for explicitly presented files, source, config and temporary files are excluded.",
			"panel.noMatches": "No matching files",
			"panel.noMatchesDesc": "Try a different file name or path keyword.",
			"panel.noKindMatches": "No \"{kind}\" deliverables",
			"panel.noKindMatchesDesc": "Switch the type filter, or clear the search to see more.",
			"panel.clearFilters": "Clear filters",
			"panel.loadError": "Could not read deliverables",
			"panel.loadErrorHint": "Try again in a moment. If it keeps failing, this conversation log may be unreadable.",
			"panel.retry": "Retry",
			"panel.footer": "Deliverable files only · except explicitly presented files, source, config and temp folders are excluded",
			"panel.footerCount": "{count} total",
			"panel.truncatedHint": "Too many deliverables — showing the first {shown} of {total}",
			"filter.all": "All",
			"filter.doc": "Docs",
			"filter.sheet": "Sheets",
			"filter.image": "Images",
			"filter.other": "Other",
			"source.presented": "Presented",
			"source.write": "Created in chat",
			"source.edit": "Edited in chat",
			"source.bash": "From script",
			"source.reply": "Mentioned in chat",
			"badge.source": "Source",
			"action.preview": "Preview in sidebar",
			"action.open": "Open in default app",
			"action.reveal": "Reveal in Finder",
			"action.openError": "Could not open the file",
			"action.previewError": "Could not open the preview",
			"action.revealError": "Could not reveal the file",
			"action.opened": "Opened in default app",
			"action.revealed": "Revealed in Finder",
			"guideDescription": "Files delivered in this conversation. Preview them in the sidebar, open them in the default app, or reveal them in Finder.",
			"panel.guideDescription": "Files delivered in this conversation. Preview them in the sidebar, open them in the default app, or reveal them in Finder.",
			"shortcut.open": "Open outputs",
			"shortcut.noSession": "Select a conversation first",
			"type.html": "HTML",
			"type.htm": "HTML",
			"type.md": "Markdown",
			"type.txt": "Text",
			"type.pdf": "PDF",
			"type.docx": "Word",
			"type.xlsx": "Excel",
			"type.csv": "CSV",
			"type.pptx": "PPT",
			"type.png": "PNG",
			"type.jpg": "JPG",
			"type.jpeg": "JPEG",
			"type.webp": "WebP",
			"type.gif": "GIF",
			"type.svg": "SVG",
			"type.zip": "ZIP",
			"type.mp4": "MP4",
			"type.mov": "MOV",
			"type.mp3": "MP3",
			"type.wav": "WAV",
			"time.today": "Today {time}",
			"time.yesterday": "Yesterday {time}",
			"time.sameYear": "{month}/{day} {time}",
			"time.otherYear": "{year}/{month}/{day}"
		};
		// src/client/styles.ts
		/**
		* 「产出物」面板的样式（一整段 CSS 字符串）。
		*
		* `index.tsx` 把它注入成 `<style data-plugin-css="dsh-output/panel.css">`。
		* 约定：
		* - 颜色 / 圆角 / 阴影 / 字体只用 DSH token（`--dsw-alias-*`、`--dsw-radius-*`、`--ds-font-family-code` 等），
		*   深浅主题由 DSH 自动切换，这里不写 `[data-theme]`、不写配色常量。
		* - 全部选择器带 `dsout-` 前缀，避免和 DSH 本体 / 其它插件撞名。
		* - 面板是右栏 tab body，外框和背景由 tab body 提供；这里不画卡片、不加边框和阴影。
		* - 滚动条沿用 DSH 全局样式，不自己定义。
		*/
		const PANEL_CSS = `
/* ---------- 根容器 ---------- */
.dsout-root{position:relative;display:flex;flex-direction:column;height:100%;min-height:0;min-width:0;
  color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px;background:transparent;container-type:inline-size}
.dsout-root *{box-sizing:border-box}
/* reset 用 :where() 降到零特异性：单类规则（.dsout-chip / .dsout-state-action 等）才能盖住它。
 * 之前写成 .dsout-root button（0,1,1）会吃掉同名单类规则的 padding / border / font-size / color。 */
:where(.dsout-root) button{font-family:inherit;font-size:inherit;color:inherit;background:none;border:0;padding:0;cursor:pointer}
:where(.dsout-root) button:disabled{cursor:default}
.dsout-root svg{display:block;flex:none}

/* ---------- DSH 文件类型图标配色（数值取自 docs/tokens.css 的 static 色板） ---------- */
.dsout-fic{--dsout-fic-violet:rgb(139,118,246);--dsout-fic-color:var(--dsw-static-neutral-bluish-300);
  color:var(--dsout-fic-color);flex:none}
.dsout-fic-code{--dsout-fic-color:var(--dsw-static-deepseek-500)}
.dsout-fic-excel{--dsout-fic-color:var(--dsw-static-green-500)}
.dsout-fic-html{--dsout-fic-color:var(--dsw-static-deepseek-500)}
.dsout-fic-image{--dsout-fic-color:var(--dsout-fic-violet)}
.dsout-fic-markdown{--dsout-fic-color:var(--dsw-static-deepseek-500)}
.dsout-fic-other{--dsout-fic-color:var(--dsw-static-neutral-bluish-300)}
.dsout-fic-pdf{--dsout-fic-color:var(--dsw-static-red-600)}
.dsout-fic-ppt{--dsout-fic-color:var(--dsw-static-amber-500)}
.dsout-fic-video{--dsout-fic-color:var(--dsout-fic-violet)}
.dsout-fic-word{--dsout-fic-color:var(--dsw-static-deepseek-450)}

/* ---------- 面板头 38px ---------- */
.dsout-head{flex:none;display:flex;align-items:center;gap:8px;height:38px;padding:0 6px 0 16px;
  border-bottom:.5px solid var(--dsw-alias-border-l3)}
.dsout-title{flex:none;font-size:13px;line-height:20px;font-weight:500;color:var(--dsw-alias-label-primary)}
.dsout-count-pill{flex:none;padding:0 6px;border-radius:9px;background:var(--dsw-alias-bg-module-platform);
  color:var(--dsw-alias-label-tertiary);font-family:var(--ds-font-family-code);font-size:11px;line-height:16px;
  font-variant-numeric:tabular-nums}
.dsout-run-dot{flex:none;width:6px;height:6px;border-radius:999px;background:var(--dsw-alias-state-business-primary)}
.dsout-head-actions{flex:none;margin-left:auto;display:flex;align-items:center;gap:2px}
.dsout-iconbtn{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;flex:none;
  border-radius:var(--dsw-radius-sm);color:var(--dsw-alias-label-secondary)}
.dsout-iconbtn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dsout-iconbtn:disabled{opacity:.45}
.dsout-iconbtn svg{width:15px;height:15px}

/* ---------- 类型筛选：一条描边分段槽，只渲染有内容的类型（0 计数在 panel.tsx 里被过滤掉） ----------
 * 圆角 10px / 6px 是同心圆角（外层 = 内层 + 4px 内边距），token 圆角档位里没有这一档，故用 px。
 * 槽本身不填底色：选中项用 --dsw-alias-bg-module-platform 提亮，深浅两套主题下都是「选中更亮」。 */
.dsout-filters{flex:none;display:flex;align-items:center;gap:6px;margin:12px 12px 0;padding:4px;
  width:fit-content;max-width:calc(100% - 24px);border-radius:10px;
  border:.5px solid var(--dsw-alias-border-l3);overflow-x:auto;scrollbar-width:none}
.dsout-filters::-webkit-scrollbar{display:none}
.dsout-chip{display:inline-flex;align-items:center;gap:7px;flex:none;height:26px;padding:0 11px;
  border-radius:6px;border:.5px solid transparent;color:var(--dsw-alias-label-secondary);
  font-size:12px;line-height:16px;letter-spacing:.3px;white-space:nowrap}
.dsout-chip:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dsout-chip[aria-pressed="true"]{background:var(--dsw-alias-bg-module-platform);
  border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary);
  font-weight:500;box-shadow:var(--dsw-shadow-lv1)}
.dsout-chip-n{font-family:var(--ds-font-family-code);font-size:10px;line-height:14px;letter-spacing:0;
  color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}
.dsout-chip[aria-pressed="true"] .dsout-chip-n{color:var(--dsw-alias-label-secondary)}
/* 五种类型全出现时计数自动退场：五段带计数在 360px 面板下会超出槽宽，
 * 而滚动条是隐藏的，最后一段会被圆角切掉且鼠标滚不到。 */
.dsout-filters:has(> .dsout-chip:nth-child(5)) .dsout-chip{gap:0}
.dsout-filters:has(> .dsout-chip:nth-child(5)) .dsout-chip-n{display:none}

/* ---------- 搜索 ---------- */
.dsout-searchrow{flex:none;padding:12px 12px 8px}
.dsout-searchbox{position:relative;display:flex;align-items:center}
.dsout-searchbox>svg{position:absolute;left:8px;width:13px;height:13px;color:var(--dsw-alias-label-tertiary);pointer-events:none}
.dsout-search{width:100%;height:26px;padding:0 26px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);
  background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-primary);font-family:inherit;
  font-size:12px;line-height:20px;outline:none;transition:border-color var(--ds-transition-duration-fast) var(--ds-ease-in-out),
  box-shadow var(--ds-transition-duration-fast) var(--ds-ease-in-out)}
.dsout-search::placeholder{color:var(--dsw-alias-label-tertiary)}
.dsout-search:hover{border-color:var(--dsw-alias-border-l3)}
.dsout-search:focus-visible{border-color:var(--dsw-alias-border-l4);box-shadow:0 0 0 2px var(--dsw-alias-border-l2)}
.dsout-search-clear{position:absolute;right:4px;display:inline-flex;align-items:center;justify-content:center;
  width:18px;height:18px;border-radius:4px;color:var(--dsw-alias-label-tertiary)}
.dsout-search-clear:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dsout-search-clear svg{width:11px;height:11px}

/* ---------- 列表与行（四行制，hover 只换底色） ---------- */
.dsout-list{flex:1;min-height:0;overflow:auto;padding:2px 8px 8px}
.dsout-row{position:relative;display:flex;align-items:flex-start;gap:10px;width:100%;padding:7px 8px;
  border-radius:var(--dsw-radius-md);text-align:left;cursor:pointer;background:transparent;
  color:inherit;font:inherit}
.dsout-row:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dsout-row:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:-2px}
.dsout-row-icon{flex:none;display:flex;margin-top:1px}
.dsout-row-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}
.dsout-row-name{font-size:13px;line-height:20px;font-weight:500;color:var(--dsw-alias-label-primary);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsout-row-path{font-family:var(--ds-font-family-code);font-size:11px;line-height:16px;
  color:var(--dsw-alias-label-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsout-row-desc{font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsout-row-meta{display:flex;align-items:center;gap:5px;min-width:0;overflow:hidden;font-family:var(--ds-font-family-code);
  font-size:10px;line-height:14px;color:var(--dsw-alias-label-caption);white-space:nowrap}
.dsout-row-meta>*{flex:none}
.dsout-sep{color:var(--dsw-alias-border-l4)}
.dsout-meta-type{display:inline-flex;align-items:center;gap:5px;min-width:0;overflow:hidden}
.dsout-meta-time{overflow:hidden;text-overflow:ellipsis}

/* 来源徽标：presented 用 business 蓝，源码用 warn 色 */
.dsout-badge{flex:none;display:inline-flex;align-items:center;height:15px;padding:0 4px;border-radius:4px;
  background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-tertiary);font-size:9px;line-height:14px;
  font-family:var(--dsw-font-family,inherit)}
.dsout-badge-explicit{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 12%,transparent);
  color:var(--dsw-alias-state-business-primary)}
.dsout-badge-source{background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 12%,transparent);
  color:var(--dsw-alias-state-warn-label)}

/* 行内动作：默认隐藏，hover / 键盘聚焦时出现 */
.dsout-row-actions{flex:none;display:flex;align-items:center;gap:2px;margin-top:2px;opacity:0;
  transition:opacity var(--ds-transition-duration-fast) var(--ds-ease-in-out)}
.dsout-row:hover .dsout-row-actions,.dsout-row:focus-within .dsout-row-actions{opacity:1}
.dsout-mini{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;flex:none;
  border-radius:999px;color:var(--dsw-alias-label-tertiary)}
.dsout-mini:hover{background:var(--dsw-alias-interactive-bg-hover-solid);color:var(--dsw-alias-label-primary)}
.dsout-mini svg{width:14px;height:14px}
@media (hover:none){
  .dsout-row-actions{opacity:1}
}

/* ---------- 空态 / 错误态 / 加载态（照原型的 .empty） ---------- */
.dsout-state{flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:10px;padding:32px 24px;text-align:center}
.dsout-state-icon{color:var(--dsw-alias-label-caption);opacity:.9}
.dsout-state-icon-error{color:var(--dsw-alias-state-error-primary);opacity:.9}
.dsout-state-title{font-size:13px;line-height:20px;font-weight:500;color:var(--dsw-alias-label-secondary)}
.dsout-state-desc{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);max-width:250px}
.dsout-state-action{height:26px;padding:0 12px;border-radius:8px;border:.5px solid var(--dsw-alias-border-l2);
  color:var(--dsw-alias-label-secondary);font-size:12px;line-height:20px}
.dsout-state-action:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dsout-spinner{width:14px;height:14px;flex:none;border-radius:999px;border:1.5px solid var(--dsw-alias-border-l3);
  border-top-color:var(--dsw-alias-state-business-primary);animation:dsout-spin .8s linear infinite}
@keyframes dsout-spin{to{transform:rotate(360deg)}}

/* ---------- 底注 ---------- */
.dsout-foot{flex:none;display:flex;align-items:center;gap:6px;padding:8px 16px 10px;
  border-top:.5px solid var(--dsw-alias-border-l1);font-size:10px;line-height:14px;color:var(--dsw-alias-label-caption)}
.dsout-foot>svg{width:11px;height:11px;color:var(--dsw-alias-label-caption)}
.dsout-foot-text{flex:1;min-width:0}
.dsout-foot-count{flex:none;font-family:var(--ds-font-family-code);font-variant-numeric:tabular-nums}

/* ---------- 面板内提示胶囊 ---------- */
.dsout-toast{position:absolute;left:50%;bottom:44px;z-index:10;display:flex;align-items:center;gap:6px;
  max-width:calc(100% - 24px);padding:6px 12px;border-radius:999px;background:var(--dsw-alias-toast-bg);
  color:var(--dsw-alias-toast-label);font-size:12px;line-height:18px;box-shadow:var(--dsw-shadow-lv2);
  pointer-events:none;white-space:nowrap;transform:translate(-50%,0);
  animation:dsout-toast-in 120ms var(--ds-ease-in-out)}
@keyframes dsout-toast-in{from{opacity:0;transform:translate(-50%,8px)}to{opacity:1;transform:translate(-50%,0)}}
@media (prefers-reduced-motion:reduce){
  .dsout-spinner{animation:none}
  .dsout-toast{animation:none}
}

/* ---------- 窄面板（320px 起）：先去掉类型文字，靠图标/大小/时间表达 ---------- */
@container (max-width:340px){
  .dsout-meta-type{display:none}
  .dsout-row-name{font-size:12px}
  /* 窄面板优先保住类型标签本身：计数退场，避免 5 段时横向滚动把最后一段切掉 */
  .dsout-chip{padding:0 8px;gap:0}
  .dsout-chip-n{display:none}
}
`;
		// src/client/index.tsx
		/** tab 类型 id，同时是右栏持久化 tab 记录与 slot key 的身份。 */
		const TAB_ID = "@kulebbb/dsh-output";
		/** tab 类型判别符，`sidebarRight.openTab("outputs")` 用。 */
		const TAB_KIND = "outputs";
		/** 快捷键命令 id（guide 卡片的 commandId 也指向它）。 */
		const COMMAND_ID = "outputs.open";
		const SHORTCUT_DEFAULTS = {
			"desktop:macos": {
				code: "KeyO",
				modifiers: ["meta", "shift"]
			},
			"desktop:windows": {
				code: "KeyO",
				modifiers: ["control", "shift"]
			},
			"desktop:linux": {
				code: "KeyO",
				modifiers: ["control", "shift"]
			}
		};
		const inject = [
			"slots",
			"sessions",
			"locale",
			"sidebarRight",
			"sidebarRightTabs",
			"remote",
			"remote.session"
		];
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "dsh-output: dictionaries");
			if (typeof document !== "undefined") {
				const style = document.createElement("style");
				style.setAttribute("data-plugin", "dsh-output");
				style.setAttribute("data-plugin-css", "dsh-output/panel.css");
				style.textContent = PANEL_CSS;
				document.head.append(style);
				ctx.effect(() => () => style.remove(), "dsh-output: styles");
			}
			const sidebarRight = ctx.sidebarRight;
			const sidebarRightTabs = ctx.sidebarRightTabs;
			if (!sidebarRight || !sidebarRightTabs) return;
			const t = ctx.locale.bind(NS);
			ctx.effect(() => sidebarRightTabs.register({
				id: TAB_ID,
				kind: TAB_KIND,
				priority: "extension",
				title: () => t("panel.title"),
				guide: [{
					id: TAB_ID,
					order: 40,
					title: () => t("panel.title"),
					description: () => t("panel.guideDescription"),
					commandId: COMMAND_ID
				}]
			}), "dsh-output: tab type");
			ctx.effect(() => ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register({
				name: "sidebar.right.pane.tab",
				key: TAB_ID,
				locale: NS,
				inject: (sessionId) => ({
					sessionId: String(sessionId),
					api: createOutputsApi(ctx, String(sessionId))
				})
			}, (props) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(OutputsPanel, {
				t: props.t,
				sessionId: String(props.sessionId),
				api: props.api
			}))), "dsh-output: tab body");
			if (typeof sidebarRight.openTabFromTarget === "function" && typeof ctx.inject === "function") ctx.inject(["shortcuts"], (scope) => {
				const shortcuts = scope.shortcuts;
				if (!shortcuts) return;
				scope.effect(() => {
					try {
						return shortcuts.register({
							id: COMMAND_ID,
							label: () => t("shortcut.open"),
							aliases: [
								"outputs",
								"deliverables",
								"产出物"
							],
							defaults: SHORTCUT_DEFAULTS,
							regions: ["page", "editable"],
							modals: [],
							resolve: ({ target: element }) => {
								const target = sidebarRight.commandTarget?.(element);
								if (target === void 0) return {
									status: "blocked",
									reason: t("shortcut.noSession")
								};
								return {
									status: "handled",
									run: () => {
										sidebarRight.openTabFromTarget?.(TAB_KIND, target);
									}
								};
							}
						});
					} catch (error) {
						ctx.logger?.warn?.("[dsh-output] shortcut registration failed:", error);
						return;
					}
				}, "dsh-output: shortcut");
			});
		}
		exports.COMMAND_ID = COMMAND_ID;
		exports.SHORTCUT_DEFAULTS = SHORTCUT_DEFAULTS;
		exports.TAB_ID = TAB_ID;
		exports.TAB_KIND = TAB_KIND;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
