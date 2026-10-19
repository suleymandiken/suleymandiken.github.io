@echo off
chcp 65001 >nul
py -m pip install --quiet --upgrade pillow
py gridpost.py
if errorlevel 1 pause
