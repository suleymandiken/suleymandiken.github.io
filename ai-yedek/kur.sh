#!/usr/bin/env bash
# macOS / Linux kurulumu. Çalıştır:  bash kur.sh
set -e
KLASOR="$(cd "$(dirname "$0")" && pwd)"

if ! command -v npm >/dev/null 2>&1; then
  echo "Önce Node.js kur: https://nodejs.org (LTS sürümü). Sonra bu betiği tekrar çalıştır."
  exit 1
fi

echo "1/3 Ücretsiz yapay zekâ araçları kuruluyor..."
npm install -g @anthropic-ai/claude-code @google/gemini-cli @openai/codex @qwen-code/qwen-code

echo "2/3 'ai' ve 'ai-kontrol' komutları kuruluyor..."
mkdir -p "$HOME/.local/bin"
cp "$KLASOR/ai" "$KLASOR/ai-kontrol" "$HOME/.local/bin/"
chmod +x "$HOME/.local/bin/ai" "$HOME/.local/bin/ai-kontrol"
case ":$PATH:" in
  *":$HOME/.local/bin:"*) ;;
  *)
    for rc in "$HOME/.zshrc" "$HOME/.bashrc"; do
      [ -f "$rc" ] && echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$rc"
    done
    echo "   PATH güncellendi; terminali kapatıp aç."
    ;;
esac

echo "3/3 Claude'a 'yardimci-modeller' becerisi ekleniyor..."
mkdir -p "$HOME/.claude/skills/yardimci-modeller"
cp "$KLASOR/skill/SKILL.md" "$HOME/.claude/skills/yardimci-modeller/SKILL.md"

echo
echo "Kurulum bitti. Şimdi her araca BİR KEZ giriş yap (README'deki 'Giriş' adımı):"
echo "  gemini   →  Google hesabınla giriş"
echo "  codex    →  ChatGPT hesabınla giriş"
echo "  qwen     →  Qwen hesabınla giriş"
echo "Sonra test et:  ai-kontrol"
