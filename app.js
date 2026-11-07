(function () {
  "use strict";

  const INPUT_KEY = "aijob:input:v1";
  const DIAGNOSIS_KEY = "aijob:diagnosis:v1";
  const resumeInput = document.querySelector("#resumeText");
  const jobInput = document.querySelector("#jobText");
  const resumeCount = document.querySelector("#resumeCount");
  const jobCount = document.querySelector("#jobCount");
  const resumeCard = document.querySelector("#resumeText").closest(".input-card");
  const resumePdf = document.querySelector("#resumePdf");
  const pdfDropzone = document.querySelector("#pdfDropzone");
  const pdfFileCard = document.querySelector("#pdfFileCard");
  const pdfFileName = document.querySelector("#pdfFileName");
  const pdfFileMeta = document.querySelector("#pdfFileMeta");
  const removePdfButton = document.querySelector("#removePdfButton");
  const usePasteButton = document.querySelector("#usePasteButton");
  const analyzeButton = document.querySelector("#analyzeButton");
  const formMessage = document.querySelector("#formMessage");
  const modeTitle = document.querySelector("#modeTitle");
  const modeDescription = document.querySelector("#modeDescription");
  const freshToggle = document.querySelector("#freshToggle");
  const consentCheckbox = document.querySelector("#consentCheckbox");
  const analysisProgress = document.querySelector("#analysisProgress");
  const progressTitle = document.querySelector("#progressTitle");
  const progressElapsed = document.querySelector("#progressElapsed");
  const progressNote = document.querySelector("#progressNote");
  const progressSteps = Array.from(
    document.querySelectorAll("#progressSteps li"),
  );
  const retryButton = document.querySelector("#retryButton");
  const STAGE_ORDER = ["request", "rubric", "evidence", "scoring", "done"];
  let selectedPdf = null;
  let lastPastedResume = "";
  let progressTimer = null;
  let progressStartedAt = 0;

  function setMessage(message, tone = "error") {
    formMessage.textContent = message;
    formMessage.classList.toggle("is-success", tone === "success");
    formMessage.classList.toggle("is-info", tone === "info");
  }

  function setProgressStage(stage) {
    const active = STAGE_ORDER.indexOf(stage);
    progressSteps.forEach((item, index) => {
      item.classList.toggle("is-done", index < active);
      item.classList.toggle("is-active", index === active);
      item.classList.remove("is-error");
    });
  }

  function startProgress() {
    window.clearInterval(progressTimer);
    analysisProgress.hidden = false;
    analysisProgress.classList.remove("is-error");
    progressTitle.textContent = "正在分析简历与岗位";
    progressNote.textContent = "";
    retryButton.hidden = true;
    progressStartedAt = Date.now();
    progressElapsed.textContent = "0.0 秒";
    progressTimer = window.setInterval(() => {
      const seconds = (Date.now() - progressStartedAt) / 1000;
      progressElapsed.textContent = `${seconds.toFixed(1)} 秒`;
    }, 100);
    setProgressStage("request");
  }

  function stopProgressTimer() {
    window.clearInterval(progressTimer);
    progressTimer = null;
    const seconds = (Date.now() - progressStartedAt) / 1000;
    progressElapsed.textContent = `${seconds.toFixed(1)} 秒`;
  }

  function finishProgress(note) {
    stopProgressTimer();
    progressSteps.forEach((item) => {
      item.classList.add("is-done");
      item.classList.remove("is-active", "is-error");
    });
    progressTitle.textContent = "分析完成，正在打开报告";
    progressNote.textContent = note || "";
  }

  function failProgress(message) {
    stopProgressTimer();
    analysisProgress.classList.add("is-error");
    progressTitle.textContent = "分析失败";
    progressSteps.forEach((item) => {
      if (item.classList.contains("is-active")) {
        item.classList.add("is-error");
      }
      item.classList.remove("is-active");
    });
    progressNote.textContent = message;
    retryButton.hidden = false;
  }

  function handleProgressEvent(data) {
    if (!data || typeof data.stage !== "string") return;
    if (data.stage === "cache") {
      stopProgressTimer();
      progressSteps.forEach((item) => {
        item.classList.add("is-done");
        item.classList.remove("is-active");
      });
      progressNote.textContent =
        "命中历史缓存：相同简历和岗位复用了上次结果，本次没有再次调用模型。";
      return;
    }
    if (STAGE_ORDER.includes(data.stage)) {
      setProgressStage(data.stage);
      progressNote.textContent = "";
    }
  }

  function updateCount(input, target) {
    target.textContent = `${input.value.trim().length} 字`;
  }

  function showPasteInput() {
    resumeCard.classList.remove("has-pdf");
    pdfFileCard.hidden = true;
    pdfDropzone.hidden = false;
  }

  function showPdfInput() {
    resumeCard.classList.add("has-pdf");
    pdfFileCard.hidden = false;
    pdfDropzone.hidden = true;
  }

  function clearPdf({ showPaste = true } = {}) {
    selectedPdf = null;
    resumePdf.value = "";
    showPasteInput();
    if (showPaste) {
      resumeInput.value = lastPastedResume;
      updateCount(resumeInput, resumeCount);
    }
  }

  async function preparePdf(file) {
    if (!file) {
      return;
    }

    const current = {
      file,
      text: "",
      pageCount: 0,
      pending: null,
    };
    selectedPdf = current;
    lastPastedResume = resumeInput.value;
    pdfFileName.textContent = file.name;
    pdfFileMeta.textContent = "正在准备，可随时开始诊断";
    showPdfInput();
    pdfDropzone.classList.add("is-busy");
    setMessage("", "info");

    current.pending = window.AIJobAssistantPdf
      .extractPdfText(file)
      .then((result) => {
        if (selectedPdf !== current) {
          return;
        }
        current.text = result.text;
        current.pageCount = result.pageCount;
        pdfFileMeta.textContent = `${result.pageCount} 页 · 已准备好生成诊断`;
      })
      .catch((error) => {
        if (selectedPdf !== current) {
          return;
        }
        clearPdf({ showPaste: true });
        setMessage(error.message || "PDF 暂时无法读取，请重试。");
      })
      .finally(() => {
        pdfDropzone.classList.remove("is-busy");
      });

    await current.pending;
  }

  function fillExample(type) {
    if (type === "resume") {
      clearPdf({ showPaste: false });
      resumeInput.value = window.AIJobAssistantExamples.resume;
      lastPastedResume = resumeInput.value;
      updateCount(resumeInput, resumeCount);
      setMessage("", "info");
      return;
    }
    jobInput.value = window.AIJobAssistantExamples.job;
    updateCount(jobInput, jobCount);
    setMessage("", "info");
  }

  function getFirstLine(text, fallback) {
    return (
      text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find(Boolean)
        ?.slice(0, 48) || fallback
    );
  }

  function createMeta(resume, job, source, model, fallbackReason = "") {
    const now = new Date();
    return {
      source,
      model,
      fallbackReason,
      jobTitle: getFirstLine(job, "目标岗位诊断"),
      candidateLine: getFirstLine(resume, "求职者"),
      createdAt: now.toLocaleString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }),
    };
  }

  async function readAnalysisStream(response, onProgress) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let payload = null;
    let streamError = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let boundary = buffer.indexOf("\n\n");
      while (boundary >= 0) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf("\n\n");

        if (!frame.trim() || frame.startsWith(":")) continue;
        let event = "message";
        const dataLines = [];
        frame.split("\n").forEach((line) => {
          if (line.startsWith("event:")) {
            event = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            dataLines.push(line.slice(5).trim());
          }
        });
        if (!dataLines.length) continue;

        let data;
        try {
          data = JSON.parse(dataLines.join("\n"));
        } catch {
          continue;
        }
        if (event === "stage") {
          if (typeof onProgress === "function") onProgress(data);
        } else if (event === "error") {
          streamError = data;
        } else if (event === "done") {
          payload = data.payload;
        }
      }
    }

    if (streamError) {
      const error = new Error(streamError.error || "分析失败，请重试。");
      error.code = streamError.code;
      error.detail = streamError.detail;
      throw error;
    }
    if (!payload) {
      throw new Error("分析连接中断，请重试。");
    }
    return payload;
  }

  async function requestDeepSeek(resume, job, options = {}) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 150_000);

    try {
      const streamDisabled =
        new URLSearchParams(window.location.search).get("stream") === "0";
      const onProgress =
        !streamDisabled && typeof options.onProgress === "function"
          ? options.onProgress
          : null;
      const body = { resume, job };
      if (options.fresh) body.fresh = true;
      if (onProgress) body.stream = true;

      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const contentType = response.headers.get("content-type") || "";
      let data;
      if (contentType.includes("text/event-stream")) {
        data = await readAnalysisStream(response, onProgress || (() => {}));
      } else {
        data = await response.json().catch(() => ({}));
      }

      if (!response.ok) {
        const error = new Error(
          data.error || `DeepSeek接口返回${response.status}`,
        );
        error.code = data.code;
        error.detail = data.detail;
        throw error;
      }
      if (!data.analysis) {
        throw new Error("DeepSeek返回结果缺少分析内容");
      }

      return {
        analysis: data.analysis,
        meta: {
          ...createMeta(resume, job, "deepseek", data.model || "deepseek-flash"),
          cached: Boolean(data.cached),
          rubricCached: Boolean(data.rubricCached),
          usage: data.usage || null,
          protocolVersion: data.protocolVersion || null,
          promptFingerprint: data.promptFingerprint || null,
          generatedAt: data.createdAt || null,
        },
      };
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new Error("分析等待时间过长，请重试。");
      }
      throw error;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async function requestBrowserDeepSeek(resume, job, options = {}) {
    const result = await window.AIJobAssistantBrowserApi.requestDirect(
      resume,
      job,
      options,
    );
    return {
      analysis: result.analysis,
      meta: {
        ...createMeta(resume, job, "deepseek", result.model),
        cached: Boolean(result.cached),
        rubricCached: Boolean(result.rubricCached),
        usage: result.usage || null,
        protocolVersion: result.protocolVersion || null,
        promptFingerprint: result.promptFingerprint || null,
        generatedAt: result.createdAt || null,
      },
    };
  }

  function buildDemoResult(resume, job, fallbackReason) {
    return {
      analysis: window.AIJobAssistantCore.buildMockAnalysis(resume, job),
      meta: createMeta(resume, job, "mock", "本地模拟", fallbackReason),
    };
  }

  async function analyzeResumeText(resume, job, options = {}) {
    const isWeb = location.protocol === "http:" || location.protocol === "https:";
    const canConnectDirectly = window.AIJobAssistantBrowserApi.hasDirectConfig();

    if (isWeb) {
      try {
        return await requestDeepSeek(resume, job, options);
      } catch (serverError) {
        if (serverError.code === "missing_api_key") {
          await new Promise((resolve) => window.setTimeout(resolve, 650));
          return buildDemoResult(resume, job, "未配置 DeepSeek 密钥");
        }
        if (!canConnectDirectly) throw serverError;
        console.warn("本地服务不可用，切换浏览器测试直连：", serverError);
      }
    }

    if (canConnectDirectly) {
      return requestBrowserDeepSeek(resume, job, options);
    }

    await new Promise((resolve) => window.setTimeout(resolve, 650));
    return buildDemoResult(resume, job, "未配置测试密钥");
  }

  function validate(resume, job) {
    if (!resume) {
      setMessage("请先上传 PDF 简历，或点击“加载示例简历”。");
      resumePdf.focus();
      return false;
    }
    if (resume.length < 30) {
      setMessage("简历内容过短，请上传信息完整的 PDF，或补充一段真实经历。");
      return false;
    }
    if (!job) {
      setMessage("请先粘贴岗位招聘要求，或点击“加载示例岗位”。");
      jobInput.focus();
      return false;
    }
    if (job.length < 30) {
      setMessage("岗位信息过短，请补充具体职责和任职要求。");
      jobInput.focus();
      return false;
    }
    return true;
  }

  function resetAnalyzeButton() {
    analyzeButton.disabled = false;
    analyzeButton.classList.remove("is-loading");
    analyzeButton.querySelector(".button-label").textContent = "生成求职诊断报告";
  }

  async function handleAnalyze() {
    setMessage("", "info");
    const selectedPdfAtStart = selectedPdf;
    if (selectedPdfAtStart?.pending) {
      await selectedPdfAtStart.pending;
    }
    if (selectedPdfAtStart && !selectedPdf) {
      return;
    }

    const resume = selectedPdf?.text || resumeInput.value.trim();
    const job = jobInput.value.trim();
    if (!validate(resume, job)) {
      return;
    }
    if (!consentCheckbox?.checked) {
      setMessage("请先阅读并勾选同意《隐私与数据说明》，再开始诊断。");
      consentCheckbox?.focus();
      return;
    }

    analyzeButton.disabled = true;
    analyzeButton.classList.add("is-loading");
    analyzeButton.querySelector(".button-label").textContent = "正在生成求职诊断";
    startProgress();

    try {
      const result = await analyzeResumeText(resume, job, {
        fresh: Boolean(freshToggle?.checked),
        onProgress: handleProgressEvent,
      });
      sessionStorage.setItem(INPUT_KEY, JSON.stringify({ resume, job }));
      sessionStorage.setItem(
        DIAGNOSIS_KEY,
        JSON.stringify({
          input: { resume, job },
          analysis: result.analysis,
          meta: result.meta,
        }),
      );
      finishProgress(
        result.meta?.cached
          ? "命中历史缓存：复用了上次的相同结果，本次没有再次调用模型。"
          : "分析完成，正在打开诊断报告。",
      );
      await new Promise((resolve) => window.setTimeout(resolve, 450));
      const requestedTab = new URLSearchParams(window.location.search).get("tab");
      window.location.assign(
        requestedTab
          ? `./report.html?tab=${encodeURIComponent(requestedTab)}`
          : "./report.html",
      );
    } catch (error) {
      console.error(error);
      const message =
        error.message || "诊断报告生成失败，请重试或检查网络是否正常。";
      setMessage(message);
      failProgress(message);
      resetAnalyzeButton();
    }
  }

  function restoreInputs() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(INPUT_KEY) || "null");
      if (saved?.resume && saved?.job) {
        resumeInput.value = saved.resume;
        jobInput.value = saved.job;
        lastPastedResume = saved.resume;
        updateCount(resumeInput, resumeCount);
        updateCount(jobInput, jobCount);
        setMessage("已恢复上次填写的简历和岗位，可以直接重新诊断。", "info");
        return;
      }
    } catch {
      // Ignore unavailable or invalid local state and use examples.
    }

    if (window.AIJobAssistantExamples) {
      fillExample("resume");
      fillExample("job");
      setMessage("示例内容已填入，上传 PDF 可直接覆盖示例简历。", "info");
    }
  }

  function configureModeNote() {
    const directEnabled = window.AIJobAssistantBrowserApi.hasDirectConfig();
    if (location.protocol === "file:" && directEnabled) {
      modeTitle.textContent = "DeepSeek AI 求职诊断";
      modeDescription.textContent =
        "测试直连已启用，上传 PDF 并填写岗位后即可生成分析。";
      return;
    }
    if (location.protocol === "file:") {
      modeTitle.textContent = "求职诊断演示";
      modeDescription.textContent =
        "当前未启用测试直连，页面会展示模拟诊断结果。";
      return;
    }
    modeTitle.textContent = "DeepSeek AI 求职诊断";
    modeDescription.textContent =
      "通过本地服务完成分析，上传 PDF 并填写岗位后即可生成结果。";
  }

  resumeInput.addEventListener("input", () => {
    lastPastedResume = resumeInput.value;
    updateCount(resumeInput, resumeCount);
  });
  jobInput.addEventListener("input", () => updateCount(jobInput, jobCount));
  analyzeButton.addEventListener("click", handleAnalyze);
  retryButton.addEventListener("click", () => {
    retryButton.hidden = true;
    handleAnalyze();
  });
  resumePdf.addEventListener("change", () => {
    preparePdf(resumePdf.files?.[0]);
  });
  removePdfButton.addEventListener("click", () => {
    clearPdf({ showPaste: true });
    setMessage("已移除 PDF，可以重新上传或直接粘贴简历。", "info");
  });
  usePasteButton.addEventListener("click", () => {
    clearPdf({ showPaste: true });
    setMessage("已切换到文字输入，可以直接粘贴简历。", "info");
  });

  ["dragenter", "dragover"].forEach((eventName) => {
    pdfDropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      pdfDropzone.classList.add("is-dragging");
    });
  });
  ["dragleave", "drop"].forEach((eventName) => {
    pdfDropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      pdfDropzone.classList.remove("is-dragging");
    });
  });
  pdfDropzone.addEventListener("drop", (event) => {
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      preparePdf(file);
    }
  });

  document.querySelectorAll("[data-example]").forEach((button) => {
    button.addEventListener("click", () => fillExample(button.dataset.example));
  });

  configureModeNote();
  restoreInputs();

  const demoMode = new URLSearchParams(window.location.search).get("demo");
  if (demoMode === "short") {
    clearPdf({ showPaste: false });
    resumeInput.value =
      "张同学\n软件工程专业本科生，预计2027年毕业\n郑州大学 软件工程 本科\n主修课程：数据结构、数据库原理、Python程序设计、机器学习基础";
    lastPastedResume = resumeInput.value;
    updateCount(resumeInput, resumeCount);
    window.setTimeout(handleAnalyze, 250);
  } else if (demoMode === "1") {
    window.setTimeout(handleAnalyze, 250);
  }
})();
