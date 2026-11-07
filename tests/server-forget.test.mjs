import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import "../scoring-core.js";
import { createSqliteStore } from "../storage/sqlite-store.mjs";

const SCORING = globalThis.AIJobAssistantScoring;
const dir = mkdtempSync(join(tmpdir(), "zhiyin-server-"));
const file = join(dir, "cache.db");

process.env.CACHE_DB = file;
process.env.DEEPSEEK_MODEL = "test-model";
process.env.DEEPSEEK_API_KEY = "";

const { createApplicationServer } = await import("../server.mjs");
const server = createApplicationServer();
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;

function hashText(value) {
  return createHash("sha256").update(String(value || "")).digest("hex");
}

const resume = "软件工程本科，熟悉Python数据分析。";
const job = "数据分析实习生，要求熟悉Python。";

async function seedAnalysis() {
  const status = await (await fetch(`${base}/api/status`)).json();
  const model = status.modelAlias;
  const key = hashText(
    SCORING.buildAnalysisCacheKeyInput({ model, resume, job }),
  );
  const store = createSqliteStore({ file });
  store.setAnalysis(key, { analysis: { score: 66 } }, { model });
  store.close();
  return key;
}

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test("按简历与岗位原文删除分析记录，重复删除返回未命中", async () => {
  const key = await seedAnalysis();

  const first = await fetch(`${base}/api/forget`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resume, job }),
  });
  assert.equal(first.status, 200);
  assert.equal((await first.json()).deleted, true);

  const store = createSqliteStore({ file });
  assert.equal(store.getAnalysis(key), null);
  store.close();

  const second = await fetch(`${base}/api/forget`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resume, job }),
  });
  assert.equal((await second.json()).deleted, false);
});

test("删除接口缺少原文时返回400，不误删其他记录", async () => {
  const key = await seedAnalysis();
  const response = await fetch(`${base}/api/forget`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resume: "", job }),
  });
  assert.equal(response.status, 400);

  const store = createSqliteStore({ file });
  assert.ok(store.getAnalysis(key));
  store.close();
});

test("状态接口公开缓存保留天数，便于说明数据生命周期", async () => {
  const response = await fetch(`${base}/api/status`);
  const status = await response.json();
  assert.equal(response.status, 200);
  assert.equal(status.cacheTtlDays, 30);
  assert.equal(status.storage, "sqlite");
});
