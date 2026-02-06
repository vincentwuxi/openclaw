# WebBot 开发指南

> **版本**: 1.0.0  
> **日期**: 2026-02-01

---

## 1. 快速开始

### 1.1 环境要求

- Node.js >= 22
- pnpm >= 9.0
- Git

### 1.2 项目初始化

```bash
cd website-bot-module

# 初始化项目
pnpm init

# 安装核心依赖
pnpm add ws playwright @sinclair/typebox ajv hono
pnpm add -D typescript vitest @types/ws @types/node

# 初始化 TypeScript
npx tsc --init
```

### 1.3 目录结构

```
website-bot-module/
├── docs/                   # 文档 (已创建)
├── resources/              # OpenClaw 复用资源
├── templates/              # 配置模板
├── src/                    # 源码
│   ├── gateway/            # Gateway 服务
│   │   ├── server.ts       # WebSocket 服务器
│   │   ├── protocol.ts     # 协议处理
│   │   └── session.ts      # 会话管理
│   ├── agent/              # Agent 运行时
│   │   ├── runner.ts       # 推理运行器
│   │   ├── context.ts      # 上下文管理
│   │   └── providers/      # LLM 提供者
│   ├── tools/              # 网站修改工具
│   │   ├── file-read.ts
│   │   ├── file-write.ts
│   │   ├── file-search.ts
│   │   ├── browser-preview.ts
│   │   ├── browser-screenshot.ts
│   │   └── registry.ts
│   ├── ui/                 # Web UI
│   │   ├── index.html
│   │   ├── app.ts
│   │   └── components/
│   └── cli/                # 命令行工具
│       ├── index.ts
│       └── commands/
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

---

## 2. 核心模块开发

### 2.1 Gateway 服务

**文件**: `src/gateway/server.ts`

```typescript
import { WebSocketServer, type WebSocket } from "ws";
import { validateRequestFrame, type RequestFrame } from "./protocol.js";
import { SessionManager } from "./session.js";

export class GatewayServer {
  private wss: WebSocketServer;
  private sessions: SessionManager;

  constructor(options: { port: number }) {
    this.wss = new WebSocketServer({ port: options.port });
    this.sessions = new SessionManager();
    this.setup();
  }

  private setup() {
    this.wss.on("connection", (ws) => {
      console.log("Client connected");
      
      ws.on("message", (data) => {
        this.handleMessage(ws, data.toString());
      });

      ws.on("close", () => {
        console.log("Client disconnected");
      });
    });
  }

  private async handleMessage(ws: WebSocket, raw: string) {
    try {
      const frame = JSON.parse(raw) as RequestFrame;
      
      if (!validateRequestFrame(frame)) {
        this.sendError(ws, frame.id, "Invalid request frame");
        return;
      }

      const result = await this.dispatch(frame);
      this.sendResponse(ws, frame.id, result);
    } catch (err) {
      console.error("Message handling error:", err);
    }
  }

  private async dispatch(frame: RequestFrame): Promise<unknown> {
    switch (frame.method) {
      case "chat.send":
        return this.handleChatSend(frame.params);
      case "file.read":
        return this.handleFileRead(frame.params);
      // ... 其他方法
      default:
        throw new Error(`Unknown method: ${frame.method}`);
    }
  }

  private sendResponse(ws: WebSocket, id: string, result: unknown) {
    ws.send(JSON.stringify({ id, result }));
  }

  private sendError(ws: WebSocket, id: string, message: string) {
    ws.send(JSON.stringify({ id, error: { message } }));
  }
}
```

### 2.2 Agent 运行时

**文件**: `src/agent/runner.ts`

```typescript
import Anthropic from "@anthropic-ai/sdk";

export interface AgentOptions {
  model: string;
  apiKey: string;
  systemPrompt: string;
  tools: ToolDefinition[];
}

export class AgentRunner {
  private client: Anthropic;
  private options: AgentOptions;

  constructor(options: AgentOptions) {
    this.client = new Anthropic({ apiKey: options.apiKey });
    this.options = options;
  }

