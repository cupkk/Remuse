# AGENTS.md

## Project overview

Re-Museum 是一个全栈数字再生博物馆项目，核心目标是把“旧物上传 -> AI 识别 -> 归档进展馆 -> 生成贴纸 / 拼豆 / 改造指南 / 记忆内容”串成一条完整体验链路。

当前仓库同时包含：

- 主站 Web App
- Express API 服务
- SQLite 数据层
- 管理后台能力
- 共建藏馆 / 记忆对话 / 拼豆工坊 / 表情包工坊
- 一个独立的礼物/NFC 展示子站构建链路

用户侧真实依赖的数据主要在：

- `data/`：SQLite 数据库
- `uploads/`：上传文件、生成结果、封面等
- `backups/`：备份产物

不要把这个项目当成“纯前端 demo”。多数功能都依赖服务端持久化、AI 调用、配额与权限。

## Architecture

### Runtime shape

- 前端入口：`index.tsx`
- 前端主编排：`App.tsx`
- 后端入口：`server.ts`
- 前端构建：Vite
- 后端构建：TypeScript -> `build/server/server.js`

### Frontend

主要页面/模块：

- `components/LoginScreen.tsx`：登录、注册、找回密码、协议弹窗
- `components/Scanner.tsx`：扫描、识别、归档、故事草稿、贴纸入口
- `components/Gallery.tsx`：藏品馆 / 展馆浏览
- `components/ItemArchiveDetail.tsx`：藏品详情页
- `components/StickerLibrary.tsx`：贴纸库 / 成果库
- `components/PerlerPatternStudio.tsx` / `components/PerlerPatternItemStudio.tsx`：拼豆工坊
- `components/EmojiPackStudio.tsx`：表情包工坊
- `components/TransformationGuideStudio.tsx`：综合改造指南
- `components/MemoryRagStudio.tsx`：记忆检索 / 对话
- `components/CuratorOffice.tsx`：馆长办公室
- `components/AdminWorkspace.tsx`：管理员工作区
- `components/SharedMuseumHub.tsx`：共建藏馆

### Backend

主要 API 路由：

- `routes/auth.ts`：游客、注册、登录、刷新、邮箱验证、重置密码、账号治理
- `routes/ai.ts`：AI 能力聚合入口
- `routes/items.ts`：藏品 CRUD、归档内容
- `routes/halls.ts`：展馆
- `routes/stickers.ts`：贴纸
- `routes/memory.ts`：记忆线程与消息
- `routes/transformationGuides.ts`：改造指南
- `routes/sharedMuseums.ts`：共建藏馆
- `routes/admin.ts`：管理员数据概览、反馈、监控
- `routes/clientErrors.ts`：前端错误上报

核心服务：

- `services/database.ts`：SQLite schema、查询、迁移兼容
- `services/aiService.ts`：服务端 AI 业务编排
- `services/geminiService.ts`：前端 AI API 调用封装
- `services/usageQuota.ts`：AI 配额、调用统计
- `services/collectionCoverComposer.ts`：藏品封面组合/生成
- `services/subjectCutout.ts`：抠图链路
- `services/memoryRag.ts` / `services/memoryService.ts`：记忆检索与存储
- `services/externalAlerting.ts` / `services/clientErrorReporter.ts`：错误告警

### Deployment

- 生产环境默认是 Alibaba Cloud ECS 单机部署
- Nginx 反代到 Node/Express
- PM2 管理进程
- `deploy.sh` 是服务端部署入口
- 本地不要把 `.env` 打包上服务器

## Coding conventions

### General

- 使用 TypeScript，优先保持类型闭环，不要用 `any` 逃避问题。
- 默认使用 ASCII；只有用户可见中文文案才写中文。
- 用户可见文案统一使用简体中文。
- 前端样式遵循现有视觉语言：深色底、荧光强调色、博物馆/终端感。
- 修改已有模块时，优先延续原结构和命名，不要为了“更优雅”大改整页。

### React / frontend

- 现有项目以组件内状态和服务层函数为主，不要强行引入新的全局状态库。
- 保持懒加载边界稳定，避免随意改 chunk 名和 import 结构。
- 与扫描、归档、贴纸、拼豆相关的状态流要特别谨慎，先看完整链路再改。
- 任何用户输入在异步请求期间都不应被无故清空。
- 成功态、等待态、失败态都要有明确 UI，不允许 silent failure。

