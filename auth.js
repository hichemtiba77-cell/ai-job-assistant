(() => {
  "use strict";

  const root = document.querySelector("[data-auth-root]");
  root.innerHTML = `
    <div class="auth-intro">
      <h1 id="authHeading">欢迎回到职引者</h1>
      <p id="authDescription">用邮箱登录，打开你的求职档案。</p>
    </div>
    <div class="auth-modes" id="authModes" role="group" aria-label="账号操作" hidden>
      <button id="authLoginMode" type="button" aria-pressed="true">登录</button>
      <button id="authSignupMode" type="button" aria-pressed="false">注册</button>
    </div>
    <form class="account-form" id="authForm" hidden>
      <label>邮箱 <input id="authEmail" type="email" autocomplete="email" required /></label>
      <label>密码 <input id="authPassword" type="password" autocomplete="current-password" required /></label>
      <label hidden>邮箱验证码
        <input id="authCode" type="text" inputmode="numeric" autocomplete="one-time-code"
          pattern="[0-9]{6,10}" maxlength="10" disabled required />
      </label>
      <button class="primary-button" id="authSubmit" type="submit">登录</button>
    </form>
    <p class="account-message" id="authMessage" role="status"></p>
    <div class="account-options">
      <button class="text-button" id="authBack" type="button" hidden>返回登录</button>
      <button class="text-button" id="authForgot" type="button" hidden>忘记密码</button>
      <button class="text-button" id="authResend" type="button" hidden>重发邮件</button>
    </div>`;

  const cloud = window.CareerCloud;
  const form = document.querySelector("#authForm");
  const heading = document.querySelector("#authHeading");
  const description = document.querySelector("#authDescription");
  const email = document.querySelector("#authEmail");
  const password = document.querySelector("#authPassword");
  const code = document.querySelector("#authCode");
  const submit = document.querySelector("#authSubmit");
  const modes = document.querySelector("#authModes");
  const loginMode = document.querySelector("#authLoginMode");
  const signupMode = document.querySelector("#authSignupMode");
  const back = document.querySelector("#authBack");
  const forgot = document.querySelector("#authForgot");
  const resend = document.querySelector("#authResend");
  const status = document.querySelector("#authMessage");
  const copy = {
    login: ["欢迎回到职引者", "用邮箱登录，继续准备你的求职材料。", "登录"],
    signup: ["注册职引者账号", "使用常用邮箱注册，密码至少 8 个字符。", "发送注册验证码"],
    verify: ["确认邮箱", "输入注册邮件中的验证码。", "验证邮箱"],
    forgot: ["找回密码", "填写注册时使用的邮箱，获取重置验证码。", "发送重置验证码"],
    recover: ["验证邮箱", "输入重置邮件中的验证码。", "验证邮箱"],
    reset: ["设置新密码", "请设置至少 8 个字符的新密码。", "保存新密码"],
  };
  let mode = "login";
  let pendingEmail = "";
  let busy = false;
  let resendAfter = 0;
  let resendTimer;

  function message(text, isError = false) {
    status.textContent = text;
    status.classList.toggle("is-error", isError);
  }

  const params = new URLSearchParams(location.search);
  if (!cloud?.client) {
    message("账号功能暂时无法加载。请用 Chrome 或 Edge 重新打开完整项目中的 index.html。", true);
    return;
  }

  const next = cloud.safeNext(params.get("next"));
  const auth = cloud.client.auth;
  const recoveryLink = cloud.callback.get("type") === "recovery" && cloud.callback.has("access_token");

  function finish() {
    window.ResumeMascotReminders?.noteSignIn();
    location.replace(next);
  }

  function callbackUrl() {
    if (cloud.fileMode) return undefined;
    const url = new URL("./auth.html", location.href);
    url.searchParams.set("next", next);
    return url.href;
  }

  function updateResend() {
    const remaining = Math.max(0, Math.ceil((resendAfter - Date.now()) / 1000));
    resend.disabled = busy || remaining > 0;
    resend.textContent = remaining ? `重发邮件（${remaining} 秒）` : "重发邮件";
    if (remaining === 0) clearInterval(resendTimer);
  }

  function startCooldown() {
    resendAfter = Date.now() + 60_000;
    clearInterval(resendTimer);
    resendTimer = setInterval(updateResend, 1000);
    updateResend();
  }

  function show(field, visible) {
    field.closest("label").hidden = field.disabled = !visible;
  }

  function setMode(nextMode) {
    mode = nextMode;
    [heading.textContent, description.textContent, submit.textContent] = copy[mode];
    show(email, ["login", "signup", "forgot"].includes(mode));
    show(password, ["login", "signup", "reset"].includes(mode));
    show(code, ["verify", "recover"].includes(mode));
    password.autocomplete = mode === "login" ? "current-password" : "new-password";
    password.minLength = mode === "login" ? 0 : 8;
    password.value = code.value = "";
    modes.hidden = !["login", "signup"].includes(mode);
    loginMode.setAttribute("aria-pressed", String(mode === "login"));
    signupMode.setAttribute("aria-pressed", String(mode === "signup"));
    back.hidden = !["verify", "recover", "forgot"].includes(mode);
    forgot.hidden = mode !== "login";
    resend.hidden = !["verify", "recover"].includes(mode);
    updateResend();
    message("");
  }

  function showError(error) {
    const messages = {
      email_address_not_authorized: "当前发信服务只支持项目团队邮箱，请使用团队邮箱测试。",
      invalid_credentials: "邮箱或密码不正确，请核对后重试。",
      otp_expired: "验证码已失效，请重发邮件后使用新验证码。",
      over_email_send_rate_limit: "发信次数达到上限，请稍后重试。",
      over_request_rate_limit: "请求太频繁，请稍后重试。",
      weak_password: "请设置更长、更难猜的密码。",
      user_already_exists: "这个邮箱已注册，请登录或找回密码。",
      validation_failed: "请核对邮箱格式和输入内容。",
    };
    message(messages[error.code] || "这次操作未完成，请检查网络和输入后重试。", true);
  }

  async function run(operation) {
    if (busy) return;
    busy = submit.disabled = loginMode.disabled = signupMode.disabled = back.disabled = forgot.disabled = true;
    updateResend();
    message("");
    try {
      await operation();
    } catch (error) {
      showError(error);
    } finally {
      busy = submit.disabled = loginMode.disabled = signupMode.disabled = back.disabled = forgot.disabled = false;
      updateResend();
    }
  }

  function mailSent() {
    startCooldown();
    message(`请查看 ${pendingEmail} 的收件箱，也可以检查垃圾邮件。`);
  }

  loginMode.addEventListener("click", () => {
    if (mode !== "login") setMode("login");
  });
  signupMode.addEventListener("click", () => {
    if (mode !== "signup") setMode("signup");
  });
  back.addEventListener("click", () => {
    setMode("login");
    email.focus();
  });
  forgot.addEventListener("click", () => setMode("forgot"));
  resend.addEventListener("click", () => run(async () => {
    if (mode === "verify") {
      cloud.value(await auth.resend({ type: "signup", email: pendingEmail, options: { emailRedirectTo: callbackUrl() } }));
    } else {
      cloud.value(await auth.resetPasswordForEmail(pendingEmail, { redirectTo: callbackUrl() }));
    }
    mailSent();
  }));

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    run(async () => {
      const address = email.value.trim();
      if (mode === "signup") {
        const data = cloud.value(await auth.signUp({
          email: address, password: password.value, options: { emailRedirectTo: callbackUrl() },
        }));
        if (data.session) return finish();
        pendingEmail = address;
        setMode("verify");
        mailSent();
      } else if (mode === "login") {
        const response = await auth.signInWithPassword({ email: address, password: password.value });
        if (response.error?.code === "email_not_confirmed") {
          pendingEmail = address;
          setMode("verify");
          message("请使用注册邮件里的验证码，也可以重发邮件。");
          return;
        }
        cloud.value(response);
        finish();
      } else if (mode === "forgot") {
        cloud.value(await auth.resetPasswordForEmail(address, { redirectTo: callbackUrl() }));
        pendingEmail = address;
        setMode("recover");
        mailSent();
      } else if (mode === "reset") {
        cloud.value(await auth.updateUser({ password: password.value }));
        finish();
      } else {
        const recovery = mode === "recover";
        cloud.value(await auth.verifyOtp({
          email: pendingEmail, token: code.value.trim(), type: recovery ? "recovery" : "email",
        }));
        if (recovery) setMode("reset");
        else finish();
      }
    });
  });

  auth.onAuthStateChange((event, authSession) => {
    if (event === "PASSWORD_RECOVERY") {
      form.hidden = false;
      setMode("reset");
    } else if (event === "INITIAL_SESSION" && !recoveryLink) {
      if (mode === "reset") return;
      if (authSession?.user) finish();
      else {
        form.hidden = false;
        setMode("login");
        if (cloud.callback.get("error") || params.get("error")) {
          message("邮件链接已失效，请重新登录或申请新邮件。", true);
        }
      }
    }
  });

  if (recoveryLink) {
    message("正在验证重置链接…");
    auth.initialize().then(({ error }) => {
      if (mode === "reset") return;
      form.hidden = false;
      setMode(error ? "forgot" : "reset");
      if (error) message("重置链接已失效，请申请新的重置邮件。", true);
    });
  }
})();
