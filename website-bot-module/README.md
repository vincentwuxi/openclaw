# WebBot - 网站修改智能助手

> 基于 OpenClaw 架构的专用网站修改 Bot 模块

---

## 📋 项目概述

WebBot 是一个专注于**网站内容修改与管理**的 AI Bot 模块。用户通过自然语言与 Bot 对话，Bot 自动完成网站代码的查看、编辑、生成等操作。

### 核心特性

- 🗣️ **对话驱动** - 用自然语言描述需求
- 🎯 **专注网站** - 专为 HTML/CSS/JS 修改优化
- 🔒 **本地优先** - 数据和操作完全本地化
- 🧩 **可扩展** - 基于 OpenClaw 架构，支持插件

---

## 📁 目录结构

```
website-bot-module/
├── docs/                           # 设计文档
│   ├── 01-PRODUCT_DESIGN.md        # 产品设计文档
│   ├── 02-ARCHITECTURE.md          # 系统架构文档
│   ├── 03-REUSABLE_RESOURCES.md    # 可复用资源清单
│   └── 04-DEVELOPMENT_GUIDE.md     # 开发指南
│
├── resources/                      # OpenClaw 可复用资源
│   ├── gateway/                    # Gateway 核心
│   │   ├── protocol/               # 协议定义
│   │   └── client.ts               # WebSocket 客户端
│   └── browser/                    # Playwright 控制
│       ├── pw-session.ts           # 浏览器会话
│       └── screenshot.ts           # 截图工具
│
├── templates/                      # 项目模板
│   ├── package.json                # 依赖配置
│   ├── tsconfig.json               # TypeScript 配置
│   ├── vitest.config.ts            # 测试配置
│   └── .env.example                # 环境变量模板
│
└── src/                            # 源码 (待创建)
```

---

## 🚀 快速开始

### 1. 创建新项目

```bash
# 在 website-bot-module/ 目录下创建项目
mkdir -p src/{gateway,agent,tools,ui,cli}

# 复制模板文件
cp templates/package.json .
cp templates/tsconfig.json .
cp templates/vitest.config.ts .
cp templates/.env.example .env

# 安装依赖
pnpm install
```

### 2. 开发

```bash
# 启动开发服务器
pnpm dev --workspace ./example-site

# 运行测试
pnpm test
```

### 3. 构建

```bash
pnpm build
```

---

## 📖 文档导航

| 文档 | 描述 |
|------|------|
| [产品设计](docs/01-PRODUCT_DESIGN.md) | 功能规格、用户故事、里程碑 |
| [系统架构](docs/02-ARCHITECTURE.md) | 组件设计、数据流、扩展点 |
| [可复用资源](docs/03-REUSABLE_RESOURCES.md) | OpenClaw 资源清单和复用指南 |
| [开发指南](docs/04-DEVELOPMENT_GUIDE.md) | 代码示例和实现步骤 |

---

## 🔗 参考资源

- **OpenClaw 项目**: 本模块基于其架构设计
- **Playwright**: 浏览器自动化
- **Anthropic Claude / OpenAI**: LLM 后端

---

## 📄 许可证

MIT License
