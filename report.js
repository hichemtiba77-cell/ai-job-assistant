(function () {
  "use strict";

  const STORAGE_KEY = "aijob:diagnosis:v1";
  const payload = readPayload();
  const tabs = Array.from(document.querySelectorAll("[data-tab]"));
  const panels = Array.from(document.querySelectorAll("[data-panel]"));

  function readPayload() {
    try {
      return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "null");
    } catch {
      return null;
    }
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function activateTab(nextTab) {
    const target = nextTab.dataset.tab;
    tabs.forEach((tab) => {
      const selected = tab === nextTab;
      tab.classList.toggle("is-active", selected);
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
    panels.forEach((panel) => {
      const active = panel.dataset.panel === target;
      panel.hidden = !active;
      panel.classList.toggle("is-active", active);
    });
  }

  function showEmptyState() {
    document.querySelector("#reportPaper").hidden = true;
    document.querySelector(".report-tabs").hidden = true;
    document.querySelector(".report-summary").hidden = true;
    document.querySelector(".report-heading").hidden = true;
    document.querySelector("#diagnosisNotice").hidden = true;
    document.querySelector("#reportEmpty").hidden = false;
    document.querySelector("#sourceBadge").textContent = "暂无记录";
  }

  function deriveHardGate(analysis) {
    const statuses = (analysis.constraints || []).map((item) => item.status);
    if (statuses.includes("unmet")) {
      return { label: "不满足", detail: "存在明确未满足项" };
    }
    if (statuses.includes("unknown")) {
      return { label: "待确认", detail: "存在信息缺口" };
    }
    if (statuses.includes("partial")) {
      return { label: "部分满足", detail: "仍有条件待核对" };
    }
    return { label: "已满足", detail: "已找到必要条件证据" };
  }

  function renderDimensions(dimensions) {
    const target = document.querySelector("#dimensionGrid");
    target.innerHTML = (dimensions || [])
      .map((item) => {
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
            <p>${escapeHtml(item.detail || "")}</p>
          </div>
        `;
      })
      .join("");
  }

  function renderEvidence(items) {
    const target = document.querySelector("#evidenceList");
    if (!items?.length) {
      target.innerHTML =
        '<p class="report-panel-heading"><span></span></p><p>没有生成可展示的逐条证据。</p>';
      return;
    }

    target.innerHTML = items
      .map(
        (item) => `
          <article class="evidence-item">
            <span class="${escapeHtml(item.status || "unknown")}">${escapeHtml(item.statusLabel || "待确认")}</span>
            <div>
              <h3>${escapeHtml(item.label || "岗位要求")}</h3>
              <p>${escapeHtml(item.jobEvidence || "")}</p>
              <blockquote>${escapeHtml(item.resumeEvidence || "简历中未找到")}</blockquote>
            </div>
            <div class="evidence-levels">
              <span>相关度 ${Number.isFinite(item.relevanceLevel) ? `${item.relevanceLevel}/4` : "--"}</span>
              <span>证据 ${Number.isFinite(item.evidenceLevel) ? `${item.evidenceLevel}/4` : "--"}</span>
              <span>承担 ${Number.isFinite(item.depthLevel) ? `${item.depthLevel}/4` : "--"}</span>
            </div>
          </article>
        `,
      )
      .join("");
  }

  function renderConstraints(items) {
    const target = document.querySelector("#constraintList");
    target.innerHTML = (items || [])
      .map(
        (item) => `
          <div class="constraint-item">
            <strong>${escapeHtml(item.name)}</strong>
            <span class="constraint-status ${escapeHtml(item.status)}">${escapeHtml(item.label)}</span>
            <p>${escapeHtml(item.detail || "")}</p>
          </div>
        `,
      )
      .join("");
  }

  function renderList(selector, items, emptyText) {
    const target = document.querySelector(selector);
    target.innerHTML =
      items?.length
        ? items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")
        : `<li>${escapeHtml(emptyText)}</li>`;
  }

  function render(payloadValue) {
    const { analysis, meta = {}, input = {} } = payloadValue;
    const hardGate = deriveHardGate(analysis);
    const hasScore = Number.isFinite(analysis.score);
    const jobTitle = meta.jobTitle || "目标岗位诊断";

    document.querySelector("#jobTitle").textContent = jobTitle;
    document.querySelector("#reportSubtitle").textContent =
      `${meta.candidateLine || "求职者"} · 基于当前简历和目标岗位生成`;
    document.querySelector("#fitLevel").textContent = analysis.fitLevel || "--";
    document.querySelector("#overallScore").textContent = hasScore ? analysis.score : "—";
    document.querySelector("#scoreLabel").textContent = hasScore
      ? `${analysis.fitLevel || "参考结果"} · 仅为求职准备参考`
      : "材料不足，暂不评分";
    document.querySelector("#evidenceReliability").textContent = analysis.confidence || "低";
    document.querySelector("#confidenceLabel").textContent =
      `判断置信度：${analysis.confidence || "低"}`;
    document.querySelector("#hardGateLabel").textContent = hardGate.label;
    document.querySelector("#hardGateDetail").textContent = hardGate.detail;
    document.querySelector("#summaryText").textContent = analysis.summary || "";
    document.querySelector("#scoreExplanation").textContent =
      analysis.scoreExplanation || analysis.summary || "";
    document.querySelector("#reportTime").textContent = meta.createdAt
      ? `生成时间 ${meta.createdAt}`
      : "";
    document.querySelector("#modelLabel").textContent =
      meta.source === "deepseek"
        ? `${meta.model || "deepseek-flash"} · DeepSeek分析`
        : "本地模拟结果";
    const sourceBadge = document.querySelector("#sourceBadge");
    sourceBadge.textContent =
      meta.source === "deepseek" ? "DeepSeek分析结果" : "本地模拟结果";
    sourceBadge.classList.toggle("is-ai", meta.source === "deepseek");
    sourceBadge.title =
      meta.source === "deepseek"
        ? `模型：${meta.model || "deepseek-flash"}`
        : meta.fallbackReason || "当前使用本地模拟结果";

    const scoreRing = document.querySelector("#scoreRing");
    scoreRing.style.setProperty("--score", hasScore ? analysis.score : 0);
    scoreRing.classList.toggle("is-empty", !hasScore);
    document.querySelector("#scoreValue").textContent = hasScore ? analysis.score : "—";
    document.querySelector("#scoreDenominator").textContent = hasScore ? "/ 100" : "暂不评分";

    const notice = document.querySelector("#diagnosisNotice");
    notice.hidden = !analysis.notice;
    notice.innerHTML = analysis.notice
      ? `<strong>先补齐材料，再判断岗位匹配</strong>${escapeHtml(analysis.notice)}`
      : "";

    renderDimensions(analysis.dimensions);
    renderEvidence(analysis.evidenceItems);
    renderConstraints(analysis.constraints);
    renderList("#gapList", analysis.gaps, "暂未发现明确差距。");
    renderList("#suggestionList", analysis.suggestions, "暂无修改建议。");

    const requestedTab = new URLSearchParams(window.location.search).get("tab");
    const initialTab = tabs.find((tab) => tab.dataset.tab === requestedTab);
    if (initialTab) {
      activateTab(initialTab);
    }
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => activateTab(tab));
    tab.addEventListener("keydown", (event) => {
      let nextIndex = null;
      if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
      if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
      if (event.key === "Home") nextIndex = 0;
      if (event.key === "End") nextIndex = tabs.length - 1;
      if (nextIndex === null) return;
      event.preventDefault();
      activateTab(tabs[nextIndex]);
      tabs[nextIndex].focus();
    });
  });

  if (!payload?.analysis) {
    showEmptyState();
    return;
  }

  render(payload);
})();
