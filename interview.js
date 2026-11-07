(() => {
  "use strict";

  const STORAGE_KEY = "aijob:interview:v1";
  const panel = document.querySelector("#mockInterview");
  const setup = document.querySelector("#interviewSetup");
  const practice = document.querySelector("#interviewPractice");
  const result = document.querySelector("#interviewResult");
  const answer = document.querySelector("#interviewAnswer");
  const previous = document.querySelector("#interviewPrevious");
  const next = document.querySelector("#interviewContinue");
  const status = document.querySelector("#interviewStatus");
  const levelLabels = { basic: "基础表达", standard: "岗位实战", challenge: "深度追问" };
  let report;
  let title;
  let reportHash;
  let state;

  function read(key) {
    try {
      return JSON.parse(sessionStorage.getItem(key) || "null");
    } catch {
      return null;
    }
  }

  function open(payload, { saved = true } = {}) {
    if (!payload?.analysis || !payload.input?.job) return;
    report = payload;
    const { analysis, meta } = report;
    title = analysis.jobRubric?.title || meta?.jobTitle || "当前目标岗位";
    document.querySelector("#interviewJob").textContent = title;
    document.querySelector("#interviewDiagnosis").textContent = [
      Number.isFinite(analysis.score) ? `匹配参考 ${analysis.score} 分` : "本次诊断已完成",
      analysis.fitLevel,
    ].filter(Boolean).join(" · ");
    panel.querySelector(".interview-return").hidden = !saved;

    // Match saved practice to this report without duplicating the resume in storage.
    reportHash = 2166136261;
    for (const character of JSON.stringify([report.input, meta?.createdAt])) {
      reportHash = Math.imul(reportHash ^ character.codePointAt(0), 16777619);
    }
    const practiceState = read(STORAGE_KEY);
    state = practiceState?.reportHash === reportHash ? practiceState : { reportHash, difficulty: "standard" };

    setup.querySelector("button").disabled = false;
    next.disabled = previous.disabled = answer.readOnly = false;
    message("");
    panel.hidden = false;
    if (state.result) showResult(false);
    else if (state.questions) showQuestion(false);
    else showSetup();
    try {
      history.replaceState(null, "", "#mockInterview");
    } catch {
      // Some browsers restrict history changes for local files.
    }
    panel.scrollIntoView();
    document.querySelector("#interviewTitle").focus({ preventScroll: true });
  }

  function save() {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Practice can continue in memory when storage is unavailable.
    }
  }

  function message(text, isError = false) {
    status.textContent = text;
    status.classList.toggle("is-error", isError);
  }

  async function request(path, body) {
    if (location.protocol === "file:") {
      return window.AIJobAssistantBrowserApi.requestInterviewDirect(path, body);
    }
    const response = await fetch(`/api/interview/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(90_000),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data) {
      throw new Error(data?.error || "无法连接面试服务，请重试。");
    }
    return data;
  }

  function showSetup() {
    setup.hidden = false;
    practice.hidden = true;
    result.hidden = true;
    setup.elements.difficulty.value = state.difficulty;
  }

  function showQuestion(focus = true) {
    const question = state.questions[state.index];
    setup.hidden = true;
    result.hidden = true;
    practice.hidden = false;
    document.querySelector("#interviewProgress").textContent =
      `第 ${state.index + 1} / ${state.questions.length} 题 · ${levelLabels[state.difficulty]}`;
    const heading = document.querySelector("#interviewQuestion");
    heading.textContent = question.prompt;
    document.querySelector("#interviewReference").textContent =
      `${question.focus} · ${question.requirementId} ${question.requirement}`;
    answer.value = state.answers[state.index] || "";
    previous.hidden = state.index === 0;
    next.textContent = state.index === state.questions.length - 1 ? "提交并查看反馈 →" : "下一题 →";
    if (focus) heading.focus();
  }

  function showResult(focus = true) {
    setup.hidden = true;
    practice.hidden = true;
    result.hidden = false;
    document.querySelector("#interviewSummary").textContent = state.result.summary;
    document.querySelector("#interviewNextAction").textContent = state.result.nextAction;
    document.querySelector("#interviewFeedback").replaceChildren(...state.result.feedback.map((row, index) => {
      const item = document.createElement("li");
      const question = document.createElement("strong");
      question.textContent = state.questions[index].prompt;
      const strength = document.createElement("p");
      strength.textContent = `回答亮点 · ${row.strength}`;
      const improvement = document.createElement("p");
      improvement.textContent = `优先改进 · ${row.improvement}`;
      item.append(question, strength, improvement);
      return item;
    }));
    if (focus) document.querySelector("#interviewResultTitle").focus();
  }

  setup.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = setup.querySelector("button");
    if (button.disabled) return;
    const activeReport = report;
    button.disabled = true;
    message("正在整理考察项并生成面试题…");
    const difficulty = setup.elements.difficulty.value;
    try {
      const { questions } = await request("start", {
        difficulty,
        jobTitle: title,
        job: report.input.job,
        requirements: report.analysis.jobRubric?.requirements,
        evidenceItems: report.analysis.evidenceItems,
        previousQuestions: state.previousQuestions,
      });
      if (activeReport !== report) return;
      state = { reportHash, difficulty, questions, index: 0, answers: [] };
      save();
      showQuestion();
      message("");
    } catch (error) {
      if (activeReport === report) message(error.message, true);
    } finally {
      if (activeReport === report) button.disabled = false;
    }
  });

  answer.addEventListener("input", () => {
    state.answers[state.index] = answer.value;
    save();
  });

  previous.addEventListener("click", () => {
    state.index -= 1;
    save();
    message("");
    showQuestion();
  });

  practice.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (next.disabled) return;
    const text = answer.value.trim();
    if (!text) {
      message("请先填写你的回答。", true);
      answer.focus();
      return;
    }
    state.answers[state.index] = text;
    save();
    if (state.index < state.questions.length - 1) {
      state.index += 1;
      save();
      message("");
      showQuestion();
      return;
    }

    const activeReport = report;
    next.disabled = previous.disabled = answer.readOnly = true;
    message("正在整理逐题反馈和下一步练习…");
    try {
      const feedback = await request("feedback", {
        difficulty: state.difficulty,
        responses: state.questions.map((question, index) => ({ ...question, answer: state.answers[index] })),
      });
      if (activeReport !== report) return;
      state.result = feedback;
      save();
      showResult();
      message("");
    } catch (error) {
      if (activeReport === report) message(error.message, true);
    } finally {
      if (activeReport === report) next.disabled = previous.disabled = answer.readOnly = false;
    }
  });

  document.querySelector("#interviewRestart").addEventListener("click", () => {
    state = { reportHash, difficulty: state.difficulty, previousQuestions: state.questions.map(({ prompt }) => prompt) };
    save();
    showSetup();
    setup.querySelector("input:checked")?.focus();
  });

  window.AIJobAssistantInterview = { open };
  if (location.hash === "#mockInterview" || new URLSearchParams(location.search).has("interview")) {
    open(read("aijob:diagnosis:v1"));
  }
})();