  async *run(
    messages: Message[],
    context: SessionContext
  ): AsyncIterable<AgentEvent> {
    const response = await this.client.messages.create({
      model: this.options.model,
      max_tokens: 4096,
      system: this.options.systemPrompt,
      messages: this.formatMessages(messages),
      tools: this.formatTools(this.options.tools),
      stream: true,
    });

    for await (const event of response) {
      if (event.type === "content_block_delta") {
        yield { type: "text.delta", text: event.delta.text };
      } else if (event.type === "tool_use") {
        yield { type: "tool.call", name: event.name, input: event.input };
        
        const result = await this.executeTool(event.name, event.input, context);
        yield { type: "tool.result", name: event.name, output: result };
      }
    }
  }

  private async executeTool(
    name: string,
    input: unknown,
    context: SessionContext
  ): Promise<ToolResult> {
    const tool = this.options.tools.find((t) => t.name === name);
    if (!tool) {
      return { error: `Unknown tool: ${name}` };
    }
    return tool.execute(input, context);
  }
}
```

### 2.3 网站修改工具

**文件**: `src/tools/file-read.ts`

```typescript
import * as fs from "node:fs/promises";
import * as path from "node:path";

export interface FileReadParams {
  path: string;
  startLine?: number;
  endLine?: number;
}

export const fileReadTool: ToolDefinition = {
  name: "file_read",
  description: "读取网站文件内容",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "文件相对路径" },
      startLine: { type: "number", description: "起始行 (可选)" },
      endLine: { type: "number", description: "结束行 (可选)" },
    },
    required: ["path"],
  },
  
  async execute(params: FileReadParams, context: ToolContext) {
    const { workspace } = context;
    const filePath = path.resolve(workspace, params.path);

    // 安全检查
    if (!filePath.startsWith(workspace)) {
      return { error: "路径越界访问被拒绝" };
    }

    try {
      const content = await fs.readFile(filePath, "utf-8");
      const lines = content.split("\n");

      if (params.startLine || params.endLine) {
        const start = (params.startLine ?? 1) - 1;
        const end = params.endLine ?? lines.length;
        return { content: lines.slice(start, end).join("\n") };
      }

      return { content };
    } catch (err) {
      return { error: `无法读取文件: ${err.message}` };
    }
  },
};
```

**文件**: `src/tools/file-write.ts`

```typescript
import * as fs from "node:fs/promises";
import * as path from "node:path";

export interface FileWriteParams {
  path: string;
  content: string;
  createDirs?: boolean;
}

export const fileWriteTool: ToolDefinition = {
  name: "file_write",
  description: "写入或创建网站文件",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "文件相对路径" },
      content: { type: "string", description: "文件内容" },
      createDirs: { type: "boolean", description: "自动创建目录" },
    },
    required: ["path", "content"],
  },
  
  async execute(params: FileWriteParams, context: ToolContext) {
    const { workspace } = context;
    const filePath = path.resolve(workspace, params.path);

    // 安全检查
    if (!filePath.startsWith(workspace)) {
      return { error: "路径越界访问被拒绝" };
    }

    try {
      if (params.createDirs) {
        await fs.mkdir(path.dirname(filePath), { recursive: true });
      }

      await fs.writeFile(filePath, params.content, "utf-8");
      return { success: true, path: params.path };
    } catch (err) {
      return { error: `无法写入文件: ${err.message}` };
    }
  },
};
```

### 2.4 浏览器预览

**文件**: `src/tools/browser-preview.ts`

```typescript
import { chromium, type Browser, type Page } from "playwright";
import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import * as path from "node:path";

export class BrowserPreview {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private server: ReturnType<typeof createServer> | null = null;

  async start(workspace: string, port: number): Promise<string> {
    // 启动静态文件服务器
    this.server = createServer((req, res) => {
      const filePath = path.join(workspace, req.url || "/index.html");
      const stream = createReadStream(filePath);
      stream.pipe(res);
    });
    this.server.listen(port);

    // 启动浏览器
    this.browser = await chromium.launch({ headless: true });
    this.page = await this.browser.newPage();
    await this.page.goto(`http://localhost:${port}`);

    return `http://localhost:${port}`;
  }

  async refresh(): Promise<void> {
    if (this.page) {
      await this.page.reload();
    }
  }

