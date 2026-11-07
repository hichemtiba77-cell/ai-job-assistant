import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadLocalEnvironment } from "../env-loader.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
loadLocalEnvironment(resolve(ROOT, ".env.local"), { override: false });
const baseUrl = String(
  process.env.DEMO_BASE_URL || "http://127.0.0.1:3000",
).replace(/\/+$/, "");

const requiredFiles = [
  "index.html",
  "app.js",
  "styles.css",
  "report.html",
  "report.js",
  "privacy.html",
  "scoring-core.js",
  "server.mjs",
  "storage/sqlite-store.mjs",
  "progress-events.mjs",
  "tools/eval-cases/T01.json",
  "tools/eval-baseline.mjs",
];

const results = [];

function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? `：${detail}` : ""}`);
}

function warn(name, detail = "") {
  results.push({ name, ok: true, warning: true, detail });
  console.log(`! ${name}${detail ? `：${detail}` : ""}`);
}

async function main() {
  console.log("职引者演示自检\n");

  requiredFiles.forEach((relativePath) => {
    record(
      `文件存在 ${relativePath}`,
      existsSync(resolve(ROOT, relativePath)),
    );
  });

  const envPath = resolve(ROOT, ".env.local");
  if (existsSync(envPath)) {
    record(".env.local 存在", true);
  } else {
    warn(".env.local 不存在", "将使用模拟结果");
  }
  if (Boolean(process.env.DEEPSEEK_API_KEY)) {
    record("DEEPSEEK_API_KEY 已配置（内容不显示）", true);
  } else {
    warn("DEEPSEEK_API_KEY 未配置", "将使用模拟结果");
  }

  let status = null;
  try {
    const response = await fetch(`${baseUrl}/api/status`, {
      signal: AbortSignal.timeout(5000),
    });
    status = await response.json();
    record("本地服务可访问", response.ok, baseUrl);
  } catch (error) {
    record("本地服务可访问", false, `${baseUrl}（${error.message}）`);
  }

  if (status) {
    if (status.configured) {
      record("服务已配置模型密钥", true);
    } else {
      warn("服务未配置模型密钥", "将使用模拟结果");
    }
    record("SQLite 缓存存储", status.storage === "sqlite");
    record(
      "缓存保留期限已公开",
      Number.isFinite(status.cacheTtlDays) && status.cacheTtlDays > 0,
      `${status.cacheTtlDays} 天`,
    );
    record(
      "评分协议与提示词指纹已公开",
      Boolean(status.protocolVersion && status.promptFingerprint),
      `${status.protocolVersion || "?"} / ${status.promptFingerprint || "?"}`,
    );
    record(
      "本地配置文件不会被静态服务暴露",
      await isBlocked("/config.local.js"),
    );
    record("环境变量文件不会被静态服务暴露", await isBlocked("/.env.local"));
    record("缓存数据库不会被静态服务暴露", await isBlocked("/data/cache.db"));
    record(
      "空请求被拒绝且不调用模型",
      await postStatus("/api/analyze", {}) === 400,
    );
    record(
      "删除接口要求原文，不误删记录",
      await postStatus("/api/forget", {}) === 400,
    );
  }

  const failed = results.filter((item) => !item.ok);
  const warnings = results.filter((item) => item.warning);
  const passed = results.length - failed.length - warnings.length;
  console.log(
    `\n共 ${results.length} 项检查，通过 ${passed} 项，提醒 ${warnings.length} 项，失败 ${failed.length} 项。`,
  );
  if (failed.length) {
    process.exitCode = 1;
    console.log("演示前请先修复失败项。");
  } else if (warnings.length) {
    console.log("演示环境可用；未配置真实密钥时使用模拟结果。");
  } else {
    console.log("演示环境自检通过。");
  }
}

async function isBlocked(pathname) {
  try {
    const response = await fetch(`${baseUrl}${pathname}`, {
      signal: AbortSignal.timeout(5000),
    });
    return response.status === 404;
  } catch {
    return false;
  }
}

async function postStatus(pathname, body) {
  try {
    const response = await fetch(`${baseUrl}${pathname}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    return response.status;
  } catch {
    return 0;
  }
}

main().catch((error) => {
  console.error(`自检失败：${error.message}`);
  process.exitCode = 1;
});
