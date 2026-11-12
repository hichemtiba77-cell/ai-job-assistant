import test from "node:test";
import assert from "node:assert/strict";
import "../scoring-core.js";

const SCORING = globalThis.AIJobAssistantScoring;

const jobRaw = {
  job_title: "AI产品实习生",
  job_requirements: [
    {
      id: "model-can-change-this",
      category: "core",
      dimension: "core_skills",
      requirement: "熟悉Python或SQL并完成数据分析",
      jd_quote: "熟悉Python或SQL，具备基础数据分析能力",
      evidence_rule: "简历需写出使用的工具、分析任务和结果",
    },
    {
      id: "R02",
      category: "core",
      dimension: "experience",
      requirement: "具有用户调研或产品项目经历",
      jd_quote: "有用户调研、产品原型或校园项目经历者优先",
      evidence_rule: "简历需说明项目、个人任务和产出",
    },
    {
      id: "R03",
      category: "bonus",
      dimension: "behavior",
      requirement: "具备团队沟通协作经历",
      jd_quote: "逻辑清晰，沟通表达能力良好",
      evidence_rule: "简历需提供协作任务和个人贡献",
    },
    {
      id: "R04",
      category: "hard",
      dimension: "conditions",
      requirement: "每周可实习4天并连续3个月",
      jd_quote: "每周可实习4天以上，连续实习3个月",
      evidence_rule: "简历需明确每周天数和实习周期",
    },
  ],
};

const jobText = [jobRaw.job_title, ...jobRaw.job_requirements.map((row) => row.jd_quote)].join("\n");

const resumeText = `张同学
软件工程专业本科生，预计2027年毕业
教育经历
郑州大学 软件工程 本科
项目经历
负责校园二手平台需求分析和后端接口，使用Python和SQL完成商品管理，服务约300名同学。
技能
Python、SQL、Excel；
曾担任课程小组组长，与3名成员协作完成汇报。`;

