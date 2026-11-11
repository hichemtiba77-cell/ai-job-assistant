import { writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadLocalEnvironment } from "../env-loader.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(root, ".env.local");
loadLocalEnvironment(envPath);

const key = String(process.env.DEEPSEEK_API_KEY || "").trim();
if (!key) {
  throw new Error("DEEPSEEK_API_KEY 尚未配置，请先填写 .env.local。");
}

const outputPath = join(root, "config.local.js");
const values = {
  DEEPSEEK_API_KEY: key,
  ...(process.env.DEEPSEEK_CHAT_API_KEY && {
    DEEPSEEK_CHAT_API_KEY: process.env.DEEPSEEK_CHAT_API_KEY,
  }),
  DEEPSEEK_BASE_URL:
    process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
  DEEPSEEK_MODEL: process.env.DEEPSEEK_MODEL || "deepseek-flash",
  DEEPSEEK_DISPLAY_NAME:
    process.env.DEEPSEEK_DISPLAY_NAME || "DeepSeek-V4.1-Flash-1017",
};

const content = `/* 本地测试配置，请勿提交到Git或公开分享。 */
window.AIJobAssistantConfig = ${JSON.stringify(values, null, 2)};
`;

await writeFile(outputPath, content, "utf8");
console.log(`已生成浏览器测试配置：${outputPath}`);
console.log("密钥已写入，但不会显示在终端输出中。");
