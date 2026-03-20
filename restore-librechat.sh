#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_BACKUP_DIR="$SCRIPT_DIR/librechat-backups"

BACKUP_DIR="${BACKUP_DIR:-$DEFAULT_BACKUP_DIR}"
CONTAINER_NAME="${CONTAINER_NAME:-chat-mongodb}"
DB_NAME="${DB_NAME:-LibreChat}"
FORCE_RESTORE="${FORCE_RESTORE:-false}"
RESTORE_FILE="${1:-}"

if [[ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER_NAME" 2>/dev/null || true)" != "true" ]]; then
  echo "Container '$CONTAINER_NAME' is not running."
  exit 1
fi

if [[ -z "$RESTORE_FILE" ]]; then
  RESTORE_FILE="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'librechat-backup-*.archive' -printf '%T@ %p\n' 2>/dev/null | sort -nr | head -n1 | cut -d' ' -f2-)"
fi

if [[ -z "$RESTORE_FILE" || ! -f "$RESTORE_FILE" ]]; then
  echo "Backup file not found."
  exit 1
fi

if [[ "$FORCE_RESTORE" != "true" ]]; then
  echo "Backup selected: $RESTORE_FILE"
  echo "This will replace database '$DB_NAME' in container '$CONTAINER_NAME'."
  read -r -p "Type RESTORE to continue: " confirmation
  if [[ "$confirmation" != "RESTORE" ]]; then
    echo "Restore cancelled."
    exit 0
  fi
fi

CONTAINER_RESTORE_PATH="/tmp/$(basename "$RESTORE_FILE")"

docker cp "$RESTORE_FILE" "$CONTAINER_NAME:$CONTAINER_RESTORE_PATH"
docker exec "$CONTAINER_NAME" mongorestore --archive="$CONTAINER_RESTORE_PATH" --db "$DB_NAME" --drop
docker exec "$CONTAINER_NAME" rm -f "$CONTAINER_RESTORE_PATH"

echo "Restore completed from: $RESTORE_FILE"
