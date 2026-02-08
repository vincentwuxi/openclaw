/**
 * WebBot Gateway Server
 * WebSocket + HTTP 服务器，处理客户端连接和消息路由
 */

import { WebSocketServer, WebSocket, type RawData } from "ws";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type {
    RequestFrame,
    ResponseFrame,
    EventFrame,
    GatewayConfig,
    ClientConnection,
    ChatSendParams,
    Session,
} from "../types/index.js";
import { AgentRunner } from "../agent/runner.js";
import { createToolRegistry } from "../tools/registry.js";
import { SessionStore } from "./session-store.js";
import { SnapshotStore } from "./snapshot-store.js";
import { ChangeLog } from "./changelog.js";

// ES 模块兼容
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 扩展配置类型
export interface ExtendedGatewayConfig extends GatewayConfig {
    webPort?: number;
    publicDir?: string;
    authToken?: string;
    previewPort?: number;
}

export class GatewayServer {
    private wss: WebSocketServer;
    private httpServer: ReturnType<typeof createServer> | null = null;
    private config: ExtendedGatewayConfig;
    private connections = new Map<string, ClientConnection>();
    private sessions = new Map<string, Session>();
    private agent: AgentRunner;
    private busySessions = new Set<string>();
    private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
    private sessionStore: SessionStore;
    private snapshotStore: SnapshotStore;
    private changeLog: ChangeLog;
    private previewHttpServer: ReturnType<typeof createServer> | null = null;

    constructor(config: ExtendedGatewayConfig) {
        this.config = config;
        this.wss = new WebSocketServer({
            port: config.port,
            host: config.host ?? "127.0.0.1",
        });

        // 初始化 Agent
        const tools = createToolRegistry(config.workspace);
        this.agent = new AgentRunner({
            ...config.agent,
            tools,
        });

        // 初始化会话存储并加载已有会话
        this.sessionStore = new SessionStore();
        this.sessions = this.sessionStore.loadAll();

        // 初始化快照和变动日志
        this.snapshotStore = new SnapshotStore();
        this.changeLog = new ChangeLog();

        if (config.authToken) {
            console.log(`[Gateway] Auth token enabled`);
        }

        this.setupWebSocket();
        this.setupHttpServer();
        this.setupHeartbeat();
        this.setupPreviewServer();
    }

