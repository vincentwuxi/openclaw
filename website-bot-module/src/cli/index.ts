#!/usr/bin/env node
/**
 * WebBot CLI
 * 命令行工具入口
 */

import { Command } from "commander";
import { GatewayServer } from "../gateway/server.js";
import * as path from "node:path";
import * as fs from "node:fs";

const program = new Command();

program
    .name("webbot")
    .description("WebBot - 网站修改智能助手")
    .version("1.0.0");

// serve 命令 - 启动 Gateway 服务器
program
    .command("serve")
    .description("启动 WebBot Gateway 服务器")
    .option("-p, --port <port>", "WebSocket 端口号", "8080")
    .option("--web-port <port>", "Web UI 端口号", "3030")
    .option("-h, --host <host>", "监听地址", "127.0.0.1")
    .option("-w, --workspace <path>", "网站项目目录", ".")
    .option("-m, --model <model>", "LLM 模型", "gemini-3-flash")
    .option("--provider <provider>", "LLM 提供者 (openai/deepseek)", "openai")
    .option("--base-url <url>", "API 端点 URL", "https://api2.aivolo.com/v1")
    .action((options) => {
        const workspace = path.resolve(options.workspace);

        // 验证 workspace
        if (!fs.existsSync(workspace)) {
            console.error(`错误: 工作目录不存在: ${workspace}`);
            process.exit(1);
        }

        // 检查 API Key
        const apiKey = process.env.OPENAI_API_KEY || process.env.DEEPSEEK_API_KEY;
        if (!apiKey) {
            console.error("错误: 请设置 OPENAI_API_KEY 或 DEEPSEEK_API_KEY 环境变量");
            process.exit(1);
        }

        console.log(`
╔══════════════════════════════════════════════════════════╗
║                    WebBot v1.0.0                         ║
║              网站修改智能助手                              ║
╚══════════════════════════════════════════════════════════╝
`);

        const gateway = new GatewayServer({
            port: parseInt(options.port),
            webPort: parseInt(options.webPort),
            host: options.host,
            workspace,
            agent: {
                model: options.model,
                apiKey,
                provider: options.provider,
                baseURL: options.baseUrl,
                systemPrompt: "", // 使用默认
                tools: [],
            },
        });

        // 优雅退出
        process.on("SIGINT", () => {
            console.log("\n正在关闭服务器...");
            gateway.close();
            process.exit(0);
        });

        process.on("SIGTERM", () => {
            gateway.close();
            process.exit(0);
        });
    });

// chat 命令 - 发送单条消息
program
    .command("chat <message>")
    .description("发送消息给 WebBot (需要服务器运行中)")
    .option("-u, --url <url>", "Gateway 服务器地址", "ws://127.0.0.1:8080")
    .action(async (message, options) => {
        const WebSocket = (await import("ws")).default;

        console.log(`连接到 ${options.url}...`);

        const ws = new WebSocket(options.url);

        ws.on("open", () => {
            console.log("已连接，发送消息...\n");
            ws.send(
                JSON.stringify({
                    id: "chat-1",
                    method: "chat.send",
                    params: { content: message },
                })
            );
        });

        ws.on("message", (data) => {
            const frame = JSON.parse(data.toString());

            if (frame.event === "chat") {
                const event = frame.data;
                if (event.type === "text.delta" && event.text) {
                    process.stdout.write(event.text);
                } else if (event.type === "tool.call") {
                    console.log(`\n[工具调用] ${event.toolName}`);
                } else if (event.type === "tool.result") {
                    console.log(`[工具结果] 完成`);
                } else if (event.type === "done") {
                    console.log("\n\n--- 完成 ---");
                    ws.close();
                    process.exit(0);
                } else if (event.type === "error") {
                    console.error(`\n[错误] ${event.error}`);
                    ws.close();
                    process.exit(1);
                }
            }
        });

        ws.on("error", (err) => {
            console.error(`连接错误: ${err.message}`);
            console.error("请确保 WebBot 服务器正在运行 (webbot serve)");
            process.exit(1);
        });

        ws.on("close", () => {
            console.log("连接已关闭");
        });
    });

// version 命令
program
    .command("version")
    .description("显示版本信息")
    .action(() => {
        console.log("WebBot v1.0.0");
        console.log("基于 OpenClaw 架构");
    });

program.parse();
