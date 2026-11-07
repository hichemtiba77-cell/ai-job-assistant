# 一致性评测案例

把 T01–T06 每组案例保存为单独的 JSON 文件，例如 `T01.json`：

```json
{
  "id": "T01",
  "resume": "简历原文",
  "job": "岗位要求原文"
}
```

- 文件名以 `_` 开头的（如 `_template.json`）会被忽略。
- 一个文件也可以是数组，包含多组案例。
- 案例内容应使用虚构或已脱敏的数据。

运行：

```powershell
npm start                 # 另一个终端
npm run eval:consistency  # 默认每组跑 5 次、每次独立调用
```

结果写入 `output/eval/consistency-*.json` 和 `.md`。

可用参数：

```powershell
node tools/eval-consistency.mjs --runs 5 --base-url http://127.0.0.1:3000
node tools/eval-consistency.mjs --no-fresh   # 验证缓存命中，而不是测真实波动
```
