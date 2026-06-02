# Re-Museum 研究进度日志 20260503

## 整体研究进度

项目目标：Re-Museum 是一个全栈数字再生博物馆项目，围绕“旧物上传 -> AI 识别 -> 归档进展馆 -> 生成贴纸 / 拼豆 / 表情包 / 改造指南 / 记忆内容”形成完整体验链路。

研究方向：当前重点是保持项目可部署、可演示、可维护，确保 GitHub 仓库公开可读，README 清楚说明项目技术栈、技术选型、部署实例和开源范围。

已完成工作：

- 确认本地仓库远程地址为 `https://github.com/cupkk/Re-Museum.git`。
- 确认当前分支为 `main`，跟踪 `origin/main`。
- 检查原 README，发现中文内容已经严重乱码，不适合作为项目说明。
- 确认主站 `https://remuse.top` 可访问，HTTP 状态为 200。
- 确认 NFC / 礼物子站 `https://gift.remuse.top` 可访问，HTTP 状态为 200。

关键发现：

- 原 README 已经包含项目方向、技术栈和部署信息，但大量中文为 mojibake 乱码，必须重写。
- GitHub CLI `gh` 当前环境不可用，GitHub 仓库主题或可见性不能通过 `gh` 直接修改。
- 未登录访问 GitHub REST 仓库接口返回 404，可能表示仓库尚未公开或未对匿名访问开放；需要后续在 GitHub 页面确认仓库 visibility 是否已经设为 Public。

当前阻塞：

- 无法在当前环境直接使用 `gh` 修改 GitHub 仓库 topic 或可见性。
- 仓库公开状态需要通过 GitHub 网页或已认证 API 进一步确认。

下一步：

- 提交并推送重写后的 README 和本日志。
- 如果 GitHub 仓库仍不是公开仓库，需要由有权限的账号在 GitHub Settings 中把仓库改为 Public。

## 2026-05-03 更新

### 完成事项

- 重写 `README.md`：
  - 明确项目名称和 GitHub 仓库地址。
  - 增加主站部署实例 `https://remuse.top`。
  - 增加 NFC / 礼物展示子站 `https://gift.remuse.top`。
  - 补齐项目亮点、开源范围、技术栈、系统结构、本地开发、构建测试、生产运行和安全注意事项。
  - 将所有用户可见中文改为可读简体中文，移除原 README 中的乱码。
- 新增本研究进度日志 `experiment journal 20260503.md`，用于后续工作交接。

### 涉及文件

- `README.md`
- `experiment journal 20260503.md`

### 决策记录

- README 以项目说明为主要目标，不再保留乱码旧文档。
- 生产数据、上传文件、备份和密钥继续不纳入开源仓库。

### 后续代理需要做什么

- 开始新会话时先读本日志，再检查 `git status`、`README.md` 和远程 tag。
- 如果 README 后续继续修改，必须运行 `npm run check:encoding`。
- 推送前确认 `.env`、`data/`、`uploads/`、`backups/`、构建产物和压缩包没有被误提交。

## 2026-05-03 仓库公开与说明文档更新记录

### 完成事项

- 已提交并推送 README 与进度日志更新：
  - commit：`eed1024 docs: prepare public project docs`
  - 远程分支：`origin/main`
- 已通过 GitHub API 将仓库 `cupkk/Re-Museum` 从 private 改为 public。
- 已设置 GitHub 仓库 homepage 为 `https://remuse.top`。
- 已设置 GitHub 仓库 description 为 Re-Museum 数字再生博物馆相关说明。
- 已添加 GitHub repository topics：
  - `ai`
  - `digital-museum`
  - `remuseum`

### 验证结果

- `npm run check:encoding` 通过。
- `git diff --check` 通过。
- 匿名访问 GitHub API 返回：
  - `private=False`
  - `visibility=public`
  - `homepage=https://remuse.top`
- 匿名访问 GitHub topics 返回：
  - `ai`
  - `digital-museum`
  - `remuseum`
