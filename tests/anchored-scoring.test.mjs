import test from "node:test";
import assert from "node:assert/strict";
import "../scoring-core.js";
import "../anchored-scoring.js";

const core = globalThis.AIJobAssistantScoring;
const protocol = globalThis.AIJobAssistantAnchoredScoring;
const response = (rows) => ({ value: { rows } });
const classify = async (_, prompt) => response(JSON.parse(prompt).clauses.map(({ id, quote }) => ({
  id, category: /每周|实习周期|学历|在读|年毕业/.test(quote) ? "hard" : "core",
  dimension: "core_skills",
})));

function evidence(status = "direct", reverse = false) {
  return async (_, prompt) => {
    const rows = JSON.parse(prompt).requirements.map(({ id, allowedSpanIds }) => ({
      id, status, spanIds: status === "none" ? [] : allowedSpanIds.slice(0, 1),
    }));
    return response(reverse ? rows.reverse() : rows);
  };
}

test("条款原文锚点可回填，同一条中的优先项独立处理", async () => {
  const job = protocol.redact("岗位要求：必须有本科及以上学历，熟悉 Tableau 优先。\n负责 Python 数据分析。");
  const { value: rubric } = await protocol.createRubric(job, classify);
  assert.deepEqual(rubric.requirements.map(({ category }) => category), ["hard", "bonus", "core"]);
  for (const { start, end, jd_quote } of rubric.requirements) {
    assert.equal(job.slice(start, end), jd_quote);
  }
});

test("漏答只补请求漏掉的条目，部分核验无匹配分且不能和确实无证据混淆", async () => {
  const job = "负责Python分析；负责SQL开发；负责Excel可视化";
  const resume = "使用Python清洗记录；使用SQL开发接口";
  const { value: rubric } = await protocol.createRubric(job, classify);
  const asks = [];
  const { value } = await protocol.createEvidence(resume, rubric, async (_, prompt) => {
    const rows = JSON.parse(prompt).requirements;
    asks.push(rows.map(({ id }) => id));
    return response(asks.length === 1 ? [
      { id: rows[0].id, status: "direct", spanIds: [rows[0].allowedSpanIds[0]] },
      { id: rows[1].id, status: "none", spanIds: [] },
    ] : []);
  });
  const analysis = core.buildAnalysis(rubric, value, resume);
  assert.deepEqual(asks.map((ids) => ids.length), [3, 1]);
  assert.equal(analysis.matchScore, null);
  assert.equal(analysis.analysisStatus, "incomplete");
  assert.deepEqual(analysis.evidenceItems.map((row) => row.assessment), ["verified", "none", "unassessed"]);
  assert.deepEqual(analysis.evidenceItems.map((row) => row.requirementScore).slice(1), [0, null]);
});

test("固定证据反复回放保持相同分数和原文锚点，跨项目成果不能替代个人贡献", async () => {
  const job = "负责Python数据清洗；负责SQL开发";
  const resume = "独立使用Python完成数据清洗，团队输出60页报告；使用SQL开发接口";
  const { value: rubric } = await protocol.createRubric(job, classify);
  const first = await protocol.createEvidence(resume, rubric, evidence());
  const expected = core.buildAnalysis(rubric, first.value, resume);
  assert.equal(expected.evidenceItems[0].evidenceLevel, 2);
  assert.equal(expected.evidenceItems[0].depthLevel, 3);
  for (let index = 0; index < 100; index++) {
    const { value } = await protocol.createEvidence(resume, rubric, evidence("direct", Boolean(index % 2)));
    assert.deepEqual(core.buildAnalysis(rubric, value, resume), expected);
  }
});

test("伪造片段、工具不符和否定句均不会获得分数", async () => {
  const job = "负责Python数据清洗";
  const { value: rubric } = await protocol.createRubric(job, classify);
  const checks = [
    ["使用Python清洗记录", async (_, prompt) => response([{ id: JSON.parse(prompt).requirements[0].id, status: "direct", spanIds: ["invalid"] }]), "unassessed"],
    ["精通Excel并独立完成分析", evidence(), "uncertain"],
    ["不会Python，没有使用Python做过项目", evidence(), "uncertain"],
    ["使用Python是岗位要求，我负责文档登记", evidence(), "uncertain"],
  ];
  for (const [resume, request, expected] of checks) {
    const { value } = await protocol.createEvidence(resume, rubric, request);
    const result = core.buildAnalysis(rubric, value, resume);
    assert.equal(result.matchScore, null);
    assert.equal(result.evidenceItems[0].assessment, expected);
  }
});

test("超出单批长度的岗位条款仍有明确待分类状态", async () => {
  const job = ["熟悉SQL", "负责" + "数据分析".repeat(130)].join("；");
  const { value: rubric } = await protocol.createRubric(job, classify);
  assert.equal(rubric.totalClauses, 2);
  assert.equal(rubric.checkedClauses, 1);
  const { value } = await protocol.createEvidence("负责SQL数据分析", rubric, evidence());
  const analysis = core.buildAnalysis(rubric, value, "");
  assert.equal(analysis.analysisStatus, "incomplete");
  assert.equal(analysis.matchScore, null);
});

