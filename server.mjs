import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { readFile, realpath } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadLocalEnvironment } from "./env-loader.mjs";
import { createInterview, evaluateInterview, isInterviewInputError } from "./interview.mjs";
import { createSqliteStore } from "./storage/sqlite-store.mjs";
import {
  ANALYSIS_STAGES,
  encodeSseEvent,
} from "./progress-events.mjs";
import "./scoring-core.js";
import "./anchored-scoring.js";
import "./resume-chat-api.js";

const [STAGE_RUBRIC, STAGE_EVIDENCE, STAGE_SCORING] = ANALYSIS_STAGES;

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)));
const SCORING = globalThis.AIJobAssistantScoring;
const ANCHORED = globalThis.AIJobAssistantAnchoredScoring;
const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

const localEnvironment = isMain ? loadLocalEnvironment(join(ROOT, ".env.local")) : { loaded: false };
const useAnchors = process.env.SCORING_STRATEGY !== "v1.3";
const STRATEGY = useAnchors ? ANCHORED : SCORING;
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";
const API_KEY = process.env.DEEPSEEK_API_KEY || "";
const CHAT_API_KEY = process.env.DEEPSEEK_CHAT_API_KEY?.trim() || "";
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
const PERSIST_CACHE = process.env.CACHE_PERSIST === "1";
const ACTIVE_TTL_DAYS = PERSIST_CACHE ? CACHE_TTL_DAYS : 30 / (24 * 60);
const CACHE_MAX_AGE = ACTIVE_TTL_DAYS * 86_400_000;
const CACHE_LIMIT = 100;
const MAX_ACTIVE_ANALYSES = 8;
const store = createSqliteStore({ file: PERSIST_CACHE ? CACHE_DB : ":memory:" });
const pendingAnalyses = new Map();
const pendingRubrics = new Map();

function withDiskCache(operation) {
  if (PERSIST_CACHE) return operation(store);
  if (!existsSync(CACHE_DB)) return false;
  const legacyStore = createSqliteStore({ file: CACHE_DB });
  try {
    return operation(legacyStore);
  } finally {
    legacyStore.close();
  }
}

function hashText(value) {
  return createHash("sha256").update(String(value || "")).digest("hex");
}

function safeStore(operation, fallback = null) {
  try {
    return operation();
  } catch (error) {
    console.error("缓存读写失败：", error.code || error.name);
    return fallback;
  }
}

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".wasm": "application/wasm",
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

const OCR_ASSETS = new Map([
  ["/ocr-assets/tesseract.min.js", "tesseract.js/dist/tesseract.min.js"],
  ["/ocr-assets/worker.min.js", "tesseract.js/dist/worker.min.js"],
]);
for (const variant of ["lstm", "simd-lstm", "relaxedsimd-lstm"]) {
  const name = `tesseract-core-${variant}.wasm.js`;
  OCR_ASSETS.set(`/ocr-assets/core/${name}`, `tesseract.js-core/${name}`);
}
for (const lang of ["chi_sim", "eng"]) {
  const name = `${lang}.traineddata.gz`;
  OCR_ASSETS.set(`/ocr-assets/lang/${name}`, `@tesseract.js-data/${lang}/4.0.0_best_int/${name}`);
}

async function serveOcrAsset(request, response, pathname) {
  const asset = OCR_ASSETS.get(pathname);
  if (!asset) {
    response.writeHead(404).end();
    return;
  }
  try {
    const content = await readFile(join(ROOT, "node_modules", asset));
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[extname(asset)] || "application/octet-stream",
      "Content-Length": content.length,
    });
    response.end(request.method === "HEAD" ? undefined : content);
  } catch {
    response.writeHead(404).end();
  }
}