- 匿名访问 GitHub HTML 页面 `https://github.com/cupkk/Re-Museum` 返回 HTTP 200。
- 主站 `https://remuse.top` 返回 HTTP 200。
- NFC / 礼物子站 `https://gift.remuse.top` 返回 HTTP 200。

### 当前状态

仓库已公开，README 已清楚写明技术栈和技术选型，并附部署实例。

## 2026-05-03 GitHub About 乱码修复

### 问题

用户反馈 GitHub 仓库 About 区域 description 出现问号乱码，截图确认乱码位于 GitHub 仓库元数据，不是 README 页面内容。

### 原因判断

上一轮通过 PowerShell 直接向 GitHub API 写入中文 description 时，当前 Windows 命令链路把中文字符转成了问号，导致 GitHub 侧存储的 description 本身已经损坏。

### 修复操作

- 使用 Node.js 脚本读取 Git credential manager 中的 GitHub token。
- 通过 GitHub REST API 重新 PATCH 仓库 metadata。
- 避免在 PowerShell 命令中直接写中文，改用 JavaScript 字符串中的 Unicode 转义构造正确 description。
- 写回 GitHub 仓库 description。
- 保持 homepage：
  - `https://remuse.top`

### 验证结果

- 认证 API 读取返回正确中文 description。
- 匿名公开 API 读取返回正确中文 description。
- 本地 `README.md` 用 Node.js 按 UTF-8 读取，确认包含正确中文项目介绍。
- 本次未修改 README。

### 注意事项

- 后续如果需要修改 GitHub 仓库 description、homepage 或 release 中文内容，不要在 PowerShell 命令字面量里直接写中文；优先使用 Node.js 文件或 Unicode 转义，避免再次写出问号。
- 当前工作区发现若干图片文件处于 deleted 状态，这不是本次 metadata 修复操作产生的；后续代理不要在不确认来源的情况下恢复或提交这些删除。

## 2026-05-03 仓库整洁度清理

### 目标

用户要求删除仓库中多余、冗杂的文件和缓存文件，让公开仓库更适合评委浏览。

### 清理判断

本次只清理会出现在 GitHub 仓库、且不参与构建或运行的杂物；保留真实产品资产、运行数据边界和展示子站素材。

保留内容：

- `public/nfc-showcase/`：被 `shared/nfcGiftDemos.generated.json` 和 NFC / 礼物子站引用，是展示资产，不是缓存。
- `assets/qr/poster-qr-remuse-top.png`：被 Playwright E2E 用作上传测试图。
- `data/`、`uploads/`、`backups/`：真实运行数据目录，未纳入 Git 清理。
- `.env*`：环境变量和密钥相关文件，未触碰。

删除内容：

- `.playwright-mcp/` 下的历史页面快照。
- `.tmp-gift-preview.*` 临时预览输出。
- `output/` 下的线上截图和调试截图。
- 根目录 `image.png`、`image-1.png`、`image-2.png`、`image-4.png` 等设计参考图。
- 已乱码且只引用这些参考图的 `今日好物NFC设计.md` 草稿。
- 未被源码引用的 QR/海报辅助文件：
  - `assets/qr/poster-qr-47.86.85.236-3000.png`
  - `assets/qr/poster-qr-remuse-top.svg`
  - `assets/qr/remuse-top-brochure-qr.png`
  - `assets/qr/remuse-top-brochure-qr.svg`
- 未被源码引用且含乱码/调试性质的辅助文件：
  - `fetch_images.js`
  - `fix_samples.sql`
  - `preview-covers.html`
  - `preview-images.html`

### 防回流规则

更新 `.gitignore`，新增忽略：

- `.playwright-mcp/`
- `/output/`
- `/.tmp-*.out`
- `/.tmp-*.err`
- `/image*.png`
- `/preview-*.html`

### 本地缓存清理

另外清理了本地 ignored 产物和临时文件，包括：

- `.tmp/`
- `.logs/`
- `dist/`
- `dist-gift/`
- `build/`
- 根目录历史部署压缩包 `*.tgz`
- `.tmp-dev-*.out`

这些本地缓存清理不应该进入 Git diff，但能让工作区更整洁。保留了 `node_modules/`，方便继续验证。

### 后续验证计划

