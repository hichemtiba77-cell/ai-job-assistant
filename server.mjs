import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadLocalEnvironment } from "./env-loader.mjs";
import { createInterview, evaluateInterview, isInterviewInputError } from "./interview.mjs";
import "./scoring-core.js";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)));
const SCORING = globalThis.AIJobAssistantScoring;
const localEnvironment = loadLocalEnvironment(join(ROOT, ".env.local"));
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
const jobRubricCache = new Map();
const MAX_CACHE_ENTRIES = 50;

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

function parseJsonContent(content) {
  const cleaned = String(content || "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  const candidate =
    start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;
  return JSON.parse(candidate);
}

function mergeUsage(target, usage) {
  if (!usage) return target;
  return {
    prompt_tokens:
      (target?.prompt_tokens || 0) + (usage.prompt_tokens || 0),
    completion_tokens:
      (target?.completion_tokens || 0) + (usage.completion_tokens || 0),
    total_tokens: (target?.total_tokens || 0) + (usage.total_tokens || 0),
  };
}

async function callDeepSeekJson(systemPrompt, userPrompt, maxTokens, signal) {
  const failures = [];

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      signal,
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
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
        thinking: { type: "disabled" },
        stream: false,
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(
        `DeepSeek接口失败（${response.status}）：${detail.slice(0, 240)}`,
      );
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content?.trim()) {
      failures.push(
        `空内容 ${data?.choices?.[0]?.finish_reason || "unknown"}`,
      );
      continue;
    }

    try {
      return {
        raw: parseJsonContent(content),
        usage: data.usage || null,
      };
    } catch {
      failures.push(
        `JSON格式错误 ${data?.choices?.[0]?.finish_reason || "unknown"}`,
      );
    }
  }

  throw new Error(`DeepSeek连续两次未返回可用JSON（${failures.join("；")}）`);
}

async function getJobRubric(job, signal) {
  const key = createHash("sha256")
    .update(
      `${SCORING.PROTOCOL_VERSION}\n${MODEL}\n${SCORING.canonicalizeText(job)}`,
    )
    .digest("hex");
  if (jobRubricCache.has(key)) {
    return {
      rubric: jobRubricCache.get(key).rubric,
      usage: null,
      cached: true,
    };
  }

  const { raw, usage } = await callDeepSeekJson(
    SCORING.JOB_RUBRIC_SYSTEM_PROMPT,
    SCORING.buildJobRubricUserPrompt(job),
    3500,
    signal,
  );
  const rubric = SCORING.normalizeJobRubric(raw, job);
  if (jobRubricCache.size >= MAX_CACHE_ENTRIES) {
    jobRubricCache.delete(jobRubricCache.keys().next().value);
  }
  jobRubricCache.set(key, { rubric });
  return { rubric, usage, cached: false };
}

async function createDeepSeekAnalysis(resume, job) {
  const rubricResult = await getJobRubric(job);
  const resumeResult = await callDeepSeekJson(
    SCORING.RESUME_EVIDENCE_SYSTEM_PROMPT,
    SCORING.buildResumeEvidenceUserPrompt(resume, rubricResult.rubric),
    7000,
  );
  const resumeData = SCORING.normalizeResumeEvidence(
    resumeResult.raw,
    rubricResult.rubric,
  );
  return {
    rubric: rubricResult.rubric,
    resumeData,
    analysis: SCORING.buildAnalysis(
      rubricResult.rubric,
      resumeData,
      resume,
    ),
    usage: mergeUsage(rubricResult.usage, resumeResult.usage),
    rubricCached: rubricResult.cached,
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
      .update(
        `${SCORING.PROTOCOL_VERSION}\n${MODEL}\n${normalizedResume}\n${normalizedJob}`,
      )
      .digest("hex");

    if (analysisCache.has(cacheKey)) {
      const cached = analysisCache.get(cacheKey);
      sendJson(response, 200, {
        analysis: cached.analysis,
        model: MODEL_DISPLAY_NAME,
        modelAlias: MODEL,
        usage: cached.usage,
        cached: true,
        rubricCached: true,
      });
      return;
    }

    const { analysis, usage, rubricCached } = await createDeepSeekAnalysis(
      normalizedResume,
      normalizedJob,
    );
    if (analysisCache.size >= MAX_CACHE_ENTRIES) {
      analysisCache.delete(analysisCache.keys().next().value);
    }
    analysisCache.set(cacheKey, { analysis, usage, rubricCached });
    sendJson(response, 200, {
      analysis,
      model: MODEL_DISPLAY_NAME,
      modelAlias: MODEL,
      usage,
      cached: false,
      rubricCached,
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
  const normalizedSegments = pathSegments.map((segment) => segment.toLowerCase());
  const blocked =
    normalizedSegments.some((segment) => blockedSegments.includes(segment)) ||
    normalizedSegments.includes("docx") ||
    normalizedSegments.includes("github") ||
    normalizedSegments.some(
      (segment) =>
        segment === ".env" ||
        segment === ".env.local" ||
        segment === "config.local.js",
    );

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

async function handleInterview(request, response, operation) {
  if (!API_KEY) {
    sendJson(response, 503, { error: "模拟面试需要在 .env.local 中配置 DeepSeek API Key。" });
    return;
  }

  let body;
  try {
    body = await getJsonBody(request);
  } catch {
    sendJson(response, 400, { error: "无法读取面试请求，请重试。" });
    return;
  }

  const signal = AbortSignal.timeout(85_000);
  try {
    const result = await operation(body, {
      getRubric: (job) => getJobRubric(job, signal),
      generate: (prompt, input, maxTokens) => callDeepSeekJson(prompt, input, maxTokens, signal),
    });
    sendJson(response, 200, result);
  } catch (error) {
    if (isInterviewInputError(error)) {
      sendJson(response, 400, { error: error.message });
    } else if (signal.aborted) {
      sendJson(response, 504, { error: "面试请求等待时间过长，请重试。" });
    } else {
      sendJson(response, 502, { error: "暂时无法生成面试内容，请检查网络或模型额度后重试。" });
    }
  }
}

export function createApplicationServer() {
  return createServer(async (request, response) => {
    if (request.method === "GET" && request.url === "/api/status") {
      sendJson(response, 200, {
        configured: Boolean(API_KEY),
        configSource: localEnvironment.loaded ? ".env.local" : "process environment",
        model: MODEL_DISPLAY_NAME,
        modelAlias: MODEL,
        baseUrl: BASE_URL,
        protocolVersion: SCORING.PROTOCOL_VERSION,
      });
      return;
    }

    if (request.method === "POST" && request.url === "/api/analyze") {
      await handleAnalyze(request, response);
      return;
    }

    if (request.method === "POST" && request.url === "/api/interview/start") {
      await handleInterview(request, response, createInterview);
      return;
    }

    if (request.method === "POST" && request.url === "/api/interview/feedback") {
      await handleInterview(request, response, evaluateInterview);
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
    console.log(`评分协议：${SCORING.PROTOCOL_VERSION}`);
    console.log(
      `API密钥：${API_KEY ? "已配置" : "未配置，将自动使用模拟结果"}（${
        localEnvironment.loaded ? ".env.local" : "进程环境变量"
      }）`,
    );
  });
}
