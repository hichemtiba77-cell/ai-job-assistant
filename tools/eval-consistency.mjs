import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { summarizeRuns, formatSummaryMarkdown, comparableScore } from "./consistency-stats.mjs";

import { qualityMetrics, validateLabels } from "./quality-metrics.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function runLimit(name, fallback) {
  const count = Number(argValue(name, fallback));
  if (!Number.isInteger(count) || count < 1 || count > 50) throw new Error(name + " 需要 1–50 次");
  return count;
}

function endpoint(value) {
  const url = new URL(value);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
      !["http:", "https:"].includes(url.protocol) || url.username || url.password ||
      url.pathname !== "/" || url.search || url.hash) {
    throw new Error("评测仅使用本机服务地址");
  }
  return url.origin;
}

async function loadCases(directory) {
  const files = (await readdir(directory))
    .filter((name) => name.endsWith(".json") && !name.startsWith("_"))
    .sort();
  const cases = [];
  for (const name of files) {
    const parsed = JSON.parse(await readFile(join(directory, name), "utf8"));
    const items = Array.isArray(parsed) ? parsed : [parsed];
    items.forEach((item, index) => {
      if (typeof item?.resume !== "string" || typeof item?.job !== "string") {
        throw new Error(name + " 缺少 resume 或 job 字段");
      }
      cases.push({ id: String(item.id || name + "-" + (index + 1)), resume: item.resume, job: item.job });
    });
  }
  return cases;
}

function rubricDigest(analysis) {
  const rubric = analysis.jobRubric;
  if (!Array.isArray(rubric?.requirements)) return null;
  const canonical = rubric.requirements.map((row) => [
    row.jd_quote, row.category, row.dimension, row.weight,
  ]);
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex").slice(0, 20);
}

async function analyze(target, item, mode, labels) {
  const started = performance.now();
  try {
    const response = await fetch(target.url + "/api/analyze", {
      method: "POST",
      redirect: "error",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resume: item.resume,
        job: item.job,
        fresh: mode !== "cached",
        freshRubric: mode === "cold",
      }),
      signal: AbortSignal.timeout(150_000),
    });
    const data = await response.json();
    const elapsedMs = Math.round(performance.now() - started);
    if (!response.ok || !data.analysis) return { failed: true, status: response.status, elapsedMs };
    return {
      analysis: data.analysis,
      elapsedMs,
      stageMs: data.stageMs,
      tokens: Number.isFinite(data.usage?.total_tokens) && !data.cached ? data.usage.total_tokens : null,
      cached: Boolean(data.cached),
      rubricCached: Boolean(data.rubricCached),
      rubricDigest: rubricDigest(data.analysis),
      quality: labels ? qualityMetrics(data.analysis, item.resume, labels) : undefined,
    };
  } catch {
    return { failed: true, status: "network_or_timeout", elapsedMs: Math.round(performance.now() - started) };
  }
}

function summarizeGroup(runs, mode) {
  const completed = runs.filter((run) => run.analysis);
  const valid = completed.map((run) => run.rubricDigest).filter(Boolean);
  const rubricStable = valid.length > 0 && new Set(valid).size === 1;
  const verifiedFixed = mode !== "fixed" ||
    (rubricStable && completed.length === runs.length && completed.slice(1).every((run) => run.rubricCached));
  const times = runs.map((run) => run.elapsedMs).sort((left, right) => left - right);
  const tokens = runs.map((run) => run.tokens).filter(Number.isFinite);
  const summary = summarizeRuns(runs.map((run) => run.analysis || { failed: true }));
  return {
    summary,
    verifiedFixed,
    rubricStable,
    rubricVariants: new Set(valid).size,
    p95Ms: times[Math.ceil(times.length * 0.95) - 1] ?? null,
    meanTokens: tokens.length ? Math.round(tokens.reduce((sum, count) => sum + count, 0) / tokens.length) : null,
    runs: runs.map(({ analysis, ...metrics }) => ({
      ...metrics,
      score: analysis ? comparableScore(analysis) : null,
      legacyCombinedScore: analysis?.score ?? null,
      gate: analysis?.hardGate?.status ?? null,
    })),
  };
}

async function inspect(url, modes) {
  const response = await fetch(url + "/api/status", { signal: AbortSignal.timeout(5000), redirect: "error" });
  if (!response.ok) throw new Error("无法连接本机评测服务 " + url);
  const status = await response.json();
  if (!status.configured) throw new Error("评测服务尚未配置 DeepSeek 密钥 " + url);
  if (!modes.every((mode) => status.evaluationModes?.includes(mode))) {
    throw new Error("服务不支持所选评测模式，请使用当前版本的回退开关启动对照服务");
  }
  return { url, model: status.modelAlias, protocol: status.protocolVersion, prompt: status.promptFingerprint };
}

