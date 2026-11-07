(function () {
  "use strict";

  const REQUEST_TIMEOUT = 75_000;
  const analysisCache = new Map();
  const rubricCache = new Map();
  const SCORING = window.AIJobAssistantScoring;

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
        signal: controller.signal,
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = data?.error?.message || `接口返回 ${response.status}`;
        throw new Error(`AI 诊断暂时不可用：${String(detail).slice(0, 160)}`);
      }
      const content = data?.choices?.[0]?.message?.content;
      if (!content?.trim()) {
        throw new Error("AI 暂未返回分析内容，请重新生成。");
      }
      return {
        raw: parseJsonContent(content),
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

  async function getJobRubric(config, job) {
    const model = String(config.DEEPSEEK_MODEL || "deepseek-flash");
    const cacheKey = `${SCORING.PROTOCOL_VERSION}\n${model}\n${SCORING.canonicalizeText(job)}`;
    if (rubricCache.has(cacheKey)) {
      return {
        rubric: rubricCache.get(cacheKey),
        usage: null,
        cached: true,
      };
    }

    const result = await callDeepSeekJson(
      config,
      SCORING.JOB_RUBRIC_SYSTEM_PROMPT,
      SCORING.buildJobRubricUserPrompt(job),
      3500,
    );
    const rubric = SCORING.normalizeJobRubric(result.raw, job);
    rubricCache.set(cacheKey, rubric);
    return { rubric, usage: result.usage, cached: false };
  }

  async function requestDirect(resume, job) {
    const config = getConfig();
    if (!hasDirectConfig()) {
      throw new Error("测试直连尚未配置。");
    }

    const model = String(config.DEEPSEEK_MODEL || "deepseek-flash");
    const displayName = String(
      config.DEEPSEEK_DISPLAY_NAME || "DeepSeek-V4.1-Flash-1017",
    );
    const cacheKey = `${SCORING.PROTOCOL_VERSION}\n${model}\n${resume}\n${job}`;
    if (analysisCache.has(cacheKey)) {
      return { ...analysisCache.get(cacheKey), cached: true };
    }

    const rubricResult = await getJobRubric(config, job);
    const resumeResult = await callDeepSeekJson(
      config,
      SCORING.RESUME_EVIDENCE_SYSTEM_PROMPT,
      SCORING.buildResumeEvidenceUserPrompt(resume, rubricResult.rubric),
      7000,
    );
    const resumeData = SCORING.normalizeResumeEvidence(
      resumeResult.raw,
      rubricResult.rubric,
    );
    const result = {
      analysis: SCORING.buildAnalysis(
        rubricResult.rubric,
        resumeData,
        resume,
      ),
      usage: mergeUsage(rubricResult.usage, resumeResult.usage),
      model: displayName,
      cached: false,
      rubricCached: rubricResult.cached,
    };
    analysisCache.set(cacheKey, result);
    return result;
  }

  async function requestInterviewDirect(path, body) {
    if (!hasDirectConfig()) {
      throw new Error("面试需要本地 DeepSeek 配置。可运行 npm run configure-browser 从 .env.local 生成配置，然后重新打开本页。");
    }
    const { createInterview, evaluateInterview, isInterviewInputError } = window.AIJobAssistantInterviewCore;
    const config = getConfig();
    const operation = path === "start" ? createInterview : evaluateInterview;
    try {
      return await operation(body, {
        getRubric: (job) => getJobRubric(config, job),
        generate: (prompt, input, maxTokens) => callDeepSeekJson(config, prompt, input, maxTokens),
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
