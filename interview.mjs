import { randomInt } from "node:crypto";
import { DIFFICULTY_RULES, FEEDBACK_PROMPT, QUESTION_PROMPT } from "./interview-prompts.mjs";

class InterviewInputError extends Error {}

const QUESTION_IDS = ["Q1", "Q2", "Q3"];
const FOCUSES = ["经历与个人贡献", "岗位方法与选择依据", "岗位情境与决策"];

function clean(value, limit) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function requireText(value, limit, message) {
  const text = clean(value, limit);
  if (!text) throw new InterviewInputError(message);
  return text;
}

function difficultyRules(difficulty) {
  if (typeof difficulty !== "string" || !Object.hasOwn(DIFFICULTY_RULES, difficulty)) {
    throw new InterviewInputError("请选择有效的面试难度。");
  }
  return DIFFICULTY_RULES[difficulty];
}

function buildAssessmentTable(requirements, evidenceItems) {
  const evidenceById = new Map(evidenceItems.slice(0, 20).map((item) => [item?.requirementId, item]));
  const rows = requirements.slice(0, 20).flatMap((item) => {
    const requirement = clean(item?.requirement, 400);
    const requirementId = clean(item?.id, 20);
    if (!requirement || !requirementId) return [];
    const evidence = evidenceById.get(requirementId);
    return [{
      requirementId,
      requirement,
      category: item.category,
      jobQuote: clean(item.jd_quote, 550),
      evidenceStatus: clean(evidence?.statusLabel, 40) || "未找到证据",
      resumeEvidence: clean(evidence?.resumeEvidence, 450),
      followUp: clean(evidence?.interviewFollowup, 250),
    }];
  });
  const practiceRows = rows.filter((row) => row.category !== "hard");
  // Prefer core requirements, with variation inside each priority group.
  return (practiceRows.length ? practiceRows : rows)
    .map((row) => ({ row, priority: (row.category === "core" ? 2 : 0) + randomInt(100) / 100 }))
    .sort((a, b) => b.priority - a.priority)
    .map(({ row }) => row);
}

function validateModelRows(rows, validRow) {
  if (!Array.isArray(rows) || rows.length !== QUESTION_IDS.length) {
    throw new Error("Unexpected interview response length");
  }
  return QUESTION_IDS.map((id) => {
    const matches = rows.filter((row) => row?.id === id);
    if (matches.length !== 1 || !validRow(matches[0])) {
      throw new Error("Invalid interview response row");
    }
    return matches[0];
  });
}

export async function createInterview(body, { getRubric, generate }) {
  const difficulty = difficultyRules(body?.difficulty);
  const job = requireText(body?.job, 16000, "请先完成一份岗位诊断。");
  const evidence = Array.isArray(body.evidenceItems) ? body.evidenceItems : [];
  const requirements = Array.isArray(body.requirements) ? body.requirements : [];
  let table = buildAssessmentTable(requirements, evidence);
  if (!table.length) {
    const { rubric } = await getRubric(job);
    table = buildAssessmentTable(rubric.requirements, []);
  }

  // Give the experience question a real example whenever the report has one.
  const experienceIndex = table.findIndex((row) => row.resumeEvidence && !row.evidenceStatus.includes("未找到"));
  if (experienceIndex > 0) table.unshift(...table.splice(experienceIndex, 1));

  const assessment = QUESTION_IDS.map((id, index) => ({
    id,
    focus: FOCUSES[index],
    ...table[index % table.length],
  }));
  const previousQuestions = Array.isArray(body.previousQuestions)
    ? body.previousQuestions.slice(0, 3).map((question) => clean(question, 450))
    : [];
  const { raw } = await generate(QUESTION_PROMPT, JSON.stringify({
    jobTitle: clean(body.jobTitle, 120),
    difficulty,
    assessment,
    previousQuestions,
  }), 3000);
  const questions = validateModelRows(raw?.questions, (row) => (
    clean(row.prompt, 450) && Array.isArray(row.criteria) && row.criteria.length === 2 &&
    row.criteria.every((criterion) => clean(criterion, 180))
  )).map((row, index) => ({
    id: row.id,
    prompt: clean(row.prompt, 450),
    criteria: row.criteria.map((criterion) => clean(criterion, 180)),
    requirementId: assessment[index].requirementId,
    requirement: assessment[index].requirement,
    focus: assessment[index].focus,
  }));
  if (new Set(questions.map(({ prompt }) => prompt)).size !== questions.length) {
    throw new Error("Duplicate interview questions");
  }
  return { questions };
}

export async function evaluateInterview(body, { generate }) {
  const difficulty = difficultyRules(body?.difficulty);
  if (!Array.isArray(body?.responses) || body.responses.length !== QUESTION_IDS.length) {
    throw new InterviewInputError("请先答完本轮的三道题。");
  }
  const responses = QUESTION_IDS.map((id, index) => {
    const row = body.responses[index];
    if (row?.id !== id) throw new InterviewInputError("题目顺序不正确，请重新开始练习。");
    return {
      id,
      requirement: requireText(row.requirement, 400, "缺少岗位考察项。"),
      question: requireText(row.prompt, 450, "缺少面试题。"),
      criteria: Array.isArray(row.criteria) ? row.criteria.slice(0, 2).map((text) => clean(text, 180)) : [],
      answer: requireText(row.answer, 2000, "请先答完本轮的三道题。"),
    };
  });

  const { raw } = await generate(FEEDBACK_PROMPT, JSON.stringify({ difficulty, responses }), 3000);
  const feedback = validateModelRows(raw?.feedback, (row) => (
    clean(row.strength, 350) && clean(row.improvement, 350)
  )).map((row) => ({
    id: row.id,
    strength: clean(row.strength, 350),
    improvement: clean(row.improvement, 350),
  }));
  const summary = clean(raw.summary, 350);
  const nextAction = clean(raw.nextAction, 350);
  if (!summary || !nextAction) throw new Error("Missing interview summary or next action");
  return { feedback, summary, nextAction };
}

export function isInterviewInputError(error) {
  return error instanceof InterviewInputError;
}
