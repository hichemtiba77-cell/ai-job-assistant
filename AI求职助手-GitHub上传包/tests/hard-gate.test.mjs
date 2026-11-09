import test from "node:test";
import assert from "node:assert/strict";
import "../scoring-core.js";

const SCORING = globalThis.AIJobAssistantScoring;

const jobText = `熟悉Python并完成数据分析
计算机相关专业本科及以上学历`;

const jobRaw = {
  job_title: "数据分析实习生",
  job_requirements: [
    {
      category: "core",
      dimension: "core_skills",
      requirement: "熟悉Python并完成数据分析",
      jd_quote: "熟悉Python并完成数据分析",
      evidence_rule: "简历需写出Python分析任务和结果",
    },
    {
      category: "hard",
      dimension: "education",
      requirement: "计算机相关专业本科及以上学历",
      jd_quote: "计算机相关专业本科及以上学历",
      evidence_rule: "简历需写明专业和学历",
    },
  ],
};

function buildAnalysis(
  hardStatus,
  degree = hardStatus === "unmet" ? "教育学本科" : "软件工程本科",
  quote = hardStatus === "unknown" ? "简历中未找到" : degree,
) {
  const resumeText = `${degree}
使用Python完成课程数据分析项目，独立清洗两万条记录并输出报告。`;
  const rubric = SCORING.normalizeJobRubric(jobRaw, jobText);
  const resumeData = SCORING.normalizeResumeEvidence(
    {
      evidence_table: [
        {
          requirement_id: "R01",
          evidence_status: "direct",
          resume_quote: "使用Python完成课程数据分析项目",
          relevance_level: 4,
          evidence_level: 4,
          ownership_level: 4,
          recency_level: 3,
          hard_status: "unknown",
        },
        {
          requirement_id: "R02",
          evidence_status: "none",
          resume_quote: quote,
          relevance_level: 0,
          evidence_level: 0,
          ownership_level: 0,
          recency_level: null,
          hard_status: hardStatus,
        },
      ],
    },
    rubric,
    resumeText,
  );
  return SCORING.buildAnalysis(rubric, resumeData, resumeText);
}

test("硬性条件明确不满足时，综合分封顶并标记门槛不通过", () => {
  const analysis = buildAnalysis("unmet");

  assert.equal(analysis.hardGate.blocked, true);
  assert.equal(analysis.rawScore, 100);
  assert.equal(analysis.score, 44);
  assert.equal(analysis.fitLevel, "匹配不足");
  assert.match(analysis.scoreExplanation, /硬性条件/);
  assert.deepEqual(analysis.hardGate.requirementIds, ["R02"]);
});

test("硬性条件待确认时不影响分数，只保留门槛提示", () => {
  const analysis = buildAnalysis("unknown");

  assert.equal(analysis.hardGate.blocked, false);
  assert.equal(analysis.score, 100);
  assert.equal(analysis.rawScore, 100);
});

test("没有可核实的原文时，硬性条件保持待确认", () => {
  for (const hardStatus of ["met", "unmet"]) {
    const analysis = buildAnalysis(hardStatus, "软件工程本科", "教育学本科");
    assert.equal(analysis.hardGate.status, "unknown");
    assert.equal(analysis.hardGate.blocked, false);
    assert.equal(analysis.score, 100);
    assert.match(analysis.constraints[0].detail, /无法在简历原文中核实/);
  }
});

test("硬性条件满足时正常计分", () => {
  const analysis = buildAnalysis("met");

  assert.equal(analysis.hardGate.blocked, false);
  assert.equal(analysis.score, 100);
});

test("评分结果包含维度权重和贡献值，能还原总分算式", () => {
  const analysis = buildAnalysis("met");
  const core = analysis.scoring.dimensions.find(
    (item) => item.key === "core_skills",
  );

  assert.equal(core.weight, 0.25);
  assert.equal(core.score, 100);
  assert.equal(core.contribution, 25);
  assert.equal(analysis.scoring.totalWeight, 0.25);
  assert.equal(analysis.scoring.total, 100);
  assert.match(analysis.scoring.formula, /权重/);
});
