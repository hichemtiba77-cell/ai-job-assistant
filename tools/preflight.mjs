import { existsSync, accessSync, constants, mkdirSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
import { loadLocalEnvironment } from "../env-loader.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const results = [];

function pass(name, detail = "") {
  results.push({ status: "OK", name, detail });
}

function warn(name, detail = "") {
  results.push({ status: "WARN", name, detail });
}

function fail(name, detail = "") {
  results.push({ status: "FAIL", name, detail });
}

function checkNodeVersion() {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major > 22 || (major === 22 && minor >= 5)) {
    pass("Node 版本", `${process.versions.node}`);
  } else {
    fail("Node 版本", `当前 ${process.versions.node}，需要 22.5 以上以使用 node:sqlite`);
  }
}

async function checkSqlite() {
  try {
    const { DatabaseSync } = await import("node:sqlite");
    if (typeof DatabaseSync !== "function") throw new Error("缺少 DatabaseSync");
    pass("内置 SQLite", "node:sqlite 可用");
  } catch (error) {
    fail("内置 SQLite", error.message);
  }
}

function checkFiles() {
  const required = [
    "index.html",
    "app.js",
    "report.html",
    "report.js",
    "privacy.html",
    "server.mjs",
    "scoring-core.js",
    "anchored-scoring.js",
    "browser-api.js",
    "storage/sqlite-store.mjs",
  ];
  const missing = required.filter((file) => !existsSync(join(ROOT, file)));
  if (missing.length) {
    fail("必需文件", `缺少 ${missing.join("、")}`);
  } else {
    pass("必需文件", "齐全");
  }
}

function checkEnvironment() {
  const environment = loadLocalEnvironment(join(ROOT, ".env.local"));
  if (!environment.loaded) {
    warn(".env.local", "不存在，本地服务可进行离线检查");
  } else if (String(process.env.DEEPSEEK_API_KEY || "").trim()) {
    pass(".env.local", "已配置 DEEPSEEK_API_KEY");
  } else {
    warn(".env.local", "未填写 DEEPSEEK_API_KEY，本地服务可进行离线检查");
  }

  if (existsSync(join(ROOT, "config.local.js"))) {
    pass("双击模式配置", "config.local.js 存在");
  } else {
    warn("双击模式配置", "config.local.js 不存在，双击 index.html 可进行离线检查");
  }
}

function checkDataDirectory() {
  const dataDir = join(ROOT, "data");
  try {
    mkdirSync(dataDir, { recursive: true });
    accessSync(dataDir, constants.W_OK);
    pass("缓存目录", "data/ 可写");
  } catch (error) {
    fail("缓存目录", error.message);
  }
}

function checkCases() {
  const casesDir = join(ROOT, "tools", "eval-cases");
  const count = existsSync(casesDir)
    ? readdirSync(casesDir).filter(
        (name) => name.endsWith(".json") && !name.startsWith("_"),
      ).length
    : 0;
  if (count > 0) {
    pass("评测案例", `${count} 组`);
  } else {
    warn("评测案例", "还没有 T01–T06 数据，见 tools/eval-cases/README.md");
  }
}

function checkPort(port) {
  return new Promise((resolvePromise) => {
    const server = createServer();
    server.once("error", () => resolvePromise(false));
    server.once("listening", () =>
      server.close(() => resolvePromise(true)),
    );
    server.listen(port, "127.0.0.1");
  });
}

async function main() {
  checkNodeVersion();
  await checkSqlite();
  checkFiles();
  checkEnvironment();
  checkDataDirectory();
  checkCases();

  const port = Number(process.env.PORT || 3000);
  if (await checkPort(port)) {
    pass(`端口 ${port}`, "空闲，可启动服务");
  } else {
    warn(`端口 ${port}`, "已被占用，启动前请确认是否已有服务在运行");
  }

  console.log("求职助手启动前检查\n");
  results.forEach((item) => {
    const line = `[${item.status}] ${item.name}${item.detail ? `：${item.detail}` : ""}`;
    console.log(line);
  });

  const failures = results.filter((item) => item.status === "FAIL");
  const warnings = results.filter((item) => item.status === "WARN");
  console.log(
    `\n结果：${failures.length} 项失败，${warnings.length} 项提醒，${results.length} 项检查完成。`,
  );
  if (failures.length) process.exitCode = 1;
}

main();
