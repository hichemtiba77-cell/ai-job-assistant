import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { summarizeRuns, formatSummaryMarkdown } from "./consistency-stats.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const baseUrl = String(
  argValue("--base-url", "http://127.0.0.1:3000"),
).replace(/\/+$/, "");
const runCount = Math.max(1, Number(argValue("--runs", "5")) || 5);
const casesDir = resolve(ROOT, argValue("--cases", "tools/eval-cases"));
const outDir = resolve(ROOT, argValue("--out", "output/eval"));
const fresh = !process.argv.includes("--no-fresh");

async function loadCases() {
  const files = (await readdir(casesDir))
    .filter((name) => name.endsWith(".json") && !name.startsWith("_"))
    .sort();
  if (!files.length) {
    throw new Error(
      `没有找到测试案例：${casesDir}\n请按 tools/eval-cases/_template.json 的格式添加 T01–T06。`,
    );
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

async function analyze(caseItem) {
  const response = await fetch(`${baseUrl}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      resume: caseItem.resume,
      job: caseItem.job,
      fresh,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }
  return data.analysis;
}

async function main() {
  const status = await fetch(`${baseUrl}/api/status`)
    .then((response) => response.json())
    .catch(() => null);
  if (!status) {
    throw new Error(`无法连接本地服务：${baseUrl}，请先运行 npm start`);
  }
  if (!status.configured) {
    throw new Error("本地服务未配置 DEEPSEEK_API_KEY，无法进行真实一致性评测。");
  }

  const cases = await loadCases();
  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    model: status.model,
    modelAlias: status.modelAlias,
    protocolVersion: status.protocolVersion,
    promptFingerprint: status.promptFingerprint,
    fresh,
    runsPerCase: runCount,
    cases: [],
  };

  for (const caseItem of cases) {
    const analyses = [];
    for (let index = 0; index < runCount; index += 1) {
      process.stdout.write(
        `\r${caseItem.id}：第 ${index + 1}/${runCount} 次分析…`,
      );
      analyses.push(await analyze(caseItem));
    }
    const summary = summarizeRuns(analyses);
    report.cases.push({
      id: caseItem.id,
      summary,
      scores: analyses.map((analysis) => analysis.score),
      hardGateBlocked: analyses.map(
        (analysis) => Boolean(analysis.hardGate?.blocked),
      ),
    });
    process.stdout.write(
      `\r${caseItem.id}：分数 ${summary.scores.join(", ")}，极差 ${summary.range}，完全一致率 ${summary.exactScoreMatchRate}%\n`,
    );
  }

  await mkdir(outDir, { recursive: true });
  const stamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .slice(0, 19);
  const jsonPath = join(outDir, `consistency-${stamp}.json`);
  const markdownPath = join(outDir, `consistency-${stamp}.md`);
  await writeFile(jsonPath, JSON.stringify(report, null, 2), "utf8");
  await writeFile(
    markdownPath,
    [
      "# 重复运行一致性报告",
      "",
      `- 生成时间：${report.generatedAt}`,
      `- 服务：${report.baseUrl}`,
      `- 模型：${report.model}（${report.modelAlias}）`,
      `- 协议：${report.protocolVersion}，提示词指纹：${report.promptFingerprint}`,
      `- 每组运行次数：${report.runsPerCase}，每次独立调用：${fresh}`,
      "",
      ...report.cases.flatMap((caseReport) => [
        formatSummaryMarkdown(caseReport.summary, caseReport.id),
        "",
      ]),
    ].join("\n"),
    "utf8",
  );

  console.log(`\n报告已生成：`);
  console.log(`- ${jsonPath}`);
  console.log(`- ${markdownPath}`);
}

main().catch((error) => {
  console.error(`\n评测失败：${error.message}`);
  process.exitCode = 1;
});
