/**
 * Session Store
 * JSON 文件持久化会话存储
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { homedir } from "node:os";
import type { Session } from "../types/index.js";

const SESSIONS_DIR = path.join(homedir(), ".webbot", "sessions");

export class SessionStore {
    private sessionsDir: string;

    constructor(customDir?: string) {
        this.sessionsDir = customDir ?? SESSIONS_DIR;
        this.ensureDir();
    }

    private ensureDir(): void {
        if (!fs.existsSync(this.sessionsDir)) {
            fs.mkdirSync(this.sessionsDir, { recursive: true });
            console.log(`[SessionStore] Created sessions directory: ${this.sessionsDir}`);
        }
    }

    /**
     * 加载所有持久化的会话
     */
    loadAll(): Map<string, Session> {
        const sessions = new Map<string, Session>();

        try {
            const files = fs.readdirSync(this.sessionsDir).filter(f => f.endsWith(".json"));
            for (const file of files) {
                try {
                    const filePath = path.join(this.sessionsDir, file);
                    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
                    const session: Session = {
                        ...data,
                        createdAt: new Date(data.createdAt),
                        updatedAt: new Date(data.updatedAt),
                    };
                    sessions.set(session.id, session);
                } catch {
                    // 跳过损坏的文件
                }
            }

            if (sessions.size > 0) {
                console.log(`[SessionStore] Loaded ${sessions.size} session(s)`);
            }
        } catch {
            // 目录不存在或无法读取
        }

        return sessions;
    }

    /**
     * 保存单个会话
     */
    save(session: Session): void {
        try {
            const filePath = path.join(this.sessionsDir, `${session.id}.json`);
            fs.writeFileSync(filePath, JSON.stringify(session, null, 2), "utf-8");
        } catch (err) {
            console.error(`[SessionStore] Failed to save session ${session.id}:`, err);
        }
    }

    /**
     * 删除会话文件
     */
    delete(sessionId: string): void {
        try {
            const filePath = path.join(this.sessionsDir, `${sessionId}.json`);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        } catch (err) {
            console.error(`[SessionStore] Failed to delete session ${sessionId}:`, err);
        }
    }
}
