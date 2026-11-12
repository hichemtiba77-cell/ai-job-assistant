import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadLocalEnvironment } from "../env-loader.mjs";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
loadLocalEnvironment(resolve(projectRoot, ".env.local"));

const apiKey = process.env.DEEPSEEK_API_KEY;
const baseUrl = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(
  /\/+$/,
  "",
);

if (!apiKey) {
  console.error("DEEPSEEK_API_KEY未配置。请检查.env.local。");
  process.exit(1);
}

const response = await fetch(`${baseUrl}/user/balance`, {
  headers: {
    Authorization: `Bearer ${apiKey}`,
  },
});

const data = await response.json().catch(() => ({}));
if (!response.ok) {
  console.error("余额查询失败：", response.status, data?.error?.message || "未知错误");
  process.exit(1);
}

console.log(`账户可用：${data.is_available ? "是" : "否"}`);
for (const item of data.balance_infos || []) {
  console.log(
    `${item.currency}：总余额 ${item.total_balance}，赠送余额 ${item.granted_balance}，充值余额 ${item.topped_up_balance}`,
  );
}
