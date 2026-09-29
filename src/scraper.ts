/**
 * Скрапер стандартов разработки 1С:Предприятие 8 с its.1c.ru
 * 
 * Авторизация: ITS_LOGIN + ITS_PASSWORD (подписка ИТС)
 * 
 * Использование:
 *   npx tsx src/scraper.ts
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");

// Разделы стандартов на its.1c.ru
const SECTIONS = [
  { id: "1", name: "Общие стандарты и методики разработки", path: "/db/v8std/browse/13/-1/1" },
  { id: "26", name: "Соглашения при написании кода", path: "/db/v8std/browse/13/-1/26" },
  { id: "31", name: "Стандарты для управляемых форм", path: "/db/v8std/browse/13/-1/31" },
  { id: "35", name: "Объектно-модельные стандарты", path: "/db/v8std/browse/13/-1/35" },
  { id: "36", name: "Права доступа и роли", path: "/db/v8std/browse/13/-1/36" },
  { id: "37", name: "Командный интерфейс и формы", path: "/db/v8std/browse/13/-1/37" },
  { id: "38", name: "Стандарты построения запросов", path: "/db/v8std/browse/13/-1/38" },
  { id: "39", name: "Обмен данными и интеграция", path: "/db/v8std/browse/13/-1/39" },
  { id: "40", name: "Стандарты по производительности", path: "/db/v8std/browse/13/-1/40" },
  { id: "7", name: "Дополнительные рекомендации для 8.3", path: "/db/v8std/browse/13/-1/7" },
  { id: "11", name: "Разработка пользовательских интерфейсов", path: "/db/v8std/browse/13/-1/11" },
];

const BASE_URL = "https://its.1c.ru";

// Cookie jar — дедупликация по имени, без разрастания
const cookieJar = new Map<string, string>();

function getCookieHeader(): string {
  return Array.from(cookieJar.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

function updateCookies(setCookieHeaders: string[]): void {
  for (const header of setCookieHeaders) {
    const pair = header.split(";")[0]; // берём только name=value, без path/expires
    const eqIndex = pair.indexOf("=");
    if (eqIndex > 0) {
      const name = pair.substring(0, eqIndex).trim();
      const value = pair.substring(eqIndex + 1).trim();
      cookieJar.set(name, value);
    }
  }
}

interface Standard {
  id: string;
  category: string;
  categoryName: string;
  title: string;
  url: string;
  tags: string[];
  content: string;
}

/** Декодирует HTML-сущности, включая &#NNN; / &#xHH; */
function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
    .replace(/&amp;/gi, "&");
}

/**
 * Извлекает текстовый контент из HTML, удаляя теги
 */
function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<\/li>/gi, "\n")
      .replace(/<\/h[1-6]>/gi, "\n\n")
      .replace(/<[^>]+>/g, "")
  )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Извлекает ссылки на статьи стандартов из страницы раздела
 */
function extractArticleLinks(html: string): { title: string; path: string }[] {
  const links: { title: string; path: string }[] = [];
  // Ищем ссылки вида /db/v8std/content/NNN/hdoc
  const regex = /<a[^>]+href="(\/db\/v8std\/content\/\d+\/hdoc)"[^>]*>([^<]+)<\/a>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    links.push({
      path: match[1],
      title: htmlToText(match[2]),
    });
  }
  return links;
}

function extractBrowseLinks(html: string): string[] {
  const links = new Set<string>();
  const regex = /<a[^>]+href="(\/db\/v8std\/browse\/[^"#?]+(?:\?[^"#]*)?)"[^>]*>/gi;
  let match;

  while ((match = regex.exec(html)) !== null) {
    links.add(match[1].split("#")[0]);
  }

  return Array.from(links);
}

function isPathInsideSection(browsePath: string, sectionId: string): boolean {
  const cleanPath = browsePath.split("?")[0];
  const match = cleanPath.match(/^\/db\/v8std\/browse\/13\/(.+)$/);
  if (!match) return false;
  const segments = match[1].split("/").filter(Boolean);
  return segments.includes(sectionId);
}

async function collectSectionArticleLinks(
  sectionPath: string,
  sectionId: string
): Promise<{ title: string; path: string }[]> {
  const queue: string[] = [sectionPath];
  const queued = new Set<string>([sectionPath]);
  const visited = new Set<string>();
  const articleMap = new Map<string, { title: string; path: string }>();

  while (queue.length > 0) {
    const browsePath = queue.shift()!;
    queued.delete(browsePath);

    if (visited.has(browsePath)) continue;
    visited.add(browsePath);

    try {
      const html = await fetchPage(`${BASE_URL}${browsePath}`);

      for (const article of extractArticleLinks(html)) {
        if (!articleMap.has(article.path)) {
          articleMap.set(article.path, article);
        }
      }

      for (const subPath of extractBrowseLinks(html)) {
        if (!isPathInsideSection(subPath, sectionId)) {
          continue;
        }
        if (!visited.has(subPath) && !queued.has(subPath)) {
          queue.push(subPath);
          queued.add(subPath);
        }
      }

      await new Promise((r) => setTimeout(r, 250));
    } catch (err) {
      console.error(`   [browse-error] ${browsePath}: ${(err as Error).message}`);
    }
  }

  return Array.from(articleMap.values());
}

