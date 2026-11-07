import test from "node:test";
import assert from "node:assert/strict";
import { summarizeRuns } from "../tools/consistency-stats.mjs";

function analysis(score, levels) {
  return {
    score,
    dimensions: levels.dimensions,
    evidenceItems: levels.evidence,
  };
}

function evidence(id, relevance, evidenceLevel, ownership) {
  return {
    requirementId: id,
    relevanceLevel: relevance,
    evidenceLevel,
    ownershipLevel: ownership,
  };
}

test("重复运行统计能给出总分极差和一致率", () => {
  const runs = [
    analysis(60, { dimensions: [], evidence: [evidence("R01", 4, 3, 2)] }),
    analysis(61, { dimensions: [], evidence: [evidence("R01", 4, 3, 2)] }),
    analysis(60, { dimensions: [], evidence: [evidence("R01", 3, 3, 2)] }),
  ];
  const summary = summarizeRuns(runs);

  assert.equal(summary.runs, 3);
  assert.equal(summary.min, 60);
  assert.equal(summary.max, 61);
  assert.equal(summary.range, 1);
  assert.equal(summary.modalScore, 60);
  assert.equal(summary.exactScoreMatchRate, 66.7);
  assert.equal(summary.requirementConsistency[0].id, "R01");
  assert.equal(summary.requirementConsistency[0].rate, 66.7);
});

test("维度分完全一致时一致率为 100", () => {
  const dimensions = [
    { key: "core_skills", score: 70 },
    { key: "experience", score: 55 },
  ];
  const summary = summarizeRuns([
    analysis(60, { dimensions, evidence: [] }),
    analysis(60, { dimensions, evidence: [] }),
  ]);
  assert.equal(summary.dimensionConsistency.core_skills.rate, 100);
  assert.equal(summary.dimensionConsistency.experience.rate, 100);
  assert.equal(summary.exactScoreMatchRate, 100);
});

test("没有运行时返回空统计而不是抛错", () => {
  const summary = summarizeRuns([]);
  assert.equal(summary.runs, 0);
  assert.equal(summary.range, 0);
  assert.deepEqual(summary.requirementConsistency, []);
});
