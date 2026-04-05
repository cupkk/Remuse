# gift.remuse.top 上线说明

这份文档只针对 NFC 展示站 `gift.remuse.top`。它对应的是当前仓库的静态产物 `dist-gift/`，不需要走主站 `remuse.top` 的 Express 反向代理。

## 1. 本地准备

在仓库根目录执行：

```bash
npm run polish:nfc-showcase
npm run build:gift
```

如果你这次还重新生成了真实封面和贴纸，完整链路改为：

```bash
npm run generate:nfc-showcase
npm run polish:nfc-showcase
npm run build:gift
```

构建完成后，确认下面这些内容存在：

- `dist-gift/index.html`
- `dist-gift/assets/*`
- `dist-gift/nfc-showcase/<slug>/*`
- `dist-gift/favicon.svg`

## 2. 服务器目录建议

建议在服务器上采用 release 目录 + `current` 软链接：

```bash
/var/www/remuse-gift/
├── current -> /var/www/remuse-gift/releases/20260321-01
└── releases/
    ├── 20260320-01
    └── 20260321-01
```

这样替换现网和回滚都更稳。

## 3. 上传构建产物

先在服务器创建新 release 目录：

```bash
ssh <user>@<server> "mkdir -p /var/www/remuse-gift/releases/20260321-01"
```

再上传当前 `dist-gift/`：

```bash
rsync -av --delete dist-gift/ <user>@<server>:/var/www/remuse-gift/releases/20260321-01/
```

如果你不用 `rsync`，也可以用 `scp -r`，但不如 `rsync` 适合增量替换。

## 4. Nginx 配置

把 [nginx-gift-static-template.conf](/d:/github/Re-Museum/deploy/nginx-gift-static-template.conf) 部署到服务器，例如：

```bash
sudo cp deploy/nginx-gift-static-template.conf /etc/nginx/conf.d/gift.remuse.top.conf
```

核心原则：

- `gift.remuse.top` 独立成一个静态站点
- `root` 指向 `/var/www/remuse-gift/current`
- `/assets/` 和 `/nfc-showcase/` 直接走静态文件
- 其余路径用 `try_files ... /index.html` 兜底，保证 `/<slug>` 这种单页路由能正常打开

如果证书还没签，可以先申请：

```bash
sudo certbot --nginx -d gift.remuse.top
```

## 5. 切换现网

上传完成后，将 `current` 指向这次新 release：

```bash
ssh <user>@<server> "ln -sfn /var/www/remuse-gift/releases/20260321-01 /var/www/remuse-gift/current"
```

然后检查并重载 Nginx：

```bash
ssh <user>@<server> "sudo nginx -t && sudo systemctl reload nginx"
```

注意：主站 `remuse.top` 现有的反向代理配置不用动，只需要新增 `gift.remuse.top` 这一份静态站配置。

## 6. 上线验收

先验首页：

- `https://gift.remuse.top/`

再验 10 个 NFC URL：

- `https://gift.remuse.top/campus-cup`
- `https://gift.remuse.top/denim-pocket`
- `https://gift.remuse.top/midnight-ticket`
- `https://gift.remuse.top/bottlecap-badge`
- `https://gift.remuse.top/metro-pass`
- `https://gift.remuse.top/sweater-button`
- `https://gift.remuse.top/cassette-ribbon`
- `https://gift.remuse.top/paper-crane`
- `https://gift.remuse.top/film-roll`
- `https://gift.remuse.top/concert-band`

建议上线后至少确认这几项：

- 首页能看到 10 张卡片
- 任意详情页能加载封面、原图、贴纸
- 手机访问没有横向溢出
- 浏览器控制台没有 404 和脚本错误

## 7. 快速回滚

如果现网有问题，直接把 `current` 切回上一个 release：

```bash
ssh <user>@<server> "ln -sfn /var/www/remuse-gift/releases/20260320-01 /var/www/remuse-gift/current"
ssh <user>@<server> "sudo nginx -t && sudo systemctl reload nginx"
```

因为 `gift.remuse.top` 是纯静态站，回滚不需要重启 Node 服务。
