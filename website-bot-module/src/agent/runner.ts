/**
 * WebBot Agent Runner
 * LLM 推理运行时，支持多种提供者 (Anthropic/OpenAI/DeepSeek)
 */

import OpenAI from "openai";
import type {
    AgentConfig,
    AgentEvent,
    Message,
    ToolContext,
    ToolDefinition,
    ToolResult,
} from "../types/index.js";
import { WEBBOT_SYSTEM_PROMPT } from "./system-prompt.js";

export interface AgentRunnerConfig extends AgentConfig {
    provider?: "anthropic" | "openai" | "deepseek";
    baseURL?: string;
}

export class AgentRunner {
    private client: OpenAI;
    private config: AgentRunnerConfig;
    private toolsMap: Map<string, ToolDefinition>;

    constructor(config: AgentRunnerConfig) {
        this.config = config;
        this.toolsMap = new Map(config.tools.map((t) => [t.name, t]));

        // 根据提供者配置客户端
        const provider = config.provider ?? "deepseek";
        let baseURL: string;

        switch (provider) {
            case "deepseek":
                baseURL = config.baseURL ?? "https://api.deepseek.com";
                break;
            case "openai":
                baseURL = config.baseURL ?? "https://api.openai.com/v1";
                break;
            case "anthropic":
                // Anthropic 需要使用其专用 SDK，这里暂时不支持
                throw new Error("请使用 Anthropic SDK 或切换到 OpenAI 兼容提供者");
            default:
                baseURL = config.baseURL ?? "https://api.deepseek.com";
        }

        this.client = new OpenAI({
            apiKey: config.apiKey,
            baseURL,
        });

        console.log(`[Agent] Provider: ${provider}`);
        console.log(`[Agent] Base URL: ${baseURL}`);
        console.log(`[Agent] Model: ${config.model}`);
    }

    async *run(
        messages: Message[],
        context: ToolContext
    ): AsyncGenerator<AgentEvent> {
        const systemPrompt = this.config.systemPrompt || WEBBOT_SYSTEM_PROMPT;
        const formattedMessages = this.formatMessages(messages, systemPrompt);
        const tools = this.formatTools();

        let continueLoop = true;

        while (continueLoop) {
            continueLoop = false;

            try {
                const response = await this.client.chat.completions.create({
                    model: this.config.model,
                    max_tokens: this.config.maxTokens ?? 4096,
                    messages: formattedMessages,
                    tools: tools.length > 0 ? tools : undefined,
                    stream: true,
                });

                let currentToolCall: { id: string; name: string; arguments: string } | null = null;
                let assistantContent = "";

                for await (const chunk of response) {
                    const delta = chunk.choices[0]?.delta;

                    if (delta?.content) {
                        assistantContent += delta.content;
                        yield { type: "text.delta", text: delta.content };
                    }

                    if (delta?.tool_calls) {
                        for (const toolCall of delta.tool_calls) {
                            if (toolCall.function?.name) {
                                // 新工具调用开始
                                if (currentToolCall) {
                                    // 执行上一个工具
                                    yield* this.executeToolCall(currentToolCall, context, formattedMessages);
                                }
                                currentToolCall = {
                                    id: toolCall.id ?? `call_${Date.now()}`,
                                    name: toolCall.function.name,
                                    arguments: toolCall.function.arguments ?? "",
                                };
                            } else if (toolCall.function?.arguments && currentToolCall) {
                                currentToolCall.arguments += toolCall.function.arguments;
                            }
                        }
                    }

                    // 检查是否结束
                    if (chunk.choices[0]?.finish_reason === "tool_calls" && currentToolCall) {
                        yield* this.executeToolCall(currentToolCall, context, formattedMessages);
                        continueLoop = true;
                        currentToolCall = null;
                    }
                }

                if (assistantContent) {
                    yield { type: "text.done" };
                }
            } catch (err) {
                console.error("[Agent] API Error:", err);
                const error = err instanceof Error ? err.message : "Unknown error";
                yield { type: "error", error };
                return;
            }
        }
    }

    private async *executeToolCall(
        toolCall: { id: string; name: string; arguments: string },
        context: ToolContext,
        messages: OpenAI.ChatCompletionMessageParam[]
    ): AsyncGenerator<AgentEvent> {
        yield {
            type: "tool.call",
            toolName: toolCall.name,
            toolInput: JSON.parse(toolCall.arguments || "{}"),
        };

        // 执行工具
        const tool = this.toolsMap.get(toolCall.name);
        let toolResult: ToolResult;

        if (tool) {
            try {
                const input = JSON.parse(toolCall.arguments || "{}");
                toolResult = await tool.execute(input, context);
            } catch (err) {
                toolResult = {
                    error: err instanceof Error ? err.message : "Tool execution failed",
                };
            }
        } else {
            toolResult = { error: `Unknown tool: ${toolCall.name}` };
        }

        yield {
            type: "tool.result",
            toolName: toolCall.name,
            toolOutput: toolResult,
        };

        // 添加工具调用和结果到消息历史
        messages.push({
            role: "assistant",
            content: null,
            tool_calls: [
                {
                    id: toolCall.id,
                    type: "function",
                    function: {
                        name: toolCall.name,
                        arguments: toolCall.arguments,
                    },
                },
            ],
        });

        messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify(toolResult),
        });
    }

    private formatMessages(
        messages: Message[],
        systemPrompt: string
    ): OpenAI.ChatCompletionMessageParam[] {
        const formatted: OpenAI.ChatCompletionMessageParam[] = [
            { role: "system", content: systemPrompt },
        ];

        for (const msg of messages) {
            if (msg.images && msg.images.length > 0) {
                // 多模态消息（图片+文字）
                const content: OpenAI.ChatCompletionContentPart[] = [];

                // 添加文字内容
                if (msg.content) {
                    content.push({ type: "text", text: msg.content });
                }

                // 添加图片内容
                for (const img of msg.images) {
                    content.push({
                        type: "image_url",
                        image_url: {
                            url: img.data, // data:image/png;base64,... 格式
                        },
                    });
                }

                formatted.push({
                    role: msg.role,
                    content,
                } as OpenAI.ChatCompletionMessageParam);
            } else {
                // 纯文字消息
                formatted.push({
                    role: msg.role,
                    content: msg.content,
                });
            }
        }

        return formatted;
    }

    private formatTools(): OpenAI.ChatCompletionTool[] {
        return this.config.tools.map((tool) => ({
            type: "function" as const,
            function: {
                name: tool.name,
                description: tool.description,
                parameters: {
                    type: "object",
                    ...tool.parameters,
                },
            },
        }));
    }

    public getTool(name: string): ToolDefinition | undefined {
        return this.toolsMap.get(name);
    }
}
