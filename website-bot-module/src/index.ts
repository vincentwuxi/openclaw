/**
 * WebBot Main Entry
 * 模块主入口
 */

// Gateway
export { GatewayServer } from "./gateway/server.js";

// Agent
export { AgentRunner } from "./agent/runner.js";
export { WEBBOT_SYSTEM_PROMPT, WEBBOT_SYSTEM_PROMPT_MINIMAL } from "./agent/system-prompt.js";

// Tools
export {
    createToolRegistry,
    fileReadTool,
    fileWriteTool,
    fileSearchTool,
    fileListTool,
} from "./tools/registry.js";

// Types
export type {
    RequestFrame,
    ResponseFrame,
    EventFrame,
    ChatSendParams,
    ChatEvent,
    Session,
    Message,
    ToolDefinition,
    ToolCall,
    ToolResult,
    ToolContext,
    AgentConfig,
    AgentEvent,
    GatewayConfig,
    FileReadParams,
    FileWriteParams,
    FileSearchParams,
    FileListParams,
} from "./types/index.js";

/**
 * 创建 WebBot 实例的便捷函数
 */
export function createWebBot(options: {
    workspace: string;
    port?: number;
    host?: string;
    model?: string;
    apiKey?: string;
}) {
    // 延迟导入以避免循环依赖
    const { GatewayServer } = require("./gateway/server.js");

    const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
    if (!apiKey) {
        throw new Error("API key is required. Set OPENAI_API_KEY or pass apiKey option.");
    }

    return new GatewayServer({
        port: options.port ?? 8080,
        host: options.host ?? "127.0.0.1",
        workspace: options.workspace,
        agent: {
            model: options.model ?? "gemini-3-flash-preview",
            apiKey,
            systemPrompt: "",
            tools: [],
        },
    });
}
