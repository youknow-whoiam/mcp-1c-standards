#!/usr/bin/env node

const BASE = process.argv[2] || "http://localhost:3000";
const MCP_URL = `${BASE}/mcp`;

const JSON_HEADERS = { "Content-Type": "application/json" };
const MCP_HEADERS = {
  ...JSON_HEADERS,
  Accept: "application/json, text/event-stream",
};

let passed = 0;
let failed = 0;

function assert(name, condition, detail = "") {
  if (condition) {
    console.log(`  ✅ ${name}`);
    passed++;
  } else {
    console.error(`  ❌ ${name}${detail ? ` - ${detail}` : ""}`);
    failed++;
  }
}

function extractText(result) {
  return result?.content?.map((c) => c.text || "").join("\n") || "";
}

function parseMcpResponse(raw) {
  const text = String(raw || "").trim();
  if (!text) throw new Error("Empty MCP response");

  if (text.includes("data:")) {
    const payloads = text
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .filter(Boolean);

    if (payloads.length === 0) {
      throw new Error(`SSE response has no data payload: ${text}`);
    }

    return JSON.parse(payloads[payloads.length - 1]);
  }

  return JSON.parse(text);
}

async function startSession() {
  const res = await fetch(MCP_URL, {
    method: "POST",
    headers: MCP_HEADERS,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "smoke-test", version: "1.0.0" },
      },
    }),
  });

  const raw = await res.text();
  const json = parseMcpResponse(raw);
  if (json.error) {
    throw new Error(`Initialize failed: ${json.error.message}`);
  }

  const sessionId = res.headers.get("mcp-session-id");
  if (!sessionId) {
    throw new Error(`No session ID in initialize response: ${raw}`);
  }

  const initialized = await fetch(MCP_URL, {
    method: "POST",
    headers: {
      ...MCP_HEADERS,
      "mcp-session-id": sessionId,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "notifications/initialized",
      params: {},
    }),
  });
  await initialized.text();

  return sessionId;
}

async function mcpCall(name, args = {}) {
  const sessionId = await startSession();

  const res = await fetch(MCP_URL, {
    method: "POST",
    headers: {
      ...MCP_HEADERS,
      "mcp-session-id": sessionId,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name,
        arguments: args,
      },
    }),
  });

  const raw = await res.text();
  const json = parseMcpResponse(raw);
  if (json.error) throw new Error(`MCP error: ${json.error.message}`);
  return json.result;
}

async function testHealth() {
  console.log("\n🏥 Health check");
  const res = await fetch(`${BASE}/health`, { headers: JSON_HEADERS });
  const json = await res.json();
  assert("status ok", json.status === "ok");
  assert("has standards > 0", Number(json.standards) > 0, `got ${json.standards}`);
  assert("has categories > 0", Number(json.categories) > 0, `got ${json.categories}`);
}

async function testSearchStandards() {
  console.log("\n🔍 search_standards");

  const r1 = await mcpCall("search_standards", { query: "query in loop", limit: 5 });
  const t1 = extractText(r1);
  assert("finds results for 'query in loop'", t1.includes("std-"));
  assert("contains demo std-900001", t1.includes("std-900001"));

  const r2 = await mcpCall("search_standards", { query: "locks transactions", limit: 5 });
  const t2 = extractText(r2);
  assert("finds results for 'locks transactions'", t2.includes("std-"));

  const r3 = await mcpCall("search_standards", { query: "xyzzynonexistent12345", limit: 5 });
  const t3 = extractText(r3).toLowerCase();
  assert("handles empty search result", t3.includes("не найдено") || t3.includes("not found"));
}

async function testGetStandard() {
  console.log("\n📄 get_standard");

  const r1 = await mcpCall("get_standard", { standard_id: "std-900001" });
  const t1 = extractText(r1);
  assert("resolves std-900001", t1.includes("std-900001") && !t1.toLowerCase().includes("not found"));

  const r2 = await mcpCall("get_standard", { standard_id: "900001" });
  const t2 = extractText(r2);
  assert("normalizes numeric id", t2.includes("std-900001") && !t2.toLowerCase().includes("not found"));

  const r3 = await mcpCall("get_standard", { standard_id: "std900001" });
  const t3 = extractText(r3);
  assert("normalizes compact id", t3.includes("std-900001") && !t3.toLowerCase().includes("not found"));
}

async function testListCategories() {
  console.log("\n📂 list_categories");
  const r = await mcpCall("list_categories", {});
  const t = extractText(r);
  assert("returns categories", t.includes("Категор") || t.toLowerCase().includes("categories"));
  assert("includes standards count", t.includes("стандарт") || t.toLowerCase().includes("standard"));
}

async function main() {
  console.log(`\n🚀 MCP smoke tests: ${BASE}\n${"═".repeat(50)}`);

  try {
    await testHealth();
    await testSearchStandards();
    await testGetStandard();
    await testListCategories();
  } catch (err) {
    console.error(`\n💥 Fatal error: ${err.message}`);
    process.exitCode = 2;
    return;
  }

  console.log(`\n${"═".repeat(50)}`);
  console.log(`Result: ✅ ${passed} passed, ❌ ${failed} failed`);
  process.exitCode = failed > 0 ? 1 : 0;
}

main();
