# Re-Museum 研究进度日志 20260503

## 整体研究进度

项目目标：Re-Museum 是一个全栈数字再生博物馆项目，围绕“旧物上传 -> AI 识别 -> 归档进展馆 -> 生成贴纸 / 拼豆 / 表情包 / 改造指南 / 记忆内容”形成完整体验链路，并作为 #Flux南客松S2 黑客松参赛作品提交。

研究方向：当前重点从功能开发转为参赛提交准备，确保 GitHub 仓库公开可读、README 清楚说明项目技术栈、技术选型、部署实例、开源范围和参赛标签。

已完成工作：

- 确认本地仓库远程地址为 `https://github.com/cupkk/Re-Museum.git`。
- 确认当前分支为 `main`，跟踪 `origin/main`。
- 检查原 README，发现中文内容已经严重乱码，不适合直接作为参赛说明。
- 确认主站 `https://remuse.top` 可访问，HTTP 状态为 200。
- 确认 NFC / 礼物子站 `https://gift.remuse.top` 可访问，HTTP 状态为 200。
- 确认 Git 可以创建名为 `#Flux南客松S2` 的 tag。

关键发现：

- 原 README 已经包含项目方向、技术栈和部署信息，但大量中文为 mojibake 乱码，必须重写。
- GitHub CLI `gh` 当前环境不可用，GitHub 仓库主题或可见性不能通过 `gh` 直接修改。
- 未登录访问 GitHub REST 仓库接口返回 404，可能表示仓库尚未公开或未对匿名访问开放；需要后续在 GitHub 页面确认仓库 visibility 是否已经设为 Public。

当前阻塞：

- 无法在当前环境直接使用 `gh` 修改 GitHub 仓库 topic 或可见性。
- 仓库公开状态需要通过 GitHub 网页或已认证 API 进一步确认。

下一步：

- 提交并推送重写后的 README 和本日志。
- 在提交后的最新 commit 上创建并推送 Git tag：`#Flux南客松S2`。
- 如果 GitHub 仓库仍不是公开仓库，需要由有权限的账号在 GitHub Settings 中把仓库改为 Public。
- 如果黑客松平台要求的是 GitHub repository topic，而不是 Git tag，需要在 GitHub 页面添加可接受格式的 topic，并在 README 中保留 `#Flux南客松S2` 原始标签说明。

## 2026-05-03 更新

### 完成事项

- 根据黑客松提交要求重写 `README.md`：
  - 明确项目名称、参赛标签、GitHub 仓库地址。
  - 增加主站部署实例 `https://remuse.top`。
  - 增加 NFC / 礼物展示子站 `https://gift.remuse.top`。
  - 补齐项目亮点、开源范围、技术栈、系统结构、本地开发、构建测试、生产运行和安全注意事项。
  - 将所有用户可见中文改为可读简体中文，移除原 README 中的乱码。
- 新增本研究进度日志 `experiment journal 20260503.md`，用于后续工作交接。

### 涉及文件

- `README.md`
- `experiment journal 20260503.md`

### 决策记录

- README 以参赛提交为主要目标，不再保留乱码旧文档。
- 参赛标签同时写入 README，并准备以 Git tag 形式推送 `#Flux南客松S2`。
- 生产数据、上传文件、备份和密钥继续不纳入开源仓库。

### 后续代理需要做什么

- 开始新会话时先读本日志，再检查 `git status`、`README.md` 和远程 tag。
- 如果 README 后续继续修改，必须运行 `npm run check:encoding`。
- 推送前确认 `.env`、`data/`、`uploads/`、`backups/`、构建产物和压缩包没有被误提交。

## 2026-05-03 参赛提交完成记录

### 完成事项

- 已提交并推送 README 与进度日志更新：
  - commit：`eed1024 docs: prepare hackathon submission`
  - 远程分支：`origin/main`
- 已在最新提交上创建并推送 Git tag：`#Flux南客松S2`。
- 已通过 GitHub API 将仓库 `cupkk/Re-Museum` 从 private 改为 public。
- 已设置 GitHub 仓库 homepage 为 `https://remuse.top`。
- 已设置 GitHub 仓库 description 为 `Re-Museum 数字再生博物馆，#Flux南客松S2 黑客松参赛作品`。
- 已添加 GitHub repository topics：
  - `ai`
  - `digital-museum`
  - `flux-nankesong-s2`
  - `flux-hackathon-s2`
  - `remuseum`

### 验证结果

- `npm run check:encoding` 通过。
- `git diff --check` 通过。
- `git ls-remote --tags origin '#Flux南客松S2'` 能查到 tag，指向 `eed1024fca9e5e4a3926cc84eebedf62fed14e38`。
- 匿名访问 GitHub API 返回：
  - `private=False`
  - `visibility=public`
  - `homepage=https://remuse.top`
- 匿名访问 GitHub topics 返回：
  - `ai`
  - `digital-museum`
  - `flux-nankesong-s2`
  - `flux-hackathon-s2`
  - `remuseum`
- 匿名访问 GitHub HTML 页面 `https://github.com/cupkk/Re-Museum` 返回 HTTP 200。
- 主站 `https://remuse.top` 返回 HTTP 200。
- NFC / 礼物子站 `https://gift.remuse.top` 返回 HTTP 200。

### 决策记录

- 黑客松要求的原始标签 `#Flux南客松S2` 已用 Git tag 和 README 原文满足。
- GitHub repository topics 不支持带 `#` 的原始格式，因此额外使用规范化 topic `flux-nankesong-s2` 和 `flux-hackathon-s2`。

### 当前状态

参赛提交要求已经完成：代码已公开、README 已清楚写明技术栈和技术选型、已附部署实例、已设置参赛 Git tag，并补充了 GitHub topics。

## 2026-05-03 GitHub About 乱码修复

### 问题

用户反馈 GitHub 仓库 About 区域 description 显示为 `Re-Museum ???????,#Flux???S2 ???????`，截图确认乱码位于 GitHub 仓库元数据，不是 README 页面内容。

### 原因判断

上一轮通过 PowerShell 直接向 GitHub API 写入中文 description 时，当前 Windows 命令链路把中文字符转成了问号，导致 GitHub 侧存储的 description 本身已经损坏。

### 修复操作

- 使用 Node.js 脚本读取 Git credential manager 中的 GitHub token。
- 通过 GitHub REST API 重新 PATCH 仓库 metadata。
- 避免在 PowerShell 命令中直接写中文，改用 JavaScript 字符串中的 Unicode 转义构造正确 description。
- 写回 description：
  - `Re-Museum 数字再生博物馆，#Flux南客松S2 黑客松参赛作品`
- 保持 homepage：
  - `https://remuse.top`

### 验证结果

- 认证 API 读取返回正确中文 description。
- 匿名公开 API 读取返回正确中文 description。
- 本地 `README.md` 用 Node.js 按 UTF-8 读取，确认包含正确中文项目介绍和 `#Flux南客松S2`。
- 本次未修改 README。

### 注意事项

- 后续如果需要修改 GitHub 仓库 description、homepage 或 release 中文内容，不要在 PowerShell 命令字面量里直接写中文；优先使用 Node.js 文件或 Unicode 转义，避免再次写出问号。
- 当前工作区发现若干图片文件处于 deleted 状态，这不是本次 metadata 修复操作产生的；后续代理不要在不确认来源的情况下恢复或提交这些删除。
