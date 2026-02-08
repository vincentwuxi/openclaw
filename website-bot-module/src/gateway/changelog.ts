/**
 * WebBot ChangeLog
 * 记录每次 AI 修改的详细日志
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { randomUUID } from "node:crypto";

export interface ChangeEntry {
    id: string;
    timestamp: Date;
    sessionId: string;
    action: "write" | "delete" | "rename";
    filePath: string;
    newFilePath?: string;       // rename 时的新路径
    summary: string;            // 变更摘要
    snapshotId?: string;        // 关联的快照 ID
    linesChanged?: number;      // 行数变化
}

export class ChangeLog {
    private logFile: string;
    private entries: ChangeEntry[] = [];

    constructor() {
        const dir = path.join(os.homedir(), ".webbot");
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        this.logFile = path.join(dir, "changelog.json");
        this.load();
    }

    private load(): void {
        try {
            if (fs.existsSync(this.logFile)) {
                const data = JSON.parse(fs.readFileSync(this.logFile, "utf-8"));
                this.entries = data.map((e: ChangeEntry) => ({
                    ...e,
                    timestamp: new Date(e.timestamp),
                }));
                console.log(`[ChangeLog] Loaded ${this.entries.length} entries`);
            }
        } catch {
            this.entries = [];
        }
    }

    private save(): void {
        fs.writeFileSync(this.logFile, JSON.stringify(this.entries, null, 2), "utf-8");
    }

    /**
     * 追加一条变更记录
     */
    append(entry: Omit<ChangeEntry, "id" | "timestamp">): ChangeEntry {
        const full: ChangeEntry = {
            ...entry,
            id: randomUUID().slice(0, 8),
            timestamp: new Date(),
        };
        this.entries.push(full);
        this.save();

        const icon = entry.action === "write" ? "✏️" : entry.action === "delete" ? "🗑️" : "📝";
        console.log(`[ChangeLog] ${icon} ${entry.action}: ${entry.filePath} — ${entry.summary}`);
        return full;
    }

    /**
     * 获取变更日志（分页，最近优先）
     */
    list(options?: { sessionId?: string; limit?: number; offset?: number }): {
        entries: ChangeEntry[];
        total: number;
    } {
        let filtered = this.entries;
        if (options?.sessionId) {
            filtered = filtered.filter((e) => e.sessionId === options.sessionId);
        }
        const total = filtered.length;
        const sorted = filtered.sort(
            (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );

        const offset = options?.offset ?? 0;
        const limit = options?.limit ?? 50;
        return {
            entries: sorted.slice(offset, offset + limit),
            total,
        };
    }

    /**
     * 清空日志
     */
    clear(sessionId?: string): number {
        if (sessionId) {
            const before = this.entries.length;
            this.entries = this.entries.filter((e) => e.sessionId !== sessionId);
            this.save();
            return before - this.entries.length;
        }
        const count = this.entries.length;
        this.entries = [];
        this.save();
        return count;
    }
}
