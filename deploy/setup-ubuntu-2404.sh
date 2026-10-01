#!/usr/bin/env bash
# DASPESLUS — Provisioning VPS Ubuntu 24.04 (jalankan sebagai root, sekali saja)
set -euo pipefail

APP_DIR="/var/www/daspeslus"
APP_USER="daspeslus"
DOMAIN="daspelus.web.id"

echo "=== [1/8] Update OS & paket dasar ==="
apt-get update -y
DEBIAN_FRONTEND=noninteractive apt-get upgrade -y
apt-get install -y curl git ufw fail2ban certbot python3-certbot-nginx \
  mysql-client-core-8.0 unattended-upgrades

echo "=== [2/8] User deploy non-root ==="
id -u "$APP_USER" >/dev/null 2>&1 || useradd -m -s /bin/bash "$APP_USER"
mkdir -p "$APP_DIR" && chown -R "$APP_USER:$APP_USER" "$APP_DIR"

echo "=== [3/8] Node.js 22 LTS ==="
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
node --version && npm --version
npm install -g pm2

echo "=== [4/8] Nginx ==="
apt-get install -y nginx
systemctl enable nginx && systemctl start nginx

echo "=== [5/8] Firewall UFW (22/80/443) ==="
ufw allow OpenSSH >/dev/null 2>&1 || ufw allow 22
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
ufw status numbered | head -20

echo "=== [6/8] Auto security update ==="
dpkg-reconfigure -f noninteractive unattended-upgrades

echo "=== [7/8] Direktori backup ==="
mkdir -p /var/backups/daspeslus && chown "$APP_USER:$APP_USER" /var/backups/daspeslus

echo "=== [8/8] Selesai tahap OS ==="
echo "Lanjut: clone repo ke $APP_DIR sebagai user $APP_USER,"
echo "lalu salin deploy/nginx-daspelus.conf dan deploy/.env.production.example"
echo "Perintah TLS (SETELAH DNS mengarah ke VPS ini):"
echo "  certbot --nginx -d $DOMAIN --redirect --agree-tos -m admin@$DOMAIN --no-eff-email"
