# WebBot 可复用资源清单

> **版本**: 1.0.0  
> **日期**: 2026-02-01  
> **来源**: OpenClaw 项目

---

## 1. 资源概览

本文档列出从 OpenClaw 项目中可复用的核心资源，按优先级和依赖关系组织。

### 1.1 复用策略

| 策略 | 说明 | 适用场景 |
|------|------|----------|
| **直接复制** | 文件完整复制到新项目 | 独立模块、无外部依赖 |
| **选择性复制** | 提取关键函数/类 | 大型模块中的部分功能 |
| **参考模式** | 参考设计思路重新实现 | 需要简化或定制 |

---

## 2. Gateway 模块

### 2.1 协议定义 (直接复制)

**源路径**: `src/gateway/protocol/`

| 文件 | 大小 | 用途 |
|------|------|------|
| `index.ts` | 17KB | 协议入口和验证器 |
| `schema.ts` | ~50KB | TypeBox Schema 定义 |

**复制命令**:
```bash
cp -r src/gateway/protocol/ ../website-bot-module/resources/gateway/
```

**关键导出**:
```typescript
// 请求/响应帧
export type { RequestFrame, ResponseFrame, EventFrame };

// 验证函数
export { validateRequestFrame, validateResponseFrame };

// 协议常量
export { PROTOCOL_VERSION, ErrorCodes };
```

### 2.2 WebSocket 客户端 (选择性复制)

**源路径**: `src/gateway/client.ts`

**关键部分**:
- `GatewayClient` 类 (核心)
- `GatewayClientOptions` 接口
- 重连逻辑 (`scheduleReconnect`)

**简化改造**:
```typescript
// 移除设备配对相关逻辑
// 移除 Tailscale 认证逻辑
// 保留核心 WebSocket 通信
```

### 2.3 配置热重载 (参考模式)

**源路径**: `src/gateway/config-reload.ts`

**参考要点**:
- 文件监听模式
- 配置验证流程
- 优雅重启机制

---

## 3. Agent 模块

### 3.1 嵌入式运行时 (选择性复制)

**源路径**: `src/agents/pi-embedded-runner.ts`

**关键功能**:
```typescript
// 核心导出
export {
  runEmbeddedPiAgent,      // 运行 Agent
  abortEmbeddedPiRun,      // 中止运行
  queueEmbeddedPiMessage,  // 队列消息
  compactEmbeddedPiSession // 压缩历史
};
```

**简化改造**:
- 移除多 Agent 路由
- 移除渠道特定逻辑
- 保留核心推理循环

### 3.2 上下文管理 (参考模式)

**源路径**: `src/agents/context-*.ts`

**参考要点**:
- 滑窗历史管理
- Token 计数策略
- 压缩触发条件

### 3.3 模型适配 (选择性复制)

**源路径**: `src/agents/model-*.ts`

**可复用提供者**:
| 提供者 | 文件 | 复用价值 |
|--------|------|----------|
| Anthropic | `model-anthropic.ts` | 高 |
| OpenAI | `model-openai.ts` | 高 |
| Google AI | `model-google.ts` | 中 |

---

## 4. Browser 模块 (核心复用)

### 4.1 Playwright 会话 (直接复制)

**源路径**: `src/browser/pw-session.ts`

**功能**:
- Playwright 浏览器实例管理
- 页面生命周期
- 上下文隔离

**关键类**:
```typescript
export class PlaywrightSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  
  async launch(options: LaunchOptions): Promise<void>;
  async close(): Promise<void>;
}
```

### 4.2 截图工具 (直接复制)

**源路径**: `src/browser/screenshot.ts`

**功能**:
- 全页面截图
- 元素截图
- 响应式视口模拟

### 4.3 交互工具 (选择性复制)

**源路径**: `src/browser/pw-tools-core.interactions.ts`

**可复用操作**:
- `click`
- `type`
- `waitFor`
- `evaluate`

### 4.4 快照工具 (选择性复制)

**源路径**: `src/browser/pw-tools-core.snapshot.ts`

**功能**:
- DOM 树快照
- ARIA 标签提取
- Accessibility 树

---

## 5. 工具基础设施

### 5.1 工具注册模式 (参考模式)

**参考路径**: `src/agents/tools/`

**模式摘要**:
```typescript
// 工具定义
interface ToolDefinition {
  name: string;
  description: string;
  parameters: TypeBoxSchema;
  execute: (params: unknown, context: ToolContext) => Promise<ToolResult>;
}

// 工具注册
const toolRegistry = new Map<string, ToolDefinition>();
toolRegistry.set("file_read", fileReadTool);
```

### 5.2 文件操作参考

**参考路径**: `src/agents/tools/` 中的文件相关工具

**安全模式**:
```typescript
// 路径验证
function resolveSafePath(workspace: string, userPath: string): string | null {
  const resolved = path.resolve(workspace, userPath);
  if (!resolved.startsWith(workspace)) {
    return null; // 拒绝路径逃逸
  }
  return resolved;
}
```

---

## 6. UI 模块

### 6.1 Control UI 参考 (参考模式)

**源路径**: `ui/`

**技术栈**:
- Lit (Web Components)
- Vite (构建工具)
- TypeScript

**可参考组件**:
| 组件 | 用途 |
|------|------|
| 聊天窗口 | 消息展示和输入 |
| 会话列表 | 历史会话管理 |
| 配置表单 | 设置界面 |

---

## 7. 配置和工具

### 7.1 TypeScript 配置

**源文件**: `tsconfig.json`

**关键配置**:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true
  }
}
```

### 7.2 Vitest 测试配置

**源文件**: `vitest.config.ts`

**可复用配置**:
```typescript
export default defineConfig({
  test: {
    coverage: {
      thresholds: { lines: 70, branches: 70 }
    }
  }
});
```

---

## 8. 资源备份目录结构

执行以下命令创建资源备份:

```bash
# 在 website-bot-module/ 目录下执行

# Gateway 协议
mkdir -p resources/gateway/protocol
cp ../src/gateway/protocol/index.ts resources/gateway/protocol/
cp ../src/gateway/protocol/schema.ts resources/gateway/protocol/

# Gateway 客户端
cp ../src/gateway/client.ts resources/gateway/

# Browser 模块
mkdir -p resources/browser
cp ../src/browser/pw-session.ts resources/browser/
cp ../src/browser/screenshot.ts resources/browser/
cp ../src/browser/pw-tools-core.interactions.ts resources/browser/
cp ../src/browser/pw-tools-core.snapshot.ts resources/browser/

# 配置模板
mkdir -p resources/config
cp ../tsconfig.json resources/config/
cp ../vitest.config.ts resources/config/
```

---

## 9. 依赖清单

从 OpenClaw 继承的依赖:

```json
{
  "dependencies": {
    "ws": "^8.0.0",
    "playwright": "^1.50.0",
    "@sinclair/typebox": "^0.32.0",
    "ajv": "^8.0.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^2.0.0",
    "@types/ws": "^8.0.0"
  }
}
```

---

## 10. 注意事项

### 10.1 许可证

OpenClaw 使用 MIT 许可证，复用代码需保留版权声明。

### 10.2 版本兼容

- Node.js >= 22
- TypeScript >= 5.7
- Playwright >= 1.50

### 10.3 移除的功能

以下 OpenClaw 功能不需要复用:

- 多渠道消息 (WhatsApp/Telegram 等)
- 设备配对和节点管理
- Tailscale 集成
- Voice Wake / Talk Mode
- Canvas / A2UI
