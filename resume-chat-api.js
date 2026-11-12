(function () {
  "use strict";

  const model = "deepseek-flash";
  const maxMessages = 13;
  const maxMessageLength = 2000;
  const maxReplyLength = 50;
  const systemPrompt = [
    "你是「职引者」里的简历机器人，像一位友善、务实的校园求职搭档。",
    "协助修改简历、理解岗位要求和练习面试。根据用户实际提供的信息，优先给一个现在就能做的具体动作。",
    "信息不足时只问一个关键问题。可以写一句示例，示例里的具体数据用［次数］等占位。严禁替用户编造经历、数据或招聘要求。",
    "用自然中文，通常 30 到 50 个字符，最多 50 个字符，标点也计入。只写一到两句完整的话，直接进入主题。",
    "轻松但不卖萌，避免套话、标题、列表、Markdown 和表情符号。",
  ].join("\n");

  class ChatError extends Error {
    constructor(status, message) {
      super(message);
      this.status = status;
    }
  }

  function validateMessages(messages) {
    if (!Array.isArray(messages) || !messages.length ||
        messages.length > maxMessages || messages.length % 2 === 0) {
      throw new ChatError(400, "聊天内容格式不正确，请重新发送。");
    }
    return messages.map((message, index) => {
      const role = index % 2 ? "assistant" : "user";
      const content = typeof message?.content === "string" ? message.content.trim() : "";
      if (message?.role !== role || !content || content.length > maxMessageLength) {
        throw new ChatError(400, "每条聊天消息须为 1–2000 字。");
      }
      return { role, content };
    });
  }

  function shortenReply(value) {
    const text = typeof value === "string" ? value.trim().replace(/\s*\r?\n\s*/g, " ") : "";
    const characters = Array.from(text);
    if (characters.length <= maxReplyLength) return text;
    const prefix = characters.slice(0, maxReplyLength).join("");
    const sentenceEnd = Math.max(...["。", "！", "？", "!", "?"].map((mark) => prefix.lastIndexOf(mark)));
    if (sentenceEnd >= 20) return prefix.slice(0, sentenceEnd + 1);
    return characters.slice(0, maxReplyLength - 1).join("").trimEnd() + "…";
  }

  async function requestReply(key, messages) {
    const conversation = validateMessages(messages);
    if (!key) throw new ChatError(503, "聊天密钥尚未配置。");

    let response;
    let data;
    try {
      response = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        redirect: "error",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: [{ role: "system", content: systemPrompt }, ...conversation],
          thinking: { type: "disabled" },
          temperature: 0.5,
          max_tokens: 110,
          stream: false,
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (response.ok) data = await response.json();
      else await response.body?.cancel();
    } catch (error) {
      if (error?.name === "TimeoutError" || error?.name === "AbortError") {
        throw new ChatError(504, "这次等得有点久，请再发一次。");
      }
      throw new ChatError(502, "暂时连不上 DeepSeek，请检查网络后重试。");
    }

    if (response.status === 401 || response.status === 403) {
      throw new ChatError(502, "DeepSeek 拒绝了聊天密钥，请检查密钥是否有效。");
    }
    if (response.status === 402) throw new ChatError(502, "聊天密钥的余额不足，请充值后重试。");
    if (response.status === 429) throw new ChatError(429, "DeepSeek 正忙，稍等片刻再试。");
    if (!response.ok) throw new ChatError(502, "DeepSeek 暂时无法回复，请再试一次。");

    const reply = shortenReply(data?.choices?.[0]?.message?.content);
    if (!reply) throw new ChatError(502, "这次没有收到回复，请再试一次。");
    return reply;
  }

  globalThis.AIJobAssistantResumeChat = { requestReply, ChatError, maxMessages };
})();
