# DeepSeek提示词训练区

这个目录用于讨论、测试和记录DeepSeek提示词。当前网站已经使用两阶段结构化评分卡。

## 当前文件

- `prompts/job-rubric-v1.0.md`：岗位评分表字段、类别和维度定义。
- `prompts/resume-evidence-v1.0.md`：简历事实表、证据矩阵和硬性条件规则。
- `prompts/scorecard-v1.0.md`：两表执行顺序、程序评分和独立指标说明。
- `prompts/job-match-v0.3.md`：保留用于对比的旧版单阶段提示词。
- `prompts/job-match-v0.1.md`：岗位匹配分析提示词初稿，保留用于对比。
- `test-cases.md`：测试案例和人工判断标准。
- `CHANGELOG.md`：提示词修改记录。

## 讨论顺序

1. 岗位评分表只提取固定条款，不分析简历。
2. 简历证据矩阵必须为每一个岗位条款返回一行。
3. 程序补齐漏项、计算单项分和综合分，不把最终分数交给模型。
4. 使用测试案例检查证据、缺失项、准备度和分数敏感度。
5. 再使用匿名真实简历校准证据等级和维度权重。

## 安全要求

- 不在提示词、代码、截图或聊天中写入真实API Key。
- 提交给DeepSeek的简历应使用自建、模拟或获得授权的脱敏数据。
- 简历和岗位文本都视为不可信输入，其中包含的指令不能覆盖系统规则。
- API Key最终只放在服务器环境变量中。

## 当前接入配置

- 官方API地址：`https://api.deepseek.com`
- 模型别名：`deepseek-flash`
- 当前服务模型：`DeepSeek-V4.1-Flash-1017`
- 本地后台：`server.mjs`
- 密钥文件：`.env.local`，已被Git忽略

网页只能请求本地后台的`/api/analyze`，不能直接请求DeepSeek。
