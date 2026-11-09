# 一致性评测案例

把 T01–T07 每组案例保存为单独的 JSON 文件，例如 `T01.json`：

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

## 运行对照

以下命令分别在两个 PowerShell 终端运行。两端需要配置相同的模型与密钥，建议保持默认内存缓存。若 `.env.local` 中显式填写了 `PORT` 或 `SCORING_STRATEGY`，先移除这两项再使用下列进程变量。

```powershell
# 终端一
$env:PORT = "3000"
$env:SCORING_STRATEGY = "v1.4"
npm start

# 终端二
$env:PORT = "3001"
$env:SCORING_STRATEGY = "v1.3"
npm start

# 终端三
npm run eval:consistency -- --mode both --compare-url http://127.0.0.1:3001 --include-near --runs 5 --t03-runs 10
```

- `cold` 跳过岗位评分表和分析结果缓存，每次重新提取。
- `fixed` 跳过分析结果缓存，并核查首次建立的岗位评分表后续确实复用。
- `cached` 检查结果缓存命中，旧参数 `--no-fresh` 仍可用。
- `both` 运行冷启动和固定评分表两种模式。正式对照前可用 `--runs 1 --t03-runs 1` 验证流程和配额。
- 可用 `--workers 4` 并行执行不同案例。单个案例的重复分析仍按轮次执行；比较时延时应使用相同的并行数。

报告输出到 `output/eval/`，仅保存结构化指标。分数以未被硬门槛封顶的匹配分为准，旧版封顶分和门槛状态单列。没有分数、失败、条款缺项会计数，不能作为 0 分纳入波动统计。

## 人工证据标注

至少两人独立标注，再由复核人解决分歧。按岗位隔离开发集与保留集，保留集仅在最终验证时使用。保存标注文件后通过 `--annotations 路径` 加入评测。标注使用脱敏后仍能在材料中定位的短句。

```json
{
  "合成案例编号": [
    { "jd_quote": "熟悉SQL", "evidence_quotes": ["用SQL清洗交易记录"] },
    { "jd_quote": "熟悉Tableau", "evidence_quotes": [] },
    { "jd_quote": "每周到岗4天以上", "hard_status": "unknown" }
  ]
}
```

报告只写入分子、分母、证据准确率、召回率、候选检索召回率和门槛指标。原文无法对齐的要求单独计数。分数波动统计与证据准确率独立，正式验收需使用已经复核的标注。
