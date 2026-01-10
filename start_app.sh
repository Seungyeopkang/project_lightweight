#!/bin/bash

# ONNX Optimizer - 앱 실행 스크립트

echo "🚀 ONNX Optimizer 시작 중..."
echo ""

# 프로젝트 디렉토리로 이동
cd /home/seungyeop/project_lightweight

# 기존 프로세스 확인
if pgrep -f "npm run dev" > /dev/null; then
    echo "⚠️  이미 실행 중인 프로세스가 있습니다."
    read -p "종료하고 다시 시작할까요? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "기존 프로세스 종료 중..."
        pkill -f "npm run dev"
        sleep 2
    else
        echo "취소되었습니다."
        exit 0
    fi
fi

# 앱 시작
echo ""
echo "✅ Electron 앱 시작..."
echo "   Frontend: http://localhost:5173"
echo "   Backend: http://localhost:8000"
echo ""
echo "💡 Electron 창이 자동으로 열립니다!"
echo "   (몇 초 정도 걸릴 수 있습니다)"
echo ""

npm run dev
