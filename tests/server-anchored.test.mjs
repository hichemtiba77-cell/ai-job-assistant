import test from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";

process.env.CACHE_PERSIST = "0";
process.env.SCORING_STRATEGY = "v1.4";
process.env.DEEPSEEK_API_KEY = "test-only";
process.env.DEEPSEEK_BASE_URL = "https://model.invalid";

const realFetch = globalThis.fetch;
let rubricCalls = 0;
let evidenceCalls = 0;
let waitForEvidence;
let transientFailure = false;
globalThis.fetch = async (url, options) => {
  if (url !== "https://model.invalid/chat/completions") {
    assert.ok(url.startsWith("http://127.0.0.1:"), "测试禁止真实上游请求");
    return realFetch(url, options);
  }
  const request = JSON.parse(options.body);
  const prompt = request.messages[1].content;
  assert.doesNotMatch(prompt, /private@example\.com|STUDENT001|张三/);
  const data = JSON.parse(prompt);
  let rows;
  if (data.clauses) {
    rubricCalls += 1;
    rows = data.clauses.map(({ id, quote }) => ({
      id, category: /到岗/.test(quote) ? "hard" : "core", dimension: "core_skills",
    }));
  } else {
    evidenceCalls += 1;
    if (waitForEvidence) await waitForEvidence(options.signal);
    if (transientFailure) {
      transientFailure = false;
      return new Response("synthetic", { status: 429 });
    }
    rows = data.requirements.map(({ id, allowedSpanIds }) => ({
      id, status: "direct", spanIds: allowedSpanIds.slice(0, 1),
    }));
  }
  return Response.json({
    choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ rows }) } }],
    usage: { total_tokens: 10 },
  });
};

const { createApplicationServer } = await import("../server.mjs");
const server = createApplicationServer();
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = "http://127.0.0.1:" + server.address().port;
test.after(() => new Promise((resolve) => server.close(resolve)));

const input = {
  resume: "姓名：张三\n学号：STUDENT001\n邮箱：private@example.com\n独立使用Python处理数据并输出20页报告\n每周可到岗3天",
  job: "岗位职责：使用Python处理数据\n任职要求：每周到岗4天以上",
};

function post(path, body) {
  return fetch(base + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function analyze(options = {}) {
  const response = await post("/api/analyze", { ...input, ...options });
  const data = await response.json();
  assert.equal(response.status, 200, JSON.stringify(data));
  return data;
}

test("冷评测绕过两个缓存，固定评测只重跑证据，分数与门槛分别发布", async () => {
  const cold = await analyze({ freshRubric: true });
  assert.equal(cold.cached, false);
  assert.equal(cold.rubricCached, false);
  assert.equal(cold.deletionToken, undefined);
  assert.equal(cold.protocolVersion, "scorecard-v1.4");
  assert.ok(cold.analysis.matchScore > 44);
  assert.equal(cold.analysis.score, 44);
  assert.equal(cold.analysis.hardGate.status, "unmet");
  const warm = await analyze({ fresh: true });
  assert.equal(warm.rubricCached, false);
  assert.match(warm.deletionToken, /^[A-Za-z0-9_-]{43}$/);
  transientFailure = true;
  const fixed = await analyze({ fresh: true });
  assert.equal(fixed.rubricCached, true);
  assert.equal(fixed.cached, false);
  assert.equal(rubricCalls, 2);
  assert.equal(evidenceCalls, 4);
  assert.equal((await analyze()).cached, true);
});

test("只用随机凭证可删除并取消进行中的分析，旧输入路径不能删除新版缓存", async () => {
  const cached = await analyze();
  assert.equal(cached.cached, true);
  assert.equal((await (await post("/api/forget", input)).json()).deleted, false);
  assert.equal((await post("/api/forget", { token: "bad" })).status, 400);
  let started;
  const waiting = new Promise((resolve) => { started = resolve; });
  waitForEvidence = async (signal) => {
    started();
    await delay(5000, undefined, { signal });
  };
  const pending = post("/api/analyze", { ...input, fresh: true });
  await waiting;
  const remove = () => post("/api/forget", { token: cached.deletionToken }).then((response) => response.json());
  assert.deepEqual(await remove(), { deleted: true });
  assert.equal((await pending).status, 502);
  waitForEvidence = undefined;
  assert.deepEqual(await remove(), { deleted: false });
  assert.equal((await analyze()).cached, false);
});
