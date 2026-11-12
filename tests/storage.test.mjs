import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSqliteStore } from "../storage/sqlite-store.mjs";

function withStore(run) {
  const dir = mkdtempSync(join(tmpdir(), "zhiyin-store-"));
  try {
    return run(join(dir, "cache.db"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("分析结果写入后能从新的存储实例读回", () => {
  withStore((file) => {
    const first = createSqliteStore({ file });
    first.setAnalysis(
      "analysis-key-1",
      {
        analysis: { score: 88, fitLevel: "较为匹配" },
        usage: { total_tokens: 1200 },
        rubricCached: false,
      },
      {
        model: "deepseek-flash",
        protocolVersion: "scorecard-v1.1",
        promptFingerprint: "abc123",
        resumeHash: "r1",
        jobHash: "j1",
      },
    );
    first.close();

    const second = createSqliteStore({ file });
    const restored = second.getAnalysis("analysis-key-1");
    second.close();

    assert.equal(restored.analysis.score, 88);
    assert.equal(restored.analysis.fitLevel, "较为匹配");
    assert.equal(restored.usage.total_tokens, 1200);
    assert.equal(restored.rubricCached, false);
  });
});

test("评分表按岗位 key 持久化，键不存在时返回 null", () => {
  withStore((file) => {
    const store = createSqliteStore({ file });
    assert.equal(store.getRubric("missing"), null);

    store.setRubric(
      "rubric-key-1",
      { title: "AI产品实习生", requirements: [{ id: "R01" }] },
      {
        model: "deepseek-flash",
        protocolVersion: "scorecard-v1.1",
        promptFingerprint: "abc123",
        jobHash: "j1",
      },
    );

    assert.equal(store.getRubric("rubric-key-1").title, "AI产品实习生");
    store.close();
  });
});

test("命中缓存会累计次数，原始调用可以写入审计日志", () => {
  withStore((file) => {
    const store = createSqliteStore({ file });
    store.setAnalysis("k1", { analysis: { score: 60 } }, { model: "m" });
    store.recordHit("analysis", "k1");
    store.recordHit("analysis", "k1");

    store.logRun({
      cacheKey: "k1",
      stage: "resume_evidence",
      model: "deepseek-flash",
      requestHash: "req1",
      rawResponse: '{"evidence_table":[]}',
      usage: { total_tokens: 900 },
    });

    const row = store.getAnalysis("k1");
    assert.equal(row.hitCount, 2);
    assert.equal(store.countRuns(), 1);
    store.close();
  });
});

test("同一岗位 key 重复写入会覆盖旧结果，而不是报错", () => {
  withStore((file) => {
    const store = createSqliteStore({ file });
    store.setAnalysis("same-key", { analysis: { score: 50 } }, { model: "m" });
    store.setAnalysis("same-key", { analysis: { score: 70 } }, { model: "m" });
    assert.equal(store.getAnalysis("same-key").analysis.score, 70);
    store.close();
  });
});

test("按 key 删除分析记录，不影响其他记录", () => {
  withStore((file) => {
    const store = createSqliteStore({ file });
    store.setAnalysis("keep", { analysis: { score: 60 } }, { model: "m" });
    store.setAnalysis("drop", { analysis: { score: 70 } }, { model: "m" });
    store.logRun({ cacheKey: "drop", stage: "resume_evidence" });

    assert.equal(store.deleteAnalysis("drop"), true);
    assert.equal(store.getAnalysis("drop"), null);
    assert.equal(store.getAnalysis("keep").analysis.score, 60);
    assert.equal(store.countRuns(), 0);
    assert.equal(store.deleteAnalysis("missing"), false);
    store.close();
  });
});

test("超过保留天数的缓存会被清理，较新的记录保留", () => {
  withStore((file) => {
    const store = createSqliteStore({ file });
    store.setAnalysis("old", { analysis: { score: 60 } }, { model: "m" });

    assert.equal(store.purgeOlderThan(1), 0);
    assert.ok(store.getAnalysis("old"));

    assert.equal(store.purgeOlderThan(0), 1);
    assert.equal(store.getAnalysis("old"), null);
    store.close();
  });
});

test("持久化删除凭证跨重启可用，删除记录会清除对应凭证", () => {
  withStore((file) => {
    const first = createSqliteStore({ file });
    try {
      first.setAnalysis("record", { analysis: { score: 70 } });
      assert.equal(first.issueDeletionToken("missing", "hash-other"), false);
      assert.equal(first.issueDeletionToken("record", "hash"), true);
    } finally {
      first.close();
    }
    const second = createSqliteStore({ file });
    try {
      assert.equal(second.resolveDeletionToken("hash", 60_000), "record");
      assert.equal(second.deleteAnalysis("record"), true);
      assert.equal(second.resolveDeletionToken("hash", 60_000), null);
    } finally {
      second.close();
    }
  });
});
