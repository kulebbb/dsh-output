import { stat } from "node:fs/promises";
import { basename, isAbsolute, join, normalize, relative } from "node:path";
// src/shared/types.ts
/** 宿主路由注册用的绝对路径。 */
const OUTPUTS_ROUTE = "/api/outputs.list";
OUTPUTS_ROUTE.replace(/^\/+/, "");
/** 交付类型白名单（20 项，与阶段 1 定稿一致）。 */
const DELIVERABLE_EXTS = [
	"html",
	"htm",
	"pdf",
	"docx",
	"xlsx",
	"pptx",
	"csv",
	"md",
	"txt",
	"zip",
	"png",
	"jpg",
	"jpeg",
	"webp",
	"gif",
	"svg",
	"mp4",
	"mov",
	"mp3",
	"wav"
];
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
const KIND_BY_EXT = {
	html: "doc",
	htm: "doc",
	md: "doc",
	txt: "doc",
	pdf: "doc",
	docx: "doc",
	pptx: "doc",
	xlsx: "sheet",
	csv: "sheet",
	png: "image",
	jpg: "image",
	jpeg: "image",
	webp: "image",
	gif: "image",
	svg: "image",
	zip: "other",
	mp4: "other",
	mov: "other",
	mp3: "other",
	wav: "other"
};
// src/shared/rules.ts
/**
* 交付物折叠规则（宿主半）。
*
* 阶段 1 定稿规则：
*   来源优先级：deliverables/presented > write/edit > bash > 每轮收尾回复
*   过滤：扩展名白名单 + 噪声目录 + 项目元文件 + 隐藏路径 + 临时目录 + 必须在会话 cwd 内 + 磁盘存在
*   去重：同一绝对路径只留一条，来源取最高优先级，时间取最后一次
*
* 阶段 2 拍板调整（老板确认）：
*   - `deliverables/presented` 显式声明的文件，即使是 .ts/.js/.json 等源码类扩展名也展示，
*     并标记 `isSource: true`（UI 标「源码」徽标）；
*   - present 文件同时豁免「临时目录」和「必须在 cwd 内」两条（显式交付最权威）。
*   其余规则不变。
*/
const DELIVERABLE_EXT_SET = new Set(DELIVERABLE_EXTS);
const SOURCE_EXT_SET = new Set(SOURCE_EXTS);
/** 排除目录：依赖 / 版本库 / 构建产物 / 隐藏工具目录 / agent 工作流过程目录。 */
const NOISE_DIR = /(^|\/)(node_modules|\.git|\.worktrees|dist|build|out|coverage|\.next|\.nuxt|\.venv|venv|__pycache__|\.cache|\.idea|\.vscode|\.claude|\.agents|superpowers)(\/|$)/;
/** 项目元文件：改这些不算交付给用户的成果。 */
const META_NAMES = /* @__PURE__ */ new Set([
	"agents.md",
	"readme.md",
	"claude.md",
	"license",
	"license.md",
	"changelog.md",
	"contributing.md",
	"intend.md",
	"package.json",
	"requirements.txt",
	".gitignore"
]);
const TEMP_DIRS = [
	"/tmp",
	"/private/tmp",
	"/var/folders"
];
const SOURCE_RANK = {
	presented: 3,
	write: 2,
	edit: 2,
	bash: 1,
	reply: 0
};
/** 从命令文本里抓绝对路径（含 `~/`），与阶段 1 脚本一致。 */
const BASH_PATH_RE = /(?:\/|~\/)[^\s"'`;|&<>()]+?\.(?:html|htm|pdf|docx|xlsx|pptx|csv|md|txt|zip|png|jpg|jpeg|webp|gif|svg|mp4|mov|mp3|wav|ts|tsx|js|jsx|mjs|cjs|json|yaml|yml|toml|sh|py|go|rs|java|c|cpp|h|hpp|css|scss|sql|rb|php|swift|kt)/gi;
/** 收尾回复里的行内代码路径 / 绝对路径。 */
const REPLY_PATH_RE = /`([^`\n]+?\.[A-Za-z0-9]+)`|((?:\/|~\/)[^\s)'"`，,；;]+?\.[A-Za-z0-9]+)/g;
function hasHiddenSegment(path) {
	return path.split("/").some((segment) => segment.length > 1 && segment.startsWith("."));
}
function isUnderTempDir(path) {
	return TEMP_DIRS.some((dir) => path === dir || path.startsWith(dir + "/"));
}
/** 把事件里的路径写法（相对/绝对/`~/`/file URI/带引号）解析成绝对路径；无效返回 null。 */
function resolveCandidatePath(raw, cwd) {
	if (typeof raw !== "string") return null;
	let path = raw.trim();
	if (!path) return null;
	path = path.replace(/^[("'`]+|[)"'`]+$/g, "");
	if (path.startsWith("file://")) try {
		path = decodeURIComponent(path.slice(7));
	} catch {
		return null;
	}
	if (path === "~" || path.startsWith("~/")) {
		const home = process.env.HOME;
		if (!home) return null;
		path = join(home, path.slice(1));
	}
	if (!isAbsolute(path)) {
		if (!cwd) return null;
		path = join(cwd, path);
	}
	path = normalize(path);
	if (/[*?{}]/.test(path)) return null;
	return path;
}
/**
* 判定一条路径是否属于「交付给用户的文件」。
* 纯函数、不碰磁盘（磁盘校验在路由层做）。
*/
function classifyPath(raw, options) {
	const { cwd, source, time, turn, description } = options;
	const presented = source === "presented";
	const absolute = resolveCandidatePath(raw, cwd);
	if (!absolute) return {
		ok: false,
		reason: "invalid-path"
	};
	const ext = /\.([A-Za-z0-9]+)$/.exec(absolute)?.[1]?.toLowerCase();
	if (!ext) return {
		ok: false,
		reason: "no-extension"
	};
	const rel = cwd ? relative(cwd, absolute) : absolute;
	const insideCwd = !!cwd && rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
	if (hasHiddenSegment(insideCwd ? rel : absolute)) return {
		ok: false,
		reason: "hidden-path"
	};
	if (NOISE_DIR.test(absolute)) return {
		ok: false,
		reason: "noise-dir"
	};
	if (META_NAMES.has(basename(absolute).toLowerCase())) return {
		ok: false,
		reason: "project-meta-file"
	};
	if (!presented && isUnderTempDir(absolute)) return {
		ok: false,
		reason: "temp-dir"
	};
	if (!presented && !insideCwd) return {
		ok: false,
		reason: "outside-session-cwd"
	};
	let isSource = false;
	let kind;
	if (DELIVERABLE_EXT_SET.has(ext)) kind = KIND_BY_EXT[ext] ?? "other";
	else if (presented && SOURCE_EXT_SET.has(ext)) {
		kind = "other";
		isSource = true;
	} else return {
		ok: false,
		reason: "ext-not-deliverable"
	};
	return {
		ok: true,
		candidate: {
			path: absolute,
			rel: insideCwd ? rel : absolute,
			name: basename(absolute),
			ext,
			kind,
			source,
			time,
			...turn === void 0 ? {} : { turn },
			...description ? { description } : {},
			...isSource ? { isSource } : {}
		}
	};
}
/** 从 bash/run_code 命令里抓候选路径。 */
function extractBashPaths(command) {
	if (typeof command !== "string" || !command) return [];
	const found = [];
	BASH_PATH_RE.lastIndex = 0;
	let match;
	while (match = BASH_PATH_RE.exec(command)) found.push(match[0]);
	return found;
}
/** 从收尾回复文本里抓候选路径。 */
function extractReplyPaths(text) {
	if (typeof text !== "string" || !text) return [];
	const found = [];
	REPLY_PATH_RE.lastIndex = 0;
	let match;
	while (match = REPLY_PATH_RE.exec(text)) found.push(match[1] ?? match[2] ?? "");
	return found.filter(Boolean);
}
function textOfAssistantMessage(data) {
	const content = data?.message?.content;
	if (!Array.isArray(content)) return "";
	return content.filter((part) => part?.type === "text" && typeof part.text === "string").map((part) => part.text).join("\n").trim();
}
function parseToolArguments(data) {
	const raw = data?.arguments;
	if (typeof raw !== "string") return raw ?? {};
	try {
		return JSON.parse(raw);
	} catch {
		return {};
	}
}
function pathOfToolArguments(data) {
	const args = parseToolArguments(data);
	return args?.file_path ?? args?.path ?? args?.filePath;
}
/**
* 增量折叠器：喂事件、随时快照。宿主半对同一会话只维护一个实例，
* 冷启动时全量回放，运行中由 `session/event` 逐条追加。
*/
var DeliverableFolder = class {
	cwd;
	merged = /* @__PURE__ */ new Map();
	turn = 0;
	turnText = null;
	constructor(options) {
		this.cwd = options.cwd;
	}
	apply(event) {
		if (!event || typeof event.type !== "string") return;
		const data = event.data ?? {};
		const time = typeof event.time === "number" ? event.time : Date.now();
		switch (event.type) {
			case "turn/start": {
				const next = typeof data.turn === "number" ? data.turn : this.turn + 1;
				this.turn = next;
				this.turnText = null;
				return;
			}
			case "tool/call": {
				const toolName = typeof data.name === "string" ? data.name : "";
				const turn = typeof data.turn === "number" ? data.turn : this.turn;
				if (toolName === "write" || toolName === "edit" || toolName === "str_replace_editor") {
					const source = toolName === "edit" ? "edit" : "write";
					this.add(classifyPath(pathOfToolArguments(data), {
						cwd: this.cwd,
						source,
						time,
						turn
					}));
					return;
				}
				if (toolName === "bash" || toolName === "run_code") {
					const args = parseToolArguments(data);
					const command = args?.command ?? args?.code ?? "";
					for (const raw of extractBashPaths(command)) this.add(classifyPath(raw, {
						cwd: this.cwd,
						source: "bash",
						time,
						turn
					}));
				}
				return;
			}
			case "assistant/message": {
				const text = textOfAssistantMessage(data);
				if (!text) return;
				this.turnText = {
					text,
					time,
					turn: typeof data.turn === "number" ? data.turn : this.turn
				};
				return;
			}
			case "turn/end":
				this.flushTurnText();
				return;
			case "deliverables/presented": {
				const files = Array.isArray(data.files) ? data.files : [];
				const turn = typeof data.turn === "number" ? data.turn : void 0;
				for (const file of files) {
					const path = file?.path ?? file?.filePath ?? file?.file;
					const description = typeof file?.description === "string" ? file.description : void 0;
					this.add(classifyPath(path, {
						cwd: this.cwd,
						source: "presented",
						time,
						turn,
						description
					}));
				}
				return;
			}
			default: return;
		}
	}
	/**
	* 收尾回复提取只在 turn/end 时做；但日志可能在最后一轮没有 turn/end（中断/旧格式），
	* 冷启动回放结束后调用一次 `finalize()` 补上最后一条回复。
	*/
	finalize() {
		this.flushTurnText();
	}
	snapshot() {
		return [...this.merged.values()].sort((a, b) => b.time - a.time);
	}
	get lastEventTime() {
		let latest = 0;
		for (const candidate of this.merged.values()) if (candidate.time > latest) latest = candidate.time;
		return latest;
	}
	flushTurnText() {
		if (!this.turnText) return;
		const { text, time, turn } = this.turnText;
		this.turnText = null;
		for (const raw of extractReplyPaths(text)) this.add(classifyPath(raw, {
			cwd: this.cwd,
			source: "reply",
			time,
			turn
		}));
	}
	add(result) {
		if (!result.ok) return;
		const candidate = result.candidate;
		const previous = this.merged.get(candidate.path);
		if (!previous) {
			this.merged.set(candidate.path, candidate);
			return;
		}
		if (SOURCE_RANK[candidate.source] > SOURCE_RANK[previous.source]) previous.source = candidate.source;
		if (candidate.description && (previous.source === "presented" || candidate.source === "presented")) previous.description = candidate.description;
		if (candidate.isSource) previous.isSource = true;
		if (candidate.time >= previous.time) {
			previous.time = candidate.time;
			if (candidate.turn !== void 0) previous.turn = candidate.turn;
		}
	}
};
// src/host/service.ts
const REPLY_FRESHNESS_WINDOW_MS = 216e5;
const STAT_CONCURRENCY = 12;
/** 单次响应最多返回多少条交付物；超出的截断并标 truncated。 */
const DEFAULT_MAX_DELIVERABLES = 2e3;
/** 冷读期间最多缓冲多少条 live 事件（防止极端会话无限增长）。 */
const MAX_INGRESS_EVENTS = 2e3;
/** 已知的「会话不存在 / 日志不可读」错误码，避免把它们变成 500。 */
const NOT_FOUND_CODES = /* @__PURE__ */ new Set(["SESSION_QUERY_SESSION_NOT_FOUND", "session/not-found"]);
const UNREADABLE_CODE_PREFIX = "SESSION_QUERY_";
function errorCode(error) {
	if (typeof error !== "object" || error === null) return void 0;
	const code = error.code;
	return typeof code === "string" ? code : void 0;
}
function jsonResponse(body, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			"content-type": "application/json; charset=utf-8",
			"cache-control": "no-store"
		}
	});
}
function errorResponse(status, code, message) {
	return jsonResponse({ error: {
		code,
		message
	} }, status);
}
/** 简易并发池：交付物一般只有几条到几十条，限制并发避免一次打开太多 fd。 */
async function mapWithConcurrency(items, limit, mapper) {
	const results = new Array(items.length);
	let cursor = 0;
	const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
		for (;;) {
			const index = cursor++;
			if (index >= items.length) return;
			results[index] = await mapper(items[index], index);
		}
	});
	await Promise.all(workers);
	return results;
}
var OutputsService = class {
	deps;
	cache = /* @__PURE__ */ new Map();
	pending = /* @__PURE__ */ new Map();
	/**
	* 冷读/强制刷新窗口内到达的 live 事件：先按会话缓冲，日志读完、缓存建立后
	* 再按 seq > lastSeq 回放。否则 readSession 返回后到 cache.set 之间的事件会被丢掉且永不补。
	*/
	ingress = /* @__PURE__ */ new Map();
	constructor(deps) {
		this.deps = deps;
	}
	/** 认证路由的 handler；直接交给 `ctx.connection.fetch.register({ fetch })`。 */
	async handle(request) {
		try {
			const url = new URL(request.url);
			const sessionId = url.searchParams.get("sessionId")?.trim();
			if (!sessionId) return errorResponse(400, "invalid-request", "Missing sessionId.");
			const refresh = url.searchParams.get("refresh") === "1";
			return jsonResponse(await this.buildPayload(sessionId, refresh));
		} catch (error) {
			const code = errorCode(error);
			if (code && NOT_FOUND_CODES.has(code)) return errorResponse(404, "session-not-found", "Session not found.");
			if (code && code.startsWith(UNREADABLE_CODE_PREFIX)) {
				this.deps.logger?.warn?.("[dsh-output] session unreadable:", code);
				return errorResponse(422, "session-unreadable", "Session log is unreadable.");
			}
			this.deps.logger?.warn?.("[dsh-output] outputs request failed:", error);
			return errorResponse(500, "internal", "Failed to build output list.");
		}
	}
	/**
	* `session/event` 推送：
	*   - 已有缓存 → 直接增量折叠；
	*   - 正在冷读/强制刷新 → 先放进该会话的缓冲，读完日志后补放（不丢事件）；
	*   - 从没请求过的会话 → 忽略（下次冷读会读到全量日志，包含这条事件）。
	*/
	ingest(sessionId, event) {
		const entry = this.cache.get(sessionId);
		if (entry) {
			this.applyToEntry(entry, event);
			return;
		}
		if (this.pending.has(sessionId)) {
			const buffer = this.ingress.get(sessionId) ?? [];
			buffer.push(event);
			if (buffer.length > MAX_INGRESS_EVENTS) buffer.splice(0, buffer.length - MAX_INGRESS_EVENTS);
			this.ingress.set(sessionId, buffer);
		}
	}
	applyToEntry(entry, event) {
		try {
			entry.folder.apply(event);
			if (typeof event.seq === "number" && event.seq > entry.lastSeq) entry.lastSeq = event.seq;
		} catch (error) {
			this.deps.logger?.warn?.("[dsh-output] incremental fold failed:", error);
		}
	}
	/** 手动失效（测试或会话被重置时用）。 */
	invalidate(sessionId) {
		if (sessionId === void 0) this.cache.clear();
		else this.cache.delete(sessionId);
	}
	async buildPayload(sessionId, refresh) {
		const entry = (refresh ? void 0 : this.cache.get(sessionId)) ?? await this.loadEntry(sessionId, refresh);
		const deliverables = (await mapWithConcurrency(entry.folder.snapshot(), STAT_CONCURRENCY, async (candidate) => {
			const stat = await this.deps.statPath(candidate.path).catch(() => null);
			if (!stat || !stat.isFile) return null;
			if (candidate.source === "reply" && entry.createdAt > 0 && stat.mtimeMs < entry.createdAt - REPLY_FRESHNESS_WINDOW_MS) return null;
			return {
				...candidate,
				exists: true,
				size: stat.size,
				mtime: stat.mtimeMs
			};
		})).filter((item) => item !== null).sort((a, b) => b.mtime - a.mtime);
		const limit = this.deps.maxDeliverables ?? DEFAULT_MAX_DELIVERABLES;
		const limited = deliverables.length > limit ? deliverables.slice(0, limit) : deliverables;
		const now = this.deps.now?.() ?? Date.now();
		return {
			sessionId,
			cwd: entry.cwd,
			generatedAt: new Date(now).toISOString(),
			total: deliverables.length,
			truncated: deliverables.length > limit,
			deliverables: limited
		};
	}
	loadEntry(sessionId, refresh) {
		const pending = this.pending.get(sessionId);
		if (pending) return pending;
		const task = (async () => {
			if (refresh) this.cache.delete(sessionId);
			this.ingress.set(sessionId, []);
			try {
				const snapshot = await this.deps.readSession(sessionId);
				const cwd = typeof snapshot.session?.cwd === "string" && snapshot.session.cwd ? snapshot.session.cwd : null;
				const createdAt = typeof snapshot.session?.createdAt === "number" ? snapshot.session.createdAt : 0;
				const folder = new DeliverableFolder({ cwd: cwd ?? "" });
				let lastSeq = 0;
				for (const event of snapshot.events) {
					folder.apply(event);
					if (typeof event.seq === "number" && event.seq > lastSeq) lastSeq = event.seq;
				}
				folder.finalize();
				const entry = {
					sessionId,
					cwd,
					createdAt,
					lastSeq,
					folder
				};
				const buffered = this.ingress.get(sessionId) ?? [];
				for (const event of buffered) {
					if (typeof event.seq === "number" && event.seq <= lastSeq) continue;
					this.applyToEntry(entry, event);
				}
				this.cache.set(sessionId, entry);
				return entry;
			} finally {
				this.ingress.delete(sessionId);
			}
		})();
		this.pending.set(sessionId, task);
		task.finally(() => this.pending.delete(sessionId)).catch(() => {});
		return task;
	}
};
// src/index.ts
/**
* 宿主（node 半）入口。
*
* 注册一条认证路由 `GET /api/outputs.list?sessionId=...`，返回该会话折叠后的交付物列表；
* 同时订阅 `session/event`，让运行中的会话无需重复读日志就能增量更新。
*
* 插件只依赖 DSH 宿主已有的两个服务：
*   - `connection`：认证路由（与内置 deliverables 插件同一套写法）；
*   - `sessionQuery`：`readSession()` 一次读出会话全量日志（冷会话不激活 Agent）。
*/
const name = "@kulebbb/dsh-output";
const inject = ["connection", "sessionQuery"];
/** 只关心「是不是普通文件 / 大小 / mtime」，其余一律当作不存在。 */
async function statFile(path) {
	try {
		const info = await stat(path);
		if (!info.isFile()) return null;
		return {
			isFile: true,
			size: info.size,
			mtimeMs: info.mtimeMs
		};
	} catch {
		return null;
	}
}
function apply(ctx) {
	const service = new OutputsService({
		readSession: (sessionId) => ctx.sessionQuery.readSession(sessionId),
		statPath: statFile,
		logger: ctx.logger
	});
	ctx.effect(() => ctx.connection.fetch.register({
		path: OUTPUTS_ROUTE,
		methods: ["GET"],
		requestBody: "buffered",
		fetch: (request) => service.handle(request)
	}), "dsh-output: outputs route");
	ctx.effect(() => ctx.on("session/event", (session, event) => {
		const sessionId = session?.id === void 0 ? "" : String(session.id);
		if (sessionId) service.ingest(sessionId, event);
	}), "dsh-output: live session events");
}
export { apply, inject, name };
