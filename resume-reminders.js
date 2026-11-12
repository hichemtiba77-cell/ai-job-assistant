(function () {
  "use strict";

  const signInKey = "aijob:resume-reminder-sign-in";
  const reminderMinutes = 5;
  const reminderDelay = reminderMinutes * 60_000;
  const analysisMessages = {
    request: "我在看你的简历和岗位，稍等一下。",
    rubric: "我在梳理这个岗位最看重的能力。",
    evidence: "我在一条条核对你的经历和岗位要求。",
    scoring: "我在整理结果，看看哪些地方值得先改。",
    cache: "找到上次的分析了，马上打开报告。",
    done: "分析完成了，一起看看吧！",
    failed: "这次分析卡住了，点「重试」我再试一次。",
  };
  const workspaceLines = [
    "项目经历里，你亲手做的那一步最值得写清楚。",
    "如果一段经历太长，先挑一句能证明你做过什么的话。",
    "有真实的结果数字？把它放在对应的行动后面。",
    "卡在开头也没关系，先写下你负责的那件事。",
    "选一个岗位要求，找找简历里哪段经历最能对应它。",
    "写到一半想不通？点我，我们可以只聊这一句。",
  ];
  const reportLines = [
    "这份报告可以分几次看，先挑一条最容易改的建议。",
    "遇到没找到证据的条目，可以回想有没有相近的真实经历。",
    "先看看你的个人贡献写清楚了没有。",
    "改完一段再重新诊断，前后对照起来更容易。",
  ];
  const interviewLines = [
    "回答前可以先想一句结论，再补一个具体例子。",
    "练面试时，试着用一句话讲清你自己做了什么。",
    "说结果前可以先讲讲你当时遇到的难点。",
  ];
  const mascot = document.querySelector("#resumeMascot");
  const workspace = document.querySelector("[data-auth-workspace]");
  const chat = document.querySelector("#resumeChatPanel");
  let stateKey;
  let state = { welcomed: false, seen: [], scheduled: [], task: null };
  let returned = false;
  let visibleSince = Date.now();
  let report;
  let reportEnd;
  let bubble;
  let notice;
  let analysis;
  let analysisDismissed = false;
  let revisionTask;
  let nextAsideAt;
  let lastAside;
  let lastInputAt = 0;

  function noteSignIn() {
    try { sessionStorage.setItem(signInKey, "1"); } catch { /* Optional session storage. */ }
  }

  function tabNote(name, value) {
    try {
      const key = `${stateKey}:${name}`;
      if (value === undefined) return sessionStorage.getItem(key);
      if (value === null) sessionStorage.removeItem(key);
      else sessionStorage.setItem(key, value);
    } catch { /* Optional session storage. */ }
    return null;
  }

  function noteAnalysisComplete(id) {
    if (stateKey) tabNote("complete", id);
  }

  function scheduleAside(now) {
    nextAsideAt = now + 15_000 + Math.random() * 5000;
  }

  function rememberReportTask(now) {
    if (state.task?.id === report.id) return;
    state.task = {
      id: report.id,
      suggestion: report.suggestion,
      dueAt: now + reminderDelay,
      followedUp: false,
    };
  }

  function readState() {
    try {
      const saved = JSON.parse(localStorage.getItem(stateKey));
      if (saved && Array.isArray(saved.seen) && Array.isArray(saved.scheduled)) {
        state = saved;
        const previousDelay = state.reminderDelay ?? 20 * 60_000;
        if (previousDelay !== reminderDelay) {
          for (const task of [state.task, ...state.scheduled]) {
            if (task && Number.isFinite(task.dueAt)) task.dueAt += reminderDelay - previousDelay;
          }
          saveState();
        }
      }
      else if (saved === null) state = { welcomed: false, seen: [], scheduled: [], task: null };
    } catch { /* Keep the in-page state when storage is unavailable. */ }
  }

  function saveState() {
    state.reminderDelay = reminderDelay;
    try { localStorage.setItem(stateKey, JSON.stringify(state)); } catch { /* Optional local storage. */ }
  }

  function positionBubble() {
    if (!notice) return;
    const viewport = window.visualViewport;
    const leftEdge = viewport?.offsetLeft || 0;
    const topEdge = viewport?.offsetTop || 0;
    const width = viewport?.width || document.documentElement.clientWidth;
    const height = viewport?.height || window.innerHeight;
    const bounds = mascot.getBoundingClientRect();
    const gap = 8;
    const center = bounds.left + bounds.width / 2;
    const left = Math.max(leftEdge + gap, Math.min(center - bubble.offsetWidth / 2,
      leftEdge + width - bubble.offsetWidth - gap));
    const above = bounds.top - bubble.offsetHeight - gap;
    const below = above < topEdge + gap;
    const top = Math.max(topEdge + gap, Math.min(below ? bounds.bottom + gap : above,
      topEdge + height - bubble.offsetHeight - gap));
    bubble.dataset.side = below ? "below" : "above";
    bubble.style.left = `${left}px`;
    bubble.style.top = `${top}px`;
    bubble.style.setProperty("--reminder-tail", `${Math.max(14, Math.min(center - left, bubble.offsetWidth - 14))}px`);
  }

  function dismiss() {
    notice = null;
    bubble.hidden = true;
  }

  function show(kind, task, now) {
    const duration = { welcome: 15_000, returning: 14_000, complete: 6500, revise: 12_000, aside: 6500 };
    notice = { kind, task, until: now + (duration[kind] ?? 60_000) };
    scheduleAside(now);
    bubble.dataset.kind = kind;
    const message = bubble.querySelector(".resume-reminder-message");
    const actions = bubble.querySelector(".resume-reminder-actions");
    actions.replaceChildren();
    const preview = task && Array.from(task.suggestion);
    const excerpt = preview && (preview.length > 72 ? preview.slice(0, 71).join("") + "…" : task.suggestion);

    function addAction(label, action) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.addEventListener("click", action);
      actions.append(button);
    }

    const lines = {
      welcome: "你好，我是简历机器人。今天想先改简历，还是练一道面试题？",
      returning: task ? "欢迎回来！上次那条建议，要不要继续改？" :
        "欢迎回来！今天想继续改简历，还是练一道面试题？",
      complete: "分析完成了，一起看看吧！",
      revise: "要不要先改一处？把想改的那段发给我，我陪你一起改。",
      report: `这份报告可以先改一处。${excerpt}`,
      "follow-up": `上次那条改得怎么样了？${excerpt}`,
      aside: lastAside,
    };
    message.textContent = lines[kind];

    if (kind === "complete") {
      addAction("一起看看", () => {
        dismiss();
        report?.openSuggestions?.();
      });
    } else if (kind !== "aside") {
      addAction(task ? "一起看看" : "聊一聊", () => {
        dismiss();
        const draft = task ? `报告建议：${task.suggestion}\n这条具体应该怎么改？` : "";
        window.dispatchEvent(new CustomEvent("resume-chat:open", { detail: { draft } }));
      });
    }
    if (task) {
      addAction(`${reminderMinutes} 分钟后提醒`, () => {
        state.scheduled = state.scheduled.filter((item) => item.id !== task.id);
        state.scheduled.push({ ...task, dueAt: Date.now() + reminderDelay });
        if (state.task?.id === task.id) state.task.followedUp = true;
        saveState();
        dismiss();
      });
      if (kind !== "report") {
        addAction("改好了", () => forgetReport(task.id));
      }
    }
    bubble.hidden = false;
    positionBubble();
  }

  function setAnalysisProgress(stage) {
    if (!bubble || !Object.hasOwn(analysisMessages, stage)) return;
    if (stage === "request") analysisDismissed = false;
    const duration = stage === "failed" ? 6500 : stage === "done" ? 1200 : Infinity;
    analysis = { stage, until: Date.now() + duration };
    tick();
  }

  function tick() {
    if (document.hidden || workspace.hidden || !chat?.hidden || document.querySelector("dialog:modal")) {
      if (notice) dismiss();
      if (Date.now() >= nextAsideAt) scheduleAside(Date.now());
      return;
    }
    const now = Date.now();
    if (analysis && now >= analysis.until) {
      analysis = null;
      if (notice?.kind === "analysis") dismiss();
    }
    if (analysis) {
      if (analysisDismissed) return;
      if (notice?.stage !== analysis.stage) {
        notice = { kind: "analysis", stage: analysis.stage };
        bubble.dataset.kind = "analysis";
        bubble.querySelector(".resume-reminder-actions").replaceChildren();
        bubble.querySelector(".resume-reminder-message").textContent = analysisMessages[analysis.stage];
        bubble.hidden = false;
      }
      positionBubble();
      return;
    }
    const visibleFor = now - visibleSince;
    if (notice) {
      if (now >= notice.until && !bubble.matches(":hover, :focus-within")) dismiss();
      else positionBubble();
      return;
    }
    const due = state.scheduled.find((task) => task.dueAt <= now);
    if (report?.completed) {
      report.completed = false;
      tabNote("complete", null);
      show("complete", null, now);
      return;
    }
    if (returned && state.welcomed && visibleFor >= 1800) {
      returned = false;
      const task = due || (state.scheduled.some((item) => item.id === state.task?.id) ? null : state.task);
      if (due) state.scheduled = state.scheduled.filter((item) => item !== due);
      if (task && state.task?.id === task.id) state.task.followedUp = true;
      saveState();
      show("returning", task, now);
      return;
    }
    if (due && visibleFor >= 1200) {
      state.scheduled = state.scheduled.filter((task) => task !== due);
      saveState();
      show("follow-up", due, now);
      return;
    }
    if (report?.suggestion && !state.seen.includes(report.id)) {
      const readingTime = now - Math.max(report.openedAt, visibleSince);
      if (readingTime < (report.endSeen ? 4500 : 10_000)) return;
      state.seen = [...state.seen, report.id].slice(-40);
      state.welcomed = true;
      rememberReportTask(now);
      returned = false;
      saveState();
      show("report", state.task, now);
      return;
    }
    if (!state.welcomed && visibleFor >= 1500) {
      state.welcomed = true;
      returned = false;
      saveState();
      show("welcome", null, now);
      return;
    }
    const task = state.task;
    if (task && !task.followedUp && task.dueAt <= now && visibleFor >= 3000) {
      task.followedUp = true;
      saveState();
      show("follow-up", task, now);
      return;
    }
    if (revisionTask && visibleFor >= 2500) {
      state.revised = [...(state.revised || []), revisionTask.id].slice(-40);
      saveState();
      show("revise", revisionTask, now);
      revisionTask = null;
      return;
    }
    if (now >= nextAsideAt && now - lastInputAt > 3500) {
      const pool = (report ? reportLines :
        document.body.classList.contains("lake-interview") ? interviewLines : workspaceLines)
        .filter((line) => line !== lastAside);
      lastAside = pool[Math.floor(Math.random() * pool.length)];
      show("aside", null, now);
    }
  }

  function start(userId) {
    if (stateKey || !userId || !mascot || !workspace || !chat) return;
    stateKey = `aijob:resume-reminders:v1:${userId}`;
    readState();
    const previousReport = tabNote("previous-report");
    tabNote("previous-report", null);
    if (document.body.classList.contains("lake-materials") && state.task && previousReport === state.task.id &&
        !state.revised?.includes(state.task.id)) revisionTask = state.task;
    try {
      returned = sessionStorage.getItem(signInKey) === "1";
      sessionStorage.removeItem(signInKey);
    } catch { /* The elapsed-time reminder still works. */ }
    bubble = document.createElement("aside");
    bubble.className = "resume-reminder";
    bubble.setAttribute("aria-label", "简历机器人提醒");
    bubble.hidden = true;
    bubble.innerHTML = `
      <p class="resume-reminder-message" role="status"></p>
      <button class="resume-reminder-close" type="button" aria-label="关闭提醒">×</button>
      <div class="resume-reminder-actions"></div>
    `;
    bubble.querySelector(".resume-reminder-close").addEventListener("click", () => {
      if (notice?.kind === "analysis") analysisDismissed = true;
      dismiss();
    });
    document.body.append(bubble);
    visibleSince = Date.now();
    scheduleAside(visibleSince);
    window.setInterval(tick, 1000);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        visibleSince = Date.now();
        scheduleAside(visibleSince);
      }
      tick();
    });
    window.addEventListener("storage", (event) => {
      if (event.key === stateKey) readState();
    });
    window.addEventListener("resize", positionBubble);
    window.addEventListener("pagehide", () => {
      if (!report) return;
      if (report.suggestion && !state.seen.includes(report.id) && state.task?.id !== report.id) {
        rememberReportTask(Date.now());
        saveState();
      }
      tabNote("previous-report", report.id);
    });
    workspace.addEventListener("input", () => { lastInputAt = Date.now(); });
    window.visualViewport?.addEventListener("resize", positionBubble);
    window.visualViewport?.addEventListener("scroll", positionBubble);
    mascot.addEventListener("pointermove", positionBubble);
    mascot.addEventListener("resume-mascot:activate", () => {
      if (notice && !chat.hidden) dismiss();
    });
  }

  function watchReport({ id, suggestion, end, openSuggestions }) {
    if (!stateKey) return;
    reportEnd?.disconnect();
    const reportId = String(id || "latest");
    report = { id: reportId, suggestion: typeof suggestion === "string" ? suggestion.trim().slice(0, 400) : "",
      completed: tabNote("complete") === reportId, openSuggestions, openedAt: Date.now(), endSeen: false };
    if (end && report.suggestion && !state.seen.includes(report.id) && "IntersectionObserver" in window) {
      reportEnd = new IntersectionObserver((entries, observer) => {
        if (!entries.some((entry) => entry.isIntersecting) || document.hidden) return;
        report.endSeen = true;
        observer.disconnect();
      }, { threshold: 0.5 });
      reportEnd.observe(end);
    }
  }

  function forgetReport(id) {
    if (!stateKey) return;
    const reportId = String(id || "latest");
    if (report?.id === reportId) {
      reportEnd?.disconnect();
      report = null;
    }
    if (state.task?.id === reportId) {
      state.task = null;
      if (!state.seen.includes(reportId)) state.seen = [...state.seen, reportId].slice(-40);
    }
    if (revisionTask?.id === reportId) revisionTask = null;
    state.scheduled = state.scheduled.filter((task) => task.id !== reportId);
    if (notice?.task?.id === reportId) dismiss();
    saveState();
  }

  window.ResumeMascotReminders = { start, watchReport, noteSignIn, noteAnalysisComplete, forgetReport, setAnalysisProgress };
})();