function evidenceRow(requirementId, overrides = {}) {
  return {
    requirement_id: requirementId,
    evidence_status: "direct",
    resume_quote: "负责校园二手平台需求分析和后端接口",
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

function buildResumeData(evidenceRows) {
  return SCORING.normalizeResumeEvidence(
    {
      resume_items: [
        {
          item_id: "E01",
          section: "experience",
          title: "校园二手平台",
          facts: ["负责需求分析和接口开发"],
          source_quotes: ["使用Python和SQL完成商品管理"],
        },
      ],
      evidence_table: evidenceRows,
      strengths: [],
      gaps: [],
      suggestions: [],
      summary: "",
    },
    SCORING.normalizeJobRubric(jobRaw, jobText),
    resumeText,
  );
}

test("岗位评分表由程序生成稳定编号", () => {
  const rubric = SCORING.normalizeJobRubric(
    jobRaw,
    jobText,
  );
  assert.deepEqual(
    rubric.requirements.map((item) => item.id),
    ["R01", "R02", "R03", "R04"],
  );
  assert.equal(rubric.requirements[2].weight, 0.5);
  assert.equal(rubric.requirements[3].weight, 0);
});

test("遗漏的证据行由程序补零，分数不会变成空值", () => {
  const rubric = SCORING.normalizeJobRubric(jobRaw, jobText);
  const resumeData = SCORING.normalizeResumeEvidence(
    {
      resume_items: [],
      evidence_table: [evidenceRow("R01")],
    },
    rubric,
    resumeText,
  );
  assert.equal(resumeData.evidence_table.length, 4);
  assert.equal(
    resumeData.evidence_table.find((item) => item.requirement_id === "R02")
      .evidence_status,
    "none",
  );

  const analysis = SCORING.buildAnalysis(rubric, resumeData, resumeText);
  assert.equal(Number.isFinite(analysis.score), true);
  assert.ok(analysis.score < 100);
});

test("简历没有任何证据时仍返回可解释的0到100分", () => {
  const rubric = SCORING.normalizeJobRubric(jobRaw, jobText);
  const resumeData = SCORING.normalizeResumeEvidence(
    {
      resume_items: [],
      evidence_table: [],
    },
    rubric,
    "仅有姓名",
  );
  const analysis = SCORING.buildAnalysis(rubric, resumeData, "仅有姓名");
  assert.equal(analysis.score, 0);
  assert.equal(analysis.fitLevel, "匹配不足");
  assert.equal(analysis.evidenceItems.length, 4);
  assert.match(analysis.notice, /现有材料仍可评分/);
});

test("相同评分表和证据得到完全相同分数", () => {
  const rubric = SCORING.normalizeJobRubric(jobRaw, jobText);
  const resumeData = buildResumeData([
    evidenceRow("R01"),
    evidenceRow("R02", {
      relevance_level: 3,
      evidence_level: 2,
      ownership_level: 2,
    }),
    evidenceRow("R03"),
    evidenceRow("R04"),
  ]);
  const first = SCORING.buildAnalysis(rubric, resumeData, resumeText);
  const second = SCORING.buildAnalysis(rubric, resumeData, resumeText);
  assert.equal(first.score, second.score);
  assert.deepEqual(first.dimensions, second.dimensions);
});

test("删除核心证据会降低分数，而不是删除该维度分母", () => {
  const rubric = SCORING.normalizeJobRubric(jobRaw, jobText);
  const full = SCORING.buildAnalysis(
    rubric,
    buildResumeData([
      evidenceRow("R01"),
      evidenceRow("R02"),
      evidenceRow("R03"),
      evidenceRow("R04"),
    ]),
    resumeText,
  );
  const reduced = SCORING.buildAnalysis(
    rubric,
    buildResumeData([
      evidenceRow("R01"),
      evidenceRow("R02", {
        evidence_status: "none",
        resume_quote: "简历中未找到",
        relevance_level: 0,
        evidence_level: 0,
        ownership_level: 0,
        recency_level: null,
      }),
      evidenceRow("R03"),
      evidenceRow("R04"),
    ]),
    resumeText,
  );

  assert.ok(reduced.score < full.score);
  const experience = reduced.dimensions.find(
    (dimension) => dimension.key === "experience",
  );
  assert.equal(experience.assessed, true);
  assert.equal(experience.score, 0);
});

test("硬性条件未知只影响门槛和置信度，不会取消匹配分", () => {
  const rubric = SCORING.normalizeJobRubric(jobRaw, jobText);
  const resumeData = buildResumeData([
    evidenceRow("R01"),
    evidenceRow("R02"),
    evidenceRow("R03"),
    evidenceRow("R04", {
      evidence_status: "none",
      resume_quote: "简历中未找到",
      hard_status: "unknown",
      relevance_level: 0,
      evidence_level: 0,
      ownership_level: 0,
      recency_level: null,
    }),
  ]);
  const analysis = SCORING.buildAnalysis(rubric, resumeData, resumeText);
  assert.equal(Number.isFinite(analysis.score), true);
  assert.equal(
    analysis.constraints.find((item) => item.name.startsWith("R04")).status,
    "unknown",
  );
  assert.notEqual(analysis.confidence, "高");
});

test("简历准备度由程序规则计算", () => {
  const rubric = SCORING.normalizeJobRubric(jobRaw, jobText);
  const resumeData = buildResumeData([
    evidenceRow("R01"),
    evidenceRow("R02"),
    evidenceRow("R03"),
    evidenceRow("R04"),
  ]);
  const analysis = SCORING.buildAnalysis(rubric, resumeData, resumeText);
  assert.equal(Number.isFinite(analysis.readiness.score), true);
  assert.deepEqual(analysis.readiness.missing_sections, []);
});

test("只有一个bonus要求的维度不会被权重错误减半", () => {
  const rubric = SCORING.normalizeJobRubric(jobRaw, jobText);
  const resumeData = buildResumeData([
    evidenceRow("R01"),
    evidenceRow("R02"),
    evidenceRow("R03"),
    evidenceRow("R04"),
  ]);
  const analysis = SCORING.buildAnalysis(rubric, resumeData, resumeText);
  const behavior = analysis.dimensions.find(
    (dimension) => dimension.key === "behavior",
  );
  const behaviorEvidence = analysis.evidenceItems.find(
    (item) => item.requirementId === "R03",
  );
  assert.equal(behavior.score, behaviorEvidence.requirementScore);
});

test("无效引用不计分，PDF换行产生的空白可正常匹配", () => {
  const rubric = SCORING.normalizeJobRubric(jobRaw, jobText);
  const resume = "负责校园二手平台需求\n分析和后端接口，使用 Python   和 SQL。";
  const resumeData = SCORING.normalizeResumeEvidence(
    {
      evidence_table: [
        evidenceRow("R01", { resume_quote: "使用 Python 和 SQL" }),
        evidenceRow("R02", { resume_quote: "负责校园二手平台需求分析和后端接口" }),
        evidenceRow("R03", { resume_quote: "协调五个团队完成交付" }),
      ],
    },
    rubric,
    resume,
  );
  const analysis = SCORING.buildAnalysis(rubric, resumeData, resume);

  const [skills, experience, behavior] = analysis.evidenceItems;
  assert.ok(skills.requirementScore > 0);
  assert.ok(experience.requirementScore > 0);
  assert.equal(behavior.requirementScore, 0);
  assert.equal(behavior.resumeEvidence, "简历中未找到");
  assert.match(behavior.explanation, /无法在简历原文中核实/);
  assert.ok(analysis.strengths.every((item) => !item.includes("协调五个团队")));
});

test("证据提示词要求硬性条件与简历事实冲突时标记unmet", () => {
  assert.match(
    SCORING.RESUME_EVIDENCE_SYSTEM_PROMPT,
    /学历、专业、毕业时间、证书、到岗时间等与硬性条件冲突时，必须填unmet/,
  );
});

test("虚构的岗位引用不能进入评分表或新增门槛", () => {
  const rubric = SCORING.normalizeJobRubric({
    job_requirements: [
      ...jobRaw.job_requirements,
      { category: "hard", dimension: "education", jd_quote: "必须是博士" },
    ],
  }, jobText);
  assert.equal(rubric.requirements.length, 4);
  assert.throws(() => SCORING.normalizeJobRubric(jobRaw, "岗位描述缺失"), /评分表为空/);
});

test("时效标签的波动不改变评分，非法等级不能换成满分", () => {
  const rubric = SCORING.normalizeJobRubric(jobRaw, jobText);
  const build = (overrides) => SCORING.buildAnalysis(
    rubric, buildResumeData([evidenceRow("R01", overrides)]), resumeText,
  ).evidenceItems[0];
  assert.equal(build({ recency_level: 0 }).requirementScore, build({ recency_level: 3 }).requirementScore);
  assert.equal(build({ relevance_level: 100 }).requirementScore, 0);
  assert.equal(build({ ownership_level: true }).levelsComplete, false);
  const partial = build({ evidence_status: "partial", relevance_level: 4 });
  assert.equal(partial.relevanceLevel, 2);
  assert.ok(partial.requirementScore < build({}).requirementScore);
});

test("重复且冲突的硬性证据始终待确认", () => {
  const rubric = SCORING.normalizeJobRubric(jobRaw, jobText);
  const rows = [
    ...rubric.requirements.slice(0, 3).map(({ id }) => evidenceRow(id, { evidence_status: "none" })),
    evidenceRow("R04", { hard_status: "met" }),
    evidenceRow("R04", { hard_status: "unmet" }),
  ];
  for (const evidence_table of [rows, [...rows].reverse()]) {
    const data = SCORING.validateModelEvidence({ evidence_table }, rubric, resumeText);
    assert.equal(SCORING.buildAnalysis(rubric, data, resumeText).hardGate.status, "unknown");
  }
  assert.throws(() => SCORING.validateModelEvidence({}, rubric, resumeText), /有效岗位编号/);
  assert.throws(() => SCORING.validateModelEvidence({ evidence_table: rows.slice(1) }, rubric, resumeText), /有效岗位编号/);
});

test("脱敏可重复执行并保留经历", () => {
  const raw = "姓名：张三\n邮箱：Test@example.com\n手机：＋８６ １３８００１３８０００\n证件：11010519491231002X\n微信号：private_id\n住址：某小区一号楼\n负责Python数据分析，清洗3000条数据。";
  const redacted = SCORING.redactPersonalText(raw, { resume: true });
  for (const secret of ["张三", "example.com", "13800138000", "11010519491231002X", "private_id", "某小区"]) {
    assert.ok(!redacted.includes(secret));
  }
  assert.match(redacted, /负责Python数据分析,清洗3000条数据/);
  assert.equal(SCORING.redactPersonalText(redacted, { resume: true }), redacted);
});

test("新缓存键区分跨字段换行的不同输入", () => {
  const first = SCORING.buildAnalysisCacheKeyInput({ resume: "简历\n附加", job: "岗位" });
  const second = SCORING.buildAnalysisCacheKeyInput({ resume: "简历", job: "附加\n岗位" });
  assert.notEqual(first, second);
});
