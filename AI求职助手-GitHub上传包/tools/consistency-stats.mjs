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

export function summarizeRuns(runs) {
  const safeRuns = Array.isArray(runs) ? runs : [];
  if (!safeRuns.length) {
    return {
      runs: 0,
      scores: [],
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

  const scores = safeRuns
    .map((run) => Number(run?.score))
    .filter((score) => Number.isFinite(score));
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

  const dimensionKeys = new Set();
  safeRuns.forEach((run) => {
    (run?.dimensions || []).forEach((dimension) => {
      dimensionKeys.add(dimension.key);
    });
  });

  const dimensionConsistency = {};
  dimensionKeys.forEach((key) => {
    const values = safeRuns
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

  const requirementOrder = [];
  const requirementValues = new Map();
  safeRuns.forEach((run) => {
    (run?.evidenceItems || []).forEach((item) => {
      const id = String(item?.requirementId || "");
      if (!id) return;
      if (!requirementValues.has(id)) {
        requirementValues.set(id, []);
        requirementOrder.push(id);
      }
      requirementValues.get(id).push(levelSignature(item));
    });
  });

  const requirementConsistency = requirementOrder.map((id) => {
    const { modal, rate } = rateOf(requirementValues.get(id));
    return { id, modal, rate };
  });

  return {
    runs: safeRuns.length,
    scores,
    min,
    max,
    range: max - min,
    mean: round1(mean),
    stdDev: round1(Math.sqrt(variance)),
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
    `- 运行次数：${summary.runs}`,
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
    "| 要求 | 一致率 |",
    "| --- | --- |",
    ...summary.requirementConsistency.map(
      (item) => `| ${item.id} | ${item.rate}% |`,
    ),
  ];
  return lines.join("\n");
}
