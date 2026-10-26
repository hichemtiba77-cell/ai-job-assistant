(function () {
  "use strict";

  const INPUT_KEY = "aijob:input:v1";
  const DIAGNOSIS_KEY = "aijob:diagnosis:v1";
  const resumeInput = document.querySelector("#resumeText");
  const jobInput = document.querySelector("#jobText");
  const resumeCount = document.querySelector("#resumeCount");
  const jobCount = document.querySelector("#jobCount");
  const analyzeButton = document.querySelector("#analyzeButton");
  const formMessage = document.querySelector("#formMessage");

  function updateCount(input, target) {
    target.textContent = `${input.value.trim().length} 字`;
  }

  function fillExample(type) {
    if (type === "resume") {
      resumeInput.value = window.AIJobAssistantExamples.resume;
      updateCount(resumeInput, resumeCount);
      formMessage.textContent = "";
      return;
    }
    jobInput.value = window.AIJobAssistantExamples.job;
    updateCount(jobInput, jobCount);
    formMessage.textContent = "";
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
    const timeout = window.setTimeout(() => controller.abort(), 75000);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resume, job }),
        signal: controller.signal,
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || `DeepSeek接口返回${response.status}`);
      }
      if (!data.analysis) {
        throw new Error("DeepSeek返回结果缺少分析内容");
      }

      return {
        analysis: data.analysis,
        meta: {
          ...createMeta(resume, job, "deepseek", data.model || "deepseek-flash"),
          cached: Boolean(data.cached),
          usage: data.usage || null,
        },
      };
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async function analyzeResumeText(resume, job) {
    if (location.protocol === "http:" || location.protocol === "https:") {
      try {
        return await requestDeepSeek(resume, job);
      } catch (error) {
        console.warn("DeepSeek不可用，切换本地模拟结果：", error);
        return {
          analysis: window.AIJobAssistantCore.buildMockAnalysis(resume, job),
          meta: createMeta(resume, job, "mock", "本地模拟", error.message),
        };
      }
    }

    await new Promise((resolve) => window.setTimeout(resolve, 650));
    return {
      analysis: window.AIJobAssistantCore.buildMockAnalysis(resume, job),
      meta: createMeta(resume, job, "mock", "本地模拟", "当前以文件方式打开，未调用本地接口"),
    };
  }

  function validate(resume, job) {
    if (!resume) {
      formMessage.textContent = "请先粘贴简历文字，或点击“加载示例简历”。";
      resumeInput.focus();
      return false;
    }
    if (resume.length < 30) {
      formMessage.textContent = "简历内容过短，请至少提供一段真实的教育、项目或实习经历。";
      resumeInput.focus();
      return false;
    }
    if (!job) {
      formMessage.textContent = "请先粘贴岗位招聘要求，或点击“加载示例岗位”。";
      jobInput.focus();
      return false;
    }
    if (job.length < 30) {
      formMessage.textContent = "岗位信息过短，请补充具体职责和任职要求。";
      jobInput.focus();
      return false;
    }
    return true;
  }

  async function handleAnalyze() {
    const resume = resumeInput.value.trim();
    const job = jobInput.value.trim();
    formMessage.textContent = "";

    if (!validate(resume, job)) {
      return;
    }

    analyzeButton.disabled = true;
    analyzeButton.classList.add("is-loading");
    analyzeButton.querySelector(".button-label").textContent = "正在生成求职诊断";

    try {
      const result = await analyzeResumeText(resume, job);
      sessionStorage.setItem(INPUT_KEY, JSON.stringify({ resume, job }));
      sessionStorage.setItem(
        DIAGNOSIS_KEY,
        JSON.stringify({
          input: { resume, job },
          analysis: result.analysis,
          meta: result.meta,
        }),
      );
      const requestedTab = new URLSearchParams(window.location.search).get("tab");
      window.location.assign(
        requestedTab ? `./report.html?tab=${encodeURIComponent(requestedTab)}` : "./report.html",
      );
    } catch (error) {
      console.error(error);
      formMessage.textContent = "诊断报告生成失败，请重试或检查本地服务是否启动。";
      analyzeButton.disabled = false;
      analyzeButton.classList.remove("is-loading");
      analyzeButton.querySelector(".button-label").textContent = "生成求职诊断报告";
    }
  }

  function restoreInputs() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(INPUT_KEY) || "null");
      if (saved?.resume && saved?.job) {
        resumeInput.value = saved.resume;
        jobInput.value = saved.job;
        updateCount(resumeInput, resumeCount);
        updateCount(jobInput, jobCount);
        formMessage.textContent = "已恢复上次填写的简历和岗位，可以直接重新诊断。";
        return;
      }
    } catch {
      // Ignore invalid local state and fall back to examples.
    }

    if (window.AIJobAssistantExamples) {
      fillExample("resume");
      fillExample("job");
      formMessage.textContent = "示例内容已填入，可以直接生成求职诊断报告。";
    }
  }

  resumeInput.addEventListener("input", () => updateCount(resumeInput, resumeCount));
  jobInput.addEventListener("input", () => updateCount(jobInput, jobCount));
  analyzeButton.addEventListener("click", handleAnalyze);

  document.querySelectorAll("[data-example]").forEach((button) => {
    button.addEventListener("click", () => fillExample(button.dataset.example));
  });

  restoreInputs();

  const demoMode = new URLSearchParams(window.location.search).get("demo");
  if (demoMode === "short") {
    resumeInput.value =
      "张同学\n软件工程专业本科生，预计2027年毕业\n郑州大学 软件工程 本科\n主修课程：数据结构、数据库原理、Python程序设计、机器学习基础";
    updateCount(resumeInput, resumeCount);
    window.setTimeout(handleAnalyze, 250);
  } else if (demoMode === "1") {
    window.setTimeout(handleAnalyze, 250);
  }
})();
