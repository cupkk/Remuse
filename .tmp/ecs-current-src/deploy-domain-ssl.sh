#!/usr/bin/env bash

set -euo pipefail

DOMAIN="${1:-remuse.top}"
EMAIL="${2:-}"
APP_PORT="${3:-3000}"

if [[ -z "${EMAIL}" ]]; then
  echo "用法: bash deploy-domain-ssl.sh <domain> <email> [app_port]"
  echo "示例: bash deploy-domain-ssl.sh remuse.top admin@remuse.top 3000"
  exit 1
fi

if [[ "$(id -u)" -eq 0 ]]; then
  SUDO=""
else
  SUDO="sudo"
fi

install_pkg() {
  if command -v apt-get >/dev/null 2>&1; then
    ${SUDO} apt-get update -y
    ${SUDO} apt-get install -y "$@"
  elif command -v dnf >/dev/null 2>&1; then
    ${SUDO} dnf install -y "$@"
  elif command -v yum >/dev/null 2>&1; then
    ${SUDO} yum install -y "$@"
  else
    echo "未识别包管理器，请手动安装: $*"
    exit 1
  fi
}

echo "[1/6] 安装 Nginx + Certbot"
if ! command -v nginx >/dev/null 2>&1; then
  install_pkg nginx
fi

if ! command -v certbot >/dev/null 2>&1; then
  if command -v apt-get >/dev/null 2>&1; then
    install_pkg certbot python3-certbot-nginx
  elif command -v dnf >/dev/null 2>&1; then
    install_pkg certbot python3-certbot-nginx
  elif command -v yum >/dev/null 2>&1; then
    install_pkg epel-release || true
    install_pkg certbot python3-certbot-nginx
  fi
fi

echo "[2/6] 启动 Nginx"
${SUDO} systemctl enable nginx
${SUDO} systemctl start nginx

echo "[3/6] 写入反向代理配置"
if [[ -d /etc/nginx/sites-available ]]; then
  CONF_FILE="/etc/nginx/sites-available/${DOMAIN}.conf"
  ENABLED_FILE="/etc/nginx/sites-enabled/${DOMAIN}.conf"

  ${SUDO} tee "${CONF_FILE}" >/dev/null <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} www.${DOMAIN};

    client_max_body_size 20m;

    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF

  ${SUDO} rm -f "${ENABLED_FILE}"
  ${SUDO} ln -s "${CONF_FILE}" "${ENABLED_FILE}"
  ${SUDO} rm -f /etc/nginx/sites-enabled/default || true
else
  CONF_FILE="/etc/nginx/conf.d/${DOMAIN}.conf"

  ${SUDO} tee "${CONF_FILE}" >/dev/null <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} www.${DOMAIN};

    client_max_body_size 20m;

    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF
fi

echo "[4/6] 检查并重载 Nginx"
${SUDO} nginx -t
${SUDO} systemctl reload nginx

echo "[5/6] 申请 HTTPS 证书"
${SUDO} certbot --nginx -d "${DOMAIN}" -d "www.${DOMAIN}" --non-interactive --agree-tos -m "${EMAIL}" --redirect

echo "[6/6] 完成"
echo "HTTPS 已启用: https://${DOMAIN}"
echo "如果你未放行安全组端口，请在云厂商控制台放行 80/443。"
