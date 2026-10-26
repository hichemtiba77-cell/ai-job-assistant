import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)));
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";
const API_KEY = process.env.DEEPSEEK_API_KEY || "";
const BASE_URL = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(
  /\/+$/,
  "",
);
const MODEL = process.env.DEEPSEEK_MODEL || "deepseek-flash";
const MODEL_DISPLAY_NAME =
  process.env.DEEPSEEK_DISPLAY_NAME || "DeepSeek-V4.1-Flash-1017";
const analysisCache = new Map();
const MAX_CACHE_ENTRIES = 50;
const PROMPT_PATH = join(
  ROOT,
  "deepseek-training",
  "prompts",
  "job-match-v0.3.md",
);

const DIMENSIONS = {
  core_skills: { name: "核心专业技能", weight: 0.25 },
  domain_knowledge: { name: "行业与岗位知识", weight: 0.1 },
  experience: { name: "项目与实习证据", weight: 0.2 },
  complexity: { name: "任务复杂度与独立程度", weight: 0.1 },
  education: { name: "教育、专业与证书", weight: 0.1 },
  behavior: { name: "沟通与协作行为", weight: 0.1 },
  conditions: { name: "到岗、语言与其他条件", weight: 0.1 },
  expression: { name: "简历表达完整度", weight: 0.05 },
};

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

async function loadSystemPrompt() {
  const markdown = await readFile(PROMPT_PATH, "utf8");
  const match = markdown.match(/```text\s*\n([\s\S]*?)\n```/);
  if (!match) {
    throw new Error("无法从job-match-v0.3.md中读取系统提示词");
  }
  return match[1].trim();
}

function getJsonBody(request, limit = 250_000) {
  return new Promise((resolvePromise, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > limit) {
        reject(new Error("请求内容过大"));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolvePromise(JSON.parse(body || "{}"));
      } catch {
        reject(new Error("请求内容不是合法JSON"));
      }
    });
    request.on("error", reject);
  });
}

async function callDeepSeek(resume, job) {
  const systemPrompt = await loadSystemPrompt();
  const userPrompt = `请分析以下材料。\n\n【简历】\n${resume}\n\n【岗位招聘要求】\n${job}\n\n请严格依据系统规则输出JSON，不得补充输入中不存在的事实。`;
  const emptyResponses = [];

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0,
        max_tokens: 8000,
        response_format: { type: "json_object" },
        thinking: { type: "disabled" },
        stream: false,
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`DeepSeek接口失败（${response.status}）：${detail.slice(0, 240)}`);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (content?.trim()) {
      return {
        raw: JSON.parse(content),
        usage: data.usage || null,
      };
    }
    emptyResponses.push(
      `${data?.choices?.[0]?.finish_reason || "unknown"} / ${data?.usage?.completion_tokens || 0} tokens`,
    );
  }

  throw new Error(`DeepSeek连续两次返回空内容（${emptyResponses.join("；")}）`);
}

function statusFromRequirement(requirement) {
  const relevance = Number(requirement.relevance_level);
  const evidence = Number(requirement.evidence_level);
  if (relevance >= 3 && evidence >= 2) {
    return { status: "direct", statusLabel: "有直接证据" };
  }
  if (relevance >= 2 && evidence <= 1) {
    return { status: "partial", statusLabel: "表达缺口" };
  }
  return { status: "unknown", statusLabel: "证据不足" };
}

function requirementScore(requirement) {
  const relevance = Number(requirement.relevance_level);
  const evidence = Number(requirement.evidence_level);
  const depth = Number(requirement.depth_level);
  const recency = requirement.recency_level;

  const parts = [];
  if (Number.isFinite(relevance)) parts.push([clamp((relevance / 4) * 100), 0.4]);
  if (Number.isFinite(evidence)) parts.push([clamp((evidence / 4) * 100), 0.35]);
  if (Number.isFinite(depth)) parts.push([clamp((depth / 4) * 100), 0.15]);
  if (recency !== null && Number.isFinite(Number(recency))) {
    parts.push([clamp((Number(recency) / 3) * 100), 0.1]);
  }

  if (!parts.length) return null;
  const totalWeight = parts.reduce((sum, [, weight]) => sum + weight, 0);
  return clamp(
    parts.reduce((sum, [score, weight]) => sum + score * weight, 0) / totalWeight,
  );
}