/** Путь iframe с телом документа ITS: /db/content/v8std/src/.../i8100NNN.htm */
function extractIframeSrc(html: string): string | null {
  const match =
    html.match(/id="w_metadata_doc_frame"[^>]*\ssrc="([^"]+)"/i) ||
    html.match(/\ssrc="(\/db\/content\/[^"]+\.htm)"/i);
  return match?.[1] || null;
}

/**
 * Извлекает содержимое статьи стандарта.
 * На its.1c.ru текст лежит в iframe (srcdoc и/или src=/db/content/...).
 */
function extractArticleContent(html: string): string {
  // 1) srcdoc у iframe документа — основной источник без доп. запроса
  const srcdocMatch = html.match(/\ssrcdoc="([^"]*)"/i);
  if (srcdocMatch?.[1]) {
    const decoded = decodeEntities(srcdocMatch[1]);
    const text = htmlToText(decoded);
    if (text.length > 80) return text;
  }

  // 2) Классические контейнеры (на случай смены вёрстки)
  const contentMatch =
    html.match(
      /<div[^>]+class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<div[^>]+class="[^"]*footer/i
    ) ||
    html.match(/<div[^>]+class="[^"]*article[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
    html.match(/<div[^>]+id="l_doc"[^>]*>([\s\S]*?)<div[^>]+id="l_toc"/i);

  if (contentMatch) {
    const text = htmlToText(contentMatch[1]);
    if (text.length > 80) return text;
  }

  // 3) Fallback: body целиком
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return bodyMatch ? htmlToText(bodyMatch[1]) : "";
}

/** Загружает текст статьи: shell → srcdoc → отдельный запрос iframe src */
async function loadArticleContent(articlePath: string): Promise<string> {
  const shellHtml = await fetchPage(`${BASE_URL}${articlePath}`);
  let content = extractArticleContent(shellHtml);
  if (content.length > 80) return content;

  const iframeSrc = extractIframeSrc(shellHtml);
  if (iframeSrc) {
    const iframeUrl = iframeSrc.startsWith("http")
      ? iframeSrc
      : `${BASE_URL}${iframeSrc}`;
    const iframeHtml = await fetchPage(iframeUrl);
    content = htmlToText(iframeHtml);
  }

  return content;
}

/**
 * Генерирует теги из заголовка и содержимого
 */
function generateTags(title: string, content: string): string[] {
  const tagKeywords: Record<string, string[]> = {
    "запрос": ["запросы", "SQL"],
    "блокировк": ["блокировки", "параллельность"],
    "транзакц": ["транзакции", "данные"],
    "форм": ["формы", "интерфейс"],
    "модул": ["модуль", "код"],
    "перемен": ["переменные", "код"],
    "процедур": ["процедуры", "код"],
    "функц": ["функции", "код"],
    "справочник": ["справочник", "метаданные"],
    "документ": ["документ", "метаданные"],
    "регистр": ["регистр", "метаданные"],
    "обмен": ["обмен", "интеграция"],
    "рол": ["роли", "безопасность"],
    "прав": ["права", "безопасность"],
    "произво": ["производительность", "оптимизация"],
    "клиент": ["клиент-сервер"],
    "сервер": ["клиент-сервер"],
    "макет": ["печать", "макеты"],
    "печат": ["печать"],
    "подписк": ["подписки", "события"],
    "команд": ["команды", "интерфейс"],
  };

  const tags = new Set<string>();
  const lowerTitle = title.toLowerCase();
  const lowerContent = content.substring(0, 500).toLowerCase();

  for (const [keyword, keywordTags] of Object.entries(tagKeywords)) {
    if (lowerTitle.includes(keyword) || lowerContent.includes(keyword)) {
      keywordTags.forEach((t) => tags.add(t));
    }
  }

  return Array.from(tags);
}

