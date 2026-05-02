# Re-Museum

Re-Museum 是一个全栈数字再生博物馆项目，目标是把“旧物上传 -> AI 识别 -> 归档进展馆 -> 生成贴纸 / 拼豆图纸 / 表情包 / 改造指南 / 记忆内容”串成一条完整体验链路。

本项目为 #Flux南客松S2 黑客松参赛作品。

- GitHub 仓库：https://github.com/cupkk/Re-Museum
- 主站部署实例：https://remuse.top
- NFC / 礼物展示子站：https://gift.remuse.top
- 参赛标签：#Flux南客松S2

## 项目亮点

- 旧物扫描与 AI 识别：用户上传旧物照片后，系统生成物品信息、故事草稿、馆藏封面与再生方向。
- 数字藏品归档：将旧物以“藏品”的方式保存到个人藏品馆或展馆。
- 再生内容生成：围绕同一件旧物生成贴纸、拼豆图纸、表情包、改造指南等衍生内容。
- 记忆对话与检索：围绕已归档物品建立记忆线程，支持后续继续补充故事。
- 共建藏馆：支持共享展馆与多人共建的内容组织方式。
- 管理后台：包含用户、反馈、用量、错误上报等运营治理能力。
- 独立 NFC / 礼物子站：用于线下礼物、活动或 NFC 场景展示。

## 开源与部署说明

本仓库开源参赛版本的核心代码，包括前端、后端、数据层 schema、AI 编排、构建脚本和测试脚本。

出于安全和隐私原因，以下内容不会提交到 GitHub：

- `.env`、`.env.local` 等本地或生产环境密钥
- `data/` 中的真实 SQLite 数据库
- `uploads/` 中的用户上传文件与生成结果
- `backups/` 中的备份快照
- 服务器私有配置、邮件密钥、AI API Key、告警 Webhook 等生产凭据

已部署实例：

- 主站：https://remuse.top
- NFC / 礼物展示子站：https://gift.remuse.top

## 技术栈

### 前端

- React 19：主站交互界面与组件体系
- TypeScript：前后端统一类型约束
- Vite 6：前端开发服务器与构建工具
- Tailwind CSS 3：界面样式系统
- lucide-react：图标组件
- Recharts：管理后台和数据概览图表

### 后端

- Node.js 20+
- Express 5：API 服务与静态资源服务
- TypeScript：服务端源码与构建
- better-sqlite3：SQLite 持久化访问
- Zod：输入与结构化数据校验
- JSON Web Token：登录态与鉴权
- express-rate-limit：接口限流
- Multer：上传文件处理
- Sharp：图片处理、封面组合、抠图辅助链路

### AI 与内容生成

- StepFun：文本生成、扫描分析中的文本与视觉问答能力
- Gemini 兼容图像接口：封面图、贴纸、表情包、改造指南配图等图像生成
- 服务端 AI 编排：统一经过 `/api/ai/*` 接口处理配额、失败兜底、日志和权限

### 数据与存储

- SQLite：用户、藏品、展馆、贴纸、记忆线程、管理员数据等核心业务数据
- 本地文件系统：上传图、生成图、封面与临时处理文件
- 备份脚本：支持数据与上传资源快照备份、恢复和生产 smoke 检查

### 构建、测试与运维

- Vite：主站和 NFC / 礼物子站构建
- TypeScript Compiler：后端构建
- Node test runner + TSX：API 与业务脚本测试
- Playwright：端到端测试
- PM2：生产 Node 进程管理
- Nginx：生产反向代理与 TLS 终止
- Alibaba Cloud ECS：当前生产部署环境

## 系统结构

```text
index.tsx                         前端入口
App.tsx                           主站页面与状态编排
server.ts                         Express 服务入口
components/                       前端页面与业务组件
routes/                           API 路由
services/                         数据库、AI、配额、记忆、告警等服务
shared/                           前后端共享类型与生成数据
scripts/                          构建、备份、校验、运维脚本
tests/                            API、拼豆、E2E 测试
gift-site/                        NFC / 礼物子站入口
docs/                             部署与专项说明文档
```

关键模块：