class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function getJsonBody(request, limit = 250_000) {
  return new Promise((resolvePromise, reject) => {
    const chunks = [];
    let bytes = 0;
    let oversized = false;
    request.on("data", (chunk) => {
      if (oversized) return;
      bytes += chunk.length;
      if (bytes > limit) {
        oversized = true;
        chunks.length = 0;
        reject(new RequestError(413, "请求内容过大。"));
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      if (oversized) return;
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
        resolvePromise(body);
      } catch {
        reject(new RequestError(400, "请求内容必须是合法的 JSON 对象。"));
      }
    });
    request.on("error", reject);
  });
}

function normalizeInputs(resume, job, anchored = useAnchors) {
  if (typeof resume !== "string" || typeof job !== "string") {
    throw new RequestError(400, "简历和岗位内容必须是文本。");
  }
  if (resume.length > SCORING.MAX_INPUT_LENGTH || job.length > SCORING.MAX_INPUT_LENGTH) {
    throw new RequestError(413, "简历和岗位内容各最多 20000 字符。");
  }
  const redact = anchored ? ANCHORED.redact : SCORING.redactPersonalText;
  const input = {
    resume: redact(resume, { resume: true }),
    job: redact(job),
  };
  if (!input.resume || !input.job) {
    throw new RequestError(400, "简历和岗位内容不能为空。");
  }
  return input;
}

async function readModelResponse(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) return JSON.parse(text + decoder.decode());
    bytes += value.byteLength;
    if (bytes > 512_000) {
      await reader.cancel();
      throw new Error("模型响应超出大小限制");
    }
    text += decoder.decode(value, { stream: true });
  }
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

async function callDeepSeekJson(systemPrompt, userPrompt, maxTokens, normalize, signal, maxAttempts = 2) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    signal.throwIfAborted();
    if (attempt) await delay(350, undefined, { signal });
    try {
      const response = await fetch(`${BASE_URL}/chat/completions`, {
        method: "POST",
        redirect: "error",
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
        signal: AbortSignal.any([signal, AbortSignal.timeout(45_000)]),
      });
      if (!response.ok) {
        await response.body?.cancel();
        if (response.status !== 408 && response.status !== 429 && response.status < 500) {
          throw new RequestError(502, "模型服务拒绝请求，请检查模型配置和 API 额度。");
        }
        continue;
      }
      const data = await readModelResponse(response);
      const choice = data?.choices?.[0];
      if (choice?.finish_reason !== "stop" || typeof choice.message?.content !== "string") continue;
      const raw = parseJsonContent(choice.message.content);
      return { value: normalize(raw), usage: data.usage || null };
    } catch (error) {
      signal.throwIfAborted();
      if (error instanceof RequestError) throw error;
    }
  }
  const error = new RequestError(502, "模型暂未返回完整且可用的结果，请重试。");
  error.code = "model_incomplete";
  throw error;
}

async function requestAnchored(system, prompt, signal) {
  try {
    return await callDeepSeekJson(system, prompt, 3000, ANCHORED.validateRows, signal, 1);
  } catch (error) {
    signal.throwIfAborted();
    if (error instanceof RequestError && error.code !== "model_incomplete") throw error;
    await delay(350, undefined, { signal });
    return null;
  }
}

function fetchRubric(job, signal) {
  if (useAnchors) return ANCHORED.createRubric(job, (system, prompt) => requestAnchored(system, prompt, signal));
  return callDeepSeekJson(
    SCORING.JOB_RUBRIC_SYSTEM_PROMPT,
    SCORING.buildJobRubricUserPrompt(job),
    3500,
    (raw) => SCORING.normalizeJobRubric(raw, job),
    signal,
  );
}

