# WebBot 系统架构文档

> **版本**: 1.0.0-draft  
> **日期**: 2026-02-01  
> **基于**: OpenClaw 架构模式

---

## 1. 架构概览

### 1.1 设计原则

基于 OpenClaw 的架构理念，WebBot 采用以下核心原则：

| 原则 | 描述 | OpenClaw 参考 |
|------|------|---------------|
| **Gateway 中心化** | 单一控制平面处理所有请求 | `src/gateway/` |
| **Agent 嵌入式** | LLM 推理本地嵌入运行 | `src/agents/pi-embedded.ts` |
| **工具可插拔** | 模块化工具注册机制 | `src/agents/tools/` |
| **通道抽象** | 统一接口，多入口接入 | `src/channels/` |

### 1.2 高层架构图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          WebBot 系统架构                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│    ┌─────────────┐   ┌─────────────┐   ┌─────────────┐                 │
│    │  Web UI     │   │    CLI      │   │   HTTP API  │   ← 通道层       │
│    │  (Lit/Vite) │   │  (Commander)│   │   (Hono)    │                 │
│    └──────┬──────┘   └──────┬──────┘   └──────┬──────┘                 │
│           │                 │                 │                         │
│           └─────────────────┼─────────────────┘                         │
│                             │                                           │
│                             ▼                                           │
│    ┌────────────────────────────────────────────────────────────────┐  │
│    │                    Gateway (WebSocket)                          │  │
│    │  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐    │  │
│    │  │ Session Manager│  │ Tool Registry  │  │ Event Emitter  │    │  │
│    │  └────────────────┘  └────────────────┘  └────────────────┘    │  │
│    └────────────────────────────────────────────────────────────────┘  │
│                             │                                           │
│                             ▼                                           │
│    ┌────────────────────────────────────────────────────────────────┐  │
│    │                    Agent (Pi Embedded)                          │  │
│    │  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐    │  │
│    │  │ LLM Provider   │  │ Context Window │  │ Tool Executor  │    │  │
│    │  │ (Claude/GPT/..│  │ (History Mgmt) │  │                │    │  │
│    │  └────────────────┘  └────────────────┘  └────────────────┘    │  │
│    └────────────────────────────────────────────────────────────────┘  │
│                             │                                           │
│                             ▼                                           │
│    ┌────────────────────────────────────────────────────────────────┐  │
│    │                    Tools (网站修改专用)                          │  │
│    │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │  │
│    │  │ file_read│  │file_write│  │ browser  │  │ search   │        │  │
│    │  └──────────┘  └──────────┘  └──────────┘  └──────────┘        │  │
│    │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │  │
│    │  │ git_diff │  │screenshot│  │ validate │  │ generate │        │  │
│    │  └──────────┘  └──────────┘  └──────────┘  └──────────┘        │  │
│    └────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│    ┌────────────────────────────────────────────────────────────────┐  │
│    │                    Workspace (目标网站项目)                      │  │
│    │  /path/to/website/                                              │  │
│    │  ├── index.html                                                 │  │
│    │  ├── styles/                                                    │  │
│    │  ├── scripts/                                                   │  │
│    │  └── ...                                                        │  │
│    └────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 核心组件

### 2.1 Gateway 服务

**职责**: 系统控制平面，处理所有客户端连接和消息路由。

**复用自 OpenClaw**: `src/gateway/`

```typescript
// 简化版 Gateway 结构
interface WebBotGateway {
  // WebSocket 服务器
  server: WebSocketServer;
  
  // 会话管理
  sessions: Map<string, Session>;
  
  // 工具注册表
  tools: ToolRegistry;
  
  // 方法
  handleMessage(ws: WebSocket, message: GatewayFrame): void;
  broadcast(event: string, data: unknown): void;
}
```

**关键文件参考**:
- `src/gateway/client.ts` - WebSocket 客户端实现
- `src/gateway/protocol/` - 协议 Schema 定义
- `src/gateway/boot.ts` - 服务启动逻辑

### 2.2 Agent 运行时

**职责**: 执行 LLM 推理，管理对话上下文，调度工具执行。

**复用自 OpenClaw**: `src/agents/pi-embedded*.ts`

```typescript
// Agent 核心接口
interface WebBotAgent {
  // 运行一次推理
  run(input: string, context: SessionContext): AsyncIterable<AgentEvent>;
  
  // 中止运行
  abort(sessionId: string): void;
  
  // 压缩历史
  compact(sessionId: string): Promise<void>;
}
```

**关键文件参考**:
- `src/agents/pi-embedded-runner.ts` - 嵌入式运行时
- `src/agents/context-*.ts` - 上下文管理
- `src/agents/model-*.ts` - 模型适配

### 2.3 工具系统

**职责**: 提供网站修改所需的原子操作。

**WebBot 专用工具集**:

| 工具 | 功能 | OpenClaw 参考 |
|------|------|---------------|
| `file_read` | 读取文件内容 | 部分复用 `src/agents/tools/` |
| `file_write` | 写入/创建文件 | 新建 |
| `file_search` | 搜索文件内容 | 参考 `grep_search` 模式 |
| `browser_preview` | 启动预览服务器 | 复用 `src/browser/` |
| `browser_screenshot` | 截图验证 | 复用 `src/browser/screenshot.ts` |
| `git_status` | 查看变更状态 | 参考 `src/agents/tools/` |
| `git_diff` | 生成差异 | 参考 `src/agents/tools/` |
| `validate_html` | HTML 验证 | 新建 |
| `validate_css` | CSS 验证 | 新建 |

### 2.4 浏览器控制

**职责**: 提供网页预览、截图、交互验证。

**复用自 OpenClaw**: `src/browser/`

```typescript
// 浏览器控制接口
interface BrowserController {
  // 启动预览服务器
  startPreview(port: number): Promise<void>;
  
  // 刷新页面
  refresh(): Promise<void>;
  
  // 截图
  screenshot(options: ScreenshotOptions): Promise<Buffer>;
  
  // 模拟设备
  emulate(device: DeviceDescriptor): Promise<void>;
}
```

**关键文件参考**:
- `src/browser/pw-session.ts` - Playwright 会话管理
- `src/browser/screenshot.ts` - 截图功能
- `src/browser/pw-tools-core.*.ts` - 浏览器操作工具

---

## 3. 数据流

### 3.1 消息处理流程

```
1. 用户输入 (Web UI / CLI / API)
        │
        ▼
2. Gateway 接收消息
   - 验证协议格式
   - 路由到对应会话
        │
        ▼
3. Agent 运行
   - 构建 System Prompt
   - 调用 LLM Provider
   - 流式输出 tokens
        │
        ▼
4. 工具调用 (如需要)
   - 解析工具调用请求
   - 执行文件/浏览器操作
   - 返回结果给 Agent
        │
        ▼
5. 响应返回
   - 流式发送到客户端
   - 更新会话历史
```

### 3.2 WebSocket 协议

**握手**:
```json
{
  "method": "hello",
  "params": {
    "protocol": "1.0",
    "clientType": "web-ui",
    "workspace": "/path/to/website"
  }
}
```

**发送消息**:
```json
{
  "id": "req-001",
  "method": "chat.send",
  "params": {
    "sessionId": "main",
    "content": "把标题改成红色"
  }
}
```

**接收事件**:
```json
{
  "event": "chat",
  "data": {
    "type": "text.delta",
    "text": "正在分析..."
  }
}
```

```json
{
  "event": "tool",
  "data": {
    "name": "file_write",
    "status": "completed",
    "result": { "path": "styles/main.css", "modified": true }
  }
}
```

---

## 4. 模块依赖

### 4.1 从 OpenClaw 复用

| 模块 | 路径 | 复用方式 |
|------|------|----------|
| Gateway 协议 | `src/gateway/protocol/` | 直接复制 |
| WebSocket 客户端 | `src/gateway/client.ts` | 直接复制 |
| Pi Agent 运行时 | `src/agents/pi-embedded*.ts` | 简化适配 |
| Playwright 控制 | `src/browser/pw-*.ts` | 选择性复制 |
| 浏览器截图 | `src/browser/screenshot.ts` | 直接复制 |
| 配置管理 | `src/config/` | 参考模式 |

### 4.2 新建模块

| 模块 | 描述 |
|------|------|
| `tools/file-ops.ts` | 文件读写工具 |
| `tools/search.ts` | 内容搜索工具 |
| `tools/validate.ts` | HTML/CSS 验证工具 |
| `ui/web-app/` | Web UI 应用 |
| `cli/` | 命令行工具 |

### 4.3 外部依赖

```json
{
  "dependencies": {
    // LLM 相关
    "@anthropic-ai/sdk": "^0.30.0",
    "openai": "^4.0.0",
    
    // 浏览器控制
    "playwright": "^1.50.0",
    
    // Web 服务
    "hono": "^4.0.0",
    "ws": "^8.0.0",
    
    // UI 框架
    "lit": "^3.0.0",
    
    // 工具类
    "globby": "^14.0.0",
    "chokidar": "^4.0.0"
  }
}
```

---

## 5. 目录结构

```
website-bot-module/
├── docs/                          # 文档
│   ├── 01-PRODUCT_DESIGN.md       # 产品设计文档
│   ├── 02-ARCHITECTURE.md         # 系统架构文档 (本文件)
│   ├── 03-REUSABLE_RESOURCES.md   # 可复用资源清单
│   └── 04-DEVELOPMENT_GUIDE.md    # 开发指南
│
├── resources/                     # 从 OpenClaw 复制的资源
│   ├── gateway/                   # Gateway 核心
│   │   ├── protocol/              # 协议定义
│   │   └── client.ts              # 客户端实现
│   ├── agents/                    # Agent 运行时
│   └── browser/                   # 浏览器控制
│
├── templates/                     # 项目模板
│   ├── tsconfig.json              # TypeScript 配置
│   ├── package.json               # 依赖配置
│   └── .env.example               # 环境变量模板
│
└── src/                           # 新项目源码 (待创建)
    ├── gateway/                   # Gateway 服务
    ├── agent/                     # Agent 运行时
    ├── tools/                     # 网站修改工具
    ├── ui/                        # Web UI
    └── cli/                       # 命令行工具
```

---

## 6. 安全考量

### 6.1 Workspace 隔离

```typescript
// 所有文件操作必须在 workspace 内
function validatePath(workspace: string, targetPath: string): boolean {
  const resolved = path.resolve(workspace, targetPath);
  return resolved.startsWith(workspace) && !resolved.includes("..");
}
```

### 6.2 工具权限

| 工具 | 权限级别 | 说明 |
|------|----------|------|
| `file_read` | 低 | 只读操作 |
| `file_write` | 中 | 需确认 |
| `file_delete` | 高 | 需二次确认 |
| `browser_*` | 低 | 只读操作 |
| `git_*` | 中 | 可回滚 |

### 6.3 敏感文件保护

```typescript
const protectedPatterns = [
  ".env*",
  "*.key",
  "*.pem",
  "*credentials*",
  "*secret*"
];
```

---

## 7. 扩展点

### 7.1 自定义工具

```typescript
// 工具注册接口
interface Tool {
  name: string;
  description: string;
  parameters: JSONSchema;
  execute(params: unknown): Promise<ToolResult>;
}

// 注册自定义工具
gateway.tools.register({
  name: "deploy_preview",
  description: "部署到预览环境",
  parameters: { ... },
  execute: async (params) => { ... }
});
```

### 7.2 自定义通道

```typescript
// 通道接口
interface Channel {
  id: string;
  connect(): Promise<void>;
  send(message: string): Promise<void>;
  onMessage(handler: (msg: string) => void): void;
}
```

---

## 8. 部署模式

### 8.1 本地开发模式

```bash
webbot dev --workspace ./my-website --port 8080
```

### 8.2 独立服务模式

```bash
webbot serve --workspace ./my-website --bind 0.0.0.0:8080
```

### 8.3 嵌入式模式

```typescript
import { WebBot } from "webbot";

const bot = new WebBot({
  workspace: "./my-website",
  model: "claude-3-5-sonnet",
  apiKey: process.env.ANTHROPIC_API_KEY
});

await bot.execute("更新页脚年份");
```