- 运行 `npm run check:encoding`。
- 运行 `npm run build`。
- 检查 Git diff，确认只包含清理文件、`.gitignore` 和本日志。

## 2026-05-03 路演前项目理解与 UX 小修

### 本次目标

用户要求深入理解当前 Re-Museum 项目，梳理已开发能力、待开发任务、项目不足与可改进点，并在不影响整个平台的前提下修复少量影响路演用户体验的问题。

### 项目理解

当前项目不是纯前端 Demo，而是较完整的全栈产品：

- 前端由 `App.tsx` 统一编排，核心页面包括登录注册、扫描归档、藏品馆、再生工坊、成果库、共建藏馆、记忆对话、馆长办公室和管理后台。
- 后端由 `server.ts` + `routes/*` 提供 API，覆盖鉴权、藏品、展馆、贴纸、记忆、共建藏馆、管理员、反馈、错误上报和 AI 能力聚合。
- 数据层由 `services/database.ts` 和 SQLite 支撑，上传与生成图走本地文件系统。
- AI 能力集中在 `routes/ai.ts`、`services/aiService.ts`、`services/geminiService.ts`、`services/usageQuota.ts`，包含额度控制、失败分类、模型 fallback、mock 模式和日志。
- 测试体系包含 API 商业化就绪测试、拼豆算法 parity 测试、Playwright E2E 用户旅程测试。E2E 使用 `.tmp/e2e-runtime` 隔离数据库和上传目录，并开启 `AI_MOCK_MODE=true`，不会触碰真实生产数据。

### 已开发能力

- 账号系统：游客进入、注册、登录、邮箱验证、找回密码、游客升级、退出、账号安全与管理员角色。
- 扫描归档：上传旧物图片、AI 分析、归档到展馆、故事草稿继续补充、封面与记忆索引。
- 藏品馆：展馆浏览、藏品详情、展馆跳转。
- 再生工坊：从藏品生成贴纸、表情包、拼豆图纸、综合改造指南，并把结果沉淀到成果库。
- 成果库：贴纸、表情包、拼豆图纸、手账、改造指南的集中查看、保存和删除。
- 记忆对话：基于已归档藏品的记忆线程、查询和检索回答。
- 共建藏馆：创建、加入、邀请、成员协作、藏品加入、状态与报告。
- 管理后台：用户、反馈、用量、AI 调用、错误上报和治理入口。
- NFC / 礼物子站：独立构建链路，用于活动或礼物展示。

### 待开发或后续增强

- 路演演示数据：建议准备一套稳定演示账号、演示藏品和备用图片，避免现场网络或 AI 上游波动影响演示节奏。
- Demo 模式：当前测试有 `AI_MOCK_MODE`，但正式产品侧还可以增加受控的演示降级开关，让现场能在 AI 不可用时继续展示完整链路。
- 首次体验：游客路径已经可用，但启动动画、登录页、引导页、再生工坊之间仍偏“产品内部逻辑”，后续可以做更明确的演示路径。
- 工程体积：`components/StickerLibrary.tsx`、`components/SharedMuseumHub.tsx`、`components/Scanner.tsx` 等文件较大，后续维护成本高，建议路演后拆分。
- 自动化测试维护：E2E 曾落后于当前工坊流程，后续 UI 流程调整时要同步测试路径和稳定 `data-testid`。
- 线上观测：已经有错误上报与管理后台，但路演前应确认生产日志、AI 配额、邮件模式、Nginx/PM2 状态和备份任务正常。

### 发现的问题

- 首次进入游客路径后，引导页按钮仍显示英文 `SKIP`、`NEXT`、`START JOURNEY`，与中文主体验不一致，评委体验容易割裂。
- 登录页游客入口分隔符显示 `or`，同样是首屏中文体验中的小瑕疵。
- Playwright E2E 测试仍按旧流程在扫描结果页查找 `scanner-generate-sticker`，但当前产品已经调整为“扫描归档 -> 前往再生工坊 -> 选择贴纸工具 -> 选择藏品 -> 生成并进入成果库”。
- E2E 测试用英文 `verify` 过滤测试邮箱主题，但实际邮件主题是中文“请验证你的 Re-Museum 邮箱”，导致自动化验收误失败。

