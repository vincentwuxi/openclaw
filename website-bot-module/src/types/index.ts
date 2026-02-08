/**
 * WebBot Type Definitions
 */

// ==================== Protocol Types ====================

export interface RequestFrame {
    id: string;
    method: string;
    params?: unknown;
}

export interface ResponseFrame {
    id: string;
    result?: unknown;
    error?: ErrorShape;
}

export interface EventFrame {
    event: string;
    data: unknown;
}

export interface ErrorShape {
    code?: number;
    message: string;
}

// ==================== Chat Types ====================

export interface ImageContent {
    type: "base64" | "url";
    data: string; // Base64 data URI or URL
}

export interface ChatSendParams {
    sessionId?: string;
    content: string;
    images?: ImageContent[];
}

export interface ChatEvent {
    type:
    | "text.delta"
    | "text.done"
    | "tool.call"
    | "tool.result"
    | "error"
    | "done";
    text?: string;
    name?: string;
    input?: unknown;
    output?: unknown;
    error?: string;
}

// ==================== Session Types ====================

export interface Session {
    id: string;
    messages: Message[];
    createdAt: Date;
    updatedAt: Date;
}

export interface Message {
    role: "user" | "assistant";
    content: string;
    images?: ImageContent[];
    toolCalls?: ToolCall[];
    toolResults?: ToolResult[];
}

// ==================== Tool Types ====================

export interface ToolDefinition {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    execute: (params: unknown, context: ToolContext) => Promise<ToolResult>;
}

export interface ToolCall {
    id: string;
    name: string;
    input: unknown;
}

export interface ToolResult {
    success?: boolean;
    content?: string;
    error?: string;
    [key: string]: unknown;
}

export interface ToolContext {
    workspace: string;
    sessionId: string;
}

// ==================== Agent Types ====================

export interface AgentConfig {
    model: string;
    apiKey: string;
    systemPrompt: string;
    tools: ToolDefinition[];
    maxTokens?: number;
    provider?: "openai" | "deepseek";
    baseURL?: string;
}

export interface AgentEvent {
    type:
    | "text.delta"
    | "text.done"
    | "tool.call"
    | "tool.result"
    | "thinking"
    | "error"
    | "done";
    text?: string;
    toolName?: string;
    toolInput?: unknown;
    toolOutput?: ToolResult;
    error?: string;
}

// ==================== Gateway Types ====================

export interface GatewayConfig {
    port: number;
    host?: string;
    workspace: string;
    agent: AgentConfig;
}

export interface ClientConnection {
    id: string;
    ws: unknown; // WebSocket instance
    sessionId: string;
}

// ==================== File Tool Types ====================

export interface FileReadParams {
    path: string;
    startLine?: number;
    endLine?: number;
}

export interface FileWriteParams {
    path: string;
    content: string;
    createDirs?: boolean;
}

export interface FileSearchParams {
    pattern: string;
    path?: string;
    maxResults?: number;
}

export interface FileListParams {
    path?: string;
    recursive?: boolean;
}