function getJobRubric(job, signal, cold) {
  if (cold) return fetchRubric(job, signal).then((result) => ({ ...result, cached: false }));
  const key = useAnchors
    ? hashText(JSON.stringify([ANCHORED.PROTOCOL_VERSION, ANCHORED.PROMPT_FINGERPRINT, ANCHORED.REDACTION_VERSION, BASE_URL, MODEL, job]))
    : hashText(SCORING.buildRubricCacheKeyInput({ model: MODEL, job }));
  const cached = safeStore(() => store.getRubric(key, CACHE_MAX_AGE));
  if (cached) return Promise.resolve({ value: cached, usage: null, cached: true });

  if (!pendingRubrics.has(key)) {
    const pending = fetchRubric(job, AbortSignal.timeout(90_000)).then((result) => {
      if (!result.value.unclassified?.length) {
        safeStore(() => {
          store.setRubric(key, result.value, { model: MODEL, protocolVersion: STRATEGY.PROTOCOL_VERSION });
          store.trim(CACHE_LIMIT);
        });
      }
      return { ...result, cached: false };
    }).finally(() => pendingRubrics.delete(key));
    pendingRubrics.set(key, pending);
  }
  const pending = pendingRubrics.get(key);
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    pending.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

async function createDeepSeekAnalysis(resume, job, onStage, signal, cold) {
  onStage(STAGE_RUBRIC);
  const started = performance.now();
  const { value: rubric, usage: rubricUsage, cached } = await getJobRubric(job, signal, cold);
  const rubricMs = Math.round(performance.now() - started);
  signal.throwIfAborted();
  onStage(STAGE_EVIDENCE);
  const evidenceStarted = performance.now();
  const resumeResult = useAnchors
    ? await ANCHORED.createEvidence(resume, rubric, (system, prompt) => requestAnchored(system, prompt, signal))
    : await callDeepSeekJson(
    SCORING.RESUME_EVIDENCE_SYSTEM_PROMPT,
    SCORING.buildResumeEvidenceUserPrompt(resume, rubric),
    7000,
    (raw) => SCORING.validateModelEvidence(raw, rubric, resume),
    signal,
  );
  signal.throwIfAborted();
  onStage(STAGE_SCORING);
  return {
    analysis: SCORING.buildAnalysis(rubric, resumeResult.value, resume),
    usage: mergeUsage(rubricUsage, resumeResult.usage),
    rubricCached: cached,
    stageMs: { rubric: rubricMs, evidence: Math.round(performance.now() - evidenceStarted) },
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
    "Cache-Control": "no-store",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  const heartbeat = setInterval(() => {
    response.write(": ping\n\n");
  }, 10_000);
  response.once("close", () => clearInterval(heartbeat));
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
  stageMs,
  deletionToken,
}) {
  return {
    analysis,
    model: MODEL_DISPLAY_NAME,
    modelAlias: MODEL,
    usage,
    cached,
    rubricCached,
    protocolVersion: STRATEGY.PROTOCOL_VERSION,
    promptFingerprint: STRATEGY.PROMPT_FINGERPRINT,
    stageMs,
    deletionToken,
    createdAt: createdAt || new Date().toISOString(),
  };
}

function anchoredKey({ resume, job }) {
  return hashText(JSON.stringify([
    ANCHORED.PROTOCOL_VERSION, ANCHORED.PROMPT_FINGERPRINT,
    ANCHORED.REDACTION_VERSION, BASE_URL, MODEL, resume, job,
  ]));
}

function legacyAnalysisKey(input, options = {}) {
  return hashText(SCORING.buildAnalysisCacheKeyInput({ model: MODEL, ...input, ...options }));
}

async function handleForget(request, response) {
  try {
    const original = await getJsonBody(request);
    if (Object.hasOwn(original, "token")) {
      if (typeof original.token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(original.token)) {
        throw new RequestError(400, "删除凭证格式无效。");
      }
      const deleteByToken = (cache, maxAge) => {
        const key = cache.resolveDeletionToken(hashText(original.token), maxAge);
        if (!key) return false;
        pendingAnalyses.get(key)?.controller.abort();
        return cache.deleteAnalysis(key);
      };
      const deleted = deleteByToken(store, CACHE_MAX_AGE) ||
        (!PERSIST_CACHE && withDiskCache((disk) => deleteByToken(disk, CACHE_TTL_DAYS * 86_400_000)));
      sendJson(response, 200, { deleted: Boolean(deleted) });
      return;
    }
    const input = normalizeInputs(original.resume, original.job, false);
    const key = legacyAnalysisKey(input);
    pendingAnalyses.get(key)?.controller.abort();
    const deleted = store.deleteAnalysis(key);
    const deletedDisk = withDiskCache((disk) => {
      const keys = [
        key,
        legacyAnalysisKey(original, { protocolVersion: "scorecard-v1.1", promptFingerprint: "6558b0c9" }),
        legacyAnalysisKey(original, { protocolVersion: "scorecard-v1.2", promptFingerprint: "4e8cb76b" }),
      ];
      return keys.map((entry) => disk.deleteAnalysis(entry)).some(Boolean);
    });
    sendJson(response, 200, { deleted: deleted || deletedDisk });
  } catch (error) {
    if (!response.destroyed) {
      if (error.status === 413) response.setHeader("Connection", "close");
      sendJson(response, error.status || 500, {
        error: error instanceof RequestError ? error.message : "未能确认本机缓存已删除，请重试。",
      });
    }
  }
}

function joinAnalysis(key, { resume, job }, onStage, response, cold) {
  let entry = pendingAnalyses.get(key);
  if (!entry || entry.controller.signal.aborted) {
    if (pendingAnalyses.size >= MAX_ACTIVE_ANALYSES || pendingRubrics.size >= MAX_ACTIVE_ANALYSES) {
      throw new RequestError(503, "分析请求较多，请稍后重试。");
    }
    const controller = new AbortController();
    const listeners = new Set();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(140_000)]);
    entry = { controller, listeners, stage: STAGE_RUBRIC };
    const running = entry;
    entry.promise = createDeepSeekAnalysis(resume, job, (stage) => {
      running.stage = stage;
      listeners.forEach((notify) => notify(stage));
    }, signal, cold).then((result) => {
      signal.throwIfAborted();
      if (!cold && result.analysis.analysisStatus !== "incomplete") {
        safeStore(() => {
          store.setAnalysis(key, result, { model: MODEL, protocolVersion: STRATEGY.PROTOCOL_VERSION });
          store.trim(CACHE_LIMIT);
        });
      }
      return result;
    }).finally(() => {
      if (pendingAnalyses.get(key) === running) pendingAnalyses.delete(key);
    });
    pendingAnalyses.set(key, entry);
  }

  entry.listeners.add(onStage);
  onStage(entry.stage);
  const detach = () => {
    entry.listeners.delete(onStage);
    if (!entry.listeners.size && pendingAnalyses.get(key) === entry) {
      entry.controller.abort();
    }
  };
  response.once("close", detach);
  return entry.promise.finally(() => {
    response.off("close", detach);
    detach();
  });
}