async function main() {
  const requestedMode = argValue("--mode", process.argv.includes("--no-fresh") ? "cached" : "fixed");
  const modes = requestedMode === "both" ? ["cold", "fixed"] : [requestedMode];
  if (modes.some((mode) => !["cold", "fixed", "cached"].includes(mode))) throw new Error("未知评测模式");
  const count = runLimit("--runs", 5);
  const t03Count = runLimit("--t03-runs", count);
  const workers = runLimit("--workers", 1);
  if (workers > 6) throw new Error("并行案例数最多 6 个");
  const primary = endpoint(argValue("--base-url", "http://127.0.0.1:3000"));
  const comparison = argValue("--compare-url", "");
  const targets = await Promise.all([primary, ...(comparison ? [endpoint(comparison)] : [])]
    .map((url) => inspect(url, modes)));
  if (targets.some((target) => target.model !== targets[0].model)) throw new Error("对照服务需要使用相同的模型别名");
  const directory = resolve(ROOT, argValue("--cases", "tools/eval-cases"));
  const cases = await loadCases(directory);
  if (process.argv.includes("--include-near")) cases.push(...await loadCases(join(ROOT, "tools", "eval-near-cases")));
  if (!cases.length || new Set(cases.map(({ id }) => id)).size !== cases.length) throw new Error("评测案例为空或编号重复");
  const labelFile = argValue("--annotations", "");
  const labels = labelFile ? validateLabels(JSON.parse(await readFile(resolve(ROOT, labelFile), "utf8"))) : null;
  const outDir = resolve(ROOT, argValue("--out", "output/eval"));
  const generatedAt = new Date().toISOString();
  const report = { generatedAt, targets, modes, cases: [] };

  const caseResults = [];
  let nextCase = 0;
  async function runCase(item, caseIndex) {
    const entries = [];
    for (const mode of modes) {
      const groups = targets.map(() => []);
      const limit = item.id === "T03" ? t03Count : count;
      for (let index = 0; index < limit; index += 1) {
        const itemLabels = labels && Object.hasOwn(labels, item.id) ? labels[item.id] : null;
        const paired = workers === 1
          ? []
          : await Promise.all(targets.map((target) => analyze(target, item, mode, itemLabels)));
        for (const [targetIndex, target] of targets.entries()) {
          groups[targetIndex].push(paired[targetIndex] ?? await analyze(target, item, mode, itemLabels));
        }
      }
      groups.forEach((runs, index) => {
        const result = summarizeGroup(runs, mode);
        const target = targets[index];
        entries.push({ id: item.id, mode, protocol: target.protocol, target: index + 1, ...result });
        console.log(item.id, mode, target.protocol, "极差", result.summary.range, "失败", result.summary.failed);
      });
    }
    caseResults[caseIndex] = entries;
  }
  await Promise.all(Array.from({ length: Math.min(workers, cases.length) }, async () => {
    while (nextCase < cases.length) {
      const index = nextCase++;
      await runCase(cases[index], index);
    }
  }));
  report.cases = caseResults.flat();

  report.overview = targets.flatMap((target, index) => modes.map((mode) => {
    const entries = report.cases.filter((entry) => entry.target === index + 1 && entry.mode === mode);
    const primaryCases = entries.filter((entry) => /^T0[1-7]$/.test(entry.id));
    const ranges = primaryCases.map((entry) => entry.summary.range).filter(Number.isFinite);
    const attempted = entries.reduce((sum, entry) => sum + entry.summary.runs, 0);
    return {
      protocol: target.protocol, mode, attempted,
      scored: entries.reduce((sum, entry) => sum + entry.summary.scored, 0),
      failed: entries.reduce((sum, entry) => sum + entry.summary.failed, 0),
      t03Range: entries.find((entry) => entry.id === "T03")?.summary.range ?? null,
      primaryCasesWithScore: ranges.length,
      primaryMeanRange: ranges.length ? Math.round(ranges.reduce((sum, range) => sum + range, 0) / ranges.length * 10) / 10 : null,
    };
  }));

  await mkdir(outDir, { recursive: true });
  const stamp = generatedAt.replace(/[:.]/g, "-");
  const jsonPath = join(outDir, "consistency-" + stamp + ".json");
  const mdPath = join(outDir, "consistency-" + stamp + ".md");
  await writeFile(jsonPath, JSON.stringify(report, null, 2), "utf8");
  await writeFile(mdPath, [
    "# 重复运行一致性报告", "",
    ...targets.map((target, index) => "- 服务 " + (index + 1) + " · " + target.protocol + " · " + target.model + " · " + target.prompt),
    "",
    ...report.overview.map((item) =>
      "- " + item.protocol + " · " + item.mode + " · 有分 " + item.scored + "/" + item.attempted +
      " · T03 极差 " + (item.t03Range ?? "—") + " · T01–T07 平均极差 " + (item.primaryMeanRange ?? "—")
    ),
    "",
    ...report.cases.flatMap((entry) => [
      formatSummaryMarkdown(entry.summary, entry.id + " · " + entry.mode + " · " + entry.protocol),
      "- 评分表版本数 " + entry.rubricVariants + "，固定评分表核验 " + (entry.mode !== "fixed" ? "不适用" : entry.verifiedFixed ? "通过" : "未通过"),
      "- P95 耗时 " + (entry.p95Ms ?? "—") + " ms，平均 token " + (entry.meanTokens ?? "—"), "",
    ]),
  ].join("\n"), "utf8");
  console.log("报告已生成 " + jsonPath);
  if (report.cases.some((entry) => !entry.verifiedFixed || entry.summary.failed)) process.exitCode = 1;
}

main().catch((error) => {
  console.error("评测失败：" + error.message);
  process.exitCode = 1;
});
