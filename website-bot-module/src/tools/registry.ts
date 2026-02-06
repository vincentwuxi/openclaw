/**
 * Tool Registry
 * 工具注册和管理
 */

import type { ToolDefinition } from "../types/index.js";
import { fileReadTool } from "./file-read.js";
import { fileWriteTool } from "./file-write.js";
import { fileSearchTool } from "./file-search.js";
import { fileListTool } from "./file-list.js";

/**
 * 创建工具注册表
 * @param workspace 工作目录
 * @returns 工具定义数组
 */
export function createToolRegistry(workspace: string): ToolDefinition[] {
    // 返回所有可用工具
    const tools: ToolDefinition[] = [
        fileReadTool,
        fileWriteTool,
        fileSearchTool,
        fileListTool,
    ];

    console.log(`[Tools] Registered ${tools.length} tools for workspace: ${workspace}`);
    console.log(`[Tools] Available: ${tools.map((t) => t.name).join(", ")}`);

    return tools;
}

/**
 * 获取工具定义的 JSON Schema
 */
export function getToolSchemas(tools: ToolDefinition[]): object[] {
    return tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: {
            type: "object",
            ...tool.parameters,
        },
    }));
}

// 导出所有工具
export { fileReadTool, fileWriteTool, fileSearchTool, fileListTool };
