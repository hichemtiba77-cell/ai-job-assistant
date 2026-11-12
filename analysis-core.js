(function () {
  "use strict";

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

  function clamp(value, min = 0, max = 100) {
    return Math.max(min, Math.min(max, Math.round(value)));
  }

  function findEvidence(text, keywords) {
    const sentences = text
      .split(/[。！？\n]/)
      .map((sentence) => sentence.trim())
      .filter((sentence) => sentence.length >= 8);
    return sentences
      .filter((sentence) => {
        const normalized = sentence.toLowerCase();
        return keywords.some((keyword) => normalized.includes(keyword.toLowerCase()));
      })
      .slice(0, 4);
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
    const projectEvidence = findEvidence(resume, ["项目", "负责", "上线", "结果"]);
    const availabilityEvidence = findEvidence(resume, ["每周", "到岗", "实习", "连续"]);
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
    if (resume.length < 120) reviewReasons.push("简历文字较少");
    if (foundSections.length < 2) reviewReasons.push("缺少至少两类核心信息");
    if (matchedSkills.length === 0) reviewReasons.push("尚未找到岗位相关技能证据");
    if (!hasProject) reviewReasons.push("尚未找到项目或实习经历");

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
    if (!hasAvailability) {
      gaps.push("简历中未说明每周可到岗天数和实习周期。");
    }
    if (!hasProject) {
      gaps.push("简历中尚未提供项目、实习或实践经历，难以证明岗位能力如何落地。");
    }
    if (!hasMetrics) {
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
      hasAvailability
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
        status: hasProject ? "met" : "unknown",
        label: hasProject ? "有相关经历" : "未找到",
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

    const evidenceItems = [
      {
        status: matchedSkills.length >= 2 ? "direct" : matchedSkills.length ? "partial" : "unknown",
        statusLabel:
          matchedSkills.length >= 2 ? "有直接证据" : matchedSkills.length ? "表达缺口" : "证据不足",
        label: "岗位核心技能",
        jobEvidence: requestedSkills.length
          ? `岗位关注：${requestedSkills.slice(0, 6).join("、")}`
          : "岗位未识别到明确技能关键词。",
        resumeEvidence: evidence[0] || "简历中未找到直接技能证据。",
        relevanceLevel: requestedSkills.length ? 4 : null,
        evidenceLevel: evidence.length ? 3 : 0,
        depthLevel: /负责|主导/.test(resume) ? 3 : /参与/.test(resume) ? 2 : 1,
      },
      {
        status: projectEvidence.length ? "direct" : "unknown",
        statusLabel: projectEvidence.length ? "有相关证据" : "证据不足",
        label: "项目与实习经历",
        jobEvidence: "岗位要求具有相关项目或实习经历。",
        resumeEvidence: projectEvidence[0] || "简历中未找到项目或实习经历。",
        relevanceLevel: projectEvidence.length ? 3 : 0,
        evidenceLevel: projectEvidence.length ? (hasMetrics ? 4 : 2) : 0,
        depthLevel: /负责|主导/.test(resume) ? 3 : /参与/.test(resume) ? 2 : 0,
      },
      {
        status: availabilityEvidence.length ? "direct" : "unknown",
        statusLabel: availabilityEvidence.length ? "有直接证据" : "证据不足",
        label: "到岗时间",
        jobEvidence: jobNeedsAvailability
          ? "岗位要求明确的实习天数和持续周期。"
          : "岗位未明确到岗时间。",
        resumeEvidence: availabilityEvidence[0] || "简历中未找到到岗时间。",
        relevanceLevel: jobNeedsAvailability ? 4 : null,
        evidenceLevel: availabilityEvidence.length ? 3 : 0,
        depthLevel: 0,
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
      scoreExplanation:
        "参考分由技能、项目、教育、到岗条件和信息完整度加权形成；未找到的信息不会自动视为候选人具备。",
      notice: canScore
        ? ""
        : `暂不出总分：${reviewReasons.join("、")}。这表示材料不足，不代表你一定不适合该岗位。`,
      dimensions,
      evidenceItems,
      strengths,
      gaps,
      constraints,
      suggestions,
    };
  }

  window.AIJobAssistantCore = {
    buildMockAnalysis,
  };
})();