    private setupWebSocket(): void {
        this.wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
            // 认证检查
            if (this.config.authToken) {
                const url = new URL(req.url ?? "", `http://${req.headers.host}`);
                const token = url.searchParams.get("token");
                if (token !== this.config.authToken) {
                    console.log(`[Gateway] Unauthorized connection attempt`);
                    ws.close(4001, "Unauthorized");
                    return;
                }
            }

            const connectionId = randomUUID();
            const connection: ClientConnection = {
                id: connectionId,
                ws,
                sessionId: "main",
            };
            this.connections.set(connectionId, connection);

            // 标记连接为活跃（用于心跳）
            (ws as any).isAlive = true;
            ws.on("pong", () => {
                (ws as any).isAlive = true;
            });

            console.log(`[Gateway] Client connected: ${connectionId}`);

            ws.on("message", (data: RawData) => {
                this.handleMessage(connection, data.toString());
            });

            ws.on("close", () => {
                this.connections.delete(connectionId);
                console.log(`[Gateway] Client disconnected: ${connectionId}`);
            });

            ws.on("error", (err) => {
                console.error(`[Gateway] WebSocket error:`, err);
            });

            // 发送欢迎消息
            this.sendEvent(ws, "connected", { connectionId });
        });

        this.wss.on("error", (err) => {
            console.error("[Gateway] WebSocket error:", err);
        });

        console.log(
            `[Gateway] WebSocket server running on ws://${this.config.host ?? "127.0.0.1"}:${this.config.port}`
        );
        console.log(`[Gateway] Workspace: ${this.config.workspace}`);
    }

    private setupHeartbeat(): void {
        this.heartbeatInterval = setInterval(() => {
            this.wss.clients.forEach((ws) => {
                if ((ws as any).isAlive === false) {
                    console.log(`[Gateway] Terminating inactive connection`);
                    ws.terminate();
                    return;
                }
                (ws as any).isAlive = false;
                ws.ping();
            });
        }, 30000);
        console.log(`[Gateway] Heartbeat enabled (30s interval)`);
    }

    private setupHttpServer(): void {
        const webPort = this.config.webPort ?? 3030;
        const host = this.config.host ?? "127.0.0.1";

        // 查找 public 目录
        const publicDir = this.config.publicDir ?? this.findPublicDir();
        if (!publicDir) {
            console.log("[Gateway] No public directory found, Web UI disabled");
            return;
        }

        this.httpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
            this.handleHttpRequest(req, res, publicDir);
        });

        this.httpServer.listen(webPort, host, () => {
            console.log(`[Gateway] Web UI available at http://${host}:${webPort}`);
        });

        this.httpServer.on("error", (err) => {
            console.error("[Gateway] HTTP server error:", err);
        });
    }

    private findPublicDir(): string | null {
        // 尝试多个可能的位置
        const candidates = [
            path.join(process.cwd(), "public"),
            path.join(process.cwd(), "website-bot-module", "public"),
            path.join(__dirname, "..", "..", "public"),
            path.join(__dirname, "..", "..", "..", "public"),
        ];

        for (const dir of candidates) {
            if (fs.existsSync(dir) && fs.existsSync(path.join(dir, "index.html"))) {
                console.log(`[Gateway] Found public directory: ${dir}`);
                return dir;
            }
        }
        return null;
    }

    private handleHttpRequest(req: IncomingMessage, res: ServerResponse, publicDir: string): void {
        const url = req.url ?? "/";
        let filePath = path.join(publicDir, url === "/" ? "index.html" : url);

        // 安全检查：防止目录遍历
        if (!filePath.startsWith(publicDir)) {
            res.writeHead(403);
            res.end("Forbidden");
            return;
        }

        // 获取文件扩展名和 MIME 类型
        const ext = path.extname(filePath).toLowerCase();
        const mimeTypes: Record<string, string> = {
            ".html": "text/html; charset=utf-8",
            ".css": "text/css; charset=utf-8",
            ".js": "application/javascript; charset=utf-8",
            ".json": "application/json; charset=utf-8",
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".gif": "image/gif",
            ".svg": "image/svg+xml",
            ".ico": "image/x-icon",
            ".woff": "font/woff",
            ".woff2": "font/woff2",
        };

        fs.readFile(filePath, (err, data) => {
            if (err) {
                if (err.code === "ENOENT") {
                    // 文件不存在，返回 index.html (SPA 支持)
                    const indexPath = path.join(publicDir, "index.html");
                    fs.readFile(indexPath, (indexErr, indexData) => {
                        if (indexErr) {
                            res.writeHead(404);
                            res.end("Not Found");
                        } else {
                            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
                            res.end(indexData);
                        }
                    });
                } else {
                    res.writeHead(500);
                    res.end("Server Error");
                }
                return;
            }

            const contentType = mimeTypes[ext] ?? "application/octet-stream";
            res.writeHead(200, {
                "Content-Type": contentType,
                "Cache-Control": ext === ".html" ? "no-cache" : "max-age=86400",
            });
            res.end(data);
        });
    }

    private async handleMessage(
        connection: ClientConnection,
        raw: string
    ): Promise<void> {
        try {
            const frame = JSON.parse(raw) as RequestFrame;

            if (!frame.id || !frame.method) {
                this.sendError(connection.ws as WebSocket, "unknown", "Invalid request frame");
                return;
            }

            const result = await this.dispatch(connection, frame);
            this.sendResponse(connection.ws as WebSocket, frame.id, result);
        } catch (err) {
            console.error("[Gateway] Message handling error:", err);
            const error = err instanceof Error ? err.message : "Unknown error";
            this.sendError(connection.ws as WebSocket, "unknown", error);
        }
    }

    private async dispatch(
        connection: ClientConnection,
        frame: RequestFrame
    ): Promise<unknown> {
        switch (frame.method) {
            case "chat.send":
                return this.handleChatSend(connection, frame.params as ChatSendParams);

            case "session.list":
                return this.handleSessionList();

            case "session.get":
                return this.handleSessionGet(frame.params as { sessionId: string });

            case "session.clear":
                return this.handleSessionClear(frame.params as { sessionId?: string });

            case "file.read":
                return this.handleFileRead(frame.params);

            case "file.write":
                return this.handleFileWrite(frame.params);

            case "file.list":
                return this.handleFileList(frame.params);

            case "snapshot.list":
                return this.handleSnapshotList(frame.params as { sessionId?: string });

            case "snapshot.rollback":
                return this.handleSnapshotRollback(connection, frame.params as { snapshotId: string });

            case "snapshot.diff":
                return this.handleSnapshotDiff(frame.params as { snapshotId: string });

            case "changelog.list":
                return this.handleChangelogList(frame.params as { sessionId?: string; limit?: number; offset?: number });

            case "changelog.clear":
                return this.handleChangelogClear(frame.params as { sessionId?: string });

            case "ping":
                return { pong: true };

            default:
                throw new Error(`Unknown method: ${frame.method}`);
        }
    }

    private async handleChatSend(
        connection: ClientConnection,
        params: ChatSendParams
    ): Promise<{ sessionId: string }> {
        const sessionId = params.sessionId ?? connection.sessionId;
        const ws = connection.ws as WebSocket;

        // 并发保护
        if (this.busySessions.has(sessionId)) {
            throw new Error("该会话正在处理中，请等待上一条消息完成");
        }
        this.busySessions.add(sessionId);

        // 获取或创建会话
        let session = this.sessions.get(sessionId);
        if (!session) {
            session = {
                id: sessionId,
                messages: [],
                createdAt: new Date(),
                updatedAt: new Date(),
            };
            this.sessions.set(sessionId, session);
        }

        // 添加用户消息
        session.messages.push({
            role: "user",
            content: params.content,
            images: params.images,
        });

        // 运行 Agent
        const context = {
            workspace: this.config.workspace,
            sessionId,
        };

        let assistantContent = "";
        const toolCalls: Array<{ id: string; name: string; input: unknown }> = [];
        const toolResults: Array<{ success?: boolean; content?: string; error?: string }> = [];

        try {
            for await (const event of this.agent.run(session.messages, context)) {
                // 发送事件到客户端
                this.sendEvent(ws, "chat", event);

                // 收集响应内容
                if (event.type === "text.delta" && event.text) {
                    assistantContent += event.text;
                } else if (event.type === "tool.call" && event.toolName) {
                    // 在破坏性操作前保存快照
                    const toolInput = event.toolInput as Record<string, string> | undefined;
                    if (toolInput && ["file_write", "file_delete", "file_rename"].includes(event.toolName)) {
                        const filePath = toolInput.path || toolInput.oldPath;
                        if (filePath) {
                            const absPath = path.resolve(this.config.workspace, filePath);
                            const actionMap: Record<string, "before_write" | "before_delete" | "before_rename"> = {
                                file_write: "before_write",
                                file_delete: "before_delete",
                                file_rename: "before_rename",
                            };
                            this.snapshotStore.save(sessionId, absPath, this.config.workspace, actionMap[event.toolName]!);
                        }
                    }
                    toolCalls.push({
                        id: randomUUID(),
                        name: event.toolName,
                        input: event.toolInput,
                    });
                } else if (event.type === "tool.result" && event.toolOutput) {
                    toolResults.push(event.toolOutput);

                    // 记录变动日志 + 发送预览刷新
                    const lastCall = toolCalls[toolCalls.length - 1];
                    if (lastCall && event.toolOutput.success) {
                        const input = lastCall.input as Record<string, string> | undefined;
                        const actionMap: Record<string, "write" | "delete" | "rename"> = {
                            file_write: "write",
                            file_delete: "delete",
                            file_rename: "rename",
                        };
                        if (input && actionMap[lastCall.name]) {
                            const filePath = input.path || input.oldPath || "unknown";
                            const summaryMap: Record<string, string> = {
                                file_write: (event.toolOutput as Record<string, unknown>).created ? `创建文件 ${filePath}` : `修改文件 ${filePath}`,
                                file_delete: `删除文件 ${filePath}`,
                                file_rename: `重命名 ${input.oldPath} → ${input.newPath}`,
                            };
                            this.changeLog.append({
                                sessionId,
                                action: actionMap[lastCall.name]!,
                                filePath,
                                newFilePath: input.newPath,
                                summary: summaryMap[lastCall.name] || `${lastCall.name}: ${filePath}`,
                                linesChanged: (event.toolOutput as Record<string, number>).lines,
                            });

                            // 通知前端刷新预览
                            this.sendEvent(ws, "preview.reload", { filePath });
                        }
                    }
                }
            }

            // 添加助手消息到会话
            session.messages.push({
                role: "assistant",
                content: assistantContent,
                toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
                toolResults: toolResults.length > 0 ? toolResults : undefined,
            });

            session.updatedAt = new Date();

            // 发送完成事件
            this.sendEvent(ws, "chat", { type: "done" });

            // 持久化保存
            this.sessionStore.save(session);
        } catch (err) {
            const error = err instanceof Error ? err.message : "Agent error";
            this.sendEvent(ws, "chat", { type: "error", error });
        } finally {
            this.busySessions.delete(sessionId);
        }

        return { sessionId };
    }

    private handleSessionList(): { sessions: Array<{ id: string; messageCount: number; updatedAt: Date }> } {
        const sessions = Array.from(this.sessions.values()).map((s) => ({
            id: s.id,
            messageCount: s.messages.length,
            updatedAt: s.updatedAt,
        }));
        return { sessions };
    }

    private handleSessionGet(params: { sessionId: string }): Session | null {
        return this.sessions.get(params.sessionId) ?? null;
    }

    private handleSessionClear(params: { sessionId?: string }): { cleared: boolean } {
        const sessionId = params.sessionId ?? "main";
        const session = this.sessions.get(sessionId);
        if (session) {
            session.messages = [];
            session.updatedAt = new Date();
            this.sessionStore.save(session);
            return { cleared: true };
        }
        return { cleared: false };
    }

    private async handleFileRead(params: unknown): Promise<unknown> {
        const tool = this.agent.getTool("file_read");
        if (!tool) throw new Error("file_read tool not found");
        return tool.execute(params, {
            workspace: this.config.workspace,
            sessionId: "system",
        });
    }

    private async handleFileWrite(params: unknown): Promise<unknown> {
        const tool = this.agent.getTool("file_write");
        if (!tool) throw new Error("file_write tool not found");
        return tool.execute(params, {
            workspace: this.config.workspace,
            sessionId: "system",
        });
    }

    private async handleFileList(params: unknown): Promise<unknown> {
        const tool = this.agent.getTool("file_list");
        if (!tool) throw new Error("file_list tool not found");
        return tool.execute(params, {
            workspace: this.config.workspace,
            sessionId: "system",
        });
    }

    // ==================== Snapshot API ====================

    private handleSnapshotList(params: { sessionId?: string }): unknown {
        return { snapshots: this.snapshotStore.list(params.sessionId) };
    }

    private handleSnapshotRollback(connection: ClientConnection, params: { snapshotId: string }): unknown {
        const result = this.snapshotStore.rollback(params.snapshotId);
        if (result.success) {
            // 记录回滚到变动日志
            this.changeLog.append({
                sessionId: connection.sessionId,
                action: "write",
                filePath: result.filePath || "unknown",
                summary: `回滚文件到快照 ${params.snapshotId}`,
            });
            // 通知前端刷新预览
            const ws = connection.ws as WebSocket;
            this.sendEvent(ws, "preview.reload", { filePath: result.filePath });
        }
        return result;
    }

    private handleSnapshotDiff(params: { snapshotId: string }): unknown {
        return this.snapshotStore.diff(params.snapshotId);
    }

    // ==================== ChangeLog API ====================

    private handleChangelogList(params: { sessionId?: string; limit?: number; offset?: number }): unknown {
        return this.changeLog.list(params);
    }

    private handleChangelogClear(params: { sessionId?: string }): unknown {
        const cleared = this.changeLog.clear(params.sessionId);
        return { cleared };
    }

    // ==================== Preview Server ====================

    private setupPreviewServer(): void {
        const previewPort = this.config.previewPort;
        if (!previewPort) return;

        const workspace = this.config.workspace;
        this.previewHttpServer = createServer((req, res) => {
            // CORS 头
            res.setHeader("Access-Control-Allow-Origin", "*");

            let urlPath = decodeURIComponent(req.url?.split("?")[0] || "/");
            if (urlPath === "/") urlPath = "/index.html";

            const filePath = path.join(workspace, urlPath);

            // 安全检查
            if (!filePath.startsWith(path.resolve(workspace))) {
                res.writeHead(403);
                res.end("Forbidden");
                return;
            }

            const ext = path.extname(filePath).toLowerCase();
            const mimeTypes: Record<string, string> = {
                ".html": "text/html",
                ".css": "text/css",
                ".js": "application/javascript",
                ".json": "application/json",
                ".png": "image/png",
                ".jpg": "image/jpeg",
                ".jpeg": "image/jpeg",
                ".gif": "image/gif",
                ".svg": "image/svg+xml",
                ".ico": "image/x-icon",
                ".webp": "image/webp",
                ".woff": "font/woff",
                ".woff2": "font/woff2",
                ".ttf": "font/ttf",
            };

            try {
                if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
                    res.writeHead(404);
                    res.end("Not Found");
                    return;
                }
                const content = fs.readFileSync(filePath);
                res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
                res.end(content);
            } catch {
                res.writeHead(500);
                res.end("Internal Server Error");
            }
        });

        const host = this.config.host ?? "0.0.0.0";
        this.previewHttpServer.listen(previewPort, host, () => {
            console.log(`[Gateway] Preview server running at http://${host}:${previewPort}`);
        });
    }

    private sendResponse(ws: WebSocket, id: string, result: unknown): void {
        const frame: ResponseFrame = { id, result };
        ws.send(JSON.stringify(frame));
    }

    private sendError(ws: WebSocket, id: string, message: string): void {
        const frame: ResponseFrame = { id, error: { message } };
        ws.send(JSON.stringify(frame));
    }

    private sendEvent(ws: WebSocket, event: string, data: unknown): void {
        const frame: EventFrame = { event, data };
        ws.send(JSON.stringify(frame));
    }

    public close(): void {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }
        this.wss.close();
        if (this.httpServer) {
            this.httpServer.close();
        }
        console.log("[Gateway] Server closed");
    }
}
