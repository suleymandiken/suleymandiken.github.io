@echo off
chcp 65001 >nul
echo Izgara.exe derleniyor...
py -m pip install --quiet --upgrade pillow pyinstaller
py -m PyInstaller --onefile --windowed --name Izgara gridpost.py
echo.
echo Hazir: dist\Izgara.exe
pause
