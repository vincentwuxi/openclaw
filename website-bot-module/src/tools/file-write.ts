/**
 * file_write Tool
 * 写入或创建网站文件
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { ToolDefinition, ToolContext, FileWriteParams, ToolResult } from "../types/index.js";

// 敏感文件模式
const PROTECTED_PATTERNS = [
    /^\.env/i,
    /\.key$/i,
    /\.pem$/i,
    /credential/i,
    /secret/i,
    /password/i,
];

function isProtectedFile(filePath: string): boolean {
    const basename = path.basename(filePath);
    return PROTECTED_PATTERNS.some((pattern) => pattern.test(basename));
}

export const fileWriteTool: ToolDefinition = {
    name: "file_write",
    description: "写入或创建网站文件。可以修改现有文件或创建新文件。",
    parameters: {
        properties: {
            path: {
                type: "string",
                description: "文件相对路径，例如 'index.html' 或 'styles/main.css'",
            },
            content: {
                type: "string",
                description: "要写入的文件内容",
            },
            createDirs: {
                type: "boolean",
                description: "如果目录不存在，是否自动创建。默认 true",
            },
        },
        required: ["path", "content"],
    },

    async execute(params: unknown, context: ToolContext): Promise<ToolResult> {
        const { path: filePath, content, createDirs = true } = params as FileWriteParams;
        const { workspace } = context;

        // 解析并验证路径
        const absolutePath = path.resolve(workspace, filePath);
        if (!absolutePath.startsWith(path.resolve(workspace))) {
            return { error: "路径越界访问被拒绝" };
        }

        // 检查是否是受保护文件
        if (isProtectedFile(filePath)) {
            return { error: `无法修改敏感文件: ${filePath}` };
        }

        try {
            // 创建目录
            if (createDirs) {
                await fs.mkdir(path.dirname(absolutePath), { recursive: true });
            }

            // 检查文件是否存在（用于返回信息）
            let isNew = true;
            try {
                await fs.access(absolutePath);
                isNew = false;
            } catch {
                // 文件不存在，将创建新文件
            }

            // 写入文件
            await fs.writeFile(absolutePath, content, "utf-8");

            const lines = content.split("\n").length;

            return {
                success: true,
                path: filePath,
                created: isNew,
                modified: !isNew,
                lines,
                bytes: Buffer.byteLength(content, "utf-8"),
            };
        } catch (err) {
            return { error: `写入文件失败: ${(err as Error).message}` };
        }
    },
};