async function handleAnalyze(request, response) {
  let sse;
  try {
    const { resume, job, fresh, freshRubric, stream } = await getJsonBody(request);
    if (response.destroyed) return;
    const input = normalizeInputs(resume, job);
    const cold = freshRubric === true;
    const key = cold ? randomBytes(32).toString("hex") : useAnchors ? anchoredKey(input) : legacyAnalysisKey(input);
    const bypassCache = cold || fresh === true || fresh === 1 || fresh === "1";
    const cached = bypassCache ? null : safeStore(() => store.getAnalysis(key, CACHE_MAX_AGE));
    if (!cached && !API_KEY) {
      sendJson(response, 503, {
        error: "DEEPSEEK_API_KEY尚未配置，请填写.env.local后重启本地服务。",
        code: "missing_api_key",
      });
      return;
    }

    if (stream === true) sse = startSse(response);
    if (cached) sse?.send("stage", { stage: "cache" });
    const result = cached || await joinAnalysis(key, input, (stage) => sse?.send("stage", { stage }), response, cold);
    if (response.destroyed) return;
    let deletionToken;
    if (useAnchors && !cold && result.analysis.analysisStatus !== "incomplete") {
      const token = randomBytes(32).toString("base64url");
      if (safeStore(() => store.issueDeletionToken(key, hashText(token)), false)) deletionToken = token;
    }
    const payload = analysisResponse({ ...result, cached: Boolean(cached), deletionToken });
    if (sse) sse.send("done", { payload });
    else sendJson(response, 200, payload);
  } catch (error) {
    if (response.destroyed) return;
    const payload = {
      error: error instanceof RequestError ? error.message : "分析中断或超时，请重试。",
    };
    if (sse) sse.send("error", payload);
    else {
      if (error.status === 413) response.setHeader("Connection", "close");
      sendJson(response, error.status || 502, payload);
    }
  } finally {
    sse?.close();
  }
}

