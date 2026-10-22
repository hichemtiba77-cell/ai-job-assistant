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
  const scoreDenominator = document.querySelector("#scoreDenominator");
  const scoreRing = document.querySelector("#scoreRing");
  const fitLevel = document.querySelector("#fitLevel");
  const confidenceLevel = document.querySelector("#confidenceLevel");
  const summaryText = document.querySelector("#summaryText");
  const diagnosisNotice = document.querySelector("#diagnosisNotice");
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
    const sections = [
      { name: "教育背景", found: /教育|学校|本科|硕士|博士|专业|毕业/.test(resume) },
      { name: "项目或实习", found: /项目|实习|工作经历|实践经历/.test(resume) },
      {
        name: "技能信息",
        found: /技能|能力|python|sql|excel|数据分析|沟通/i.test(resume),
      },
    ];
    const foundSections = sections.filter((section) => section.found);
    const hasProject = sections[1].found;
    const hasMetrics =
      /[0-9]+\s*(%|人|名|项|个|次|天|小时)|[0-9]+(?:\.[0-9]+)?%/.test(resume);
    const hasAvailability =
      /每周|每周[一二三四五六日天\d]|实习\d*天|到岗|连续实习|可实习/.test(resume);
    const jobNeedsAvailability =
      /每周|实习天数|到岗|连续实习|至少.*月/.test(job);

    const reviewReasons = [];
    if (resume.length < 120) {
      reviewReasons.push("简历文字较少");
    }
    if (foundSections.length < 2) {
      reviewReasons.push("缺少至少两类核心信息");
    }
    if (matchedSkills.length === 0) {
      reviewReasons.push("尚未找到岗位相关技能证据");
    }
    if (!hasProject) {
      reviewReasons.push("尚未找到项目或实习经历");
    }

    const canScore =
      resume.length >= 120 &&
      foundSections.length >= 2 &&
      matchedSkills.length > 0 &&
      hasProject &&
      job.length >= 60;

    const skillScore = canScore
      ? clamp((matchedSkills.length / Math.max(requestedSkills.length, 1)) * 100)
      : null;
    const projectScore = canScore
      ? clamp(
          35 +
            (/负责|主导|参与/.test(resume) ? 15 : 0) +
            (hasMetrics ? 25 : 0) +
            (/上线|发布|结果|提升|降低|增长|完成/.test(resume) ? 15 : 0) +
            (/团队|协作|沟通/.test(resume) ? 10 : 0),
        )
      : null;

    const degreeRank = { 本科: 3, 硕士: 4, 博士: 5 };
    const resumeDegree = Object.keys(degreeRank).find((degree) => resume.includes(degree));
    const requiredDegree = Object.keys(degreeRank).find((degree) => job.includes(degree));
    let educationScore = null;
    if (canScore) {
      if (requiredDegree && resumeDegree) {
        educationScore =
          degreeRank[resumeDegree] >= degreeRank[requiredDegree] ? 100 : 40;
      } else if (requiredDegree) {
        educationScore = 0;
      } else {
        educationScore = resumeDegree ? 70 : 0;
      }
    }

    const conditionScore = canScore
      ? jobNeedsAvailability
        ? hasAvailability
          ? 100
          : 0
        : 60
      : null;
    const completenessScore = clamp(
      Math.min(resume.length / 5, 45) +
        foundSections.length * 12 +
        (hasProject ? 10 : 0) +
        (hasMetrics ? 6 : 0) +
        (job.length >= 100 ? 3 : 0),
    );
    const overall = canScore
      ? clamp(
          skillScore * 0.35 +
            projectScore * 0.3 +
            educationScore * 0.15 +
            conditionScore * 0.1 +
            completenessScore * 0.1,
        )
      : null;

    const dimensions = [
      {
        name: "技能匹配",
        score: skillScore,
        detail: canScore
          ? `岗位识别的 ${requestedSkills.length} 项技能中，简历提供了 ${matchedSkills.length} 项明确证据。`
          : "材料不足，暂不形成技能分数。",
      },
      {
        name: "经历与项目",
        score: projectScore,
        detail: canScore
          ? "根据项目是否存在、个人职责、结果表达和数字证据计算。"
          : "还没有找到可用于判断的项目或实习经历。",
      },
      {
        name: "教育与岗位条件",
        score: educationScore,
        detail: canScore
          ? requiredDegree
            ? `岗位出现“${requiredDegree}”要求，已单独核对简历学历。`
            : "岗位未明确学历门槛，暂按教育信息完整度判断。"
          : "学历、专业和毕业时间信息不足。",
      },
      {
        name: "到岗与其他条件",
        score: conditionScore,
        detail: canScore
          ? jobNeedsAvailability
            ? hasAvailability
              ? "岗位有到岗要求，简历也提供了时间信息。"
              : "岗位有到岗要求，简历尚未说明每周天数和实习周期。"
            : "岗位未明确到岗要求，暂按已提供的其他条件判断。"
          : "材料不足，暂不判断到岗和其他条件。",
      },
      {
        name: "简历信息完整度",
        score: completenessScore,
        detail: `当前识别到${foundSections.length}类核心信息；这部分只衡量材料是否完整，不代替岗位匹配结论。`,
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
    if (!hasProject) {
      gaps.push("简历中尚未提供项目、实习或实践经历，难以证明岗位能力如何落地。");
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
        status:
          resumeDegree && (!jobNeedsAvailability || hasAvailability)
            ? "met"
            : resumeDegree
              ? "partial"
              : "unknown",
        label:
          resumeDegree && (!jobNeedsAvailability || hasAvailability)
            ? "信息较完整"
            : resumeDegree
              ? "部分信息"
              : "未找到",
        detail: "学历、专业和实习时间需要逐项与岗位要求核对。",
      },
    ];

    return {
      score: overall,
      fitLevel: canScore
        ? overall >= 82
          ? "较为匹配"
          : overall >= 65
            ? "部分匹配"
            : overall >= 45
              ? "证据偏弱"
              : "匹配不足"
        : "材料不足",
      confidence: canScore ? (evidence.length >= 2 && resume.length >= 220 ? "中" : "低") : "低",
      summary: canScore
        ? "当前分数只根据已有证据计算；没有找到的内容会降低分数或标记为待补充。建议优先完善岗位要求的直接证据和可验证结果。"
        : "这份材料还不足以形成可靠分数。请补充教育背景、项目或实习经历，以及至少一项与岗位直接相关的技能证据。",
      notice: canScore
        ? ""
        : `暂不出总分：${reviewReasons.join("、")}。这表示材料不足，不代表你一定不适合该岗位。`,
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
        (item) => {
          const hasScore = Number.isFinite(item.score);
          return `
          <div class="dimension-item${hasScore ? "" : " is-unknown"}">
            <div class="dimension-top">
              <strong>${escapeHtml(item.name)}</strong>
              <span>${hasScore ? `${item.score} / 100` : "暂不评分"}</span>
            </div>
            <div class="dimension-track" aria-hidden="true">
              <div class="dimension-fill" style="width: ${hasScore ? item.score : 0}%"></div>
            </div>
            <p>${escapeHtml(item.detail)}</p>
          </div>
        `;
        },
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
    const hasScore = Number.isFinite(analysis.score);
    overallScore.textContent = hasScore ? analysis.score : "—";
    scoreDenominator.textContent = hasScore ? "/ 100" : "暂不评分";
    scoreRing.classList.toggle("is-empty", !hasScore);
    scoreRing.style.setProperty("--score", hasScore ? analysis.score : 0);
    diagnosisNotice.hidden = !analysis.notice;
    diagnosisNotice.innerHTML = analysis.notice
      ? `<strong>先补齐材料，再判断岗位匹配</strong>${escapeHtml(analysis.notice)}`
      : "";
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
      formMessage.textContent = "简历内容过短，请至少提供一段真实的教育、项目或实习经历。";
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
    analyzeButton.querySelector(".button-label").textContent = "正在生成求职诊断";

    try {
      const analysis = await analyzeResumeText(resume, job);
      renderAnalysis(analysis);
    } catch (error) {
      formMessage.textContent = "求职诊断生成失败，请稍后重试。";
      console.error(error);
    } finally {
      analyzeButton.disabled = false;
      analyzeButton.classList.remove("is-loading");
      analyzeButton.querySelector(".button-label").textContent = "重新诊断";
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
    formMessage.textContent = "示例内容已填入，可以直接点击“诊断简历匹配度”查看效果。";
  }

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
