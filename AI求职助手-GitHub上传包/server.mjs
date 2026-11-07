import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadLocalEnvironment } from "./env-loader.mjs";
import { createSqliteStore } from "./storage/sqlite-store.mjs";
import {
  ANALYSIS_STAGES,
  encodeSseEvent,
} from "./progress-events.mjs";

const [STAGE_RUBRIC, STAGE_EVIDENCE, STAGE_SCORING] = ANALYSIS_STAGES;
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
const CACHE_DB = process.env.CACHE_DB || join(ROOT, "data", "cache.db");
const requestedTtlDays = Number(process.env.CACHE_TTL_DAYS || 30);
const CACHE_TTL_DAYS =
  Number.isFinite(requestedTtlDays) && requestedTtlDays >= 0
    ? requestedTtlDays
    : 30;
const store = createSqliteStore({ file: CACHE_DB });

function hashText(value) {
  return createHash("sha256").update(String(value || "")).digest("hex");
}

function safeStore(operation, fallback = null) {
  try {
    return operation();
  } catch (error) {
    console.error("缓存读写失败：", error.message);
    return fallback;
  }
}

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

async function callDeepSeekJson(
  systemPrompt,
  userPrompt,
  maxTokens,
  stage = "unknown",
  cacheKey = null,
) {
  const failures = [];

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let response;
    try {
      response = await fetch(`${BASE_URL}/chat/completions`, {
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
          max_tokens: maxTokens,
          response_format: { type: "json_object" },
          thinking: { type: "disabled" },
          stream: false,
        }),
        signal: AbortSignal.timeout(120_000),
      });
    } catch (error) {
      failures.push(`请求超时或网络错误 ${error.name || ""}`.trim());
      continue;
    }

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

    let raw;
    try {
      raw = parseJsonContent(content);
    } catch {
      failures.push(
        `JSON格式错误 ${data?.choices?.[0]?.finish_reason || "unknown"}`,
      );
      continue;
    }

    try {
      store.logRun({
        cacheKey,
        stage,
        model: MODEL,
        requestHash: hashText(`${systemPrompt}\n${userPrompt}`),
        rawResponse:
          process.env.LOG_RAW_RESPONSES === "1" ? content : null,
        usage: data.usage || null,
      });
    } catch (error) {
      console.error("调用日志写入失败：", error.message);
    }

    return {
      raw,
      usage: data.usage || null,
    };
  }

  throw new Error(`DeepSeek连续两次未返回可用JSON（${failures.join("；")}）`);
}

async function getJobRubric(job) {
  const key = hashText(
    SCORING.buildRubricCacheKeyInput({ model: MODEL, job }),
  );
  const cachedRubric = safeStore(() => store.getRubric(key));
  if (cachedRubric) {
    safeStore(() => store.recordHit("rubric", key));
    return {
      rubric: cachedRubric,
      usage: null,
      cached: true,
    };
  }

  const { raw, usage } = await callDeepSeekJson(
    SCORING.JOB_RUBRIC_SYSTEM_PROMPT,
    SCORING.buildJobRubricUserPrompt(job),
    3500,
    "job_rubric",
  );
  const rubric = SCORING.normalizeJobRubric(raw, job);
  safeStore(() =>
    store.setRubric(key, rubric, {
      model: MODEL,
      protocolVersion: SCORING.PROTOCOL_VERSION,
      promptFingerprint: SCORING.PROMPT_FINGERPRINT,
      jobHash: hashText(SCORING.canonicalizeText(job)),
    }),
  );
  return { rubric, usage, cached: false };
}

