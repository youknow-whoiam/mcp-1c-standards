# MCP-сервер стандартов разработки 1С:Предприятие 8

MCP-сервер для доступа к [стандартам и методикам разработки](https://its.1c.ru/db/v8std) конфигураций 1С:Предприятие 8.

Работает с **Cursor**, **Claude Code**, **Codex**, **Claude Desktop**, **VS Code**.

> **Важно.** Тексты официальных стандартов — собственность фирмы «1С».  
> Полная база с [ИТС](https://its.1c.ru/db/v8std) **не входит в репозиторий**. Загружайте её локально через scrape при наличии подписки ИТС. Не коммитьте `data/standards.json` в Git.

Версия: **1.1.0**

В репозитории — **демо-seed** [`data/standards.seed.json`](data/standards.seed.json) (синтетические тексты для проверки MCP). Для работы с полной базой (~200+ документов) выполните загрузку с its.1c.ru (см. ниже).

---

## Происхождение

Проект основан на [1CWorkers/mcp-1c-standards](https://github.com/1CWorkers/mcp-1c-standards) (MIT).  
В этой версии доработан парсер/загрузка с ИТС; полный снимок базы получают локально через scrape. Подробности — в `NOTICE.md` и `CHANGELOG.md`.

---

## Требования

- Git
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) или Docker Engine (аккаунт Docker Hub **не** нужен — образ собирается локально)
- Для **полной** базы с its.1c.ru — подписка ИТС и учётные данные (`ITS_LOGIN` / `ITS_PASSWORD`)

---

## Быстрый старт

```bash
git clone https://github.com/youknow-whoiam/mcp-1c-standards.git
cd mcp-1c-standards
docker build -t mcp-1c-standards:1.0.0 .
```

Запуск HTTP (для Cursor и большинства клиентов):

```bash
docker run -d \
  --name mcp-1c-standards \
  -p 3000:3000 \
  -e MCP_TRANSPORT=http \
  -v mcp-1c-data:/app/data \
  mcp-1c-standards:1.0.0
```

Или через Compose:

```bash
cp .env.example .env
# ITS_* заполнять только если планируете scrape/обновление базы
docker compose up mcp-http -d
```

Проверка:

```bash
curl http://localhost:3000/health
# {"status":"ok","standards":…,"categories":…}
```

---

## Подключение к Cursor

Файл `.cursor/mcp.json` в корне проекта (или `~/.cursor/mcp.json` для всех проектов):

```json
{
  "mcpServers": {
    "1c-standards": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

Перезапустите Cursor (или Reload Window) и в Agent-режиме проверьте, например:

```
Найди стандарт 1С про запросы в цикле
```

---

## Подключение к Claude Code

**HTTP** (сервер уже запущен):

```bash
claude mcp add 1c-standards --transport http http://localhost:3000/mcp
```

**Stdio** (Docker по требованию):

```bash
claude mcp add 1c-standards \
  --transport stdio \
  -- docker run -i --rm -v mcp-1c-data:/app/data mcp-1c-standards:1.0.0
```

---

## Подключение к Codex

```bash
codex mcp add 1c-standards --transport streamable_http http://localhost:3000/mcp
```

Или stdio:

```bash
codex mcp add 1c-standards \
  --transport stdio \
  -- docker run -i --rm -v mcp-1c-data:/app/data mcp-1c-standards:1.0.0
```

---

## Подключение к Claude Desktop

Файл настроек:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "1c-standards": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "-v", "mcp-1c-data:/app/data",
        "mcp-1c-standards:1.0.0"
      ]
    }
  }
}
```

---

## Загрузка полной базы с its.1c.ru

В Docker-образ встроен только demo-seed. Полная база появляется в volume (`/app/data/standards.json`) после scrape.

1. Скопируйте `.env.example` → `.env` и укажите **свои** `ITS_LOGIN` / `ITS_PASSWORD`.
2. Не коммитьте `.env`, `data/standards.json` и не передавайте пароль в открытых чатах.

Локальная разработка без Docker:

```bash
cp .env.example .env   # заполните ITS_*
npm run scrape         # создаст data/standards.json (файл в .gitignore)
npm run dev
```

Принудительное обновление в Docker:

```bash
docker run --rm \
  --entrypoint node \
  --env-file .env \
  -e FORCE_RESCRAPE=true \
  -v mcp-1c-data:/app/data \
  mcp-1c-standards:1.0.0 \
  build/scraper.js
```

Или: `docker compose --profile scrape up scraper`.

После scrape файл `standards.json` остаётся в volume или в `./data` на хосте — **не** добавляйте его в Git. Для команды можно вынести общий снимок во внутреннее хранилище (artifact), не на GitHub.

---

## Пользовательские стандарты

Положите свои JSON в каталог и смонтируйте его (см. `custom-standards/example.json` и сервис `mcp-http-custom` в `docker-compose.yml`). При совпадении `id` пользовательский стандарт перекрывает базовый.

---

## Docker Compose — сценарии

```bash
docker compose up mcp-http -d          # HTTP + база из образа/volume
docker compose up mcp-http-full -d     # HTTP + scrape при старте (нужен .env)
docker compose up mcp-http-custom -d   # HTTP + свои стандарты
docker compose --profile full up -d    # scrape + custom
docker compose --profile scrape up scraper   # одноразовый scrape
```

---

## Инструменты MCP

| Инструмент | Описание |
|---|---|
| `search_standards` | Полнотекстовый поиск |
| `get_standard` | Полный текст по ID (с нормализацией) |
| `list_categories` | Список категорий |
| `check_code` | Проверка кода 1С на типичные нарушения |
| `get_standards_for_topic` | Подборка по теме |

Промпты: `code_review_1c`, `explain_standard`.

Поиск: стемминг русского, синонимы EN→RU, fuzzy, ранжирование.  
`get_standard` принимает `std-534`, `534`, `std534`, фрагмент заголовка и т.п.

---

## Smoke-тесты

По умолчанию проверяют **demo-seed** (`std-900001`, `std-900002`). Сервер должен использовать seed или небольшую базу без ИТС.

```bash
# Сервер должен слушать localhost:3000 (demo-seed из образа или npm run dev)
npm run test:smoke
# или: node tests/smoke.mjs http://localhost:3000
```

После локального scrape с полной базой те же тесты можно запускать только если вы обновите ожидаемые ID в `tests/smoke.mjs` или добавьте отдельный integration-профиль.

---

## Обновление сервера (код)

```bash
git pull
docker build -t mcp-1c-standards:1.0.0 .
docker rm -f mcp-1c-standards
# затем снова docker run / compose up
```

Данные в named volume (`mcp-1c-data` / `mcp-1c-standards-data`) сохраняются между пересозданиями контейнера.

---

## Безопасность

- Запускайте MCP только на **localhost**. HTTP-транспорт **без** аутентификации.
- Не коммитьте `.env`, пароли ИТС, токены.
- Не публикуйте Docker-образ с **полной** базой ИТС в открытый registry.

---

## Troubleshooting

| Проблема | Что проверить |
|---|---|
| `docker build` падает на npm | Сеть, DNS, повтор `docker build` |
| Порт 3000 занят | Другой `-p` / `MCP_PORT` в `.env` и URL в MCP-клиенте |
| Cursor не видит tools | Сервер up, `/health` ok, Reload Window, путь `.cursor/mcp.json` |
| Scrape / логин ИТС | Верность `ITS_*`, подписка, не логировать пароль |
| Мало стандартов в `/health` | Ожидаемо 2 demo без scrape; для полной базы — scrape в volume или `npm run scrape` локально |

---

## Лицензия

- **Код** — MIT (см. `LICENSE`). Attribution upstream — в `NOTICE.md`.
- **Тексты стандартов** — собственность фирмы «1С»; не являются частью MIT-лицензии на код.
