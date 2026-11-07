import test from "node:test";
import assert from "node:assert/strict";
import "../scoring-core.js";

const SCORING = globalThis.AIJobAssistantScoring;

const jobText = `岗位职责
熟悉Python或SQL，具备基础数据分析能力
有用户调研、产品原型或校园项目经历者优先
逻辑清晰，沟通表达能力良好
每周可实习4天以上，连续实习3个月`;

const jobRaw = {
  job_title: "AI产品实习生",
  job_requirements: [
    {
      category: "core",
      dimension: "core_skills",
      requirement: "熟悉Python或SQL并完成数据分析",
      jd_quote: "熟悉Python或SQL，具备基础数据分析能力",
      evidence_rule: "简历需写出使用的工具、分析任务和结果",
    },
    {
      category: "core",
      dimension: "experience",
      requirement: "具有用户调研或产品项目经历",
      jd_quote: "有用户调研、产品原型或校园项目经历者优先",
      evidence_rule: "简历需说明项目、个人任务和产出",
    },
    {
      category: "bonus",
      dimension: "behavior",
      requirement: "具备团队沟通协作经历",
      jd_quote: "逻辑清晰，沟通表达能力良好",
      evidence_rule: "简历需提供协作任务和个人贡献",
    },
    {
      category: "hard",
      dimension: "conditions",
      requirement: "每周可实习4天并连续3个月",
      jd_quote: "每周可实习4天以上，连续实习3个月",
      evidence_rule: "简历需明确每周天数和实习周期",
    },
  ],
};

const resumeText = `软件工程专业本科生
项目经历
负责校园二手平台需求分析和后端接口，使用Python和SQL完成商品管理。`;

function evidenceRow(requirementId, overrides = {}) {
  return {
    requirement_id: requirementId,
    evidence_status: "direct",
    resume_quote: "负责项目核心任务并取得明确结果",
    relevance_level: 4,
    evidence_level: 3,
    ownership_level: 3,
    recency_level: 3,
    hard_status: "met",
    missing_parts: [],
    explanation: "有直接证据",
    interview_followup: "请说明个人贡献。",
    ...overrides,
  };
}

test("模型打乱岗位要求顺序时，编号和条目顺序保持一致", () => {
  const shuffled = {
    ...jobRaw,
    job_requirements: [
      jobRaw.job_requirements[3],
      jobRaw.job_requirements[1],
      jobRaw.job_requirements[0],
      jobRaw.job_requirements[2],
    ],
  };

  const original = SCORING.normalizeJobRubric(jobRaw, jobText);
  const reordered = SCORING.normalizeJobRubric(shuffled, jobText);

  assert.deepEqual(
    reordered.requirements.map((item) => item.jd_quote),
    original.requirements.map((item) => item.jd_quote),
  );
  assert.deepEqual(
    reordered.requirements.map((item) => item.id),
    ["R01", "R02", "R03", "R04"],
  );
});

test("重复的岗位要求只保留一条，避免编号和分母膨胀", () => {
  const duplicated = {
    ...jobRaw,
    job_requirements: [
      jobRaw.job_requirements[0],
      jobRaw.job_requirements[0],
      jobRaw.job_requirements[1],
    ],
  };
  const rubric = SCORING.normalizeJobRubric(duplicated, jobText);
  assert.equal(rubric.requirements.length, 2);
});

test("模型漏掉证据等级时不再套用默认等级", () => {
  const rubric = SCORING.normalizeJobRubric(jobRaw, jobText);
  const resumeData = SCORING.normalizeResumeEvidence(
    {
      evidence_table: [
        {
          requirement_id: "R01",
          evidence_status: "direct",
          resume_quote: "负责校园二手平台需求分析和后端接口",
          hard_status: "met",
        },
      ],
    },
    rubric,
  );
  const row = resumeData.evidence_table.find(
    (item) => item.requirement_id === "R01",
  );

  assert.equal(row.relevance_level, null);
  assert.equal(row.evidence_level, null);
  assert.equal(row.ownership_level, null);
  assert.equal(row.levels_complete, false);

  const analysis = SCORING.buildAnalysis(rubric, resumeData, resumeText);
  const evidenceItem = analysis.evidenceItems.find(
    (item) => item.requirementId === "R01",
  );
  assert.equal(evidenceItem.requirementScore, 0);
  assert.equal(evidenceItem.levelsComplete, false);
  assert.match(analysis.notice, /等级/);
});

test("模型漏掉硬性条件状态时标记为待确认，而不是自动判为满足", () => {
  const rubric = SCORING.normalizeJobRubric(jobRaw, jobText);
  const resumeData = SCORING.normalizeResumeEvidence(
    {
      evidence_table: [
        {
          requirement_id: "R04",
          evidence_status: "direct",
          resume_quote: "每周可实习4天",
          relevance_level: 4,
          evidence_level: 3,
          ownership_level: 3,
        },
      ],
    },
    rubric,
  );
  const row = resumeData.evidence_table.find(
    (item) => item.requirement_id === "R04",
  );
  assert.equal(row.hard_status, "unknown");
});

test("只有硬性条件的维度标记为门槛维度，而不是岗位未涉及", () => {
  const rubric = SCORING.normalizeJobRubric(jobRaw, jobText);
  const resumeData = SCORING.normalizeResumeEvidence(
    { evidence_table: [] },
    rubric,
  );
  const analysis = SCORING.buildAnalysis(rubric, resumeData, resumeText);
  const conditions = analysis.dimensions.find(
    (item) => item.key === "conditions",
  );

  assert.equal(conditions.assessed, false);
  assert.equal(conditions.hardOnly, true);
  assert.match(conditions.detail, /硬性条件/);
});

test("缓存 key 对空白差异不敏感，并区分模型与提示词版本", () => {
  const first = SCORING.buildAnalysisCacheKeyInput({
    model: "deepseek-flash",
    resume: "第一行\r\n第二行  ",
    job: "岗位要求  ",
  });
  const second = SCORING.buildAnalysisCacheKeyInput({
    model: "deepseek-flash",
    resume: "第一行\n第二行",
    job: "岗位要求",
  });
  const otherModel = SCORING.buildAnalysisCacheKeyInput({
    model: "deepseek-pro",
    resume: "第一行\n第二行",
    job: "岗位要求",
  });

  assert.equal(first, second);
  assert.notEqual(first, otherModel);
  assert.match(first, /deepseek-flash/);
});

test("提示词指纹非空且可公开给浏览器端使用", () => {
  assert.equal(typeof SCORING.PROMPT_FINGERPRINT, "string");
  assert.ok(SCORING.PROMPT_FINGERPRINT.length >= 8);
  assert.equal(
    typeof SCORING.buildRubricCacheKeyInput({ model: "m", job: "j" }),
    "string",
  );
});
