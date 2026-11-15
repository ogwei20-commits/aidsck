#!/usr/bin/env bash
# 文档 4.4-10 / F-15：数据库备份。非破坏性操作，可随时执行。
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

DB_URL="${DATABASE_URL:-}"
if [ -z "$DB_URL" ] && [ -f .env.local ]; then
  DB_URL="$(sed -n 's/^DATABASE_URL=//p' .env.local | head -1)"
fi
if [ -z "$DB_URL" ]; then
  echo "[backup] FAIL: DATABASE_URL 未配置"
  exit 1
fi

mkdir -p storage/backups
OUT="storage/backups/crossborder_ai_$(date +%Y%m%d_%H%M%S).dump"
pg_dump --format=custom --no-owner --file="$OUT" "$DB_URL"
echo "[backup] OK: $OUT"
ls -lh "$OUT"