### Backend

- 新增接口前，先确认现有 `routes/*` 和 `services/*` 是否已覆盖相近能力。
- 权限逻辑统一走 `middleware/authMiddleware.ts` 和 `middleware/adminMiddleware.ts`。
- 涉及 AI 的接口必须考虑：
  - 限流
  - 配额
  - 上游失败兜底
  - 结构化日志
- 数据落库前优先做标准化和最小校验，不把脏数据直接写进 SQLite。

### Data / storage

- 不要手改生产数据库文件。
- 不要把 `data/`、`uploads/`、`backups/` 中的真实生产文件提交进 Git。
- `shared/nfcGiftDemos.generated.json` 这类生成文件，优先通过脚本再生成，不要手写维护。

## Project-specific guardrails

以下规则来自这个仓库里 AI 过去真实犯过的错误，必须遵守：

- 不要修改 `dist/`、`build/` 里的构建产物来“修功能”；应修改源码后重新构建。
- 不要把本地 `.env`、`.env.local`、服务器密钥、邮件 key、代理 key 提交到仓库。
- 不要部署本地临时文件、`.tmp/`、`output/`、`*.tgz`、调试截图到 ECS 工作目录。
- 不要把用户故事草稿、语音草稿在归档成功后直接清空；先确认已经持久化。
- 不要让用户可见中文文案出现乱码；改文案后必须跑 `npm run check:encoding`。
- 不要随意删除旧接口或旧字段兼容逻辑，除非确认前端和生产数据都已切走。
- 不要把管理员界面逻辑混进普通用户主流程，管理员体验要保持独立。
- 不要把“服务端失败”伪装成“前端成功”；尤其是 AI 生成、归档、贴纸、拼豆。

## Build & test

### Install

```bash
npm install
```

### Local development

```bash
npm run dev
```

单独启动：

```bash
npm run dev:client
npm run dev:server
```

### Build

完整构建前先过编码扫描：

```bash
npm run build
```

它等价于：

```bash
npm run check:encoding
npm run build:client
npm run build:server
```

### Tests

```bash
npm run test:api
npm run test:perler
npm run test:e2e
npm run test
```

### Ops scripts

```bash
npm run validate:env
npm run backup:data
npm run backup:job
npm run restore:data -- ./backups/<snapshot> ./restore-target
npm run smoke:production
```

## Common tasks

### Add or change a frontend feature

1. 先找 `App.tsx` 中该页面的入口和状态来源
2. 再看对应 `components/*`
3. 如果涉及服务端数据，再看 `services/dataService.ts` 和对应 `routes/*`
4. 改完至少跑 `npm run build`

### Add or change an API

1. 在 `routes/*` 找最接近的接口
2. 在 `services/*` 找实际业务逻辑和 DB 访问
3. 明确鉴权、限流、日志、错误返回结构
4. 跑 `npm run build`，必要时再跑 `npm run test:api`

### Fix Chinese mojibake / bad copy

1. 先修源码，不要修构建产物
2. 优先检查文件保存编码是否为 UTF-8
3. 改完必须跑：

```bash
npm run check:encoding
```

### Deploy to ECS

本仓库的常规做法是：

1. 本地确认 `npm run build` 通过
2. 打包源码，但排除 `.env`、`node_modules`、`dist`、`.tmp`、`output`、`*.tgz`
3. 上传到 ECS
4. 在服务器执行 `deploy.sh`

不要把本地环境变量覆盖到服务器。

## Review checklist

提交前至少检查：

- 功能是否真的改在源码，不是在 `dist/` 或临时文件上打补丁
- 是否破坏了主链路：登录、扫描、归档、藏品查看、贴纸、拼豆、记忆
- 是否引入新的乱码、英文残留或不统一文案
- 是否保持了用户输入在异步过程中的连续性
- 是否补了服务端错误处理，而不是只在前端 `catch`
- 是否改坏了管理员权限、用户权限或游客逻辑
- 是否误动了数据库兼容逻辑、上传文件逻辑或备份恢复逻辑
- 是否遗漏 `npm run build`

## When in doubt

- 先小改，再验证，不要一次性大重构
- 先读完整链路，再下手改状态流
- 优先修真实问题，不做“顺手美化整个系统”
- 如果发现工作区里有大量历史垃圾文件，不要顺手全删；只清理与当前发布集明确相关的内容
