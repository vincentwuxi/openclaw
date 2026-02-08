/**
 * file_rename Tool
 * 重命名或移动网站文件
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { ToolDefinition, ToolContext, ToolResult } from "../types/index.js";

interface FileRenameParams {
    oldPath: string;
    newPath: string;
}

export const fileRenameTool: ToolDefinition = {
    name: "file_rename",
    description: "重命名或移动网站文件。可以在不同目录间移动文件。",
    parameters: {
        properties: {
            oldPath: {
                type: "string",
                description: "原文件相对路径",
            },
            newPath: {
                type: "string",
                description: "新文件相对路径",
            },
        },
        required: ["oldPath", "newPath"],
    },

    async execute(params: unknown, context: ToolContext): Promise<ToolResult> {
        const { oldPath, newPath } = params as FileRenameParams;
        const { workspace } = context;

        // 解析并验证两个路径
        const absoluteOld = path.resolve(workspace, oldPath);
        const absoluteNew = path.resolve(workspace, newPath);

        if (!absoluteOld.startsWith(path.resolve(workspace))) {
            return { error: "原路径越界访问被拒绝" };
        }
        if (!absoluteNew.startsWith(path.resolve(workspace))) {
            return { error: "目标路径越界访问被拒绝" };
        }

        try {
            // 检查源文件是否存在
            const stat = await fs.stat(absoluteOld);
            if (!stat.isFile()) {
                return { error: `'${oldPath}' 不是一个文件` };
            }

            // 检查目标文件是否已存在
            try {
                await fs.access(absoluteNew);
                return { error: `目标文件已存在: ${newPath}` };
            } catch {
                // 目标不存在，正常
            }

            // 确保目标目录存在
            await fs.mkdir(path.dirname(absoluteNew), { recursive: true });

            // 执行重命名
            await fs.rename(absoluteOld, absoluteNew);

            return {
                success: true,
                oldPath,
                newPath,
                size: stat.size,
            };
        } catch (err) {
            if ((err as NodeJS.ErrnoException).code === "ENOENT") {
                return { error: `文件不存在: ${oldPath}` };
            }
            return { error: `重命名失败: ${(err as Error).message}` };
        }
    },
};
