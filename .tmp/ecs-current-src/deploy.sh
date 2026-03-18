#!/bin/bash
# ============================================================
# Re-Museum 一键部署脚本（在阿里云 ECS 上运行）
# 使用前先把项目代码上传到服务器
# ============================================================

set -e

echo "🏛️  Re-Museum 部署脚本"
echo "========================"

install_system_pkg() {
    if command -v dnf >/dev/null 2>&1; then
        sudo dnf install -y "$@"
    elif command -v yum >/dev/null 2>&1; then
        sudo yum install -y "$@"
    elif command -v apt-get >/dev/null 2>&1; then
        sudo apt-get update -y
        sudo apt-get install -y "$@"
    else
        echo "❌ 未识别的包管理器，请手动安装: $*"
        exit 1
    fi
}

# 1. 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "📦 安装 Node.js 20.x ..."
    if command -v apt-get >/dev/null 2>&1; then
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    else
        curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo -E bash -
    fi
    install_system_pkg nodejs
fi

echo "✅ Node.js $(node -v)"
echo "✅ npm $(npm -v)"

# 2. 安装 PM2
if ! command -v pm2 &> /dev/null; then
    echo "📦 安装 PM2 ..."
    sudo npm install -g pm2
fi

# 3. 安装依赖
echo "📦 安装项目依赖 ..."
npm install
npm install express http-proxy-middleware compression

# 4. 构建前端
echo "🔨 构建前端 ..."
npm run build

# 5. 创建日志目录
mkdir -p logs

# 6. 检查 .env
if [ ! -f .env ]; then
    echo ""
    echo "⚠️  未找到 .env 文件！"
    echo "   请先复制 .env.example 为 .env 并填入你的 Gemini API Key："
    echo "   cp .env.example .env"
    echo "   nano .env"
    echo ""
    exit 1
fi

# 7. 用 PM2 启动
echo "🚀 使用 PM2 启动服务 ..."
pm2 delete re-museum 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save

# 8. 设置开机自启
pm2 startup systemd -u $(whoami) --hp $(eval echo ~$(whoami)) 2>/dev/null || true
pm2 save

echo ""
echo "✅ 部署完成！"
echo "   访问地址: http://$(curl -s ifconfig.me 2>/dev/null || echo '<你的服务器IP>'):3000"
echo ""
echo "   常用命令："
echo "   pm2 logs re-museum    # 查看日志"
echo "   pm2 restart re-museum # 重启服务"
echo "   pm2 status            # 查看状态"
