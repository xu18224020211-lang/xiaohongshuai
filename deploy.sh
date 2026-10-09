#!/usr/bin/env bash
#
# 一键部署脚本（Ubuntu / Debian）
# 用法：bash deploy.sh
#
# 做的事：
#   1. 检查并安装 Node.js 22（后端依赖 node:sqlite，必须 22+）
#   2. 安装依赖、构建前端
#   3. 用 PM2 常驻运行后端（后端同时托管前端页面，单服务）
#   4. 配置开机自启
#
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_NAME="xhsc-designer"
NODE_MAJOR_MIN=22

echo "=========================================="
echo " 部署目录: $APP_DIR"
echo "=========================================="

# ---------- 1. 检查 Node ----------
need_node=1
if command -v node >/dev/null 2>&1; then
  cur="$(node -v | sed 's/v//' | cut -d. -f1)"
  echo "[检查] 当前 Node 版本: $(node -v)"
  if [ "$cur" -ge "$NODE_MAJOR_MIN" ]; then
    need_node=0
  else
    echo "[警告] Node 版本过低（需要 ${NODE_MAJOR_MIN}+，因为后端用了 node:sqlite）"
  fi
fi

if [ "$need_node" -eq 1 ]; then
  echo "[安装] 正在安装 Node.js 22 ..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
  echo "[安装] Node 版本: $(node -v)"
fi

# ---------- 2. 安装依赖并构建 ----------
cd "$APP_DIR"
echo "[构建] 安装依赖 ..."
npm install

echo "[构建] 构建前端 ..."
npm run build

# ---------- 3. 检查 .env ----------
if [ ! -f server/.env ]; then
  echo "[警告] 未找到 server/.env，正在从模板创建 ..."
  cp server/.env.example server/.env
  # 生成随机 JWT_SECRET
  secret="$(head -c 32 /dev/urandom | base64 | tr -d '/+=' | head -c 40)"
  sed -i "s|^JWT_SECRET=.*|JWT_SECRET=${secret}|" server/.env
  echo ""
  echo "  !! 请编辑 server/.env 填入真实的 AI_API_KEY 后再重启："
  echo "     nano $APP_DIR/server/.env"
  echo "     pm2 restart $APP_NAME"
  echo ""
fi

# ---------- 4. PM2 常驻 ----------
if ! command -v pm2 >/dev/null 2>&1; then
  echo "[安装] 正在安装 PM2 ..."
  npm install -g pm2
fi

echo "[启动] 用 PM2 启动服务 ..."
pm2 delete "$APP_NAME" >/dev/null 2>&1 || true
pm2 start npm --name "$APP_NAME" --cwd "$APP_DIR" -- run start

pm2 save
pm2 startup systemd -u "$(whoami)" --hp "$HOME" >/dev/null 2>&1 || true

# ---------- 5. 结果 ----------
PORT="$(grep -E '^PORT=' server/.env 2>/dev/null | cut -d= -f2 | tr -d '[:space:]')"
PORT="${PORT:-4000}"
IP="$(curl -s --max-time 5 ifconfig.me || echo '你的服务器IP')"

echo ""
echo "=========================================="
echo " 部署完成"
echo "=========================================="
echo " 访问地址: http://${IP}:${PORT}"
echo ""
echo " 常用命令:"
echo "   pm2 logs $APP_NAME      查看日志"
echo "   pm2 restart $APP_NAME   重启"
echo "   pm2 stop $APP_NAME      停止"
echo ""
echo " 注意：国内服务器未备案时 80/443 端口会被拦截，"
echo "       所以这里用 ${PORT} 端口访问。"
echo "       需要在阿里云控制台「安全组」放行 ${PORT} 端口！"
echo "=========================================="
