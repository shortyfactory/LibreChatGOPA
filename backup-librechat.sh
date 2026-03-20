#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_BACKUP_DIR="$SCRIPT_DIR/librechat-backups"

BACKUP_DIR="${BACKUP_DIR:-$DEFAULT_BACKUP_DIR}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
CONTAINER_NAME="${CONTAINER_NAME:-chat-mongodb}"
DB_NAME="${DB_NAME:-LibreChat}"
BACKUP_NAME="librechat-backup-$(date +%F-%H%M).archive"
CONTAINER_BACKUP_PATH="/tmp/$BACKUP_NAME"

mkdir -p "$BACKUP_DIR"

if [[ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER_NAME" 2>/dev/null || true)" != "true" ]]; then
  echo "Container '$CONTAINER_NAME' is not running."
  exit 1
fi

docker exec "$CONTAINER_NAME" mongodump --db "$DB_NAME" --archive="$CONTAINER_BACKUP_PATH"
docker cp "$CONTAINER_NAME:$CONTAINER_BACKUP_PATH" "$BACKUP_DIR/$BACKUP_NAME"
docker exec "$CONTAINER_NAME" rm -f "$CONTAINER_BACKUP_PATH"

find "$BACKUP_DIR" -maxdepth 1 -type f -name 'librechat-backup-*.archive' -mtime +"$RETENTION_DAYS" -delete

echo "Backup created: $BACKUP_DIR/$BACKUP_NAME"
echo "Old backups older than $RETENTION_DAYS days deleted."
