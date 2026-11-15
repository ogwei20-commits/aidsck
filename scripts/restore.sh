#!/usr/bin/env bash
# 文档 4.4-10 / F-15：备份恢复。此操作会覆盖目标库数据，必须先人工确认。
# 用法：npm run db:restore -- <备份文件>
# 恢复到临时库做演练：RESTORE_DATABASE_URL="postgresql://.../临时库" ASSUME_YES=1 npm run db:restore -- <文件>
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

FILE="${1:-}"
if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
  echo "[restore] 用法: npm run db:restore -- <备份文件>"
  exit 1
fi

DB_URL="${RESTORE_DATABASE_URL:-${DATABASE_URL:-}}"
if [ -z "$DB_URL" ] && [ -f .env.local ]; then
  DB_URL="$(sed -n 's/^DATABASE_URL=//p' .env.local | head -1)"
fi
if [ -z "$DB_URL" ]; then
  echo "[restore] FAIL: 未指定目标数据库"
  exit 1
fi

if [ "${ASSUME_YES:-0}" != "1" ]; then
  echo "[restore] 警告：将覆盖目标库中的现有数据，此操作不可逆。"
  read -r -p "确认请输入 yes: " ANSWER
  if [ "$ANSWER" != "yes" ]; then
    echo "[restore] 已取消，未做任何修改"
    exit 1
  fi
fi

pg_restore --clean --if-exists --no-owner --dbname="$DB_URL" "$FILE"
echo "[restore] OK: 已从 $FILE 恢复到目标库"
