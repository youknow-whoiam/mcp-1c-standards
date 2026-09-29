#!/bin/sh
set -e

DATA_DIR="${DATA_DIR:-/app/data}"
STANDARDS_FILE="${DATA_DIR}/standards.json"

# Создаём директорию данных, если не существует (volume может быть пустым)
mkdir -p "${DATA_DIR}"

echo "╔══════════════════════════════════════════════════════════╗"
echo "║   MCP-сервер стандартов 1С:Предприятие 8                ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# ── 1. Загрузка полной базы с its.1c.ru ──────────────────────────
if [ "${SCRAPE_ON_START}" = "true" ] || [ "${SCRAPE_ON_START}" = "1" ]; then

  # Проверяем наличие учётных данных
  if [ -z "${ITS_LOGIN}" ] || [ -z "${ITS_PASSWORD}" ]; then
    echo "❌ SCRAPE_ON_START=true, но нет данных для авторизации."
    echo "   Задайте ITS_LOGIN и ITS_PASSWORD в .env"
    echo "   Используется встроенная база стандартов."
  else
    # Если есть скачанный кэш и не просят принудительное обновление
    if [ -f "${STANDARDS_FILE}" ] && [ "${FORCE_RESCRAPE}" != "true" ]; then
      STANDARDS_COUNT=$(node -e "const d=require('${STANDARDS_FILE}');console.log(d.standards?.length||0)" 2>/dev/null || echo "0")
      if [ "${STANDARDS_COUNT}" -gt "20" ]; then
        echo "✅ База уже содержит ${STANDARDS_COUNT} стандартов. Загрузка не нужна."
        echo "   (FORCE_RESCRAPE=true для принудительного обновления)"
      else
        echo "📥 Загрузка стандартов с its.1c.ru..."
        node build/scraper.js || echo "⚠️  Ошибка загрузки. Используется текущая база."
      fi
    else
      echo "📥 Загрузка стандартов с its.1c.ru..."
      node build/scraper.js || echo "⚠️  Ошибка загрузки. Используется встроенная база."
    fi
  fi
fi

# ── 2. Проверяем наличие базы данных ─────────────────────────────
if [ ! -f "${STANDARDS_FILE}" ]; then
  echo "📋 Файл стандартов не найден. Копируем встроенную базу."
  cp /app/data-builtin/standards.json "${STANDARDS_FILE}"
fi

TOTAL=$(node -e "const d=require('${STANDARDS_FILE}');console.log(d.standards?.length||0)" 2>/dev/null || echo "?")
echo "📊 Стандартов в базе: ${TOTAL}"

# ── 3. Пользовательские стандарты ────────────────────────────────
if [ -n "${CUSTOM_STANDARDS_PATH}" ]; then
  if [ -e "${CUSTOM_STANDARDS_PATH}" ]; then
    CUSTOM_COUNT=$(find "${CUSTOM_STANDARDS_PATH}" -name "*.json" 2>/dev/null | wc -l)
    echo "📎 Пользовательские стандарты: ${CUSTOM_STANDARDS_PATH} (${CUSTOM_COUNT} файлов)"
  else
    echo "⚠️  Путь не найден: ${CUSTOM_STANDARDS_PATH}"
  fi
fi

# ── 4. Запуск MCP-сервера ────────────────────────────────────────
TRANSPORT="${MCP_TRANSPORT:-stdio}"
echo ""
echo "🚀 Транспорт: ${TRANSPORT}"
if [ "${TRANSPORT}" = "http" ]; then
  echo "   Endpoint: http://0.0.0.0:${MCP_PORT:-3000}/mcp"
fi
echo ""

exec node build/index.js
