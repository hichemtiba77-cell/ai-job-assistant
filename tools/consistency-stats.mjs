import { createHash } from "node:crypto";

function round1(value) {
  return Math.round(value * 10) / 10;
}

function modeOf(values) {
  const counts = new Map();
  values.forEach((value) => {
    counts.set(value, (counts.get(value) || 0) + 1);
  });
  let bestValue = null;
  let bestCount = 0;
  counts.forEach((count, value) => {
    if (count > bestCount) {
      bestValue = value;
      bestCount = count;
    }
  });
  return { value: bestValue, count: bestCount };
}

function rateOf(values) {
  if (!values.length) return { modal: null, rate: 0 };
  const { value, count } = modeOf(values);
  return { modal: value, rate: round1((count / values.length) * 100) };
}

function levelSignature(item) {
  return [
    item.relevanceLevel,
    item.evidenceLevel,
    item.depthLevel ?? item.ownershipLevel,
    item.status,
  ].join("|");
}

export function comparableScore(run) {
  if (Object.hasOwn(run, "matchScore")) return run.matchScore;
  if (Object.hasOwn(run, "rawScore")) return run.rawScore;
  return run.score;
}

export function summarizeRuns(runs) {
  const safeRuns = Array.isArray(runs) ? runs : [];
  if (!safeRuns.length) {
    return {
      runs: 0,
      scores: [],
      scored: 0,
      unscored: 0,
      failed: 0,
      hardGateUnknown: 0,
      min: 0,
      max: 0,
      range: 0,
      mean: 0,
      stdDev: 0,
      modalScore: null,
      exactScoreMatchRate: 0,
      dimensionConsistency: {},
      requirementConsistency: [],
    };
  }

  const completed = safeRuns.filter((run) => run && !run.failed);
  const scores = completed
    .map(comparableScore)
    .filter(Number.isFinite);
  const min = scores.length ? Math.min(...scores) : 0;
  const max = scores.length ? Math.max(...scores) : 0;
  const mean = scores.length
    ? scores.reduce((sum, score) => sum + score, 0) / scores.length
    : 0;
  const variance = scores.length
    ? scores.reduce((sum, score) => sum + (score - mean) ** 2, 0) /
      scores.length
    : 0;
  const scoreMode = rateOf(scores);
  const hardGateUnknown = completed.filter((run) => run.hardGate?.status === "unknown").length;

  const dimensionKeys = new Set();
  completed.forEach((run) => {
    (run?.dimensions || []).forEach((dimension) => {
      dimensionKeys.add(dimension.key);
    });
  });

  const dimensionConsistency = {};
  dimensionKeys.forEach((key) => {
    const values = completed
      .map((run) =>
        (run?.dimensions || []).find((dimension) => dimension.key === key),
      )
      .filter(Boolean)
      .map((dimension) =>
        Number.isFinite(dimension.score) ? dimension.score : null,
      );
    const { modal, rate } = rateOf(values);
    dimensionConsistency[key] = { modal, rate };
  });

  const requirements = new Map();
  for (const run of completed) {
    const seen = new Set();
    for (const item of run.evidenceItems || []) {
      const quote = typeof item.jobEvidence === "string"
        ? item.jobEvidence.normalize("NFKC").replace(/\s+/gu, "").trim()
        : "";
      // The plain R-number is useful for fixture display but is not a stable cross-run key.
      const id = quote
        ? createHash("sha256").update(quote).digest("hex").slice(0, 20)
        : item.requirementId;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      if (!requirements.has(id)) requirements.set(id, []);
      requirements.get(id).push(levelSignature(item));
    }
  }

  const requirementConsistency = [...requirements].map(([id, values]) => {
    const { modal, rate } = rateOf(values);
    return { id, modal, rate, present: values.length, missing: completed.length - values.length };
  });

  return {
    runs: safeRuns.length,
    scores,
    scored: scores.length,
    scoredRate: round1(scores.length * 100 / safeRuns.length),
    completedRate: round1(completed.length * 100 / safeRuns.length),
    unscored: completed.length - scores.length,
    failed: safeRuns.length - completed.length,
    hardGateUnknown,
    min: scores.length ? min : null,
    max: scores.length ? max : null,
    range: scores.length ? max - min : null,
    mean: scores.length ? round1(mean) : null,
    stdDev: scores.length ? round1(Math.sqrt(variance)) : null,
    modalScore: scoreMode.modal,
    exactScoreMatchRate: scoreMode.rate,
    dimensionConsistency,
    requirementConsistency,
  };
}

export function formatSummaryMarkdown(summary, label = "一致性统计") {
  const lines = [
    `## ${label}`,
    "",
    `- 运行次数：${summary.runs}，有分 ${summary.scored}，无分 ${summary.unscored}，失败 ${summary.failed}，门槛待确认 ${summary.hardGateUnknown}`,
    `- 总分范围：${summary.min}–${summary.max}（极差 ${summary.range}）`,
    `- 平均分：${summary.mean}，标准差：${summary.stdDev}`,
    `- 众数分：${summary.modalScore ?? "--"}，完全一致率：${summary.exactScoreMatchRate}%`,
    "",
    "| 维度 | 众数分 | 一致率 |",
    "| --- | --- | --- |",
    ...Object.entries(summary.dimensionConsistency).map(
      ([key, value]) => `| ${key} | ${value.modal ?? "--"} | ${value.rate}% |`,
    ),
    "",
    "| 原文锚点 | 出现 | 缺项 | 出现时一致率 |",
    "| --- | --- | --- | --- |",
    ...summary.requirementConsistency.map(
      (item) => `| ${item.id} | ${item.present} | ${item.missing} | ${item.rate}% |`,
    ),
  ];
  return lines.join("\n");
}