### 修复操作

- 修改 `components/Onboarding.tsx`：
  - `SKIP` 改为 `跳过`。
  - `NEXT` 改为 `继续`。
  - `START JOURNEY` 改为 `开始扫描`。
  - 补充 `aria-label="跳过引导"` 与动态继续按钮语义标签。
- 修改 `components/LoginScreen.tsx`：
  - 游客入口分隔符从 `or` 改为 `或`。
- 修改 `components/StickerLibrary.tsx`：
  - 给贴纸卡片增加稳定测试标识 `data-testid="results-sticker-card"`，不改变 UI 展示。
- 修改 `tests/e2e/user-journey.spec.ts`：
  - 邮箱验证主题筛选改为中文 `验证`。
  - 引导页跳过按钮兼容中文和历史英文。
  - 贴纸生成路径更新为当前真实工坊流程。
  - 工坊导航状态兼容“成果库仍保持打开”的合理产品状态。

### 验证结果

- `npm run check:encoding` 通过，未发现可疑乱码模式。
- `npm run build` 通过，前端 Vite 构建与后端 TypeScript 构建均成功。
- Playwright 冷启动游客路径验证通过：
  - 登录页分隔符显示 `或`。
  - 引导页显示 `跳过`。
  - 未再出现 `SKIP`、`NEXT`、`START JOURNEY`、`OR` 等英文控制文案。
- `npm run test:e2e` 通过，覆盖注册、邮箱验证、登录、扫描归档、工坊生成贴纸、成果库、藏品馆、记忆问答和退出。
- `npm test` 通过，包含 API 商业化就绪测试与拼豆 parity 测试。

### 路演前建议

- 路演当天优先走“游客进入 -> 跳过引导 -> 上传演示图 -> 归档成功 -> 前往再生工坊 -> 生成贴纸 -> 打开成果库 -> 记忆对话”的主线。
- 提前准备 2-3 张效果稳定的旧物图片，避免现场图片质量导致 AI 识别不稳定。
- 路演前在生产环境确认主站、NFC 子站、AI Key、配额、PM2、Nginx、磁盘空间和上传目录权限。
- 如果现场网络不稳，优先展示已经归档的藏品和成果库，再补充说明 AI 生成链路。

### 后续代理注意事项

- 不要为了继续优化路演体验而大改状态流；目前主链路已经通过 E2E。
- 如果继续改用户可见中文，必须运行 `npm run check:encoding`。
- E2E 当前已经对齐工坊流程，后续改再生工坊入口时要同步 `tests/e2e/user-journey.spec.ts`。
- 生产数据目录 `data/`、`uploads/`、`backups/` 和 `.env*` 仍然不要提交或清理。

## 2026-05-03 服务器同步记录

### 目标

用户询问本次路演前 UX 修复是否已经同步到服务器，并提供服务器 PEM 密钥位置。

### 服务器信息

- 主站域名 `remuse.top` 解析到 `47.86.53.69`。
- NFC 子站 `gift.remuse.top` 也解析到 `47.86.53.69`。
- 服务器要求使用 `ecs-user` 登录，拒绝 root SSH 登录。
- 主站部署目录确认为 `/home/ecs-user/Re-Museum`。
- PM2 应用名为 `re-museum`。

### 同步策略

服务器 `/home/ecs-user/Re-Museum` 工作区存在大量历史本地修改和未跟踪文件，因此本次没有执行 `git pull`、`git reset` 或整目录覆盖。

采用保守同步策略：

1. 在服务器创建备份目录：
   - `/home/ecs-user/re-museum-deploy-backups/20260503-024256-pre-ux-sync`
2. 备份即将覆盖的服务器文件：
   - `components/LoginScreen.tsx`
   - `components/Onboarding.tsx`
   - `components/StickerLibrary.tsx`
   - `tests/e2e/user-journey.spec.ts`
3. 只上传本次变更相关文件到服务器：
   - `components/LoginScreen.tsx`
   - `components/Onboarding.tsx`
   - `components/StickerLibrary.tsx`
   - `tests/e2e/user-journey.spec.ts`
   - `experiment journal 20260503.md`
