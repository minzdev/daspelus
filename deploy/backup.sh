#!/usr/bin/env bash
# DASPESLUS — backup harian database (cron: 0 2 * * * /var/www/daspeslus/deploy/backup.sh)
# Butuh: akses baca server/.env  |  Retensi lokal: 14 hari
set -euo pipefail

APP_DIR="/var/www/daspeslus"
BACKUP_DIR="/var/backups/daspeslus"
KEEP_DAYS=14
DATE=$(date +%F)

# Muat kredensial dari .env produksi (tanpa menampilkannya ke log)
# shellcheck disable=SC1091
set -a
. "$APP_DIR/server/.env"
set +a

mkdir -p "$BACKUP_DIR"
OUT="$BACKUP_DIR/daspeslus-$DATE.sql.gz"

mysqldump -h "$DB_HOST" -P "${DB_PORT:-3306}" -u "$DB_USER" -p"$DB_PASS" \
  --single-transaction --routines --triggers "$DB_NAME" 2>/dev/null | gzip > "$OUT"

find "$BACKUP_DIR" -name 'daspeslus-*.sql.gz' -mtime +"$KEEP_DAYS" -delete

echo "[backup] OK: $OUT ($(du -h "$OUT" | cut -f1))"
# TODO tahap 2: sinkronkan $OUT ke Object Storage SumoPod (rclone/s3cmd).
