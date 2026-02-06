/**
 * file_search Tool
 * 搜索文件内容
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { globby } from "globby";
import type { ToolDefinition, ToolContext, FileSearchParams, ToolResult } from "../types/index.js";

interface SearchMatch {
    file: string;
    line: number;
    content: string;
}

export const fileSearchTool: ToolDefinition = {
    name: "file_search",
    description: "在项目文件中搜索内容。支持字符串匹配和正则表达式。",
    parameters: {
        properties: {
            pattern: {
                type: "string",
                description: "搜索模式，可以是普通字符串或正则表达式",
            },
            path: {
                type: "string",
                description: "搜索范围，默认为整个项目。可以指定目录或文件模式",
            },
            maxResults: {
                type: "number",
                description: "最大结果数量，默认 50",
            },
        },
        required: ["pattern"],
    },

    async execute(params: unknown, context: ToolContext): Promise<ToolResult> {
        const { pattern, path: searchPath, maxResults = 50 } = params as FileSearchParams;
        const { workspace } = context;

        try {
            // 创建正则表达式
            let regex: RegExp;
            try {
                regex = new RegExp(pattern, "gi");
            } catch {
                // 如果不是有效的正则，则转义为字面量
                regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
            }

            // 获取文件列表
            const globPattern = searchPath
                ? path.join(workspace, searchPath, "**/*")
                : path.join(workspace, "**/*");

            const files = await globby(globPattern, {
                ignore: [
                    "**/node_modules/**",
                    "**/.git/**",
                    "**/dist/**",
                    "**/build/**",
                    "**/*.lock",
                    "**/package-lock.json",
                ],
                onlyFiles: true,
                absolute: true,
            });

            const matches: SearchMatch[] = [];
            let filesSearched = 0;

            for (const file of files) {
                if (matches.length >= maxResults) break;

                // 跳过二进制文件
                const ext = path.extname(file).toLowerCase();
                if ([".png", ".jpg", ".jpeg", ".gif", ".ico", ".woff", ".woff2", ".ttf", ".eot", ".pdf", ".zip"].includes(ext)) {
                    continue;
                }

                try {
                    const content = await fs.readFile(file, "utf-8");
                    const lines = content.split("\n");

                    for (let i = 0; i < lines.length; i++) {
                        if (matches.length >= maxResults) break;

                        const line = lines[i];
                        if (line !== undefined && regex.test(line)) {
                            matches.push({
                                file: path.relative(workspace, file),
                                line: i + 1,
                                content: line.trim().slice(0, 200), // 截断过长的行
                            });
                        }
                        // 重置正则状态
                        regex.lastIndex = 0;
                    }

                    filesSearched++;
                } catch {
                    // 跳过无法读取的文件
                }
            }

            return {
                success: true,
                pattern,
                matches,
                matchCount: matches.length,
                filesSearched,
                truncated: matches.length >= maxResults,
            };
        } catch (err) {
            return { error: `搜索失败: ${(err as Error).message}` };
        }
    },
};
