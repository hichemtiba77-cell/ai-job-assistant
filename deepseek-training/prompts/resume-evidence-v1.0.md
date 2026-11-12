# 简历事实与证据矩阵 v1.0

> 运行时提示词以 `scoring-core.js` 中的 `RESUME_EVIDENCE_SYSTEM_PROMPT` 为准。本文件用于评审字段和规则。

## 目标

读取已经锁定的岗位评分表，从简历中提取事实，并为每一个 `requirement_id` 返回一行证据。此阶段不修改岗位表，不计算最终分数。

## 简历事实表

| 字段 | 说明 |
| --- | --- |
| `item_id` | `E01`、`E02` 等事实编号 |
| `section` | `education`、`experience`、`project`、`skills`、`availability`、`other` |
| `title` | 经历、项目或技能段落名称 |
| `organization` | 学校、公司或项目名称 |
| `time` | 简历明确提供的时间 |
| `facts` | 简历明确写出的事实 |
| `source_quotes` | 支撑事实的简历原文 |

## 证据矩阵

| 字段 | 说明 |
| --- | --- |
| `requirement_id` | 必须对应岗位评分表中的固定编号 |
| `evidence_status` | `direct`、`partial`、`none` |
| `resume_quote` | 支撑证据的简历原文 |
| `resume_item_ids` | 对应事实编号 |
| `relevance_level` | 相关度 0–4 |
| `evidence_level` | 证据强度 0–4 |
| `ownership_level` | 个人承担深度 0–4 |
| `recency_level` | 时效 0–3，日期不足时为 `null` |
| `hard_status` | `met`、`unmet`、`unknown` |
| `missing_parts` | 缺少的方法、规模、职责或结果 |
| `explanation` | 等级判断依据 |
| `interview_followup` | 最可能验证该条真实性的追问 |

## 强制规则

1. 每个岗位评分条款必须返回一行，包括没有找到证据的条款。
2. `evidence_status=none` 时，三个能力等级全部为 `0`，时效为 `null`。
3. `hard_status`只判断该条硬性条件本身：简历明确写出的学历、专业、毕业时间、证书、到岗时间等与要求冲突时必须填 `unmet`；明确满足时填 `met`；只有简历没有写出该项信息、或表述含糊无法判断时才填 `unknown`。
4. 关键词出现、团队成果和岗位宣称均不能直接算作个人能力。
5. 不返回 0–100 分、总分或匹配率；最终分数由程序计算。
