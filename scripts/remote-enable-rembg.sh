#!/usr/bin/env bash
set -euo pipefail

cd /home/ecs-user/Re-Museum

sed -i '/^nENABLE_REMBG=/d;/^ENABLE_REMBG=/d;/^REMBG_COMMAND=/d;/^REMBG_MODEL=/d;/^REMBG_MODEL_HOME=/d;/^REMBG_TIMEOUT_MS=/d' .env

cat >> .env <<'EOF'
ENABLE_REMBG=true
REMBG_COMMAND=/home/ecs-user/miniforge3/bin/rembg
REMBG_MODEL=u2netp
REMBG_MODEL_HOME=/home/ecs-user/.u2net
REMBG_TIMEOUT_MS=25000
EOF

tail -n 10 .env
