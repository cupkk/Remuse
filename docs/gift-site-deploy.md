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

## 2. 先确认线上 Nginx root

这一步必须先做，不要想当然。

实际线上有两种部署方式：

1. 直接把静态文件放在 `/var/www/remuse-gift`
2. 使用 release 目录，再让 `/var/www/remuse-gift/current` 指向当前版本

先在服务器执行：

```bash
sudo nginx -T | grep -A 6 "server_name gift.remuse.top"
```

先看清楚 `root` 指向哪里，再决定后面的上传和切换动作。

## 3. 服务器目录建议

如果你准备把 gift 子站长期维护下去，建议在服务器上采用 release 目录 + `current` 软链接：

```bash
/var/www/remuse-gift/
├── current -> /var/www/remuse-gift/releases/<release-id>
└── releases/
    ├── <previous-release-id>
    └── <release-id>
```

这样替换现网和回滚都更稳。

## 4. 上传构建产物

如果线上 Nginx `root` 指向 `/var/www/remuse-gift/current`，先在服务器创建新 release 目录：

```bash
ssh <user>@<server> "mkdir -p /var/www/remuse-gift/releases/<release-id>"
```

再上传当前 `dist-gift/`：

```bash
rsync -av --delete dist-gift/ <user>@<server>:/var/www/remuse-gift/releases/<release-id>/
```

如果线上 Nginx `root` 直接指向 `/var/www/remuse-gift`，那就不要只更新 `current`，而是直接覆盖这个 root：

```bash
rsync -av --delete dist-gift/ <user>@<server>:/var/www/remuse-gift/
```

如果你不用 `rsync`，也可以用 `scp -r` 或打包上传后解压，但最终一定要确认 `index.html` 和 `assets/*` 是同一批新产物。

## 5. Nginx 配置

把 [nginx-gift-static-template.conf](/d:/github/Re-Museum/deploy/nginx-gift-static-template.conf) 部署到服务器，例如：

```bash
sudo cp deploy/nginx-gift-static-template.conf /etc/nginx/conf.d/gift.remuse.top.conf
```

核心原则：

- `gift.remuse.top` 独立成一个静态站点
- `root` 指向实际生效的静态目录
- `/assets/` 和 `/nfc-showcase/` 直接走静态文件
- 其余路径用 `try_files ... /index.html` 兜底，保证 `/<slug>` 这种单页路由能正常打开

如果证书还没签，可以先申请：

```bash
sudo certbot --nginx -d gift.remuse.top
```

## 6. 切换现网

只有在 Nginx `root` 指向 `current` 时，才需要切换软链：

```bash
ssh <user>@<server> "ln -sfn /var/www/remuse-gift/releases/<release-id> /var/www/remuse-gift/current"
```

如果 `root` 本来就是 `/var/www/remuse-gift`，那就只需要重载 Nginx。

统一检查并重载：

```bash
ssh <user>@<server> "sudo nginx -t && sudo systemctl reload nginx"
```

注意：主站 `remuse.top` 现有的反向代理配置不用动，只需要维护 `gift.remuse.top` 这一份静态站配置。

## 7. 上线验收

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

- 首页能看到新版“每日幸运物品”界面
- 任意详情页能加载图片、互动纸张和“收下好运”按钮
- 手机访问没有横向溢出
- 浏览器控制台没有 404 和脚本错误

## 8. 缓存排查

如果服务器文件已经替换，但浏览器还是旧页面，先排查：

1. `curl -L https://gift.remuse.top/` 看返回的 `<title>` 和脚本 hash
2. 强刷浏览器缓存
3. 用带查询参数的地址验证，例如：

```bash
https://gift.remuse.top/?build=<release-id>
https://gift.remuse.top/campus-cup?build=<release-id>
```

如果 `curl` 已经是新 HTML，而浏览器仍是旧样式，通常就是浏览器或 CDN 缓存问题，不是源码没更新。

## 9. 快速回滚

如果现网有问题，直接把 `current` 切回上一个 release：

```bash
ssh <user>@<server> "ln -sfn /var/www/remuse-gift/releases/<previous-release-id> /var/www/remuse-gift/current"
ssh <user>@<server> "sudo nginx -t && sudo systemctl reload nginx"
```

因为 `gift.remuse.top` 是纯静态站，回滚不需要重启 Node 服务。
