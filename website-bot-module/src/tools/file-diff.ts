/**
 * file_diff Tool
 * 对比文件修改前后的差异
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { ToolDefinition, ToolContext, ToolResult } from "../types/index.js";

interface FileDiffParams {
    path: string;
    newContent: string;
}

/**
 * 简单的行级 diff 算法
 * 返回修改、新增、删除的行
 */
function computeDiff(
    oldLines: string[],
    newLines: string[]
): { added: number; removed: number; unchanged: number; patches: string[] } {
    const patches: string[] = [];
    let added = 0;
    let removed = 0;
    let unchanged = 0;

    // 简单的逐行对比（非 LCS，但够用）
    let oldIdx = 0;
    let newIdx = 0;

    while (oldIdx < oldLines.length || newIdx < newLines.length) {
        const oldLine = oldIdx < oldLines.length ? oldLines[oldIdx] : undefined;
        const newLine = newIdx < newLines.length ? newLines[newIdx] : undefined;

        if (oldLine === newLine) {
            unchanged++;
            oldIdx++;
            newIdx++;
        } else if (oldLine !== undefined && newLine !== undefined) {
            // 行已修改
            patches.push(`@@ line ${oldIdx + 1} @@`);
            patches.push(`- ${oldLine}`);
            patches.push(`+ ${newLine}`);
            removed++;
            added++;
            oldIdx++;
            newIdx++;
        } else if (oldLine === undefined && newLine !== undefined) {
            // 新增行
            patches.push(`+ ${newLine}`);
            added++;
            newIdx++;
        } else if (oldLine !== undefined && newLine === undefined) {
            // 删除行
            patches.push(`- ${oldLine}`);
            removed++;
            oldIdx++;
        }
    }

    return { added, removed, unchanged, patches };
}

export const fileDiffTool: ToolDefinition = {
    name: "file_diff",
    description: "对比当前文件内容与新内容的差异。在写入前预览修改效果。",
    parameters: {
        properties: {
            path: {
                type: "string",
                description: "要对比的文件相对路径",
            },
            newContent: {
                type: "string",
                description: "新的文件内容",
            },
        },
        required: ["path", "newContent"],
    },

    async execute(params: unknown, context: ToolContext): Promise<ToolResult> {
        const { path: filePath, newContent } = params as FileDiffParams;
        const { workspace } = context;

        // 解析并验证路径
        const absolutePath = path.resolve(workspace, filePath);
        if (!absolutePath.startsWith(path.resolve(workspace))) {
            return { error: "路径越界访问被拒绝" };
        }

        try {
            let oldContent = "";
            let isNewFile = false;

            try {
                oldContent = await fs.readFile(absolutePath, "utf-8");
            } catch {
                isNewFile = true;
            }

            const oldLines = isNewFile ? [] : oldContent.split("\n");
            const newLines = newContent.split("\n");

            const diff = computeDiff(oldLines, newLines);

            // 限制 patches 输出长度
            const MAX_PATCHES = 100;
            const truncated = diff.patches.length > MAX_PATCHES;
            const displayPatches = truncated
                ? diff.patches.slice(0, MAX_PATCHES)
                : diff.patches;

            return {
                success: true,
                path: filePath,
                isNewFile,
                stats: {
                    oldLines: oldLines.length,
                    newLines: newLines.length,
                    added: diff.added,
                    removed: diff.removed,
                    unchanged: diff.unchanged,
                },
                diff: displayPatches.join("\n"),
                truncated,
            };
        } catch (err) {
            return { error: `对比失败: ${(err as Error).message}` };
        }
    },
};
