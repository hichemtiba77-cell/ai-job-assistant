(async () => {
  "use strict";

  const cloud = window.CareerCloud;
  const status = document.querySelector("#archiveMessage");
  const list = document.querySelector("#archiveList");
  const logout = document.querySelector("#signOut");
  const date = new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" });

  function message(text, isError = false) {
    status.textContent = text;
    status.classList.toggle("is-error", isError);
  }

  function node(tag, text, className) {
    const element = document.createElement(tag);
    if (text) element.textContent = text;
    if (className) element.className = className;
    return element;
  }

  function link(label, page, key, value) {
    const element = node("a", label);
    element.href = `./${page}.html?${key}=${encodeURIComponent(value)}`;
    return element;
  }

  function newestFirst(items) {
    return [...items].sort((left, right) => right.created_at.localeCompare(left.created_at));
  }

  function confirmDelete(table, id, prompt, onSuccess) {
    const button = node("button", table === "resumes" ? "删除简历" : "删除此版本", "text-button is-danger");
    button.type = "button";
    button.addEventListener("click", async () => {
      if (!window.confirm(prompt)) return;
      button.disabled = true;
      try {
        const rows = cloud.value(await cloud.client.from(table).delete().eq("id", id).select("id"));
        if (rows.length !== 1) throw new Error("Unavailable record");
        onSuccess();
        message(list.childElementCount ? "记录已删除。" : "还没有保存的简历。你可以回到诊断页保存一份。");
      } catch {
        message("删除未完成，请检查网络和登录状态后重试。", true);
        button.disabled = false;
      }
    });
    return button;
  }

  function versionDetails(version) {
    const details = node("details");
    const source = version.source === "upload" ? "上传 PDF" : "手动编辑";
    const summary = node("summary", `${date.format(new Date(version.created_at))} · ${source}`);
    const text = node("p", "正在读取简历文字…", "version-text");
    const actions = node("div", null, "archive-actions");
    actions.append(
      link("继续修改", "index", "version", version.id),
      confirmDelete("resume_versions", version.id, "删除这个简历版本及关联的诊断报告？", () => {
        for (const report of version.analysis_reports) window.ResumeMascotReminders?.forgetReport(report.id);
        details.remove();
      }),
    );
    details.append(summary, text, actions);

    const reports = node("ul");
    for (const report of newestFirst(version.analysis_reports)) {
      const item = node("li");
      item.append(link(`诊断报告 · ${date.format(new Date(report.created_at))}`, "report", "id", report.id));
      reports.append(item);
    }
    if (reports.childElementCount) details.append(reports);

    let loaded = false;
    let loading = false;
    details.addEventListener("toggle", async () => {
      if (!details.open || loaded || loading) return;
      loading = true;
      try {
        const current = await cloud.readVersion(version.id);
        if (!current) throw new Error("Unavailable version");
        text.textContent = current.content;
        loaded = true;
      } catch {
        text.textContent = "暂时无法读取简历。收起后重新展开可以重试。";
      } finally {
        loading = false;
      }
    });
    return details;
  }

  function resumeCard(resume) {
    const article = node("article");
    const actions = node("div", null, "archive-actions");
    actions.append(
      node("h3", resume.title),
      confirmDelete("resumes", resume.id, "删除这份简历及其全部版本和诊断报告？", () => {
        for (const report of resume.resume_versions.flatMap((version) => version.analysis_reports)) {
          window.ResumeMascotReminders?.forgetReport(report.id);
        }
        article.remove();
      }),
    );
    article.append(actions);
    for (const version of newestFirst(resume.resume_versions)) article.append(versionDetails(version));
    return article;
  }

  const user = (await cloud?.requireSession())?.user;
  if (!user) return;
  window.ResumeMascotReminders?.start(user.id);

  try {
    document.querySelector("#accountEmail").textContent = user.email || "";
    logout.hidden = false;
    logout.addEventListener("click", async () => {
      logout.disabled = true;
      try {
        await cloud.signOut();
      } catch {
        message("退出登录未完成，请重试。", true);
        logout.disabled = false;
      }
    });
    const resumes = cloud.value(await cloud.client.from("resumes")
      .select("id, title, resume_versions(id, source, created_at, analysis_reports(id, created_at))")
      .order("created_at", { ascending: false }));
    list.replaceChildren(...resumes.map(resumeCard));
    list.hidden = resumes.length === 0;
    message(resumes.length ? "" : "还没有保存的简历。你可以回到诊断页保存一份。");
  } catch {
    message("暂时无法读取档案，请检查网络后刷新页面。", true);
  }
})();
