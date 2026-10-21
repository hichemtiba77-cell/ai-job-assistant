(function () {
  "use strict";

  const resumeInput = document.querySelector("#resumeText");
  const jobInput = document.querySelector("#jobText");
  const resumeCount = document.querySelector("#resumeCount");
  const jobCount = document.querySelector("#jobCount");
  const analyzeButton = document.querySelector("#analyzeButton");
  const formMessage = document.querySelector("#formMessage");
  const resultsSection = document.querySelector("#results");

  const overallScore = document.querySelector("#overallScore");
  const scoreRing = document.querySelector("#scoreRing");
  const fitLevel = document.querySelector("#fitLevel");
  const confidenceLevel = document.querySelector("#confidenceLevel");
  const summaryText = document.querySelector("#summaryText");
  const dimensionGrid = document.querySelector("#dimensionGrid");
  const evidenceList = document.querySelector("#evidenceList");
  const gapList = document.querySelector("#gapList");
  const constraintList = document.querySelector("#constraintList");
  const suggestionList = document.querySelector("#suggestionList");

  const skillKeywords = [
    "python",
    "sql",
    "excel",
    "数据分析",
    "用户调研",
    "用户访谈",
    "产品",
    "原型",
    "ai",
    "机器学习",
    "沟通",
    "项目",
  ];

  function updateCount(input, target) {
    const count = input.value.trim().length;
    target.textContent = `${count} 字`;
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

  function clamp(value, min = 0, max = 100) {
    return Math.max(min, Math.min(max, Math.round(value)));
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function findEvidence(text, keywords) {
    const sentences = text
      .split(/[。！？\n]/)
      .map((sentence) => sentence.trim())
      .filter((sentence) => sentence.length >= 8);
    const matches = sentences.filter((sentence) => {
      const normalized = sentence.toLowerCase();
      return keywords.some((keyword) => normalized.includes(keyword.toLowerCase()));
    });
    return matches.slice(0, 3);
  }

  function buildMockAnalysis(resume, job) {
    const resumeLower = resume.toLowerCase();
    const jobLower = job.toLowerCase();
    const requestedSkills = skillKeywords.filter((keyword) =>
      jobLower.includes(keyword.toLowerCase()),
    );
    const matchedSkills = requestedSkills.filter((keyword) =>
      resumeLower.includes(keyword.toLowerCase()),
    );
    const missingSkills = requestedSkills.filter(
      (keyword) => !resumeLower.includes(keyword.toLowerCase()),
    );
    const evidence = findEvidence(resume, matchedSkills);

    const skillScore = clamp(58 + matchedSkills.length * 5.5);
    const projectScore = clamp(
      61 +
        (resume.includes("项目") ? 13 : 0) +
        (resume.includes("负责") ? 7 : 0) +
        (resume.includes("上线") || resume.includes("结果") ? 6 : 0),
    );
    const educationScore = clamp(
      resume.includes("本科") || resume.includes("硕士") || resume.includes("博士")
        ? 82
        : 65,
    );
    const completenessScore = clamp(
      50 +
        (resume.length >= 180 ? 14 : 0) +
        (resume.length >= 320 ? 8 : 0) +
        (evidence.length > 0 ? 12 : 0) +
        (job.length >= 100 ? 6 : 0),
    );
    const overall = clamp(
      skillScore * 0.35 +
        projectScore * 0.3 +
        educationScore * 0.15 +
        completenessScore * 0.2,
    );

    const dimensions = [
      {
        name: "技能匹配",
        score: skillScore,
        detail:
          matchedSkills.length > 0
            ? `找到 ${matchedSkills.slice(0, 4).join("、")} 等岗位相关技能。`
            : "简历中没有找到明显对应岗位的技能词。",
      },
      {
        name: "经历与项目",
        score: projectScore,
        detail:
          projectScore >= 80
            ? "项目描述包含职责和结果，具备进一步量化表达的基础。"
            : "建议补充项目规模、个人职责和可验证结果。",
      },
      {
        name: "教育背景",
        score: educationScore,
        detail: "当前只做演示判断，真实规则会结合岗位学历和专业要求。",
      },
      {
        name: "信息完整度",
        score: completenessScore,
        detail: "检查简历和岗位文本是否足够完整，便于后续分析。",
      },
    ];

    const strengths = evidence.length
      ? evidence.map((item) => `简历提到：“${item}”`)
      : ["简历提供了基本信息，但还需要补充与岗位相关的具体证据。"];

    const gaps = [];
    if (missingSkills.length) {
      gaps.push(`岗位可能关注 ${missingSkills.slice(0, 4).join("、")}，简历中未找到明确证据。`);
    }
    if (!/每周|实习天数|到岗/.test(resume)) {
      gaps.push("简历中未说明每周可到岗天数和实习周期。");
    }
    if (!/[0-9]+[%人天]|[0-9]+\s*(名|人|项|个)/.test(resume)) {
      gaps.push("项目成果中的规模、效率或人数等数字还不够明确。");
    }
    if (!gaps.length) {
      gaps.push("暂未发现明显的信息缺口，后续仍需结合真实岗位逐条核对。");
    }

    const suggestions = [
      missingSkills.length
        ? `如果确实使用过 ${missingSkills.slice(0, 3).join("、")}，请在项目经历中补充具体任务和结果；没有使用过则不要添加。`
        : "保持技能与项目经历对应，避免只罗列关键词而缺少使用场景。",
      "把“负责需求分析”改成更具体的事实，例如调研了多少用户、发现了什么问题、最终做了什么调整。",
      "补充项目规模、持续时间、个人贡献和可验证结果，所有数字必须真实。",
      /每周|实习天数|到岗/.test(resume)
        ? "到岗时间已经出现，建议写清起止时间和稳定性。"
        : "如果岗位要求实习时长，建议在简历中写清每周可到岗天数和持续周期。",
    ];

    const constraints = [
      {
        name: "岗位核心技能",
        status: matchedSkills.length >= 2 ? "met" : matchedSkills.length ? "partial" : "unknown",
        label: matchedSkills.length >= 2 ? "有明确证据" : matchedSkills.length ? "部分匹配" : "未找到",
        detail:
          matchedSkills.length > 0
            ? `已匹配：${matchedSkills.slice(0, 5).join("、")}`
            : "需要在简历中补充真实技能及使用场景。",
      },
      {
        name: "项目经历",
        status: /项目|实习|实践/.test(resume) ? "met" : "unknown",
        label: /项目|实习|实践/.test(resume) ? "有相关经历" : "未找到",
        detail: "真实接入后还会判断项目与岗位要求的关联程度。",
      },
      {
        name: "学历与到岗条件",
        status: /本科|硕士|博士/.test(resume) ? "partial" : "unknown",
        label: /本科|硕士|博士/.test(resume) ? "部分信息" : "未找到",
        detail: "学历、专业和实习时间需要逐项与岗位要求核对。",
      },
    ];

    return {
      score: overall,
      fitLevel: overall >= 82 ? "较为匹配" : overall >= 70 ? "部分匹配" : "需要补充",
      confidence: evidence.length >= 2 ? "中" : "低",
      summary:
        evidence.length >= 2
          ? "简历能够提供部分与岗位相关的技能和项目证据，但仍有信息需要补充。建议优先完善项目成果和到岗条件。"
          : "当前材料中的岗位对应证据较少。建议先补充真实技能、项目职责和结果，再重新评估。",
      dimensions,
      strengths,
      gaps,
      constraints,
      suggestions,
    };
  }

  function renderDimensions(dimensions) {
    dimensionGrid.innerHTML = dimensions
      .map(
        (item) => `
          <div class="dimension-item">
            <div class="dimension-top">
              <strong>${escapeHtml(item.name)}</strong>
              <span>${item.score} / 100</span>
            </div>
            <div class="dimension-track" aria-hidden="true">
              <div class="dimension-fill" style="width: ${item.score}%"></div>
            </div>
            <p>${escapeHtml(item.detail)}</p>
          </div>
        `,
      )
      .join("");
  }

  function renderList(target, items) {
    target.innerHTML = items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  }

  function renderConstraints(items) {
    constraintList.innerHTML = items
      .map(
        (item) => `
          <div class="constraint-item">
            <strong>${escapeHtml(item.name)}</strong>
            <span class="constraint-status ${item.status}">${escapeHtml(item.label)}</span>
            <p>${escapeHtml(item.detail)}</p>
          </div>
        `,
      )
      .join("");
  }

  function renderSuggestions(items) {
    suggestionList.innerHTML = items
      .map((item) => `<li>${escapeHtml(item)}</li>`)
      .join("");
  }

  function renderAnalysis(analysis) {
    overallScore.textContent = analysis.score;
    scoreRing.style.setProperty("--score", analysis.score);
    fitLevel.textContent = analysis.fitLevel;
    confidenceLevel.textContent = `置信度：${analysis.confidence}`;
    summaryText.textContent = analysis.summary;
    renderDimensions(analysis.dimensions);
    renderList(evidenceList, analysis.strengths);
    renderList(gapList, analysis.gaps);
    renderConstraints(analysis.constraints);
    renderSuggestions(analysis.suggestions);
    resultsSection.hidden = false;
    resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /*
   * 后续实现PDF与DeepSeek时，把以下函数替换为：
   * 1. PDF读取文字，并让用户在现有文本框确认；
   * 2. 调用服务端 /api/analyze，由服务端读取DeepSeek密钥；
   * 3. 保持返回字段不变，页面无需重做。
   */
  async function analyzeResumeText(resume, job) {
    await new Promise((resolve) => window.setTimeout(resolve, 850));
    return buildMockAnalysis(resume, job);
  }

  async function handleAnalyze() {
    const resume = resumeInput.value.trim();
    const job = jobInput.value.trim();
    formMessage.textContent = "";

    if (!resume) {
      formMessage.textContent = "请先粘贴简历文字，或点击“填入示例简历”。";
      resumeInput.focus();
      return;
    }

    if (resume.length < 30) {
      formMessage.textContent = "简历内容过短，请至少提供一段完整的教育或项目经历。";
      resumeInput.focus();
      return;
    }

    if (!job) {
      formMessage.textContent = "请先粘贴岗位招聘要求，或点击“填入示例岗位”。";
      jobInput.focus();
      return;
    }

    if (job.length < 30) {
      formMessage.textContent = "岗位信息过短，请补充具体职责和任职要求。";
      jobInput.focus();
      return;
    }

    analyzeButton.disabled = true;
    analyzeButton.classList.add("is-loading");
    analyzeButton.querySelector(".button-label").textContent = "正在生成演示结果";

    try {
      const analysis = await analyzeResumeText(resume, job);
      renderAnalysis(analysis);
    } catch (error) {
      formMessage.textContent = "模拟分析失败，请稍后重试。";
      console.error(error);
    } finally {
      analyzeButton.disabled = false;
      analyzeButton.classList.remove("is-loading");
      analyzeButton.querySelector(".button-label").textContent = "重新分析";
    }
  }

  resumeInput.addEventListener("input", () => updateCount(resumeInput, resumeCount));
  jobInput.addEventListener("input", () => updateCount(jobInput, jobCount));
  analyzeButton.addEventListener("click", handleAnalyze);

  document.querySelectorAll("[data-example]").forEach((button) => {
    button.addEventListener("click", () => fillExample(button.dataset.example));
  });

  if (window.AIJobAssistantExamples) {
    fillExample("resume");
    fillExample("job");
    formMessage.textContent = "示例内容已填入，可以直接点击“开始分析”查看效果。";
  }

  const demoMode = new URLSearchParams(window.location.search).get("demo") === "1";
  if (demoMode) {
    window.setTimeout(handleAnalyze, 250);
  }
})();
