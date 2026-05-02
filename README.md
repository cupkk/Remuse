# Re-Museum

Re-Museum 是一个全栈数字再生博物馆项目，主链路是：

- 用户上传旧物照片
- AI 识别并生成归档信息、故事、封面与再生内容
- 内容进入藏品馆 / 展馆
- 继续生成贴纸、拼豆图纸、表情包、改造指南、记忆对话

这个仓库不是纯前端 Demo。多数核心能力都依赖：

- Express API
- SQLite 数据库
- 上传文件目录
- 服务端 AI 编排
- 配额、权限、日志与错误告警

另外，仓库还包含一个独立的 NFC / 礼物展示子站：

- 线上地址：`https://gift.remuse.top`
- 构建目录：`dist-gift/`
- 入口组件：[components/NfcGiftExperience.tsx](./components/NfcGiftExperience.tsx)
- 独立构建入口：[gift-site/main.tsx](./gift-site/main.tsx)

## 技术栈

- 前端：Vite + React 19 + TypeScript + Tailwind
- 后端：Express 5 + TypeScript
- 数据库：SQLite
- 文本模型：StepFun
- 图像生成：Gemini 兼容接口，经服务端 `/api/ai/*` 调用
- 测试：Node test runner + TSX

## 本地开发

### 环境要求

- Node.js 20+

### 安装

```bash
npm install
```

### 环境变量

复制 `.env.example` 为 `.env`，至少配置：

```bash
GEMINI_API_KEY=your_image_key
STEPFUN_API_KEY=your_stepfun_key
JWT_SECRET=a_random_secret_with_at_least_16_characters
```

可选项示例：

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
MANAGED_UPLOAD_DELETE_GRACE_MS=60000
BACKUP_DIR=./backups
BACKUP_ALERT_EMAILS=ops@example.com
ERROR_ALERT_WEBHOOK_URL=https://example.com/hooks/remuse-errors
ERROR_ALERT_INCLUDE_WARN=false
ERROR_ALERT_COOLDOWN_MS=60000
ALERT_ENVIRONMENT=production
SMOKE_ADMIN_EMAIL=admin@example.com
# 生产邮件发送示例：
# EMAIL_DELIVERY_MODE=resend
# RESEND_API_KEY=re_xxxxxxxxxxxxxxxxx
# MAIL_FROM_EMAIL=no-reply@example.com
# MAIL_FROM_NAME=Re-Museum
```

说明：

- `STEPFUN_API_KEY` 负责文本生成，也承担扫描分析里的视觉问答。
- `GEMINI_API_KEY` 仍负责封面图、贴纸、表情包、改造指南配图等图像生成。
- `EMAIL_DELIVERY_MODE=log` 适合本地开发，会把验证链接和重置链接直接打印到服务端日志。
- 生产环境如需真实邮件发送，需配置 `APP_BASE_URL`、`EMAIL_DELIVERY_MODE=resend`、`RESEND_API_KEY`、`MAIL_FROM_EMAIL`。
- 当前项目默认走原有 `12ai` 代理链路，生产环境若继续使用，必须保留 `ALLOW_THIRD_PARTY_GEMINI_PROXY=true`。
- `ERROR_ALERT_WEBHOOK_URL` 用于把服务端异常和前端崩溃上报到 Slack / Discord / 飞书等外部告警系统。
- `SMOKE_ADMIN_EMAIL` 仅供线上 smoke 脚本使用，本身不授予管理员权限。

### 管理员权限

管理员权限只由 SQLite 中的 `users.role` 控制。提升现有用户为管理员：

```bash
npm run user:set-role -- --email admin@example.com --role admin
```

### 启动

```bash
npm run dev
```

会同时启动：

- 前端：`http://127.0.0.1:5173`
- 后端：`http://127.0.0.1:3000`

开发环境下，Vite 会把 `/api/*` 请求代理到后端，包括 `/api/uploads/*` 这种受保护资源。

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

这个命令会先跑编码扫描，再构建前后端。

### NFC / gift 子站构建

```bash
npm run build:gift
```

产物输出到 `dist-gift/`，用于部署到 `gift.remuse.top`。

### 测试

```bash
npm test
```

也可以按模块执行：

```bash
npm run test:api
npm run test:e2e
npm run test:perler
```

### 备份与恢复

创建备份快照：

```bash
npm run backup:data
```

执行带保留策略和失败告警的备份任务：

```bash
npm run backup:job
```

恢复到目标目录：

```bash
npm run restore:data -- ./backups/<snapshot-name> ./restore-target
```

## 生产运行

启动生产服务：

```bash
npm run server
```

或使用 PM2：

```bash
pm2 start ecosystem.config.cjs
```

## Alibaba Cloud ECS 部署说明

主站 `remuse.top` 的常规部署方式：

1. Node 服务运行在 `PORT=3000`
2. Nginx 监听 `80/443`
3. 所有主站请求反代到 `http://127.0.0.1:3000`
4. `uploads/` 与 `data/` 保存在持久磁盘
5. 使用 cron 或 systemd timer 定时执行 `npm run backup:job`
6. `.env` 只保留在服务器，不要把本地 `.env` 上传覆盖到线上

Express 会直接提供：

- `dist/` 中的前端静态文件
- `/api/uploads/*` 保护下的上传资源
- 全部 `/api/*` 路由

所以主站 Nginx 只负责反代和 TLS 终止。

## gift / NFC 子站说明

`gift.remuse.top` 是独立静态站，不走主站 Express。

常见命令：

```bash
npm run build:gift
```

更完整的 NFC 子站部署与回滚说明见：

- [docs/gift-site-deploy.md](./docs/gift-site-deploy.md)

非常重要：

- 部署 gift 子站前，先在 ECS 上执行 `sudo nginx -T | grep -A 6 "server_name gift.remuse.top"`，确认线上 `root` 到底指向哪里
- 不要默认以为线上一定使用 `/var/www/remuse-gift/current`
- 如果浏览器仍显示旧页，先用 `curl` 看返回的 `<title>` 和静态资源 hash，再判断是不是缓存问题
