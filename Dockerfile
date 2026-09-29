# ═══════════════════════════════════════════════════════════════
#  MCP-сервер стандартов 1С:Предприятие 8
#  Multi-stage build: сборка → минимальный runtime
# ═══════════════════════════════════════════════════════════════

# ── Stage 1: Build ────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /build

COPY package.json package-lock.json* ./
RUN npm install --ignore-scripts

COPY tsconfig.json ./
COPY src/ ./src/

RUN npx tsc

# ── Stage 2: Runtime ──────────────────────────────────────────
FROM node:22-alpine AS runtime

LABEL maintainer="mcp-1c-standards"
LABEL description="MCP-сервер стандартов разработки 1С:Предприятие 8"

WORKDIR /app

# Только production-зависимости
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --ignore-scripts && npm cache clean --force

# Скомпилированный код
COPY --from=builder /build/build/ ./build/

# Демо-база (синтетика); полная база — scrape в volume
COPY data/standards.seed.json ./data-builtin/standards.json

# Entrypoint
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# Рабочая директория для данных (volume mount point)
RUN mkdir -p /app/data /app/custom-standards

# ── Переменные окружения ──────────────────────────────────────
# Авторизация its.1c.ru (для загрузки полной базы)
ENV ITS_LOGIN=""
ENV ITS_PASSWORD=""

# Загрузка стандартов при старте
ENV SCRAPE_ON_START="false"
ENV FORCE_RESCRAPE="false"

# Пользовательские стандарты
ENV CUSTOM_STANDARDS_PATH=""

# Путь к данным
ENV DATA_DIR="/app/data"

# Транспорт: "stdio" или "http"
ENV MCP_TRANSPORT="stdio"
ENV MCP_PORT="3000"

# ── Порт для HTTP-транспорта ──────────────────────────────────
EXPOSE 3000

# ── Health check (только для HTTP-режима) ─────────────────────
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD if [ "$MCP_TRANSPORT" = "http" ]; then \
        wget -qO- http://localhost:${MCP_PORT}/health || exit 1; \
      else \
        exit 0; \
      fi

ENTRYPOINT ["./docker-entrypoint.sh"]
