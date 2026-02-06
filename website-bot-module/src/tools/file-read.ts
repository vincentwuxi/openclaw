/**
 * file_read Tool
 * 读取网站文件内容
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { ToolDefinition, ToolContext, FileReadParams, ToolResult } from "../types/index.js";

export const fileReadTool: ToolDefinition = {
    name: "file_read",
    description: "读取网站文件内容。可以读取整个文件或指定行范围。",
    parameters: {
        properties: {
            path: {
                type: "string",
                description: "文件相对路径，例如 'index.html' 或 'styles/main.css'",
            },
            startLine: {
                type: "number",
                description: "起始行号 (1-indexed)，可选",
            },
            endLine: {
                type: "number",
                description: "结束行号 (1-indexed, inclusive)，可选",
            },
        },
        required: ["path"],
    },

    async execute(params: unknown, context: ToolContext): Promise<ToolResult> {
        const { path: filePath, startLine, endLine } = params as FileReadParams;
        const { workspace } = context;

        // 解析并验证路径
        const absolutePath = path.resolve(workspace, filePath);
        if (!absolutePath.startsWith(path.resolve(workspace))) {
            return { error: "路径越界访问被拒绝" };
        }

        try {
            // 检查文件是否存在
            const stat = await fs.stat(absolutePath);
            if (!stat.isFile()) {
                return { error: `'${filePath}' 不是一个文件` };
            }

            // 读取文件内容
            const content = await fs.readFile(absolutePath, "utf-8");
            const lines = content.split("\n");
            const totalLines = lines.length;

            // 处理行范围
            if (startLine !== undefined || endLine !== undefined) {
                const start = Math.max(1, startLine ?? 1) - 1;
                const end = Math.min(totalLines, endLine ?? totalLines);

                if (start >= end) {
                    return { error: "无效的行范围" };
                }

                const selectedLines = lines.slice(start, end);
                return {
                    success: true,
                    content: selectedLines.join("\n"),
                    startLine: start + 1,
                    endLine: end,
                    totalLines,
                };
            }

            return {
                success: true,
                content,
                totalLines,
            };
        } catch (err) {
            if ((err as NodeJS.ErrnoException).code === "ENOENT") {
                return { error: `文件不存在: ${filePath}` };
            }
            return { error: `读取文件失败: ${(err as Error).message}` };
        }
    },
};
