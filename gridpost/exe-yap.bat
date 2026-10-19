@echo off
chcp 65001 >nul
echo GridPostMini.exe derleniyor...
py -m pip install --quiet --upgrade pillow pyinstaller
py -m PyInstaller --onefile --windowed --name GridPostMini gridpost.py
echo.
echo Hazir: dist\GridPostMini.exe
pause
