(() => {
  "use strict";

  const STORAGE_KEY = "aijob:interview:v1";
  const setup = document.querySelector("#interviewSetup");
  const practice = document.querySelector("#interviewPractice");
  const result = document.querySelector("#interviewResult");
  const answer = document.querySelector("#interviewAnswer");
  const previous = document.querySelector("#interviewPrevious");
  const next = document.querySelector("#interviewContinue");
  const status = document.querySelector("#interviewStatus");
  const levelLabels = { basic: "基础表达", standard: "岗位实战", challenge: "深度追问" };

  function read(key) {
    try {
      return JSON.parse(sessionStorage.getItem(key) || "null");
    } catch {
      return null;
    }
  }

  function showUnavailable(message) {
    document.querySelector("#interviewUnavailable").hidden = false;
    if (message) document.querySelector("#interviewUnavailableText").textContent = message;
  }

  const report = read("aijob:diagnosis:v1");
  if (!report?.analysis || !report.input?.job) {
    showUnavailable();
    return;
  }

  const title = report.analysis.jobRubric?.title || report.meta?.jobTitle || "当前目标岗位";
  document.querySelector("#interviewJob").textContent = title;

  // Match a saved practice to its source report without duplicating the resume in storage.
  let reportHash = 2166136261;
  for (const character of JSON.stringify([report.input, report.meta?.createdAt])) {
    reportHash = Math.imul(reportHash ^ character.codePointAt(0), 16777619);
  }
  const saved = read(STORAGE_KEY);
  let state = saved?.reportHash === reportHash ? saved : { reportHash, difficulty: "standard" };

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
      state = { reportHash, difficulty, questions, index: 0, answers: [] };
      save();
      showQuestion();
      message("");
    } catch (error) {
      message(error.message, true);
    } finally {
      button.disabled = false;
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

    next.disabled = previous.disabled = answer.readOnly = true;
    message("正在整理逐题反馈和下一步练习…");
    try {
      state.result = await request("feedback", {
        difficulty: state.difficulty,
        responses: state.questions.map((question, index) => ({ ...question, answer: state.answers[index] })),
      });
      save();
      showResult();
      message("");
    } catch (error) {
      message(error.message, true);
    } finally {
      next.disabled = previous.disabled = answer.readOnly = false;
    }
  });

  document.querySelector("#interviewRestart").addEventListener("click", () => {
    state = { reportHash, difficulty: state.difficulty, previousQuestions: state.questions.map(({ prompt }) => prompt) };
    save();
    showSetup();
    setup.querySelector("input:checked")?.focus();
  });

  if (state.result) showResult(false);
  else if (state.questions) showQuestion(false);
  else showSetup();
})();