const PUBLIC_FILES = new Set([
  "index.html", "report.html", "privacy.html", "hr-review-desk.html",
  "styles.css", "report.css", "hr-review-desk.css", "hr-review-desk.js",
  "config.example.js", "ocr.js", "pdf-extractor.js", "scoring-core.js",
  "anchored-scoring.js", "browser-api.js", "data/examples.js", "analysis-core.js", "app.js", "report.js",
  "auth.html", "history.html", "interview.html",
  "account.css", "lake-workspace.css", "report-theme.css", "interview.css",
  "auth.js", "history.js", "cloud.js", "interview.js", "interview-core.js", "interview-prompts.js",
  "background/zzu.png", "data/bac1.jpg", "data/bac2.jpg", "assets/resume-mascot.png", "vendor/supabase/supabase.js",
  "resume-mascot.css", "resume-mascot.js", "assets/resume-mascot-reading.png",
  "resume-chat.css", "resume-chat.js", "resume-chat-api.js", "resume-reminders.js",
]);

async function serveStatic(request, response) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url || "/", "http://localhost").pathname);
  } catch {
    response.writeHead(400).end();
    return;
  }
  if (pathname.startsWith("/ocr-assets/")) {
    await serveOcrAsset(request, response, pathname);
    return;
  }
  const relativePath = pathname === "/" ? "index.html" : pathname.slice(1);
  const pdfAsset = /^vendor\/pdfjs\/(?:pdf(?:\.worker)?\.min\.js|(?:cmaps|standard_fonts)\/[\w.-]+\.(?:bcmap|ttf|pfb))$/i.test(relativePath);
  if (!PUBLIC_FILES.has(relativePath) && !pdfAsset) {
    response.writeHead(404).end();
    return;
  }

  try {
    const filePath = await realpath(join(ROOT, relativePath));
    if (!filePath.startsWith(ROOT + sep)) {
      response.writeHead(404).end();
      return;
    }
    const content = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[extname(filePath).toLowerCase()] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      "Content-Length": content.length,
      "Cache-Control": "no-cache",
    });
    response.end(request.method === "HEAD" ? undefined : content);
  } catch {
    response.writeHead(404).end();
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
      async getRubric(job) {
        const { value } = await getJobRubric(job, signal);
        return { rubric: value };
      },
      async generate(prompt, input, maxTokens) {
        const { value } = await callDeepSeekJson(prompt, input, maxTokens, (raw) => raw, signal);
        return { raw: value };
      },
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

async function handleResumeChat(request, response) {
  const { requestReply, ChatError } = globalThis.AIJobAssistantResumeChat;
  try {
    const { messages } = await getJsonBody(request, 100_000);
    const reply = await requestReply(CHAT_API_KEY, messages);
    sendJson(response, 200, { reply });
  } catch (error) {
    if (error instanceof RequestError || error instanceof ChatError) {
      sendJson(response, error.status, { error: error.message });
    } else {
      sendJson(response, 502, { error: "聊天暂时不可用，请重试。" });
    }
  }
}

export function createApplicationServer() {
  const purge = () => {
    safeStore(() => store.purgeOlderThan(ACTIVE_TTL_DAYS));
    if (!PERSIST_CACHE) safeStore(() => withDiskCache((disk) => disk.purgeOlderThan(CACHE_TTL_DAYS)));
  };
  purge();
  const timer = setInterval(purge, 60_000);
  timer.unref();

  const server = createServer({ requestTimeout: 20_000, headersTimeout: 10_000 }, async (request, response) => {
    if (request.method === "GET" && request.url === "/api/status") {
      sendJson(response, 200, {
        configured: Boolean(API_KEY),
        configSource: localEnvironment.loaded ? ".env.local" : "process environment",
        model: MODEL_DISPLAY_NAME,
        modelAlias: MODEL,
        protocolVersion: STRATEGY.PROTOCOL_VERSION,
        promptFingerprint: STRATEGY.PROMPT_FINGERPRINT,
        evaluationModes: ["cold", "fixed", "cached"],
        storage: PERSIST_CACHE ? "sqlite" : "memory",
        activeCacheTtlMinutes: ACTIVE_TTL_DAYS * 24 * 60,
        cacheTtlDays: CACHE_TTL_DAYS,
      });
      return;
    }

    if (request.method === "POST" && ["/api/analyze", "/api/forget", "/api/interview/start", "/api/interview/feedback", "/api/resume-chat"].includes(request.url)) {
      const origin = request.headers.origin;
      const host = request.headers.host;
      if (request.headers["sec-fetch-site"] === "cross-site" ||
          (origin && origin !== "http://" + host && origin !== "https://" + host)) {
        sendJson(response, 403, { error: "不允许跨站提交诊断数据。" });
        return;
      }
      if (!/^application\/json(?:\s*;|$)/i.test(request.headers["content-type"] || "")) {
        sendJson(response, 415, { error: "请使用 application/json 提交数据。" });
        return;
      }
    }

    if (request.method === "POST" && request.url === "/api/analyze") {
      await handleAnalyze(request, response);
      return;
    }

    if (request.method === "POST" && request.url === "/api/resume-chat") {
      await handleResumeChat(request, response);
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
    clearInterval(timer);
    safeStore(() => store.close());
  });
  return server;
}

if (isMain) {
  const openInBrowser = process.platform === "win32" && process.argv.includes("--open");
  if (openInBrowser && [...OCR_ASSETS.values()].some((asset) => !existsSync(join(ROOT, "node_modules", asset)))) {
    console.error("缺少扫描件识别依赖。请在项目目录运行 npm ci --ignore-scripts --cache .\\tmp\\npm-cache 后重试。");
    process.exit(1);
  }

  const listenHost = openInBrowser ? "127.0.0.1" : HOST;
  const server = createApplicationServer();
  if (openInBrowser) {
    server.on("error", (error) => {
      console.error(error.code === "EADDRINUSE"
        ? `本地端口 ${PORT} 已被占用。请关闭旧服务窗口，或在 .env.local 中换一个 PORT 后重试。`
        : `本地服务启动失败：${error.message}`);
      process.exitCode = 1;
    });
  }
  server.listen(PORT, listenHost, () => {
    const url = `http://${listenHost}:${server.address().port}`;
    console.log(`职引者本地服务：${url}`);
    console.log(`模型：${MODEL_DISPLAY_NAME}（API别名：${MODEL}）`);
    console.log(`评分协议：${STRATEGY.PROTOCOL_VERSION}`);
    console.log(
      `API密钥：${API_KEY ? "已配置" : "未配置，网页可进行离线检查"}（${
        localEnvironment.loaded ? ".env.local" : "进程环境变量"
      }）`,
    );
    if (openInBrowser) {
      const browser = spawn("rundll32.exe", ["url.dll,FileProtocolHandler", url], {
        stdio: "ignore",
        windowsHide: true,
      });
      browser.on("error", () => console.error(`请在浏览器中手动打开 ${url}`));
    }
  });
}