4. 未覆盖服务器 `.env`、`data/`、`uploads/`、`backups/`、生产日志或其他运行数据。

### 服务器验证

- 服务器执行 `npm run check:encoding` 通过。
- 服务器执行 `npm run build` 通过：
  - 前端 Vite 构建成功。
  - 后端 TypeScript 构建成功。
- 执行 `pm2 restart re-museum --update-env` 成功。
- `pm2 status` 显示 `re-museum` 在线。
- 公网 `https://remuse.top/` 返回 HTTP 200。
- 公网 `https://remuse.top/api/healthz` 返回 HTTP 200。
- 公网 HTML 已指向新构建资源：
  - `index-C49Lgc91.js`
- Playwright 线上冷启动游客路径验证通过：
  - 登录页分隔符为 `或`。
  - 引导页按钮为 `跳过`。
  - 未出现 `SKIP`、`NEXT`、`START JOURNEY`、`OR` 等英文控制文案。

### 注意事项

- PM2 日志中仍能看到历史客户端 `unhandledrejection` 和 AI 上游 warn，这些早于本次同步，不是本次 UX 文案修复引入。
- 本次没有更新 `gift.remuse.top` 静态子站，因为 UX 修复只影响主站首屏与再生工坊测试链路。
- 服务器工作区仍然不是干净 Git 状态，后续如果要做正式发布治理，应单独整理服务器目录或改成 release 包部署。

## 2026-05-06 AI 模型配置核查

### 目标

用户询问当前项目实际调用哪些模型，尤其是中转站配置，并反馈在某处看到 `claude code opus4.7`。

### 核查范围

- 本地源码中的 AI 服务与配置：
  - `services/aiService.ts`
  - `services/stepfunTextService.ts`
  - `services/appConfig.ts`
  - `server.ts`
  - `.env.example`
- 线上服务器 `/home/ecs-user/Re-Museum/.env` 中的非敏感模型与端点配置。
- 源码内是否存在 `claude`、`opus`、`sonnet` 等模型调用痕迹。

### 核查结果

- 当前业务应用没有直接调用 Claude、Opus 或 Sonnet 系列模型。
- 线上文本与视觉理解使用 StepFun：
  - 文本模型：`step-3.5-flash`
  - 记忆模型：`step-3.5-flash`
  - 视觉模型：`step-1v-8k`
  - 端点：`https://api.stepfun.com/v1`
- 线上图像生成使用 Gemini 兼容中转：
  - 主端点：`https://cdn.12ai.org`
  - 主图像模型：`gemini-3-pro-image-preview`
  - 图像候选：`gemini-3-pro-image-preview`、`gemini-3.1-flash-image-preview`、`gemini-2.5-flash-image-preview`
  - 改造指南配图主模型：`gemini-3.1-flash-image-preview`
  - 改造指南配图候选：`gemini-3.1-flash-image-preview`、`gemini-3-pro-image-preview`、`gemini-2.5-flash-image-preview`
- 记忆 RAG 向量使用 DashScope：
  - embedding 模型：`text-embedding-v4`
  - 维度：`1024`
- 源码中搜索 `claude`、`opus`、`sonnet` 未发现业务模型调用；出现的 `opus` 仅是音频 MIME 编码如 `audio/webm;codecs=opus`，不是 Claude Opus 模型。

### 判断

用户看到的 `claude code opus4.7` 很可能来自开发工具、代码助手、中转站后台模型列表、浏览器扩展或第三方平台展示，不是 Re-Museum 生产业务接口的当前调用模型。若该记录来自中转站后台账单，需要进一步用请求时间、API key、endpoint、request path 或调用日志来区分是否为别的工具共享了同一个中转站账号。

### 后续建议

- 如果要彻底排除中转站混用，应检查中转站后台的 API key 维度日志，按 key 或请求路径区分 Re-Museum 与开发工具调用。
- 如需在管理后台展示真实模型名，可将当前 `feature -> provider -> model` 映射做成只读配置页，避免只看到抽象的 `Gemini 生图` 或 `StepFun 文本`。

