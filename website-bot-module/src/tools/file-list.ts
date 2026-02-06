/**
 * file_list Tool
 * 列出目录内容
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { ToolDefinition, ToolContext, FileListParams, ToolResult } from "../types/index.js";

interface FileEntry {
    name: string;
    type: "file" | "directory";
    size?: number;
    modified?: string;
}

export const fileListTool: ToolDefinition = {
    name: "file_list",
    description: "列出目录中的文件和子目录。",
    parameters: {
        properties: {
            path: {
                type: "string",
                description: "要列出的目录路径，默认为项目根目录",
            },
            recursive: {
                type: "boolean",
                description: "是否递归列出子目录内容，默认 false",
            },
        },
        required: [],
    },

    async execute(params: unknown, context: ToolContext): Promise<ToolResult> {
        const { path: dirPath = ".", recursive = false } = (params ?? {}) as FileListParams;
        const { workspace } = context;

        // 解析并验证路径
        const absolutePath = path.resolve(workspace, dirPath);
        if (!absolutePath.startsWith(path.resolve(workspace))) {
            return { error: "路径越界访问被拒绝" };
        }

        try {
            const stat = await fs.stat(absolutePath);
            if (!stat.isDirectory()) {
                return { error: `'${dirPath}' 不是一个目录` };
            }

            const entries: FileEntry[] = [];
            const ignored = new Set(["node_modules", ".git", "dist", "build", ".next", ".cache"]);

            async function listDir(dir: string, prefix: string = ""): Promise<void> {
                const items = await fs.readdir(dir, { withFileTypes: true });

                for (const item of items) {
                    if (ignored.has(item.name)) continue;

                    const itemPath = path.join(dir, item.name);
                    const relativePath = prefix ? `${prefix}/${item.name}` : item.name;

                    if (item.isDirectory()) {
                        entries.push({
                            name: relativePath,
                            type: "directory",
                        });

                        if (recursive) {
                            await listDir(itemPath, relativePath);
                        }
                    } else if (item.isFile()) {
                        const fileStat = await fs.stat(itemPath);
                        entries.push({
                            name: relativePath,
                            type: "file",
                            size: fileStat.size,
                            modified: fileStat.mtime.toISOString(),
                        });
                    }
                }
            }

            await listDir(absolutePath);

            // 排序：目录在前，然后按名称
            entries.sort((a, b) => {
                if (a.type !== b.type) {
                    return a.type === "directory" ? -1 : 1;
                }
                return a.name.localeCompare(b.name);
            });

            return {
                success: true,
                path: dirPath,
                entries,
                count: entries.length,
            };
        } catch (err) {
            if ((err as NodeJS.ErrnoException).code === "ENOENT") {
                return { error: `目录不存在: ${dirPath}` };
            }
            return { error: `列出目录失败: ${(err as Error).message}` };
        }
    },
};