export function normalizeDeepSeekResult(raw) {
  const material = raw?.material_sufficiency || {};
  const requirements = Array.isArray(raw?.requirements) ? raw.requirements : [];
  const hardConditions = Array.isArray(raw?.hard_conditions) ? raw.hard_conditions : [];

  const grouped = new Map();
  const evidenceItems = [];

  requirements.forEach((requirement) => {
    const dimension = DIMENSIONS[requirement.dimension] ? requirement.dimension : "core_skills";
    const score = requirementScore(requirement);
    const importance = requirement.importance === "bonus" ? 0.5 : 1;
    if (score !== null) {
      if (!grouped.has(dimension)) grouped.set(dimension, []);
      grouped.get(dimension).push({ score, importance });
    }

    const status = statusFromRequirement(requirement);
    evidenceItems.push({
      ...status,
      label: requirement.label || "岗位要求",
      jobEvidence: requirement.jd_evidence || "",
      resumeEvidence: requirement.resume_evidence || "简历中未找到",
      relevanceLevel: Number(requirement.relevance_level),
      evidenceLevel: Number(requirement.evidence_level),
      depthLevel: Number(requirement.depth_level),
      explanation: requirement.explanation || "",
    });
  });

  const dimensions = Object.entries(DIMENSIONS).map(([key, spec]) => {
    const values = grouped.get(key) || [];
    if (!values.length) {
      return {
        key,
        name: spec.name,
        score: null,
        assessed: false,
        detail: "本次岗位要求未涉及该维度，未纳入综合参考分。",
      };
    }
    const weightSum = values.reduce((sum, item) => sum + item.importance, 0);
    const score = clamp(
      values.reduce((sum, item) => sum + item.score * item.importance, 0) / weightSum,
    );
    const evidenceCount = requirements.filter((item) => item.dimension === key).length;
    return {
      key,
      name: spec.name,
      score,
      assessed: true,
      detail: `该维度根据 ${evidenceCount} 条岗位要求计算，已找到的证据均来自简历原文。`,
    };
  });

  const assessedDimensions = dimensions.filter((item) => Number.isFinite(item.score));
  const dimensionWeightSum = assessedDimensions.reduce(
    (sum, item) => sum + DIMENSIONS[item.key].weight,
    0,
  );
  const overall =
    material.is_sufficient === false || !assessedDimensions.length || dimensionWeightSum === 0
      ? null
      : clamp(
          assessedDimensions.reduce(
            (sum, item) => sum + item.score * DIMENSIONS[item.key].weight,
            0,
          ) / dimensionWeightSum,
        );

  const constraints = hardConditions.map((item) => ({
    name: item.label || "岗位硬性条件",
    status: item.status === "met" ? "met" : item.status === "unmet" ? "unmet" : "unknown",
    label: item.status === "met" ? "已满足" : item.status === "unmet" ? "不满足" : "待确认",
    detail: item.explanation || item.resume_evidence || "简历中未提供足够信息。",
  }));

  if (!constraints.length) {
    constraints.push({
      name: "岗位硬性条件",
      status: "unknown",
      label: "未明确",
      detail: "岗位未识别到明确硬性条件，仍需人工核对。",
    });
  }

  const confidenceInputs = raw?.confidence_inputs || {};
  const unknownItems = Number(confidenceInputs.unknown_items || 0);
  const totalCore = Number(confidenceInputs.core_requirements_total || requirements.length);
  const unknownRatio = totalCore ? unknownItems / totalCore : 0;
  const confidence = overall === null ? "低" : unknownRatio <= 0.2 ? "高" : unknownRatio <= 0.5 ? "中" : "低";
  const fitLevel =
    overall === null
      ? "材料不足"
      : overall >= 82
        ? "较为匹配"
        : overall >= 65
          ? "部分匹配"
          : overall >= 45
            ? "证据偏弱"
            : "匹配不足";
  const suggestions = (raw?.suggestions || []).map((item) =>
    typeof item === "string"
      ? item
      : [item.target, item.action].filter(Boolean).join("：") || "补充真实经历证据。",
  );

  return {
    score: overall,
    fitLevel,
    confidence,
    summary: raw?.summary || "已完成岗位与简历的证据分析。",
    scoreExplanation:
      "参考分由逐条证据的相关度、证据强度、承担深度和经历时效计算，再按岗位维度加权形成。",
    notice:
      material.is_sufficient === false
        ? `暂不出总分：${(material.missing_dimensions || []).join("、") || material.reason || "材料不足"}。`
        : "",
    dimensions,
    evidenceItems,
    strengths: raw?.strengths || [],
    gaps: raw?.gaps || [],
    constraints,
    suggestions,
  };
}

