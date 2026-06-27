#!/bin/bash
# 备份脚本 - 每次修改前自动备份
BACKUP_DIR="/Users/xylei/.openclaw/canvas/worldcup/backups"
mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
cp /Users/xylei/.openclaw/canvas/worldcup/index.html "$BACKUP_DIR/index.html.$TIMESTAMP"

# 只保留最近10个备份
ls -t "$BACKUP_DIR"/index.html.* | tail -n +11 | xargs rm -f 2>/dev/null

echo "✅ 已备份: index.html.$TIMESTAMP"