async function createDeepSeekAnalysis(
  resume,
  job,
  onStage = () => {},
  cacheKey = null,
) {
  onStage(STAGE_RUBRIC);
  const rubricResult = await getJobRubric(job);
  onStage(STAGE_EVIDENCE);
  const resumeResult = await callDeepSeekJson(
    SCORING.RESUME_EVIDENCE_SYSTEM_PROMPT,
    SCORING.buildResumeEvidenceUserPrompt(resume, rubricResult.rubric),
    7000,
    "resume_evidence",
    cacheKey,
  );
  const resumeData = SCORING.normalizeResumeEvidence(
    resumeResult.raw,
    rubricResult.rubric,
  );
  onStage(STAGE_SCORING);
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

function startSse(response) {
  response.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  const heartbeat = setInterval(() => {
    response.write(": ping\n\n");
  }, 10_000);
  return {
    send(event, payload) {
      response.write(encodeSseEvent(event, payload));
    },
    close() {
      clearInterval(heartbeat);
      response.end();
    },
  };
}

function analysisResponse({
  analysis,
  usage,
  cached,
  rubricCached,
  createdAt,
}) {
  return {
    analysis,
    model: MODEL_DISPLAY_NAME,
    modelAlias: MODEL,
    usage,
    cached,
    rubricCached,
    protocolVersion: SCORING.PROTOCOL_VERSION,
    promptFingerprint: SCORING.PROMPT_FINGERPRINT,
    createdAt: createdAt || new Date().toISOString(),
  };
}

async function handleForget(request, response) {
  try {
    const { resume, job } = await getJsonBody(request, 50_000);
    if (
      typeof resume !== "string" ||
      typeof job !== "string" ||
      !resume.trim() ||
      !job.trim()
    ) {
      sendJson(response, 400, {
        error: "需要提供简历和岗位原文才能定位并删除对应记录。",
      });
      return;
    }

    const cacheKey = hashText(
      SCORING.buildAnalysisCacheKeyInput({ model: MODEL, resume, job }),
    );
    const deleted = safeStore(() => store.deleteAnalysis(cacheKey), false);
    sendJson(response, 200, { deleted: Boolean(deleted) });
  } catch (error) {
    sendJson(response, 400, {
      error: "删除请求无法处理。",
      detail: String(error.message || error).slice(0, 200),
    });
  }
}

async function handleAnalyze(request, response) {
  let sse = null;
  const fail = (status, payload) => {
    if (sse) {
      sse.send("error", payload);
      sse.close();
      sse = null;
      return;
    }
    sendJson(response, status, payload);
  };

  try {
    const { resume, job, fresh, stream } = await getJsonBody(request);

    if (typeof resume !== "string" || typeof job !== "string" || !resume.trim() || !job.trim()) {
      fail(400, { error: "简历和岗位内容不能为空。" });
      return;
    }
    if (!API_KEY) {
      fail(503, {
        error: "DEEPSEEK_API_KEY尚未配置，请填写.env.local后重启本地服务。",
        code: "missing_api_key",
      });
      return;
    }

    if (stream === true) {
      sse = startSse(response);
    }

    const normalizedResume = SCORING.canonicalizeText(resume);
    const normalizedJob = SCORING.canonicalizeText(job);
    const cacheKey = hashText(
      SCORING.buildAnalysisCacheKeyInput({ model: MODEL, resume, job }),
    );
    const bypassCache = fresh === true || fresh === 1 || fresh === "1";

    if (!bypassCache) {
      const cached = safeStore(() => store.getAnalysis(cacheKey));
      if (cached) {
        safeStore(() => store.recordHit("analysis", cacheKey));
        const payload = analysisResponse({ ...cached, cached: true });
        if (sse) {
          sse.send("stage", { stage: "cache" });
          sse.send("done", { payload });
          sse.close();
          sse = null;
        } else {
          sendJson(response, 200, payload);
        }
        return;
      }
    }

    const result = await createDeepSeekAnalysis(
      normalizedResume,
      normalizedJob,
      (stage) => {
        if (sse) sse.send("stage", { stage });
      },
      cacheKey,
    );
    safeStore(() =>
      store.setAnalysis(
        cacheKey,
        {
          analysis: result.analysis,
          usage: result.usage,
          rubricCached: result.rubricCached,
        },
        {
          model: MODEL,
          protocolVersion: SCORING.PROTOCOL_VERSION,
          promptFingerprint: SCORING.PROMPT_FINGERPRINT,
          resumeHash: hashText(normalizedResume),
          jobHash: hashText(normalizedJob),
        },
      ),
    );
    const payload = analysisResponse({ ...result, cached: false });
    if (sse) {
      sse.send("done", { payload });
      sse.close();
      sse = null;
    } else {
      sendJson(response, 200, payload);
    }
  } catch (error) {
    console.error("DeepSeek analysis failed:", error);
    fail(502, {
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
        segment === "config.local.js" ||
        segment.endsWith(".db") ||
        segment.endsWith(".db-wal") ||
        segment.endsWith(".db-shm") ||
        segment.endsWith(".sqlite") ||
        segment.endsWith(".sqlite-wal") ||
        segment.endsWith(".sqlite-shm"),
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

export function createApplicationServer() {
  const purged = safeStore(() => store.purgeOlderThan(CACHE_TTL_DAYS), 0);
  if (purged > 0) {
    console.log(
      `已清理 ${purged} 条超过 ${CACHE_TTL_DAYS} 天的分析缓存。`,
    );
  }

  const server = createServer(async (request, response) => {
    if (request.method === "GET" && request.url === "/api/status") {
      sendJson(response, 200, {
        configured: Boolean(API_KEY),
        configSource: localEnvironment.loaded ? ".env.local" : "process environment",
        model: MODEL_DISPLAY_NAME,
        modelAlias: MODEL,
        baseUrl: BASE_URL,
        protocolVersion: SCORING.PROTOCOL_VERSION,
        promptFingerprint: SCORING.PROMPT_FINGERPRINT,
        storage: "sqlite",
        cacheFile: CACHE_DB.replace(ROOT, ".").replace(/\\/g, "/"),
        cacheTtlDays: CACHE_TTL_DAYS,
      });
      return;
    }

    if (request.method === "POST" && request.url === "/api/analyze") {
      await handleAnalyze(request, response);
      return;
    }

    if (request.method === "POST" && request.url === "/api/forget") {
      await handleForget(request, response);
      return;
    }

    if (request.method === "GET" || request.method === "HEAD") {
      await serveStatic(request, response);
      return;
    }

    response.writeHead(405);
    response.end("Method not allowed");
  });

  server.on("close", () => {
    safeStore(() => store.close());
  });
  return server;
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
      `API密钥：${API_KEY ? "已配置" : "未配置，网页将回退到模拟结果"}（${
        localEnvironment.loaded ? ".env.local" : "进程环境变量"
      }）`,
    );
  });
}