function sendJson(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  response.end(body);
}

async function handleAnalyze(request, response) {
  if (!API_KEY) {
    sendJson(response, 503, {
      error: "DEEPSEEK_API_KEY尚未配置，请填写.env.local后重启本地服务。",
      code: "missing_api_key",
    });
    return;
  }

  try {
    const { resume, job } = await getJsonBody(request);
    if (typeof resume !== "string" || typeof job !== "string" || !resume.trim() || !job.trim()) {
      sendJson(response, 400, { error: "简历和岗位内容不能为空。" });
      return;
    }

    const normalizedResume = resume.trim();
    const normalizedJob = job.trim();
    const cacheKey = createHash("sha256")
      .update(`${MODEL}\n${normalizedResume}\n${normalizedJob}`)
      .digest("hex");

    if (analysisCache.has(cacheKey)) {
      const cached = analysisCache.get(cacheKey);
      sendJson(response, 200, {
        analysis: cached.analysis,
        model: MODEL_DISPLAY_NAME,
        modelAlias: MODEL,
        usage: cached.usage,
        cached: true,
      });
      return;
    }

    const { raw, usage } = await callDeepSeek(normalizedResume, normalizedJob);
    const analysis = normalizeDeepSeekResult(raw);
    if (analysisCache.size >= MAX_CACHE_ENTRIES) {
      analysisCache.delete(analysisCache.keys().next().value);
    }
    analysisCache.set(cacheKey, { analysis, usage });
    sendJson(response, 200, {
      analysis,
      model: MODEL_DISPLAY_NAME,
      modelAlias: MODEL,
      usage,
      cached: false,
    });
  } catch (error) {
    console.error("DeepSeek analysis failed:", error);
    sendJson(response, 502, {
      error: "DeepSeek分析失败，请检查模型、网络或API额度后重试。",
      detail: String(error.message || error).slice(0, 300),
    });
  }
}

async function serveStatic(request, response) {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const relativePath = pathname.replace(/^\/+/, "");
  const filePath = resolve(ROOT, normalize(relativePath));

  if (!filePath.startsWith(`${ROOT}${sep}`)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  const blockedSegments = ["赛事文件", "tmp", ".git", "node_modules"];
  const pathSegments = relativePath.split(/[\\/]+/);
  const blocked =
    pathSegments.some((segment) => blockedSegments.includes(segment)) ||
    pathSegments.includes("docx") ||
    pathSegments.includes("github") ||
    pathSegments.some((segment) => segment === ".env" || segment === ".env.local");

  if (blocked || !existsSync(filePath)) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }

  try {
    const content = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[extname(filePath).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    response.end(content);
  } catch {
    response.writeHead(500);
    response.end("Unable to read file");
  }
}

export function createApplicationServer() {
  return createServer(async (request, response) => {
    if (request.method === "GET" && request.url === "/api/status") {
      sendJson(response, 200, {
        configured: Boolean(API_KEY),
        model: MODEL_DISPLAY_NAME,
        modelAlias: MODEL,
        baseUrl: BASE_URL,
      });
      return;
    }

    if (request.method === "POST" && request.url === "/api/analyze") {
      await handleAnalyze(request, response);
      return;
    }

    if (request.method === "GET" || request.method === "HEAD") {
      await serveStatic(request, response);
      return;
    }

    response.writeHead(405);
    response.end("Method not allowed");
  });
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMain) {
  const server = createApplicationServer();
  server.listen(PORT, HOST, () => {
    console.log(`职引者本地服务：http://${HOST}:${PORT}`);
    console.log(`模型：${MODEL_DISPLAY_NAME}（API别名：${MODEL}）`);
    console.log(`API密钥：${API_KEY ? "已配置" : "未配置，将自动使用模拟结果"}`);
  });
}
