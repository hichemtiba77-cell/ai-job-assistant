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
  let selectedPdf = null;
  let lastPastedResume = "";

  function setMessage(message, tone = "error") {
    formMessage.textContent = message;
    formMessage.classList.toggle("is-success", tone === "success");
    formMessage.classList.toggle("is-info", tone === "info");
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

  async function requestDeepSeek(resume, job) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 75_000);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resume, job }),
        signal: controller.signal,
      });
      const data = await response.json().catch(() => ({}));

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
        },
      };
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async function requestBrowserDeepSeek(resume, job) {
    const result = await window.AIJobAssistantBrowserApi.requestDirect(resume, job);
    return {
      analysis: result.analysis,
      meta: {
        ...createMeta(resume, job, "deepseek", result.model),
        cached: Boolean(result.cached),
        rubricCached: Boolean(result.rubricCached),
        usage: result.usage || null,
      },
    };
  }

  function buildDemoResult(resume, job, fallbackReason) {
    return {
      analysis: window.AIJobAssistantCore.buildMockAnalysis(resume, job),
      meta: createMeta(resume, job, "mock", "本地模拟", fallbackReason),
    };
  }

  async function analyzeResumeText(resume, job) {
    const isWeb = location.protocol === "http:" || location.protocol === "https:";
    const canConnectDirectly = window.AIJobAssistantBrowserApi.hasDirectConfig();

    if (isWeb) {
      try {
        return await requestDeepSeek(resume, job);
      } catch (serverError) {
        if (!canConnectDirectly) throw serverError;
        console.warn("本地服务不可用，切换浏览器测试直连：", serverError);
      }
    }

    if (canConnectDirectly) {
      return requestBrowserDeepSeek(resume, job);
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

    analyzeButton.disabled = true;
    analyzeButton.classList.add("is-loading");
    analyzeButton.querySelector(".button-label").textContent = "正在生成求职诊断";

    try {
      const result = await analyzeResumeText(resume, job);
      const payload = { input: { resume, job }, analysis: result.analysis, meta: result.meta };
      const inline = location.protocol === "file:";
      let saved = false;
      try {
        sessionStorage.setItem(INPUT_KEY, JSON.stringify(payload.input));
        sessionStorage.setItem(DIAGNOSIS_KEY, JSON.stringify(payload));
        saved = true;
      } catch (error) {
        if (!inline) throw error;
      }
      if (inline) {
        window.AIJobAssistantInterview.open(payload, { saved });
        resetAnalyzeButton();
        return;
      }
      const requestedTab = new URLSearchParams(window.location.search).get("tab");
      window.location.assign(
        requestedTab
          ? `./report.html?tab=${encodeURIComponent(requestedTab)}`
          : "./report.html",
      );
    } catch (error) {
      console.error(error);
      setMessage(
        error.message || "诊断报告生成失败，请重试或检查网络是否正常。",
      );
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
