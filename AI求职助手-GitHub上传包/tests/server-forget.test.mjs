import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
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
process.env.CACHE_PERSIST = "0";
process.env.SCORING_STRATEGY = "v1.3";
process.env.CACHE_TTL_DAYS = "30";
process.env.DEEPSEEK_MODEL = "test-model";
process.env.DEEPSEEK_API_KEY = "test-only";
process.env.DEEPSEEK_BASE_URL = "https://model.invalid";
const realFetch = globalThis.fetch;
let mockModel;
globalThis.fetch = (url, options) => {
  if (url === "https://model.invalid/chat/completions") return mockModel(options);
  assert.ok(url.startsWith("http://127.0.0.1:"), "测试禁止真实上游请求");
  return realFetch(url, options);
};

const { createApplicationServer } = await import("../server.mjs");
const server = createApplicationServer();
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;

function hashText(value) {
  return createHash("sha256").update(String(value || "")).digest("hex");
}

const resume = "软件工程本科，熟悉Python数据分析。";
const job = "数据分析实习生，要求熟悉Python。";

async function seedAnalysis(keyOptions = {}) {
  const status = await (await fetch(`${base}/api/status`)).json();
  const model = status.modelAlias;
  const input = keyOptions.protocolVersion
    ? { resume, job }
    : { resume: SCORING.redactPersonalText(resume, { resume: true }), job: SCORING.redactPersonalText(job) };
  const key = hashText(
    SCORING.buildAnalysisCacheKeyInput({ model, ...input, ...keyOptions }),
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
  const legacyKey = await seedAnalysis({
    protocolVersion: "scorecard-v1.1",
    promptFingerprint: "6558b0c9",
  });
  const previousKey = await seedAnalysis({
    protocolVersion: "scorecard-v1.2",
    promptFingerprint: "4e8cb76b",
  });
  assert.notEqual(key, legacyKey);
  assert.notEqual(key, previousKey);

  const first = await fetch(`${base}/api/forget`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resume, job }),
  });
  assert.equal(first.status, 200);
  assert.equal((await first.json()).deleted, true);

  const store = createSqliteStore({ file });
  try {
    assert.equal(store.getAnalysis(key), null);
    assert.equal(store.getAnalysis(legacyKey), null);
    assert.equal(store.getAnalysis(previousKey), null);
  } finally {
    store.close();
  }

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
  assert.equal(status.storage, "memory");
  assert.equal(status.activeCacheTtlMinutes, 30);
});

function post(path, body, headers = {}) {
  return fetch(base + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

const diagnosticJob = "岗位职责\n用Python完成数据分析";
const diagnosticResume = "姓名：张三\n邮箱：private@example.com\n使用Python清洗记录并输出报告";
const rubricPayload = {
  job_requirements: [
    { category: "core", dimension: "core_skills", jd_quote: "用Python完成数据分析" },
  ],
};
const evidencePayload = {
  evidence_table: [{
    requirement_id: "R01",
    evidence_status: "direct",
    resume_quote: "使用Python清洗记录并输出报告",
    relevance_level: 4,
    evidence_level: 3,
    ownership_level: 3,
  }],
};

function modelResponse(content, finish = "stop") {
  return Response.json({
    choices: [{ finish_reason: finish, message: { content: JSON.stringify(content) } }],
  });
}

test("并发分析复用同一模型请求，截断重试且提交内容先脱敏", async () => {
  let rubricCalls = 0;
  let evidenceCalls = 0;
  const prompts = [];
  mockModel = async ({ body }) => {
    const [system, user] = JSON.parse(body).messages;
    prompts.push(user.content);
    await delay(20);
    if (system.content.startsWith("你是校园招聘岗位分析员")) {
      return modelResponse(rubricPayload, ++rubricCalls === 1 ? "length" : "stop");
    }
    evidenceCalls += 1;
    return modelResponse(evidencePayload);
  };
  const input = { resume: diagnosticResume, job: diagnosticJob };
  const responses = await Promise.all([post("/api/analyze", input), post("/api/analyze", input)]);
  const [first, second] = await Promise.all(responses.map((response) => response.json()));
  assert.deepEqual(responses.map((response) => response.status), [200, 200]);
  assert.deepEqual(first.analysis, second.analysis);
  assert.equal(rubricCalls, 2);
  assert.equal(evidenceCalls, 1);
  assert.match(prompts[2], /使用Python清洗记录/);
  assert.doesNotMatch(prompts.join("\n"), /张三|private@example\.com/);
  const cached = await (await post("/api/analyze", input)).json();
  assert.equal(cached.cached, true);
  const stream = await post("/api/analyze", { ...input, stream: true });
  assert.match(stream.headers.get("content-type"), /text\/event-stream/);
  assert.match(await stream.text(), /event: stage\ndata: \{"stage":"cache"\}[\s\S]+event: done/);
  const disk = createSqliteStore({ file });
  assert.equal(disk.getAnalysis(hashText(SCORING.buildAnalysisCacheKeyInput({
    model: "test-model",
    resume: SCORING.redactPersonalText(input.resume, { resume: true }),
    job: SCORING.redactPersonalText(input.job),
  }))), null);
  assert.equal(disk.countRuns(), 0);
  disk.close();
});

test("删除正在生成的记录时取消简历请求，迟到的结果不会重新写入缓存", async () => {
  const input = { resume: diagnosticResume, job: diagnosticJob };
  let started;
  const modelStarted = new Promise((resolve) => { started = resolve; });
  mockModel = async ({ signal }) => {
    started();
    await delay(5000, undefined, { signal });
    return modelResponse(evidencePayload);
  };
  const pending = post("/api/analyze", { ...input, fresh: true });
  await modelStarted;
  const deleted = await post("/api/forget", input);
  assert.equal((await deleted.json()).deleted, true);
  assert.equal((await pending).status, 502);
  mockModel = () => Promise.resolve(modelResponse(evidencePayload));
  const next = await (await post("/api/analyze", input)).json();
  assert.equal(next.cached, false);
  assert.ok(next.analysis.score > 0);
});

test("API拒绝跨站、错误格式和超长数据，静态资源只发布白名单文件", async () => {
  assert.equal((await post("/api/analyze", {}, { Origin: "https://other.invalid" })).status, 403);
  assert.equal((await post("/api/analyze", {}, { "Content-Type": "text/plain" })).status, 415);
  assert.equal((await post("/api/analyze", null)).status, 400);
  assert.equal((await post("/api/analyze", { resume: "人".repeat(100_000), job: diagnosticJob })).status, 413);
  for (const path of ["/.env.local", "/data/cache.db", "/server.mjs", "/tools/eval-cases/T01.json"]) {
    assert.equal((await fetch(base + path)).status, 404);
  }
  for (const path of ["/", "/app.js", "/ocr.js", "/vendor/pdfjs/pdf.worker.min.js"]) {
    assert.equal((await fetch(base + path, { method: "HEAD" })).status, 200);
  }
  assert.equal((await fetch(base + "/%ff")).status, 400);
});