test("43 个门槛样例验证边界、冲突、证据不足及组合条件", async () => {
  const fixtures = [
    ["每周到岗4天以上", "每周可到岗4天", "met"],
    ["每周到岗4天以上", "每周可到岗5天", "met"],
    ["每周到岗4天以上", "每周可到岗3天", "unmet"],
    ["每周到岗4天以上", "每周最多到岗3天", "unmet"],
    ["每周到岗4天以上", "可灵活安排到岗", "unknown"],
    ["每周到岗4天以上", "每周至少到岗3天", "unknown"],
    ["每周到岗4天以上", "每周可到岗3-5天", "unknown"],
    ["每周到岗4天以上", "每周可到岗3天；每周可到岗5天", "unknown"],
    ["每周到岗4天以上", "每周可到岗3天，每周可到岗5天", "unknown"],
    ["每周到岗4天以上", "实习经历：每周可到岗5天", "unknown"],
    ["每周到岗四天以上", "每周可到岗五天", "met"],
    ["每周到岗4天以上", "每周可能到岗4天", "unknown"],
    ["每周到岗4天以上", "每周可到岗8天", "unknown"],
    ["实习周期3个月以上", "可连续实习3个月", "met"],
    ["实习周期3个月以上", "可连续实习4个月", "met"],
    ["实习周期3个月以上", "只能连续实习2个月", "unmet"],
    ["实习周期3个月以上", "可连续实习12周", "unknown"],
    ["实习周期3个月以上", "预计可以实习", "unknown"],
    ["实习周期3个月以上", "实习经历：可连续实习4个月", "unknown"],
    ["实习周期8周以上", "可连续实习8周", "met"],
    ["实习周期8周以上", "可连续实习6周", "unmet"],
    ["实习周期8周以上", "可以实习至少6周", "unknown"],
    ["本科及以上学历", "已取得本科学历", "met"],
    ["本科及以上学历", "已取得硕士学位", "met"],
    ["本科及以上学历", "已取得大专学历", "unmet"],
    ["本科及以上学历", "本科在读", "unknown"],
    ["本科及以上学历", "学历：本科", "unknown"],
    ["本科及以上在读", "本科在读", "met"],
    ["本科及以上在读", "专科在读", "unmet"],
    ["本科及以上在读", "本科已毕业", "unknown"],
    ["硕士在读", "本科已毕业，目前硕士在读", "met"],
    ["硕士在读", "本科已毕业目前硕士在读", "unknown"],
    ["计算机相关专业本科及以上学历", "已取得教育学本科学历", "unknown"],
    ["2027年毕业", "预计2027年毕业", "met"],
    ["2027年毕业", "预计2026年毕业", "unmet"],
    ["2027年毕业", "预计2026年毕业；预计2027年毕业", "unknown"],
    ["2027年毕业", "2025年入学", "unknown"],
    ["每周到岗4天以上且实习周期3个月以上", "每周可到岗4天；可连续实习3个月", "met"],
    ["每周到岗4天以上且实习周期3个月以上", "每周可到岗3天", "unmet"],
    ["每周到岗4天以上且实习周期3个月以上", "每周可到岗4天", "unknown"],
    ["每周到岗4天以上或实习周期3个月以上", "每周可到岗3天", "unknown"],
    ["每周到岗4天以上或实习周期3个月以上", "每周可到岗4天", "met"],
    ["每周到岗4天以上或实习周期3个月以上", "每周可到岗3天；可连续实习2个月", "unmet"],
  ];
  for (const [job, resume, expected] of fixtures) {
    const inputJob = protocol.redact(job);
    const inputResume = protocol.redact(resume);
    const { value: rubric } = await protocol.createRubric(inputJob, classify);
    const { value } = await protocol.createEvidence(inputResume, rubric, () => assert.fail("硬性门槛应由本地规则比较"));
    assert.equal(value.evidence_table[0].hard_status, expected, job + " / " + resume);
  }
});

test("脱敏可重复执行，离线检查不发布匹配分", () => {
  const raw = "姓名：张三\n学号：STUDENT001\n+852 9123 4567\n邮寄地址：某街一号\n独立使用Python清洗3000条记录";
  const redacted = protocol.redact(raw, { resume: true });
  assert.doesNotMatch(redacted, /张三|STUDENT001|9123|某街/);
  assert.match(redacted, /清洗3000条/);
  assert.equal(protocol.redact(redacted, { resume: true }), redacted);
  const result = protocol.localReview(redacted, "每周到岗4天以上");
  assert.equal(result.matchScore, null);
  assert.equal(result.constraints[0].status, "unknown");
});