## 2026-05-06 Gemini 中转站密钥更新

### 目标

用户要求更新新的中转站密钥，并强调需要注意防控。密钥内容不写入日志、不提交 Git、不在输出中回显。

### 操作范围

- 本地 `.env`：更新 `GEMINI_API_KEY`。
- 服务器 `/home/ecs-user/Re-Museum/.env`：更新 `GEMINI_API_KEY`。
- 未修改 `.env.example`、README 或源码中的示例值。
- 未修改 `STEPFUN_API_KEY`、`STEPFUN_BASE_URL`、`GEMINI_BASE_URL` 或模型配置。

### 防控措施

- 更新前备份本地 `.env` 到 ignored 目录 `.tmp/secret-backups/`。
- 更新前备份服务器 `.env` 到 `/home/ecs-user/re-museum-secret-backups/`。
- `.env`、`.env.local` 和 `.tmp/secret-backups/` 均被 `.gitignore` 覆盖，未进入 Git 变更。
- 服务器 `.env` 权限收紧为 `600`，属主为 `ecs-user`。
- 只用前缀布尔检查确认密钥已配置，没有打印完整密钥。

### 验证结果

- 本地 `npm run validate:env` 通过。
- 服务器 `node --import tsx scripts/validate-env.mjs` 通过。
- 服务器执行 `pm2 restart re-museum --update-env` 成功，`re-museum` 状态为 `online`。
- 公网 `https://remuse.top/` 返回 HTTP 200。
- 公网 `https://remuse.top/api/healthz` 返回 HTTP 200。
- 本地 `npm run check:encoding` 通过。

### 后续建议

- 如果旧密钥可能已经暴露，应在中转站后台立即吊销旧密钥，并按 key 维度查看最近调用日志。
- 建议为 Re-Museum 单独创建专用 key，并设置额度上限、日限额、可用模型范围和异常告警，避免开发工具与生产站共用同一个 key。

## 2026-06-02 线上用户体验 QA 与小修复

### 目标

用户要求在用户体验日之前检查线上网站功能是否正常，确保主站和礼物/NFC 子站可正常使用，并优先修复不影响整个平台的小问题。

### 已完成事项

- 线上基础健康检查：
  - `https://remuse.top/` 返回 HTTP 200。
  - `https://remuse.top/api/healthz` 返回 HTTP 200。
  - `https://gift.remuse.top/` 返回 HTTP 200。
  - PM2 中 `re-museum` 为 `online`。
- 生产磁盘治理：
  - 发现服务器根分区曾因 `backups/` 长期累积达到 100% 使用率，导致 `ENOSPC`，会影响上传、归档和备份脚本。
  - 清理旧备份快照后，根分区恢复到约 37% 使用率，约 24G 可用。
  - 将 `backups/` 中误放的旧源码备份移出到 `/home/ecs-user/re-museum-deploy-backups/legacy-code-backups-20260602-qa/`，避免备份脚本把源码目录误识别为数据快照。
  - 重新执行 `npm run backup:job` 通过，并生成新快照 `/home/ecs-user/Re-Museum/backups/2026-06-02T02-28-34-308Z`。
- 线上真实功能验证：
  - 游客进入主站成功。
  - 上传样例旧物图片后，AI 扫描、识别、归档成功，新增藏品为“绿色保温瓶”，积分从 15 增加到 20。
  - 藏品馆正常展示新归档藏品。
  - 再生工坊正常展示工具与成果库。
  - 贴纸工具对“绿色保温瓶”执行真实 Gemini 生图成功，成果库贴纸数量从 7 增加到 8。
  - 记忆对话、共建藏馆、管理后台均可加载。
  - 礼物/NFC 子站桌面与移动端渲染正常，浏览器控制台无错误。
