@echo off
echo ==========================================
echo  간호조무사 모의고사 웹 애플리케이션
echo ==========================================
echo.
echo 서버를 시작합니다...
echo 브라우저에서 http://localhost:8080 으로 접속하세요.
echo 종료하려면 Ctrl+C 를 누르세요.
echo.
cd /d "%~dp0"
python -m http.server 8080
