(function () {
  "use strict";

  const REQUEST_TIMEOUT = 75_000;
  const analysisCache = new Map();
  const rubricCache = new Map();
  const SCORING = window.AIJobAssistantScoring;
  const ANCHORED = window.AIJobAssistantAnchoredScoring;

  function remember(cache, key, value) {
    cache.delete(key);
    cache.set(key, value);
    if (cache.size > 20) cache.delete(cache.keys().next().value);
  }

  function getConfig() {
    return window.AIJobAssistantConfig || {};
  }

  function hasDirectConfig() {
    const config = getConfig();
    return Boolean(String(config.DEEPSEEK_API_KEY || "").trim());
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
    try {
      return JSON.parse(candidate);
    } catch {
      throw new Error("AI 返回内容格式异常，请重试。");
    }
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
    config,
    systemPrompt,
    userPrompt,
    maxTokens,
    normalize,
    signal,
  ) {
    const key = String(config.DEEPSEEK_API_KEY || "").trim();
    const baseUrl = String(
      config.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
    ).replace(/\/+$/, "");
    const model = String(config.DEEPSEEK_MODEL || "deepseek-flash");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        redirect: "error",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
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
        signal: AbortSignal.any([controller.signal, signal]),
      });

      if (!response.ok) {
        await response.body?.cancel();
        throw new Error("AI 诊断暂时不可用，请检查测试密钥和模型配置。");
      }
      const data = await response.json().catch(() => ({}));
      const choice = data?.choices?.[0];
      if (choice?.finish_reason !== "stop" || typeof choice.message?.content !== "string") {
        throw new Error("AI 未返回完整的分析内容，请重新生成。");
      }
      return {
        value: normalize(parseJsonContent(choice.message.content)),
        usage: data.usage || null,
      };
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new Error("诊断等待时间过长，请检查网络后重试。");
      }
      throw error;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async function getJobRubric(job, cacheKey, request) {
    if (rubricCache.has(cacheKey)) {
      return { value: rubricCache.get(cacheKey), usage: null, cached: true };
    }
    const result = await ANCHORED.createRubric(job, request);
    if (!result.value.unclassified.length) remember(rubricCache, cacheKey, result.value);
    return { ...result, cached: false };
  }

  function rubricCacheKey(config, job) {
    return JSON.stringify([
      ANCHORED.PROTOCOL_VERSION, ANCHORED.PROMPT_FINGERPRINT, ANCHORED.REDACTION_VERSION,
      config.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
      String(config.DEEPSEEK_MODEL || "deepseek-flash"), job,
    ]);
  }

  function anchoredRequest(config, signal) {
    return async (system, prompt) => {
      try {
        return await callDeepSeekJson(config, system, prompt, 3000, ANCHORED.validateRows, signal);
      } catch {
        signal.throwIfAborted();
        return null;
      }
    };
  }

  async function requestDirect(resume, job, options = {}) {
    const config = getConfig();
    if (location.protocol !== "file:" || !hasDirectConfig()) {
      throw new Error("测试直连尚未配置。");
    }

    if (typeof resume !== "string" || typeof job !== "string" ||
        resume.length > SCORING.MAX_INPUT_LENGTH || job.length > SCORING.MAX_INPUT_LENGTH) {
      throw new Error("简历和岗位内容各最多 20000 字符。");
    }
    resume = ANCHORED.redact(resume, { resume: true });
    job = ANCHORED.redact(job);
    if (!resume || !job) throw new Error("简历和岗位内容不能为空。");

    const onProgress =
      typeof options.onProgress === "function" ? options.onProgress : () => {};
    const displayName = String(
      config.DEEPSEEK_DISPLAY_NAME || "DeepSeek-V4.1-Flash-1017",
    );
    const rubricKey = rubricCacheKey(config, job);
    const cacheKey = JSON.stringify([rubricKey, resume]);
    if (!options.fresh && analysisCache.has(cacheKey)) {
      onProgress({ stage: "cache" });
      return { ...analysisCache.get(cacheKey), cached: true };
    }

    const request = anchoredRequest(config, AbortSignal.timeout(140_000));
    onProgress({ stage: "rubric" });
    const rubricResult = await getJobRubric(job, rubricKey, request);
    onProgress({ stage: "evidence" });
    const resumeResult = await ANCHORED.createEvidence(resume, rubricResult.value, request);
    onProgress({ stage: "scoring" });
    const result = {
      analysis: SCORING.buildAnalysis(rubricResult.value, resumeResult.value, resume),
      usage: mergeUsage(rubricResult.usage, resumeResult.usage),
      model: displayName,
      cached: false,
      rubricCached: rubricResult.cached,
      protocolVersion: ANCHORED.PROTOCOL_VERSION,
      promptFingerprint: ANCHORED.PROMPT_FINGERPRINT,
      createdAt: new Date().toISOString(),
    };
    if (result.analysis.analysisStatus !== "incomplete") remember(analysisCache, cacheKey, result);
    return result;
  }

  async function requestInterviewDirect(path, body) {
    if (!hasDirectConfig()) {
      throw new Error("面试需要本地 DeepSeek 配置。可运行 npm run configure-browser 从 .env.local 生成配置，然后重新打开本页。");
    }
    const { createInterview, evaluateInterview, isInterviewInputError } = window.AIJobAssistantInterviewCore;
    const config = getConfig();
    const operation = path === "start" ? createInterview : evaluateInterview;
    const signal = AbortSignal.timeout(85_000);
    const request = anchoredRequest(config, signal);
    try {
      return await operation(body, {
        async getRubric(job) {
          const { value } = await getJobRubric(job, rubricCacheKey(config, job), request);
          return { rubric: value };
        },
        async generate(prompt, input, maxTokens) {
          const { value } = await callDeepSeekJson(config, prompt, input, maxTokens, (raw) => raw, signal);
          return { raw: value };
        },
      });
    } catch (error) {
      if (isInterviewInputError(error)) throw error;
      throw new Error("暂时无法生成面试内容，请检查网络、DeepSeek 配置或模型额度后重试。");
    }
  }

  window.AIJobAssistantBrowserApi = {
    requestDirect,
    requestInterviewDirect,
    hasDirectConfig,
  };
})();
