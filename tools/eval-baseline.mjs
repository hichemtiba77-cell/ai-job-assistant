import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadLocalEnvironment } from "../env-loader.mjs";
import { summarizeRuns } from "./consistency-stats.mjs";
import "../scoring-core.js";
import "../anchored-scoring.js";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const localEnvironment = loadLocalEnvironment(join(ROOT, ".env.local"));

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const baseUrl = String(
  argValue("--base-url", "http://127.0.0.1:3000"),
).replace(/\/+$/, "");
const runCount = Math.max(1, Number(argValue("--runs", "3")) || 3);
const casesDir = resolve(ROOT, argValue("--cases", "tools/eval-cases"));
const outDir = resolve(ROOT, argValue("--out", "output/eval"));
const methodsArg = String(argValue("--methods", "both"));
const methods = new Set(
  methodsArg === "both" ? ["baseline", "pipeline"] : methodsArg.split(","),
);
if ([...methods].some((method) => !["baseline", "pipeline"].includes(method))) {
  throw new Error("--methods 只能是 both、baseline 或 pipeline");
}

const BASELINE_SYSTEM_PROMPT = `你是一名校园招聘评委。请阅读候选人的简历和目标岗位，给出0到100的岗位匹配分。
要求：
1. 综合考虑学历、专业、技能、实习和项目经历，以及岗位列出的硬性条件；
2. 只输出一个JSON对象，格式为 {"score": 整数, "reason": "不超过60字的理由"}；
3. score 必须是0到100之间的整数，不要输出其他内容。`;

function textOrEmpty(value) {
  return String(value || "");
}

async function loadCases() {
  const files = (await readdir(casesDir))
    .filter((name) => name.endsWith(".json") && !name.startsWith("_"))
    .sort();
  if (!files.length) {
    throw new Error(`没有找到测试案例：${casesDir}`);
  }

  const cases = [];
  for (const name of files) {
    const parsed = JSON.parse(await readFile(join(casesDir, name), "utf8"));
    const items = Array.isArray(parsed) ? parsed : [parsed];
    items.forEach((item, index) => {
      const id = String(item?.id || `${name.replace(/\.json$/, "")}-${index + 1}`);
      if (typeof item?.resume !== "string" || typeof item?.job !== "string") {
        throw new Error(`${name} 缺少 resume 或 job 字段`);
      }
      cases.push({ id, resume: item.resume, job: item.job });
    });
  }
  return cases;
}

async function directScore(caseItem, config) {
  const redact = globalThis.AIJobAssistantAnchoredScoring.redact;
  const resume = redact(caseItem.resume, { resume: true });
  const job = redact(caseItem.job);
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    redirect: "error",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: "system", content: BASELINE_SYSTEM_PROMPT },
        {
          role: "user",
          content: `【简历】\n${resume}\n\n【目标岗位】\n${job}`,
        },
      ],
      temperature: 0,
      max_tokens: 400,
      response_format: { type: "json_object" },
      thinking: { type: "disabled" },
      stream: false,
    }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `直接打分接口失败（${response.status}）：${detail.slice(0, 200)}`,
    );
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content || "";
  const cleaned = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  const parsed = JSON.parse(
    start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned,
  );
  const score = Number(parsed.score);
  if (!Number.isFinite(score) || score < 0 || score > 100) {
    throw new Error(`模型返回了无效分数：${content.slice(0, 120)}`);
  }
  return {
    score: Math.round(score),
    reason: textOrEmpty(parsed.reason).slice(0, 120),
    usage: data.usage || null,
  };
}