  async screenshot(): Promise<Buffer> {
    if (!this.page) {
      throw new Error("预览未启动");
    }
    return this.page.screenshot({ fullPage: true });
  }

  async emulateDevice(device: "mobile" | "tablet" | "desktop"): Promise<void> {
    if (!this.page) return;

    const viewports = {
      mobile: { width: 375, height: 667 },
      tablet: { width: 768, height: 1024 },
      desktop: { width: 1920, height: 1080 },
    };

    await this.page.setViewportSize(viewports[device]);
  }

  async stop(): Promise<void> {
    if (this.browser) await this.browser.close();
    if (this.server) this.server.close();
  }
}
```

---

## 3. CLI 开发

**文件**: `src/cli/index.ts`

```typescript
#!/usr/bin/env node
import { Command } from "commander";
import { GatewayServer } from "../gateway/server.js";

const program = new Command();

program
  .name("webbot")
  .description("网站修改智能助手")
  .version("1.0.0");

program
  .command("serve")
  .description("启动 Gateway 服务")
  .option("-p, --port <port>", "端口号", "8080")
  .option("-w, --workspace <path>", "工作目录", ".")
  .action((options) => {
    const gateway = new GatewayServer({
      port: parseInt(options.port),
      workspace: options.workspace,
    });
    console.log(`WebBot Gateway running on :${options.port}`);
  });

program
  .command("chat <message>")
  .description("发送消息给 Bot")
  .option("-w, --workspace <path>", "工作目录", ".")
  .action(async (message, options) => {
    // 实现 CLI 客户端
  });

program.parse();
```

---

## 4. 系统提示词

**文件**: `src/agent/system-prompt.ts`

```typescript
export const WEBBOT_SYSTEM_PROMPT = `
你是 WebBot，一个专注于网站修改的智能助手。

## 你的能力
- 读取和修改网站文件 (HTML, CSS, JavaScript, JSON)
- 创建新页面和组件
- 搜索项目内容
- 预览修改效果并截图验证
- 提供 SEO 和无障碍建议

## 工作原则
1. 修改前先阅读目标文件，理解上下文
2. 使用最小化修改原则，避免大规模重写
3. 保持代码风格一致
4. 修改后主动验证效果
5. 遇到不确定的需求时，主动询问用户

## 安全限制
- 只能操作 workspace 内的文件
- 不能执行任意 shell 命令
- 敏感文件 (.env, *.key) 默认受保护

## 回复风格
- 简洁明了，避免冗长解释
- 修改完成后，简要说明做了什么
- 提供预览链接或截图确认效果
`;
```

---

## 5. 测试

### 5.1 单元测试

**文件**: `src/tools/file-read.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { fileReadTool } from "./file-read.js";

describe("file_read tool", () => {
  let workspace: string;

  beforeEach(async () => {
    workspace = await fs.mkdtemp(path.join(os.tmpdir(), "webbot-test-"));
    await fs.writeFile(
      path.join(workspace, "test.html"),
      "<h1>Hello</h1>\n<p>World</p>"
    );
  });

  afterEach(async () => {
    await fs.rm(workspace, { recursive: true });
  });

  it("should read file content", async () => {
    const result = await fileReadTool.execute(
      { path: "test.html" },
      { workspace }
    );
    expect(result.content).toContain("<h1>Hello</h1>");
  });

  it("should reject path traversal", async () => {
    const result = await fileReadTool.execute(
      { path: "../../../etc/passwd" },
      { workspace }
    );
    expect(result.error).toContain("路径越界");
  });
});
```

### 5.2 运行测试

```bash
pnpm test
pnpm test:coverage
```

---

## 6. 构建和发布

### 6.1 构建

```bash
pnpm build
```

### 6.2 本地测试

```bash
# 启动服务
pnpm dev --workspace ./example-site

# 另一终端
curl -X POST http://localhost:8080/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "把标题改成红色"}'
```

---

## 7. 下一步

1. **Phase 1**: 实现 Gateway + 文件工具 + CLI
2. **Phase 2**: 集成 Playwright 预览
3. **Phase 3**: 添加 Web UI
4. **Phase 4**: 智能增强 (SEO/A11y)
