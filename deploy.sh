#!/bin/bash

set -euo pipefail

APP_NAME="re-museum"

install_system_pkg() {
  if command -v dnf >/dev/null 2>&1; then
    sudo dnf install -y "$@"
  elif command -v yum >/dev/null 2>&1; then
    sudo yum install -y "$@"
  elif command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update -y
    sudo apt-get install -y "$@"
  else
    echo "[deploy] unsupported package manager, please install manually: $*"
    exit 1
  fi
}

echo "[deploy] starting ${APP_NAME}"

if ! command -v node >/dev/null 2>&1; then
  echo "[deploy] installing Node.js 20.x"
  if command -v apt-get >/dev/null 2>&1; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  else
    curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo -E bash -
  fi
  install_system_pkg nodejs
fi

echo "[deploy] node $(node -v)"
echo "[deploy] npm  $(npm -v)"

if ! command -v pm2 >/dev/null 2>&1; then
  echo "[deploy] installing pm2"
  sudo npm install -g pm2
fi

echo "[deploy] installing dependencies"
npm install

if [ ! -f .env ]; then
  echo "[deploy] missing .env"
  echo "[deploy] copy .env.example to .env and fill production variables first"
  exit 1
fi

mkdir -p logs

echo "[deploy] building application"
npm run build

echo "[deploy] restarting pm2 app"
pm2 delete "${APP_NAME}" 2>/dev/null || true
pm2 start ecosystem.config.cjs --only "${APP_NAME}"
pm2 save

echo "[deploy] enabling pm2 startup"
pm2 startup systemd -u "$(whoami)" --hp "$(eval echo ~$(whoami))" >/dev/null 2>&1 || true
pm2 save

PUBLIC_IP="$(curl -s ifconfig.me 2>/dev/null || echo '<server-ip>')"

echo "[deploy] done"
echo "[deploy] url: http://${PUBLIC_IP}:3000"
echo "[deploy] logs: pm2 logs ${APP_NAME}"
echo "[deploy] status: pm2 status"
echo "[deploy] restart: pm2 restart ${APP_NAME}"
