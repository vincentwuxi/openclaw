/**
 * file_delete Tool
 * 删除网站文件
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { ToolDefinition, ToolContext, ToolResult } from "../types/index.js";

// 敏感文件模式（与 file-write 保持一致）
const PROTECTED_PATTERNS = [
    /^\.env/i,
    /\.key$/i,
    /\.pem$/i,
    /credential/i,
    /secret/i,
    /password/i,
];

// 关键目录保护
const PROTECTED_DIRS = [
    "node_modules",
    ".git",
];

function isProtectedFile(filePath: string): boolean {
    const basename = path.basename(filePath);
    return PROTECTED_PATTERNS.some((pattern) => pattern.test(basename));
}

function isProtectedDir(filePath: string): boolean {
    const parts = filePath.split(path.sep);
    return parts.some((part) => PROTECTED_DIRS.includes(part));
}

interface FileDeleteParams {
    path: string;
}

export const fileDeleteTool: ToolDefinition = {
    name: "file_delete",
    description: "删除网站文件。不能删除目录，只能删除单个文件。",
    parameters: {
        properties: {
            path: {
                type: "string",
                description: "要删除的文件相对路径",
            },
        },
        required: ["path"],
    },

    async execute(params: unknown, context: ToolContext): Promise<ToolResult> {
        const { path: filePath } = params as FileDeleteParams;
        const { workspace } = context;

        // 解析并验证路径
        const absolutePath = path.resolve(workspace, filePath);
        if (!absolutePath.startsWith(path.resolve(workspace))) {
            return { error: "路径越界访问被拒绝" };
        }

        // 检查是否是受保护文件
        if (isProtectedFile(filePath)) {
            return { error: `无法删除敏感文件: ${filePath}` };
        }

        // 检查是否在受保护目录中
        if (isProtectedDir(filePath)) {
            return { error: `无法删除受保护目录中的文件: ${filePath}` };
        }

        try {
            const stat = await fs.stat(absolutePath);
            if (!stat.isFile()) {
                return { error: `'${filePath}' 不是一个文件，不支持删除目录` };
            }

            const size = stat.size;
            await fs.unlink(absolutePath);

            return {
                success: true,
                path: filePath,
                deletedBytes: size,
            };
        } catch (err) {
            if ((err as NodeJS.ErrnoException).code === "ENOENT") {
                return { error: `文件不存在: ${filePath}` };
            }
            return { error: `删除文件失败: ${(err as Error).message}` };
        }
    },
};
