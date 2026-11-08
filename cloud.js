(() => {
  "use strict";

  const supported = window.isSecureContext && ["http:", "https:", "file:"].includes(location.protocol);
  const fileMode = location.protocol === "file:";
  const callback = new URLSearchParams(location.hash.slice(1));
  let localAuth;
  if (supported && fileMode) {
    try {
      const key = sessionStorage.getItem("aijob:local-auth-key") || crypto.randomUUID();
      sessionStorage.setItem("aijob:local-auth-key", key);
      localAuth = { storage: sessionStorage, storageKey: "aijob:auth:" + key, detectSessionInUrl: false };
    } catch {
      // Some browsers disable storage for local files.
    }
  }
  const client = supported && (!fileMode || localAuth) && window.supabase?.createClient(
    "https://smdqrjqxmyzvsgmpjrzp.supabase.co",
    "sb_publishable_r-_D8p47FHEv2LcNGaPH-w_qr7tnKMz",
    localAuth ? { auth: localAuth } : undefined,
  );
  const workspace = document.querySelector("[data-auth-workspace]");
  let currentUserId;
  let signingOut = false;

  function loginUrl(next = (location.pathname.split("/").pop() || "index.html") + location.search) {
    return "./auth.html?next=" + encodeURIComponent(next);
  }

  function safeNext(value) {
    if (!value) return "./index.html";
    let url;
    try {
      url = new URL(value, location.href);
    } catch {
      return "./index.html";
    }
    const pages = ["./index.html", "./report.html", "./history.html", "./interview.html"];
    if (!fileMode) pages.push("./");
    const isLocalPage = pages.some((page) => new URL(page, location.href).pathname === url.pathname);
    if (url.protocol !== location.protocol || url.host !== location.host || !isLocalPage) {
      return "./index.html";
    }
    return url.href;
  }

  function value({ data, error }) {
    if (error) throw error;
    return data;
  }

  async function session() {
    return value(await client.auth.getSession()).session;
  }

  async function requireSession() {
    const current = client ? await session().catch(() => null) : null;
    if (!current?.user) {
      location.replace(loginUrl());
      return null;
    }
    workspace.hidden = false;
    return current;
  }

  async function signOut() {
    signingOut = true;
    try {
      value(await client.auth.signOut({ scope: "local" }));
      location.replace("./auth.html");
    } finally {
      signingOut = false;
    }
  }

  async function saveRecord({ resumeId, versionId, title, content, source, reportId, job, result }, accessToken) {
    return value(await client.rpc("save_career_record", {
      p_resume_id: resumeId,
      p_version_id: versionId,
      p_title: title ?? null,
      p_content: content,
      p_source: source,
      p_report_id: reportId ?? null,
      p_job_description: job ?? null,
      p_result: result ?? null,
    }).setHeader("Authorization", `Bearer ${accessToken}`));
  }

  async function readVersion(id) {
    return value(await client.from("resume_versions")
      .select("id, resume_id, user_id, content, source, resumes(title)")
      .eq("id", id).maybeSingle());
  }

  async function readReport(id) {
    const row = value(await client.from("analysis_reports")
      .select("id, job_description, result, resume_versions(id, resume_id, user_id, content, source, resumes(title))")
      .eq("id", id).maybeSingle());
    if (!row?.resume_versions || !row.result?.analysis) return null;
    const version = row.resume_versions;
    return {
      ...row.result,
      input: { resume: version.content, job: row.job_description },
      archive: {
        resumeId: version.resume_id,
        versionId: version.id,
        title: version.resumes?.title,
        ownerId: version.user_id,
        content: version.content,
        source: version.source,
      },
    };
  }

  function updateSaveForm(form, archive) {
    const title = form.elements.title;
    title.disabled = title.closest("label").hidden = Boolean(archive);
    if (archive) form.querySelector("[data-archive-hint]").textContent = `简历：${archive.title}`;
  }

  function attachSaveForm(form, { prepare, login, saved }) {
    const status = form.querySelector("[role=status]");
    const button = form.querySelector("button[type=submit]");
    form.hidden = false;
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (button.disabled) return;
      button.disabled = true;
      status.classList.remove("is-error");
      status.textContent = "正在保存…";
      try {
        const title = form.elements.title.value.trim();
        if (!form.elements.title.disabled && !title) {
          status.textContent = "请填写简历名称。";
          form.elements.title.focus();
          return;
        }
        const authSession = await session();
        const user = authSession?.user;
        const record = await prepare(title, user);
        if (!record) {
          status.textContent = "请先上传 PDF 或填写简历文字。";
          return;
        }
        if (!user) {
          location.assign(loginUrl(login?.(record)));
          return;
        }
        await saveRecord(record, authSession.access_token);
        saved(record, user);
        status.textContent = "已保存到「我的档案」。";
      } catch {
        status.textContent = "暂时无法保存，请检查网络和登录状态后重试。";
        status.classList.add("is-error");
      } finally {
        button.disabled = false;
      }
    });
  }

  window.CareerCloud = {
    client, callback, fileMode, requireSession, signOut, value, loginUrl, safeNext,
    readVersion, readReport, updateSaveForm, attachSaveForm,
  };

  if (!client) return;

  client.auth.onAuthStateChange((_event, authSession) => {
    const nextUserId = authSession?.user?.id ?? null;
    const accountChanged = currentUserId && currentUserId !== nextUserId;
    currentUserId = nextUserId;
    if (accountChanged) {
      if (workspace) workspace.hidden = true;
      try {
        for (const key of ["aijob:input:v1", "aijob:diagnosis:v1", "aijob:interview:v1"]) {
          sessionStorage.removeItem(key);
        }
      } catch {
        // Storage may be disabled.
      }
      if (!signingOut && !location.pathname.endsWith("/auth.html")) location.reload();
    }
  });
  window.addEventListener("pagehide", (event) => {
    if (event.persisted && workspace) workspace.hidden = true;
  });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) location.reload();
  });
})();
