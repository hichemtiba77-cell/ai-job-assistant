(async function () {
  "use strict";

  const INPUT_KEY = "aijob:input:v1";
  const cloud = window.CareerCloud;
  const params = new URLSearchParams(location.search);
  if (cloud && params.get("account") === "1") {
    location.replace(cloud.loginUrl(cloud.safeNext(params.get("next"))));
    return;
  }
  const signedInUser = (await cloud?.requireSession())?.user;
  if (!signedInUser) return;
  window.ResumeMascotReminders?.start(signedInUser.id);
  let archive;
  let pendingSave;
  let restoredUpload;
  let previewContext;
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
  const replacePdfButton = document.querySelector("#replacePdfButton");
  const openPdfReview = document.querySelector("#openPdfReview");
  const pdfReview = document.querySelector("#pdfReview");
  const pdfPageNumber = document.querySelector("#pdfPageNumber");
  const pdfPageRotation = document.querySelector("#pdfPageRotation");
  const recognizePdfPage = document.querySelector("#recognizePdfPage");
  const restorePdfPage = document.querySelector("#restorePdfPage");
  const pdfPageStatus = document.querySelector("#pdfPageStatus");
  const pdfPageText = document.querySelector("#pdfPageText");
  const pdfReviewConfirm = document.querySelector("#pdfReviewConfirm");
  const pdfTextConfirmed = document.querySelector("#pdfTextConfirmed");
  const reviewControls = [pdfPageNumber, pdfPageRotation, pdfPageText, pdfTextConfirmed, recognizePdfPage, restorePdfPage];
  const usePasteButton = document.querySelector("#usePasteButton");
  const analyzeButton = document.querySelector("#analyzeButton");
  const formMessage = document.querySelector("#formMessage");
  const modeTitle = document.querySelector("#modeTitle");
  const modeDescription = document.querySelector("#modeDescription");
  const freshToggle = document.querySelector("#freshToggle");
  const privacyPreview = document.querySelector("#privacyPreview");
  const previewResume = document.querySelector("#previewResume");
  const previewJob = document.querySelector("#previewJob");
  const previewStatus = document.querySelector("#previewStatus");
  const offlineReviewButton = document.querySelector("#offlineReviewButton");
  const consentCheckbox = document.querySelector("#consentCheckbox");
  const resumeMascot = document.querySelector("#resumeMascot");
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
    window.ResumeMascotReminders?.setAnalysisProgress?.(stage);
  }

  function startProgress() {
    window.clearInterval(progressTimer);
    resumeMascot?.setAttribute("data-state", "working");
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
    resumeMascot?.setAttribute("data-state", "done");
    progressSteps.forEach((item) => {
      item.classList.add("is-done");
      item.classList.remove("is-active", "is-error");
    });
    progressTitle.textContent = "分析完成，正在打开报告";
    progressNote.textContent = note || "";
    window.ResumeMascotReminders?.setAnalysisProgress?.("done");
  }

  function failProgress(message) {
    stopProgressTimer();
    resumeMascot?.removeAttribute("data-state");
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
    window.ResumeMascotReminders?.setAnalysisProgress?.("failed");
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
      window.ResumeMascotReminders?.setAnalysisProgress?.("cache");
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
    selectedPdf?.controller.abort();
    selectedPdf = null;
    resumePdf.value = "";
    openPdfReview.hidden = true;
    togglePdfReview(false);
    pdfPageText.value = "";
    pdfDropzone.classList.remove("is-busy");
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

    selectedPdf?.controller.abort();
    const current = { file, controller: new AbortController(), pages: [], pending: null, needsReview: false };
    selectedPdf = current;
    lastPastedResume = resumeInput.value;
    pdfFileName.textContent = file.name;
    pdfFileMeta.textContent = "正在读取 PDF";
    pdfFileMeta.title = "";
    removePdfButton.textContent = "取消读取";
    openPdfReview.hidden = true;
    togglePdfReview(false);
    pdfPageText.value = "";
    pdfTextConfirmed.checked = false;
    pdfPageRotation.value = "0";
    reviewControls.forEach((control) => { control.disabled = false; });
    showPdfInput();
    pdfDropzone.classList.add("is-busy");
    setMessage("", "info");

    current.pending = window.AIJobAssistantPdf
      .extractPdfText(file, {
        signal: current.controller.signal,
        onProgress: ({ stage, pageNumber, pageCount }) => {
          if (selectedPdf !== current) return;
          const action = stage === "ocr" ? "正在识别" : "正在读取";
          pdfFileMeta.textContent = `${action}第 ${pageNumber}/${pageCount} 页`;
        },
      })
      .then((result) => {
        if (selectedPdf !== current) {
          return;
        }
        current.pages = result.pages;
        current.needsReview = current.pages.some((page) => page.source === "ocr" || page.error);
        pdfPageNumber.replaceChildren(...current.pages.map((page) => new Option(`第 ${page.pageNumber} 页`, page.pageNumber)));
        const firstReview = current.pages.find((page) => page.error || page.source === "ocr");
        if (firstReview) pdfPageNumber.value = firstReview.pageNumber;
        openPdfReview.hidden = false;
        togglePdfReview(current.needsReview);
        refreshPdfReview(current);
      })
      .catch((error) => {
        if (selectedPdf !== current) {
          return;
        }
        clearPdf({ showPaste: true });
        setMessage(error.message || "PDF 暂时无法读取，请重试。");
      })
      .finally(() => {
        current.pending = null;
        if (selectedPdf === current) {
          pdfDropzone.classList.remove("is-busy");
          removePdfButton.textContent = "移除";
        }
      });

    await current.pending;
  }

  function togglePdfReview(open) {
    pdfReview.hidden = !open;
    openPdfReview.setAttribute("aria-expanded", String(open));
    openPdfReview.textContent = open ? "收起提取文字" : "查看提取文字";
  }

  function getReviewPage(current) {
    return current.pages[Number(pdfPageNumber.value) - 1];
  }

  function refreshPdfReview(current) {
    const unresolved = current.pages.filter((page) => page.error && !page.edited);
    const status = unresolved.length
      ? `请核对第 ${unresolved.map((page) => page.pageNumber).join("、")} 页`
      : current.needsReview && !pdfTextConfirmed.checked ? "请确认识别文字" : "可生成诊断";
    pdfFileMeta.textContent = `${current.pages.length} 页 · ${status}`;
    pdfFileMeta.title = pdfFileMeta.textContent;
    pdfReviewConfirm.hidden = !current.needsReview;
    const page = getReviewPage(current);
    if (!page) return;
    if (pdfPageText.value !== page.text) pdfPageText.value = page.text;
    const source = page.edited ? "已手动编辑" : page.source === "ocr" ? "来自扫描识别" : "来自 PDF 文字层";
    const lowConfidence = !page.edited && page.source === "ocr" && page.confidence < 70;
    pdfPageStatus.textContent = page.error && !page.edited
      ? page.error
      : lowConfidence ? `${source}，部分文字可能不准确。` : source;
    restorePdfPage.hidden = !page.textLayer || page.text === page.textLayer;
  }

  async function retryPdfPage() {
    const current = selectedPdf;
    if (!current || current.pending) return;
    const page = getReviewPage(current);
    if (!page) return;
    const rotation = Number(pdfPageRotation.value);
    current.needsReview = true;
    pdfTextConfirmed.checked = false;
    reviewControls.forEach((control) => { control.disabled = true; });
    removePdfButton.textContent = "取消识别";
    pdfPageStatus.textContent = `正在识别第 ${page.pageNumber} 页…`;
    current.pending = window.AIJobAssistantPdf.recognizePdfPage(current.file, page.pageNumber, {
      signal: current.controller.signal,
      rotation,
    }).then((result) => {
      if (selectedPdf !== current) return;
      if (!result.text) throw new Error("本次未识别到文字，已保留原内容，可旋转后重试或手动补录。");
      page.text = result.text;
      page.source = "ocr";
      page.confidence = result.confidence;
      page.edited = false;
      page.error = "";
    }).catch((error) => {
      if (selectedPdf === current) {
        page.edited = false;
        page.error = error.message;
      }
    }).finally(() => {
      current.pending = null;
      if (selectedPdf === current) {
        reviewControls.forEach((control) => { control.disabled = false; });
        removePdfButton.textContent = "移除";
        refreshPdfReview(current);
      }
    });
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
          deletionToken: data.deletionToken || null,
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

  async function analyzeResumeText(resume, job, options = {}) {
    if (location.protocol === "http:" || location.protocol === "https:") {
      return requestDeepSeek(resume, job, options);
    }
    if (window.AIJobAssistantBrowserApi.hasDirectConfig()) {
      return requestBrowserDeepSeek(resume, job, options);
    }
    throw new Error("尚未配置测试密钥，可以使用离线检查材料。");
  }

  function validate(resume, job) {
    const limit = window.AIJobAssistantScoring.MAX_INPUT_LENGTH;
    if (resume.length > limit || job.length > limit) {
      setMessage("简历和岗位内容各最多 20000 字符，请精简后再提交。");
      return false;
    }
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
    offlineReviewButton.disabled = false;
    analyzeButton.classList.remove("is-loading");
    analyzeButton.querySelector(".button-label").textContent = "预览并生成求职诊断";
  }

  function resumeText() {
    return selectedPdf
      ? selectedPdf.pages.map((page) => page.text.trim()).filter(Boolean).join("\n\n")
      : resumeInput.value.trim();
  }

  function resumeSource(content) {
    if (selectedPdf || restoredUpload === content) return "upload";
    return archive?.content === content ? archive.source : "manual";
  }

  function confirmPdfText() {
    if (!selectedPdf?.needsReview || pdfTextConfirmed.checked) return true;
    togglePdfReview(true);
    setMessage("请先核对 PDF 各页文字并勾选确认。", "info");
    pdfTextConfirmed.focus();
    return false;
  }

  async function readInputs() {
    if (analyzeButton.disabled || privacyPreview.open) return;
    setMessage("", "info");
    const selectedPdfAtStart = selectedPdf;
    if (selectedPdfAtStart?.pending) {
      await selectedPdfAtStart.pending;
    }
    if (selectedPdfAtStart !== selectedPdf || analyzeButton.disabled) {
      return;
    }

    if (!confirmPdfText()) return;
    const originalResume = resumeText();
    const originalJob = jobInput.value.trim();
    if (!validate(originalResume, originalJob)) {
      return;
    }
    return {
      resume: window.AIJobAssistantAnchoredScoring.redact(originalResume, { resume: true }),
      job: window.AIJobAssistantAnchoredScoring.redact(originalJob),
      archiveAtStart: archive,
      source: resumeSource(originalResume),
    };
  }

  async function handleAnalyze() {
    const input = await readInputs();
    if (!input || privacyPreview.open || analyzeButton.disabled) return;
    previewContext = { archiveAtStart: input.archiveAtStart, source: input.source };
    previewResume.value = input.resume;
    previewJob.value = input.job;
    previewStatus.textContent = "";
    consentCheckbox.checked = false;
    privacyPreview.showModal();
  }

  async function confirmPreview() {
    if (!consentCheckbox.checked) {
      previewStatus.textContent = "请先勾选同意后再发送。";
      consentCheckbox.focus();
      return;
    }
    const scoring = window.AIJobAssistantScoring;
    const resume = window.AIJobAssistantAnchoredScoring.redact(previewResume.value, { resume: true });
    const job = window.AIJobAssistantAnchoredScoring.redact(previewJob.value);
    if ([resume, job].some((text) => text.length < 30 || text.length > scoring.MAX_INPUT_LENGTH)) {
      previewStatus.textContent = "简历和岗位各需保留 30 到 20000 字符的有效内容。";
      return;
    }
    if (resume !== previewResume.value || job !== previewJob.value) {
      previewResume.value = resume;
      previewJob.value = job;
      previewStatus.textContent = "已重新整理并遮盖识别到的信息，请复核后再次确认。";
      return;
    }
    const input = { ...previewContext, resume, job };
    privacyPreview.close();
    await generateReport(input);
  }

  async function generateReport({ resume, job, archiveAtStart, source }, { offline = false } = {}) {
    if (analyzeButton.disabled) return;
    analyzeButton.disabled = true;
    offlineReviewButton.disabled = true;
    analyzeButton.classList.add("is-loading");
    analyzeButton.querySelector(".button-label").textContent = "正在生成求职诊断";
    startProgress();

    try {
      const result = offline
        ? {
            analysis: window.AIJobAssistantAnchoredScoring.localReview(resume, job),
            meta: createMeta(resume, job, "offline", "离线材料检查"),
          }
        : await analyzeResumeText(resume, job, {
            fresh: Boolean(freshToggle?.checked),
            onProgress: handleProgressEvent,
          });
      const reportId = crypto.randomUUID();
      sessionStorage.setItem(
        DIAGNOSIS_KEY,
        JSON.stringify({
          input: { resume, job },
          analysis: result.analysis,
          meta: result.meta,
          archive: archiveAtStart,
          source,
          ownerId: signedInUser.id,
          reportId,
        }),
      );
      sessionStorage.removeItem(INPUT_KEY);
      window.ResumeMascotReminders?.noteAnalysisComplete?.(reportId);
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
      const message = offline
        ? "无法打开离线报告，请检查浏览器的会话存储设置。"
        : (error.message || "诊断报告生成失败。") + " 可重试或选择离线检查材料。";
      setMessage(message);
      failProgress(message);
      resetAnalyzeButton();
    }
  }

  function restoreInputs(userId, startNew = false) {
    try {
      const draft = JSON.parse(sessionStorage.getItem(INPUT_KEY) || "null");
      const report = draft ? null : JSON.parse(sessionStorage.getItem(DIAGNOSIS_KEY) || "null");
      const saved = draft || (report?.input && {
        ...report.input, archive: report.archive, source: report.source, ownerId: report.ownerId,
      });
      const hasDraft = typeof saved?.resume === "string" || typeof saved?.job === "string";
      if (!startNew && hasDraft && (!saved.ownerId || saved.ownerId === userId) &&
          (!saved.archive || saved.archive.ownerId === userId)) {
        resumeInput.value = saved.resume || "";
        jobInput.value = saved.job || "";
        archive = saved.archive;
        if (saved.source === "upload") restoredUpload = saved.resume;
        if (saved.title) document.querySelector("#resumeArchive").elements.title.value = saved.title;
        lastPastedResume = resumeInput.value;
        updateCount(resumeInput, resumeCount);
        updateCount(jobInput, jobCount);
        if (resumeInput.value || jobInput.value) setMessage("已恢复上次填写的材料。", "info");
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
        "当前未启用测试直连，可在本机离线检查材料。";
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
  offlineReviewButton.addEventListener("click", async () => {
    const input = await readInputs();
    if (input && !privacyPreview.open) await generateReport(input, { offline: true });
  });
  document.querySelector("#confirmPreviewButton").addEventListener("click", confirmPreview);
  document.querySelector("#cancelPreviewButton").addEventListener("click", () => privacyPreview.close());
  privacyPreview.addEventListener("close", () => {
    previewContext = null;
    previewResume.value = "";
    previewJob.value = "";
    consentCheckbox.checked = false;
  });
  retryButton.addEventListener("click", () => {
    retryButton.hidden = true;
    handleAnalyze();
  });
  resumePdf.addEventListener("change", () => {
    const file = resumePdf.files?.[0];
    resumePdf.value = "";
    preparePdf(file);
  });
  replacePdfButton.addEventListener("click", () => resumePdf.click());
  openPdfReview.addEventListener("click", () => togglePdfReview(pdfReview.hidden));
  pdfPageNumber.addEventListener("change", () => {
    pdfPageRotation.value = "0";
    refreshPdfReview(selectedPdf);
  });
  recognizePdfPage.addEventListener("click", retryPdfPage);
  pdfPageText.addEventListener("input", () => {
    const page = getReviewPage(selectedPdf);
    page.text = pdfPageText.value;
    page.edited = true;
    selectedPdf.needsReview = true;
    pdfTextConfirmed.checked = false;
    refreshPdfReview(selectedPdf);
  });
  restorePdfPage.addEventListener("click", () => {
    const page = getReviewPage(selectedPdf);
    page.text = page.textLayer;
    page.source = "text";
    page.edited = false;
    page.error = "";
    selectedPdf.needsReview = true;
    pdfTextConfirmed.checked = false;
    refreshPdfReview(selectedPdf);
  });
  pdfTextConfirmed.addEventListener("change", () => refreshPdfReview(selectedPdf));
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
  const versionId = params.get("version");
  if (versionId) {
    analyzeButton.disabled = resumeInput.disabled = jobInput.disabled = resumePdf.disabled = true;
    try {
      const version = await cloud.readVersion(versionId);
      if (!version) throw new Error("Unavailable version");
      archive = {
        resumeId: version.resume_id, versionId: version.id, ownerId: version.user_id,
        title: version.resumes.title, content: version.content, source: version.source,
      };
      resumeInput.value = lastPastedResume = version.content;
      updateCount(resumeInput, resumeCount);
      setMessage(`已打开「${archive.title}」的历史版本。修改文字后可保存新版本。`, "info");
    } catch {
      setMessage("无法打开这个简历版本，请从「我的档案」重试。");
    } finally {
      analyzeButton.disabled = resumeInput.disabled = jobInput.disabled = resumePdf.disabled = false;
    }
  } else {
    restoreInputs(signedInUser.id, params.get("new") === "1");
  }

  const form = document.querySelector("#resumeArchive");
  cloud.updateSaveForm(form, archive);
  cloud.attachSaveForm(form, {
    async prepare(title, user) {
      const pdf = selectedPdf;
      if (pdf?.pending) await pdf.pending;
      if (selectedPdf !== pdf || !confirmPdfText()) return null;
      const content = resumeText();
      if (!content) return null;
      if (user && user.id !== signedInUser.id) throw new Error("Account changed");
      const unchanged = archive?.content === content;
      const source = resumeSource(content);
      const reuseVersion = unchanged && archive.source === source;
      if (pendingSave?.content !== content || pendingSave?.title !== title || pendingSave?.source !== source) {
        pendingSave = {
          resumeId: archive?.resumeId || crypto.randomUUID(),
          versionId: reuseVersion ? archive.versionId : crypto.randomUUID(),
          title, content, source,
        };
      }
      return { ...pendingSave, title: archive ? null : title };
    },
    login(record) {
      try {
        sessionStorage.setItem(INPUT_KEY, JSON.stringify({
          resume: record.content, source: record.source, title: record.title, archive, ownerId: signedInUser.id,
          job: jobInput.value,
        }));
      } catch {
        // Navigation is still available if the browser disables draft storage.
      }
      return "./index.html";
    },
    saved(record, user) {
      archive = { ...record, title: archive?.title || record.title, ownerId: user.id };
      pendingSave = null;
      cloud.updateSaveForm(form, archive);
      const url = new URL(location.href);
      url.searchParams.delete("new");
      url.searchParams.set("version", record.versionId);
      history.replaceState(null, "", url);
      sessionStorage.setItem(INPUT_KEY, JSON.stringify({
        resume: record.content, job: jobInput.value.trim(), archive, ownerId: user.id,
      }));
    },
  });

  const demoMode = params.get("demo");
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
