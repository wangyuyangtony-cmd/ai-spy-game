#!/bin/bash
set -e
echo "🔄 拉取最新代码..."
cd /root/ai-spy-game
git pull origin main

echo "🔧 编译后端..."
cd backend && npm run build

echo "🎨 编译前端..."
cd ../frontend && npm run build

echo "🚀 重启服务..."
pm2 restart ai-spy-game

sleep 2
pm2 logs ai-spy-game --lines 5 --nostream

echo "✅ 更新完成！"