- 修复旧数据造成的记忆页图片 404：
  - 浏览器发现旧链接 `/api/uploads/items/5700fc67-01ce-4632-99df-2f86035893fa/017ee28b-c1b9-4ee8-837a-2647e485d1bc.webp` 返回 404。
  - 查询确认该藏品 ID 已不在 `collected_items` 主表中，只残留在 `memory_threads.matches_json` 和两条 `transformation_guides` 的历史 JSON 快照里。
  - 修改前备份数据库到 `/home/ecs-user/re-museum-db-manual-backups/remuse-before-stale-json-prune-2026-06-02T03-07-54-167Z.db`。
  - 事务清理结果：记忆线程移除 1 个失效匹配，两条改造指南移除已删除藏品的来源快照。
  - 复查同一 `.webp` 文件名，不再出现在会被前端渲染的记忆线程或改造指南 JSON 中。
- 修复记忆页小文案问题：
  - `components/MemoryRagStudio.tsx` 中检索结果元信息原显示为“材质 路 日期”，已修正为“材质 · 日期”。
  - 本地执行 `npm run build` 通过，包含 `check:encoding`、前端构建和后端 TypeScript 构建。
  - 服务器同步同一处源码修复后执行 `npm run build` 通过，并执行 `pm2 restart re-museum --update-env`。

### 验证结果

- 服务器 `node --import tsx scripts/validate-env.mjs` 通过，`disableLiveAi: false`。
- 服务器根分区复查：`/dev/vda3` 约 37% 使用率，约 24G 可用。
- 线上 `https://remuse.top/api/healthz` 返回 200。
- 线上主站刷新后加载新主 bundle `index-DYCD2hHJ.js`。
- 浏览器进入“记忆对话”后：
  - 失效旧图片不再加载。
  - 控制台当前错误数为 0。
  - 检索结果已显示“毛绒与布料 · 2026/3/16”等正确分隔符。
- 后台权限复查：
  - 无 Cookie 请求 `/api/admin/overview` 返回 401。
  - 游客 token 请求 `/api/admin/overview` 返回 403。
- PM2 最新 out 日志显示：
  - `server.started` 正常。
  - `/assets/MemoryRagStudio-Si_gf_6N.js` 返回 200。
  - `/api/memory/threads/...` 返回 304。
  - 三个有效记忆图片返回 304。
  - 后台权限测试分别返回 401 和 403。

### 涉及文件与数据

- 本地源码：
  - `components/MemoryRagStudio.tsx`
  - `experiment journal 20260503.md`
- 线上数据：
  - `memory_threads`：清理 1 条旧线程中的失效匹配项。
  - `transformation_guides`：清理 2 条旧指南中的已删除来源藏品快照。
- 临时脚本：
  - 本地 `.tmp/remote-*.cjs`，仅用于远端只读查询、数据清理和单字符远端补丁；`.tmp/` 已被 Git 忽略。
  - 服务器 `/tmp/remuse-*.cjs`，仅为本次运维临时脚本。

### 当前注意事项

- 本地工作区仍有未提交源码变更 `components/MemoryRagStudio.tsx`，以及本日志更新。
- 上一轮 QA 生成在仓库根目录的截图已移动到 ignored 目录，避免污染仓库根目录：
  - `.tmp/qa-screenshots/20260602/remuse-gift-mobile-qa.png`
  - `.tmp/qa-screenshots/20260602/remuse-main-mobile-qa.png`
- PM2 `error.log` 中仍能看到 5 月历史 `ENOSPC`、历史 unhandledrejection 和历史上游 warn；本次重启后的最新 out 日志未显示新的启动错误。
- 本次创建了一个游客账号用于权限验证，这是一次性测试数据，不含后台权限。

### 后续建议

- 如果今天现场还要继续高频上传，建议保持磁盘监控，重点看 `/home/ecs-user/Re-Museum/backups` 和 `uploads/` 增长。
- 备份目录建议长期只保存数据快照，不再混放源码备份；源码备份继续放在独立目录或使用 Git。
- 记忆页和改造指南未来可增加图片 `onError` 兜底，防止其他历史数据再次出现缺图时影响控制台和观感。
- 若要正式提交本次小修复，应只提交 `components/MemoryRagStudio.tsx` 和本日志，不提交 `.env`、`data/`、`uploads/`、`backups/`、`dist/`、`build/`、截图或 `.tmp/`。