- `components/Scanner.tsx`：扫描、识别、归档、故事草稿、贴纸入口
- `components/Gallery.tsx`：藏品馆与展馆浏览
- `components/ItemArchiveDetail.tsx`：藏品详情页
- `components/StickerLibrary.tsx`：贴纸库 / 成果库
- `components/PerlerPatternStudio.tsx`：拼豆工坊
- `components/EmojiPackStudio.tsx`：表情包工坊
- `components/TransformationGuideStudio.tsx`：改造指南
- `components/MemoryRagStudio.tsx`：记忆检索与对话
- `components/AdminWorkspace.tsx`：管理员工作区
- `routes/auth.ts`：注册、登录、刷新、验证、重置密码
- `routes/ai.ts`：AI 能力聚合入口
- `routes/items.ts`：藏品 CRUD 与归档内容
- `routes/stickers.ts`：贴纸与生成结果
- `routes/memory.ts`：记忆线程与消息
- `services/database.ts`：SQLite schema 与兼容迁移
- `services/aiService.ts`：服务端 AI 业务编排
- `services/usageQuota.ts`：AI 配额与调用统计

## 本地开发

### 环境要求

- Node.js 20+
- npm

### 安装依赖

```bash
npm install
```

### 配置环境变量

复制 `.env.example` 为 `.env`，至少配置：

```bash
GEMINI_API_KEY=your_image_key
STEPFUN_API_KEY=your_stepfun_key
JWT_SECRET=a_random_secret_with_at_least_16_characters
```

常用配置项：

```bash
PORT=3000
BACKEND_PORT=3000
STEPFUN_BASE_URL=https://api.stepfun.com/v1
STEPFUN_TEXT_MODEL=step-3.5-flash
GEMINI_BASE_URL=https://cdn.12ai.org
GEMINI_FALLBACK_BASE_URLS=https://hk.12ai.org
ALLOW_THIRD_PARTY_GEMINI_PROXY=true
DB_PATH=./data/remuse.db
UPLOADS_DIR=./uploads
APP_BASE_URL=http://127.0.0.1:5173
EMAIL_DELIVERY_MODE=log
DAILY_GEMINI_CALL_LIMIT=40
DAILY_MEMORY_QUERY_LIMIT=24
BACKUP_DIR=./backups
```

说明：

- `STEPFUN_API_KEY` 用于文本生成与扫描分析链路。
- `GEMINI_API_KEY` 用于封面、贴纸、表情包、改造指南配图等图像生成。
- `EMAIL_DELIVERY_MODE=log` 适合本地开发，会把验证链接和重置链接输出到服务端日志。
- 生产环境需要独立配置真实邮件发送、域名、备份、告警和 AI 配额。

### 启动开发环境

```bash
npm run dev
```

该命令会同时启动：

- 前端：http://127.0.0.1:5173
- 后端：http://127.0.0.1:3000

也可以分开启动：

```bash
npm run dev:client
npm run dev:server
```

## 构建与测试

### 主站构建

```bash
npm run build
```

该命令等价于：

```bash
npm run check:encoding
npm run build:client
npm run build:server
```

### NFC / 礼物子站构建

```bash
npm run build:gift
```

### 测试

```bash
npm test
```

按模块执行：

```bash
npm run test:api
npm run test:perler
npm run test:e2e
```

## 生产运行

构建完成后启动生产服务：

```bash
npm run server
```

PM2 启动方式：

```bash
pm2 start ecosystem.config.cjs
```

当前主站部署形态：

- Alibaba Cloud ECS 单机部署
- Nginx 反代到 Node / Express
- Express 提供 `dist/` 静态文件、`/api/*` 路由和受保护的 `/api/uploads/*` 资源
- `data/`、`uploads/`、`backups/` 保存在服务器持久化磁盘
- 使用 `npm run backup:job` 做数据和上传资源备份

## 常用脚本

```bash
npm run validate:env
npm run backup:data
npm run backup:job
npm run restore:data -- ./backups/<snapshot> ./restore-target
npm run smoke:production
```

管理员账号角色由 SQLite 中的 `users.role` 控制。提升已有用户为管理员：

```bash
npm run user:set-role -- --email admin@example.com --role admin
```

## 提交与安全注意事项

- 不要提交 `.env`、`.env.local`、生产密钥、邮件 key、代理 key 或告警 Webhook。
- 不要提交 `data/`、`uploads/`、`backups/` 中的真实生产数据。
- 不要通过修改 `dist/`、`build/` 里的构建产物来修功能，应修改源码后重新构建。
- 修改中文文案后必须运行 `npm run check:encoding`，避免用户可见乱码。
- 涉及 AI 生成、归档、贴纸、拼豆等链路时，服务端失败不能伪装成前端成功。
