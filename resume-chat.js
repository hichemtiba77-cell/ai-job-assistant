(function () {
  "use strict";

  const mascot = document.querySelector("#resumeMascot");
  const historyKey = "aijob:resume-chat:v1";
  const historyLimit = 12;
  const panel = document.createElement("aside");
  panel.id = "resumeChatPanel";
  panel.className = "resume-chat";
  panel.setAttribute("aria-labelledby", "resumeChatTitle");
  panel.hidden = true;
  panel.innerHTML = `
    <header class="resume-chat-header">
      <img src="./assets/resume-mascot.png" alt="" width="44" height="44" />
      <h2 id="resumeChatTitle">求职聊天</h2>
      <button type="button" data-chat-reset>新对话</button>
      <button type="button" data-chat-expand aria-expanded="false">展开</button>
      <button type="button" data-chat-close aria-label="关闭聊天">×</button>
    </header>
    <div class="resume-chat-scroll">
      <p class="resume-chat-greeting">你好，我是简历机器人。今天想改一段经历，还是练一道面试题？</p>
      <div class="resume-chat-suggestions" aria-label="聊天建议">
        <button type="button">项目经历怎么写？</button>
        <button type="button">给我一道面试题</button>
      </div>
      <ol class="resume-chat-messages" role="log" aria-label="聊天记录" aria-live="polite"></ol>
    </div>
    <form class="resume-chat-form">
      <p class="resume-chat-status" role="status"></p>
      <div class="resume-chat-composer">
        <textarea rows="2" maxlength="2000" aria-label="聊天消息" placeholder="说说你想改哪里…"></textarea>
        <button type="submit" disabled>发送</button>
      </div>
      <p class="resume-chat-notice">消息会发送给 DeepSeek，请先隐去个人信息。</p>
    </form>
  `;
  document.body.append(panel);
  mascot.setAttribute("aria-controls", panel.id);
  mascot.setAttribute("aria-expanded", "false");
  mascot.setAttribute("aria-label", "打开求职聊天");

  const scroll = panel.querySelector(".resume-chat-scroll");
  const header = panel.querySelector(".resume-chat-header");
  const log = panel.querySelector(".resume-chat-messages");
  const suggestions = panel.querySelector(".resume-chat-suggestions");
  const form = panel.querySelector("form");
  const input = panel.querySelector("textarea");
  const send = form.querySelector('button[type="submit"]');
  const status = panel.querySelector(".resume-chat-status");
  const close = panel.querySelector("[data-chat-close]");
  const expand = panel.querySelector("[data-chat-expand]");
  const reset = panel.querySelector("[data-chat-reset]");
  const mobile = window.matchMedia("(max-width: 700px)");
  const visualViewport = window.visualViewport;
  let conversation = readHistory();
  let pending = false;
  let fileSupport;

  function readHistory() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(historyKey));
      if (Array.isArray(saved) && saved.length % 2 === 0 && saved.every((message, index) =>
        message?.role === (index % 2 ? "assistant" : "user") &&
        typeof message.content === "string" && message.content.length <= 2000
      )) return saved.slice(-historyLimit);
    } catch {
      // The current page can still hold a conversation without tab storage.
    }
    return [];
  }

  function saveHistory() {
    try {
      if (conversation.length) sessionStorage.setItem(historyKey, JSON.stringify(conversation));
      else sessionStorage.removeItem(historyKey);
    } catch {
      // The current page can still hold a conversation without tab storage.
    }
  }

  function appendMessage(message) {
    const item = document.createElement("li");
    item.className = "resume-chat-message";
    item.dataset.role = message.role;
    item.setAttribute("aria-label", message.role === "user" ? "你" : "简历机器人");
    item.textContent = message.content;
    log.append(item);
    scroll.scrollTop = scroll.scrollHeight;
    return item;
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.onload = resolve;
      script.onerror = () => {
        script.remove();
        reject(new Error("无法加载本地聊天配置，请检查项目文件后重试。"));
      };
      document.head.append(script);
    });
  }

  async function requestReply(messages) {
    if (location.protocol === "file:") {
      fileSupport ||= Promise.all([
        globalThis.AIJobAssistantResumeChat || loadScript("./resume-chat-api.js"),
        globalThis.AIJobAssistantConfig?.DEEPSEEK_CHAT_API_KEY || loadScript("./config.local.js"),
      ]).catch((error) => {
        fileSupport = undefined;
        throw error;
      });
      await fileSupport;
      return globalThis.AIJobAssistantResumeChat.requestReply(
        globalThis.AIJobAssistantConfig?.DEEPSEEK_CHAT_API_KEY,
        messages,
      );
    }

    const response = await fetch("./api/resume-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
      signal: AbortSignal.timeout(35_000),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || typeof data.reply !== "string" || !data.reply.trim()) {
      throw new Error(data.error || "聊天暂时不可用，请重新打开求职助手后重试。");
    }
    return data.reply;
  }

  function updateControls() {
    send.disabled = pending || !input.value.trim();
    reset.disabled = pending || (!conversation.length && !input.value.trim());
    input.readOnly = pending;
    suggestions.hidden = pending || conversation.length > 0;
  }

  function setExpanded(expanded) {
    panel.classList.toggle("is-expanded", expanded);
    expand.setAttribute("aria-expanded", String(expanded));
    expand.textContent = expanded ? "缩小" : "展开";
    fitMobileViewport();
    scroll.scrollTop = scroll.scrollHeight;
  }

  function fitMobileViewport() {
    if (!mobile.matches || panel.hidden || visualViewport?.scale !== 1) return;
    const bottom = Math.max(0, window.innerHeight - visualViewport.height - visualViewport.offsetTop);
    panel.style.setProperty("--chat-visible-height", `${visualViewport.height}px`);
    panel.style.setProperty("--chat-visible-bottom", `${bottom}px`);
    const top = visualViewport.offsetTop + 8;
    const mascotTop = top + mascot.offsetHeight + 8 <= panel.offsetTop
      ? top
      : panel.offsetTop + header.offsetHeight + 6;
    mascot.style.setProperty("--resume-chat-mascot-top", `${mascotTop}px`);
  }

  function setOpen(open) {
    panel.hidden = !open;
    document.body.classList.toggle("resume-chat-open", open);
    mascot.setAttribute("aria-expanded", String(open));
    mascot.setAttribute("aria-label", open ? "关闭求职聊天" : "打开求职聊天");
    if (open) {
      fitMobileViewport();
      scroll.scrollTop = scroll.scrollHeight;
      (mobile.matches ? close : input).focus({ preventScroll: true });
    } else {
      setExpanded(false);
      mascot.focus({ preventScroll: true });
    }
  }

  mascot.addEventListener("resume-mascot:activate", () => setOpen(panel.hidden));
  window.addEventListener("resume-chat:open", (event) => {
    if (!pending && !input.value.trim() && typeof event.detail?.draft === "string") {
      input.value = event.detail.draft.slice(0, input.maxLength);
      updateControls();
    }
    setOpen(true);
  });
  close.addEventListener("click", () => setOpen(false));
  expand.addEventListener("click", () => setExpanded(!panel.classList.contains("is-expanded")));
  visualViewport?.addEventListener("resize", fitMobileViewport);
  visualViewport?.addEventListener("scroll", fitMobileViewport);
  panel.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || event.isComposing) return;
    event.preventDefault();
    setOpen(false);
  });
  input.addEventListener("input", updateControls);
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.shiftKey || event.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    if (!send.disabled) form.requestSubmit();
  });
  suggestions.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    input.value = button.textContent.trim();
    updateControls();
    input.focus();
  });
  reset.addEventListener("click", () => {
    conversation = [];
    input.value = "";
    status.textContent = "";
    log.replaceChildren();
    saveHistory();
    updateControls();
    input.focus();
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const content = input.value.trim();
    if (pending || !content) return;
    const user = { role: "user", content };
    const row = appendMessage(user);
    pending = true;
    input.value = "";
    status.textContent = "正在想怎么帮你…";
    status.classList.remove("is-error");
    updateControls();
    try {
      const reply = await requestReply([...conversation, user]);
      const assistant = { role: "assistant", content: reply };
      conversation = [...conversation, user, assistant].slice(-historyLimit);
      appendMessage(assistant);
      saveHistory();
      status.textContent = "";
    } catch (error) {
      row.remove();
      input.value = content;
      status.textContent = error?.name === "TimeoutError" ? "这次等得有点久，请再发一次。" :
        error instanceof TypeError ? "暂时连不上聊天服务，请检查网络后重试。" : error.message;
      status.classList.add("is-error");
    } finally {
      pending = false;
      updateControls();
      if (!panel.hidden && !mobile.matches && document.activeElement === document.body) input.focus();
    }
  });

  conversation.forEach(appendMessage);
  updateControls();
})();