async function pipelineScore(caseItem) {
  const response = await fetch(`${baseUrl}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      resume: caseItem.resume,
      job: caseItem.job,
      fresh: true,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }
  return data.analysis;
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function summarizeScores(scores) {
  const summary = summarizeRuns(scores.map((score) => ({ score })));
  return {
    scores: summary.scores,
    min: summary.min,
    max: summary.max,
    range: summary.range,
    mean: summary.mean,
    stdDev: summary.stdDev,
    exactScoreMatchRate: summary.exactScoreMatchRate,
  };
}

function verdictFor(caseReport) {
  const baseline = caseReport.baseline;
  const pipeline = caseReport.pipeline;
  if (!baseline || !pipeline) return "仅单组数据";
  const stability =
    pipeline.range < baseline.range
      ? "流程更稳定"
      : pipeline.range > baseline.range
        ? "直接打分更稳定"
        : "极差相同";
  if (caseReport.id === "T07" && pipeline.scores?.length) {
    return `${stability}；流程分 ${pipeline.scores.join("/")}，直接分 ${baseline.scores.join("/")}`;
  }
  return stability;
}

async function main() {
  const apiKey = process.env.DEEPSEEK_API_KEY || "";
  const apiBaseUrl = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com")
    .replace(/\/+$/, "");
  const model = process.env.DEEPSEEK_MODEL || "deepseek-flash";

  if (methods.has("baseline") && !apiKey) {
    throw new Error(
      "未配置 DEEPSEEK_API_KEY，无法运行直接打分基线。请填写 .env.local。",
    );
  }

  const status = await fetch(`${baseUrl}/api/status`)
    .then((response) => (response.ok ? response.json() : null))
    .catch(() => null);
  if (methods.has("pipeline") && !status) {
    throw new Error(`无法连接本地服务：${baseUrl}，请先运行 npm start`);
  }
  if (methods.has("pipeline") && !status.configured) {
    throw new Error("本地服务未配置 DEEPSEEK_API_KEY，无法运行评分表流程。");
  }

  const cases = await loadCases();
  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    apiBaseUrl,
    model,
    modelDisplayName: status?.model || model,
    protocolVersion: status?.protocolVersion || null,
    promptFingerprint: status?.promptFingerprint || null,
    runsPerCase: runCount,
    methods: [...methods],
    envSource: localEnvironment.loaded ? ".env.local" : "process environment",
    cases: [],
  };

  for (const caseItem of cases) {
    const caseReport = { id: caseItem.id, baseline: null, pipeline: null };

    if (methods.has("baseline")) {
      const runs = [];
      for (let index = 0; index < runCount; index += 1) {
        process.stdout.write(
          `\r${caseItem.id} 直接打分：${index + 1}/${runCount}…`,
        );
        runs.push(await directScore(caseItem, { apiKey, baseUrl: apiBaseUrl, model }));
      }
      caseReport.baseline = {
        ...summarizeScores(runs.map((run) => run.score)),
        reasons: runs.map((run) => run.reason),
      };
    }

    if (methods.has("pipeline")) {
      const analyses = [];
      for (let index = 0; index < runCount; index += 1) {
        process.stdout.write(
          `\r${caseItem.id} 评分表流程：${index + 1}/${runCount}…`,
        );
        analyses.push(await pipelineScore(caseItem));
      }
      caseReport.pipeline = summarizeScores(
        analyses.map((analysis) => analysis.score),
      );
      caseReport.pipeline.hardGateBlocked = analyses.map(
        (analysis) => Boolean(analysis.hardGate?.blocked),
      );
      caseReport.pipeline.fitLevels = analyses.map(
        (analysis) => analysis.fitLevel || "",
      );
    }

    caseReport.verdict = verdictFor(caseReport);
    report.cases.push(caseReport);
    process.stdout.write(
      `\r${caseItem.id}：${caseReport.verdict}\n`,
    );
  }

  const compared = report.cases.filter(
    (caseReport) => caseReport.baseline && caseReport.pipeline,
  );
  report.aggregate = compared.length
    ? {
        cases: compared.length,
        baselineMeanRange: round1(
          compared.reduce((sum, item) => sum + item.baseline.range, 0) /
            compared.length,
        ),
        pipelineMeanRange: round1(
          compared.reduce((sum, item) => sum + item.pipeline.range, 0) /
            compared.length,
        ),
        baselineMeanStdDev: round1(
          compared.reduce((sum, item) => sum + item.baseline.stdDev, 0) /
            compared.length,
        ),
        pipelineMeanStdDev: round1(
          compared.reduce((sum, item) => sum + item.pipeline.stdDev, 0) /
            compared.length,
        ),
        pipelineExactMatchRate: round1(
          compared.reduce(
            (sum, item) => sum + item.pipeline.exactScoreMatchRate,
            0,
          ) / compared.length,
        ),
        baselineExactMatchRate: round1(
          compared.reduce(
            (sum, item) => sum + item.baseline.exactScoreMatchRate,
            0,
          ) / compared.length,
        ),
      }
    : null;

  await mkdir(outDir, { recursive: true });
  const stamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .slice(0, 19);
  const jsonPath = join(outDir, `baseline-${stamp}.json`);
  const markdownPath = join(outDir, `baseline-${stamp}.md`);
  await writeFile(jsonPath, JSON.stringify(report, null, 2), "utf8");

  const lines = [
    "# 直接打分基线 vs 评分表流程",
    "",
    `- 生成时间：${report.generatedAt}`,
    `- 服务：${report.baseUrl}`,
    `- 模型：${report.modelDisplayName}（${report.model}）`,
    `- 每组运行次数：${report.runsPerCase}`,
    `- 直接打分：模型一次性给出 0–100 分；评分表流程：先提取固定评分表与逐条证据，再由程序计分`,
    "",
  ];

  if (report.aggregate) {
    lines.push(
      "## 汇总",
      "",
      `- 对照案例数：${report.aggregate.cases}`,
      `- 平均极差：直接打分 ${report.aggregate.baselineMeanRange} 分，评分表流程 ${report.aggregate.pipelineMeanRange} 分`,
      `- 平均标准差：直接打分 ${report.aggregate.baselineMeanStdDev}，评分表流程 ${report.aggregate.pipelineMeanStdDev}`,
      `- 完全一致率：直接打分 ${report.aggregate.baselineExactMatchRate}%，评分表流程 ${report.aggregate.pipelineExactMatchRate}%`,
      "",
    );
  }

  lines.push(
    "| 案例 | 直接打分 | 直接极差 | 流程分 | 流程极差 | 硬门槛触发 | 结论 |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...report.cases.map((caseReport) => {
      const baselineScores = caseReport.baseline?.scores?.join(" / ") || "—";
      const pipelineScores = caseReport.pipeline?.scores?.join(" / ") || "—";
      const gate = caseReport.pipeline?.hardGateBlocked?.some(Boolean)
        ? "是"
        : "否";
      return `| ${caseReport.id} | ${baselineScores} | ${
        caseReport.baseline?.range ?? "—"
      } | ${pipelineScores} | ${caseReport.pipeline?.range ?? "—"} | ${gate} | ${caseReport.verdict} |`;
    }),
    "",
    "## 说明",
    "",
    "- 直接打分基线只给模型简历和岗位，不提供固定评分表，也不要求逐条引用证据。",
    "- 评分表流程的模型不直接输出总分；总分由程序按固定权重计算，硬性条件明确不满足时封顶 44 分。",
    "- 两个方法的分数范围和稳定性仅用于说明一致性差异，不代表哪一方的评分更“正确”。",
    "",
  );

  await writeFile(markdownPath, lines.join("\n"), "utf8");
  console.log("\n报告已生成：");
  console.log(`- ${jsonPath}`);
  console.log(`- ${markdownPath}`);
}

main().catch((error) => {
  console.error(`\n基线评测失败：${error.message}`);
  process.exitCode = 1;
});
