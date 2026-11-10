/** 会话事件的最小结构（v0/v3/v4 日志与 session/event 推送共用）。 */
interface SessionEventLike {
  type?: string;
  seq?: number;
  time?: number;
  data?: any;
}
/** `sessionQuery.readSession()` 返回值里我们用到的最小结构。 */
interface SessionSnapshotLike {
  session?: {
    cwd?: string;
    createdAt?: number;
  } | null;
  events: readonly SessionEventLike[];
}
declare const name = "@kulebbb/dsh-output";
declare const inject: string[];
interface ConnectionRoute {
  path: string;
  methods: string[];
  requestBody: 'buffered';
  fetch: (request: Request) => Promise<Response>;
}
interface HostContext {
  connection: {
    fetch: {
      register(route: ConnectionRoute): () => void;
    };
  };
  sessionQuery: {
    readSession(sessionId: string): Promise<SessionSnapshotLike>;
  };
  logger?: {
    warn?(...args: unknown[]): void;
    debug?(...args: unknown[]): void;
  };
  effect(factory: () => (() => void) | void, label?: string): () => void;
  on(event: 'session/event', listener: (session: {
    id?: unknown;
  }, event: SessionEventLike) => void): () => void;
}
declare function apply(ctx: HostContext): void;
export { apply, inject, name };