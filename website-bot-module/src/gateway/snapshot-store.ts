/**
 * WebBot Snapshot Store
 * 文件修改前自动保存快照，支持回滚
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { randomUUID } from "node:crypto";

export interface SnapshotEntry {
    id: string;
    sessionId: string;
    filePath: string;           // 相对于 workspace 的路径
    absolutePath: string;       // 原文件绝对路径
    timestamp: Date;
    action: "before_write" | "before_delete" | "before_rename";
    fileSize: number;
}

export class SnapshotStore {
    private baseDir: string;
    private indexFile: string;
    private entries: SnapshotEntry[] = [];

    constructor() {
        this.baseDir = path.join(os.homedir(), ".webbot", "snapshots");
        this.indexFile = path.join(this.baseDir, "index.json");
        this.ensureDir();
        this.loadIndex();
    }

    private ensureDir(): void {
        if (!fs.existsSync(this.baseDir)) {
            fs.mkdirSync(this.baseDir, { recursive: true });
            console.log(`[SnapshotStore] Created directory: ${this.baseDir}`);
        }
    }

    private loadIndex(): void {
        try {
            if (fs.existsSync(this.indexFile)) {
                const data = JSON.parse(fs.readFileSync(this.indexFile, "utf-8"));
                this.entries = data.map((e: SnapshotEntry) => ({
                    ...e,
                    timestamp: new Date(e.timestamp),
                }));
                console.log(`[SnapshotStore] Loaded ${this.entries.length} snapshot(s)`);
            }
        } catch {
            this.entries = [];
        }
    }

    private saveIndex(): void {
        fs.writeFileSync(this.indexFile, JSON.stringify(this.entries, null, 2), "utf-8");
    }

    /**
     * 保存文件快照（在修改/删除前调用）
     */
    save(sessionId: string, absolutePath: string, workspace: string, action: SnapshotEntry["action"]): SnapshotEntry | null {
        try {
            if (!fs.existsSync(absolutePath)) {
                return null; // 文件不存在，无需快照（新建场景）
            }

            const content = fs.readFileSync(absolutePath);
            const id = randomUUID().slice(0, 8);
            const timestamp = new Date();
            const relativePath = path.relative(workspace, absolutePath);

            // 存储快照文件
            const snapshotDir = path.join(this.baseDir, sessionId);
            if (!fs.existsSync(snapshotDir)) {
                fs.mkdirSync(snapshotDir, { recursive: true });
            }

            const safeFileName = relativePath.replace(/[/\\]/g, "__");
            const snapshotFile = path.join(snapshotDir, `${id}_${safeFileName}`);
            fs.writeFileSync(snapshotFile, content);

            const entry: SnapshotEntry = {
                id,
                sessionId,
                filePath: relativePath,
                absolutePath,
                timestamp,
                action,
                fileSize: content.length,
            };

            this.entries.push(entry);
            this.saveIndex();

            console.log(`[SnapshotStore] Saved snapshot ${id} for ${relativePath} (${action})`);
            return entry;
        } catch (err) {
            console.error("[SnapshotStore] Save error:", err);
            return null;
        }
    }

    /**
     * 获取快照列表
     */
    list(sessionId?: string): SnapshotEntry[] {
        const filtered = sessionId
            ? this.entries.filter((e) => e.sessionId === sessionId)
            : this.entries;
        return filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }

    /**
     * 获取快照内容
     */
    getContent(snapshotId: string): string | null {
        const entry = this.entries.find((e) => e.id === snapshotId);
        if (!entry) return null;

        const safeFileName = entry.filePath.replace(/[/\\]/g, "__");
        const snapshotFile = path.join(this.baseDir, entry.sessionId, `${snapshotId}_${safeFileName}`);

        try {
            return fs.readFileSync(snapshotFile, "utf-8");
        } catch {
            return null;
        }
    }

    /**
     * 回滚文件到快照版本
     */
    rollback(snapshotId: string): { success: boolean; filePath?: string; error?: string } {
        const entry = this.entries.find((e) => e.id === snapshotId);
        if (!entry) {
            return { success: false, error: "Snapshot not found" };
        }

        const content = this.getContent(snapshotId);
        if (content === null) {
            return { success: false, error: "Snapshot file not found" };
        }

        try {
            // 确保目录存在
            const dir = path.dirname(entry.absolutePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            fs.writeFileSync(entry.absolutePath, content, "utf-8");
            console.log(`[SnapshotStore] Rolled back ${entry.filePath} to snapshot ${snapshotId}`);
            return { success: true, filePath: entry.filePath };
        } catch (err) {
            const error = err instanceof Error ? err.message : "Unknown error";
            return { success: false, error };
        }
    }

    /**
     * 获取快照与当前文件的 diff
     */
    diff(snapshotId: string): { diff: string; filePath: string } | { error: string } {
        const entry = this.entries.find((e) => e.id === snapshotId);
        if (!entry) return { error: "Snapshot not found" };

        const snapshotContent = this.getContent(snapshotId);
        if (snapshotContent === null) return { error: "Snapshot file not found" };

        let currentContent = "";
        try {
            currentContent = fs.readFileSync(entry.absolutePath, "utf-8");
        } catch {
            currentContent = "（文件已删除）";
        }

        // 简单行级 diff
        const oldLines = snapshotContent.split("\n");
        const newLines = currentContent.split("\n");
        const diffLines: string[] = [];
        const maxLen = Math.max(oldLines.length, newLines.length);

        for (let i = 0; i < maxLen; i++) {
            const oldLine = oldLines[i];
            const newLine = newLines[i];
            if (oldLine === undefined) {
                diffLines.push(`+ ${newLine}`);
            } else if (newLine === undefined) {
                diffLines.push(`- ${oldLine}`);
            } else if (oldLine !== newLine) {
                diffLines.push(`- ${oldLine}`);
                diffLines.push(`+ ${newLine}`);
            }
        }

        return {
            diff: diffLines.length > 0 ? diffLines.join("\n") : "(no changes)",
            filePath: entry.filePath,
        };
    }
}