async function fetchPage(url: string, retries: number = 2): Promise<string> {
  const headers: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.5",
  };

  const cookie = getCookieHeader();
  if (cookie) {
    headers["Cookie"] = cookie;
  }

  const response = await fetch(url, { headers, redirect: "follow" });

  if (!response.ok) {
    if (response.status === 400 && retries > 0) {
      // Возможно сервер сбросил сессию — пауза и повтор
      console.error(`   ⚠️  HTTP 400 на ${url.substring(0, 80)}... повтор через 3с (осталось ${retries})`);
      await new Promise((r) => setTimeout(r, 3000));
      return fetchPage(url, retries - 1);
    }
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  // Обновляем cookie jar (дедупликация по имени)
  const setCookies = response.headers.getSetCookie?.() || [];
  if (setCookies.length > 0) {
    updateCookies(setCookies);
  }

  // its.1c.ru чаще windows-1251; iframe-документы могут быть utf-8
  const buffer = await response.arrayBuffer();
  const contentType = response.headers.get("content-type") || "";
  const charsetMatch = contentType.match(/charset=([^\s;]+)/i);
  const charset = (charsetMatch?.[1] || "windows-1251").replace(/["']/g, "");
  try {
    return new TextDecoder(charset).decode(buffer);
  } catch {
    return new TextDecoder("windows-1251").decode(buffer);
  }
}

function parseFormInputs(html: string): Record<string, string> {
  const inputs: Record<string, string> = {};
  for (const m of html.matchAll(/<input[^>]*>/gi)) {
    const tag = m[0];
    const name = (tag.match(/\bname="([^"]+)"/i) || [])[1];
    if (!name) continue;
    const type = ((tag.match(/\btype="([^"]*)"/i) || [])[1] || "text").toLowerCase();
    if (type === "submit" || type === "button" || type === "image") continue;
    inputs[name] = (tag.match(/\bvalue="([^"]*)"/i) || [])[1] || "";
  }
  return inputs;
}

/** docker run --env-file не снимает кавычки; compose — снимает. Страхуемся. */
function stripEnvQuotes(value: string): string {
  const t = value.trim();
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    return t.slice(1, -1);
  }
  return t;
}

async function fetchRaw(
  url: string,
  opts: RequestInit = {}
): Promise<{ status: number; location: string | null; body: string }> {
  const headers: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.5",
    Cookie: getCookieHeader(),
    ...((opts.headers as Record<string, string>) || {}),
  };

  const response = await fetch(url, { ...opts, headers, redirect: "manual" });
  const setCookies = response.headers.getSetCookie?.() || [];
  if (setCookies.length > 0) updateCookies(setCookies);

  const buffer = await response.arrayBuffer();
  const contentType = response.headers.get("content-type") || "";
  const charset = (contentType.match(/charset=([^\s;]+)/i)?.[1] || "utf-8").replace(
    /["']/g,
    ""
  );
  let body: string;
  try {
    body = new TextDecoder(charset).decode(buffer);
  } catch {
    body = new TextDecoder("utf-8").decode(buffer);
  }

  return {
    status: response.status,
    location: response.headers.get("location"),
    body,
  };
}

async function followManual(startUrl: string, maxHops = 12): Promise<string> {
  let url = startUrl;
  let lastBody = "";
  for (let i = 0; i < maxHops; i++) {
    const res = await fetchRaw(url);
    lastBody = res.body;
    if (res.status >= 300 && res.status < 400 && res.location) {
      url = new URL(res.location, url).toString();
      continue;
    }
    return lastBody;
  }
  return lastBody;
}

/**
 * Авторизация на its.1c.ru через login.1c.ru (форма с execution + ticket redirect).
 * Тексты v8std доступны и без логина (iframe/srcdoc) — при ошибке скрапер продолжит.
 */
async function authenticate(login: string, password: string): Promise<boolean> {
  console.log(`🔐 Авторизация на its.1c.ru как ${login}...`);

  try {
    const itsPage = await followManual("https://its.1c.ru/user/auth");
    const serviceRaw =
      (itsPage.match(/\bname="service"[^>]*\bvalue="([^"]+)"/i) ||
        itsPage.match(/login\.1c\.ru\/login\?service=([^"&\s]+)/i) ||
        [])[1] || "";
    const service = decodeEntities(
      serviceRaw.includes("%") ? decodeURIComponent(serviceRaw) : serviceRaw
    );
    const loginPageUrl = service
      ? `https://login.1c.ru/login?service=${encodeURIComponent(service)}`
      : "https://login.1c.ru/login";

    const loginPage = await followManual(loginPageUrl);
    const inputs = parseFormInputs(loginPage);
    if (!inputs.execution) {
      console.error("❌ Не найден execution-токен формы login.1c.ru\n");
      return false;
    }

    const formData = new URLSearchParams({
      ...inputs,
      username: login,
      password,
      _eventId: inputs._eventId || "submit",
      rememberMe: inputs.rememberMe || "on",
    });

    const post = await fetchRaw("https://login.1c.ru/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: "https://login.1c.ru",
        Referer: loginPageUrl,
      },
      body: formData.toString(),
    });

    if (/Неверный логин или пароль|invalid.*password/i.test(post.body)) {
      console.error("❌ Неверный логин или пароль (login.1c.ru).\n");
      return false;
    }

    // Успешный логин: 302 на its.1c.ru/...&ticket=ST-...
    if (post.status >= 300 && post.status < 400 && post.location) {
      await followManual(new URL(post.location, "https://login.1c.ru/login").toString());
    } else if (/ticket=/i.test(post.body)) {
      const ticketUrl = (post.body.match(/https?:\/\/its\.1c\.ru\/[^"'\s]+ticket=[^"'\s]+/i) ||
        [])[0];
      if (ticketUrl) await followManual(ticketUrl);
    }

    const testPage = await followManual("https://its.1c.ru/db/v8std");
    const isAuthed =
      /class="[^"]*\bauthorized\b/i.test(testPage) ||
      cookieJar.has("TGC") ||
      cookieJar.has("BITRIX_SM_LOGIN") ||
      [...cookieJar.keys()].some((k) => /TGC|CASTGC|FRESH_LOGIN/i.test(k));

    if (isAuthed) {
      console.log("✅ Авторизация успешна\n");
      return true;
    }

    console.error("❌ Авторизация не подтверждена на its.1c.ru.\n");
    console.error("   Проверьте ITS_LOGIN и ITS_PASSWORD.\n");
    return false;
  } catch (err) {
    console.error(`❌ Ошибка авторизации: ${(err as Error).message}`);
    console.error("   Проверьте ITS_LOGIN и ITS_PASSWORD.\n");
    return false;
  }
}

async function scrapeAllStandards(): Promise<void> {
  console.log("🚀 Начинаем загрузку стандартов с its.1c.ru...\n");

  const itsLogin = stripEnvQuotes(process.env.ITS_LOGIN || "");
  const itsPassword = stripEnvQuotes(process.env.ITS_PASSWORD || "");

  if (itsLogin && itsPassword) {
    const success = await authenticate(itsLogin, itsPassword);
    if (!success) {
      console.warn(
        "⚠️  Авторизация ИТС не удалась — продолжаем без логина.\n" +
          "   Тексты v8std обычно доступны через iframe; закрытые разделы могут быть пустыми.\n"
      );
    }
  } else {
    console.warn(
      "⚠️  Нет данных для авторизации. its.1c.ru может потребовать вход.\n" +
        "   Задайте ITS_LOGIN и ITS_PASSWORD в .env\n"
    );
  }

  const allStandards: Standard[] = [];
  const categories: { id: string; name: string; order: number }[] = [];

  for (let i = 0; i < SECTIONS.length; i++) {
    const section = SECTIONS[i];
    console.log(`📂 [${i + 1}/${SECTIONS.length}] Раздел: ${section.name}`);
    categories.push({ id: section.id, name: section.name, order: i + 1 });

    try {
      const articles = await collectSectionArticleLinks(section.path, section.id);
      console.log(`   Найдено статей: ${articles.length}`);

      for (let j = 0; j < articles.length; j++) {
        const article = articles[j];
        console.log(`   📄 [${j + 1}/${articles.length}] ${article.title}`);

        try {
          const content = await loadArticleContent(article.path);
          if (content.length < 40) {
            console.error(`   ⚠️  Пустой текст: ${article.title}`);
          }

          const idMatch = article.path.match(/content\/(\d+)\//);
          const id = idMatch ? `std-${idMatch[1]}` : `std-${section.id}-${j}`;

          allStandards.push({
            id,
            category: section.id,
            categoryName: section.name,
            title: article.title,
            url: `${BASE_URL}${article.path}`,
            tags: generateTags(article.title, content),
            content,
          });

          // Пауза между запросами — не нагружаем сервер
          await new Promise((r) => setTimeout(r, 500));
        } catch (err) {
          console.error(`   ❌ Ошибка загрузки: ${(err as Error).message}`);
        }
      }
    } catch (err) {
      console.error(`   ❌ Ошибка раздела: ${(err as Error).message}`);
    }
  }

  // Удаляем возможные дубли и сохраняем результат
  const uniqueStandards = Array.from(
    new Map(allStandards.map((s) => [s.id, s])).values()
  );
  const outputPath = path.join(DATA_DIR, "standards.json");
  const data = { categories, standards: uniqueStandards };

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2), "utf-8");

  console.log(`\n✅ Загружено ${uniqueStandards.length} стандартов (raw: ${allStandards.length})`);
  console.log(`🍪 Cookies в сессии: ${cookieJar.size} (${getCookieHeader().length} байт)`);
  console.log(`📁 Сохранено в ${outputPath}`);
}

scrapeAllStandards().catch(console.error);
