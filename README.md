# AI求职助手

郑州大学首届AI智能体创新应用大赛校园真实需求项目，对应任务清单B2“精准就业匹配与求职辅助（含研究生就业）”。

## 项目进度

当前阶段和下一步工作统一记录在：

[开发进度与阶段计划](./开发进度与阶段计划.md)

GitHub仓库创建、邀请队友、分支和Pull Request规则见：

[GitHub协作指南](./GITHUB协作指南.md)

## 独立设计原型

- [HR评审桌界面原型](./hr-review-desk.html)
- [求职档案标签关系图](./assets/diagrams/08-求职档案标签关系.png)

## 当前阶段

当前为可测试的本地MVP：

- 可上传PDF简历，并在浏览器内完成文字读取。
- 上传后直接进入诊断，不展示文字提取的中间步骤。
- 仍支持直接粘贴简历文字。
- 可粘贴岗位招聘要求。
- 可生成岗位适配、证据、差距和建议报告，并从报告进入三档文字模拟面试。
- 岗位侧先生成固定评分表，简历侧再逐条填写证据矩阵，避免模型每次重新拆分要求。
- DeepSeek只提取岗位条款和简历证据；编号、权重、缺失补零、准备度、置信度和最终分数由程序计算。
- 支持本地服务调用DeepSeek，也支持双击`index.html`的测试直连模式。
- 硬性条件明确不满足时，综合分按规则封顶44分，并保留原始证据分供核对。
- 分析前需阅读并同意《隐私与数据说明》；报告页可一键删除本次缓存记录。
- 暂不部署，不接账号；分析结果使用本地SQLite缓存，不作为用户数据库。
- 当前读取PDF文字层；扫描图片型PDF需要先转换为可复制文字的PDF，或改用粘贴。

## 查看方式

### 双击打开（队友测试）

直接双击根目录中的 `index.html`。项目内的 `config.local.js` 目前保留占位配置；填入真实密钥后，上传PDF并填写岗位即可使用DeepSeek。

`config.local.js` 已加入 `.gitignore`，不会进入Git。填写真实密钥后，只应通过私密压缩包发给参与本轮测试的队友，不要发到公开群、公开仓库或部署到公网。

如果测试密钥更换，请更新 `.env.local` 后重新生成浏览器配置：

```powershell
npm run configure-browser
```

没有填写 DeepSeek 密钥时，双击页面仍可演示，但只显示本地模拟结果。

### 本地服务模式

1. 将`.env.example`复制为`.env.local`。
2. 在`.env.local`中填写真实的`DEEPSEEK_API_KEY`。
3. 保持以下配置：

```text
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-flash
DEEPSEEK_DISPLAY_NAME=DeepSeek-V4.1-Flash-1017
```

4. 在项目目录运行：

```powershell
npm start
```

5. 打开：

```text
http://127.0.0.1:3000
```

`deepseek-flash`是DeepSeek官方API中的模型别名，目前由DeepSeek-V4.1-Flash-1017提供服务。正式部署或对外公开时应使用本地服务模式，不要把真实密钥放入可公开访问的前端文件。

服务会优先使用`.env.local`中的密钥。即使电脑系统里已经存在另一个`DEEPSEEK_API_KEY`，项目也会用`.env.local`中的值覆盖它，避免调用到旧账号。

本地服务不会对外提供 `.env.local` 或 `config.local.js`。

查询当前账户余额：

```powershell
npm run check-balance
```

同一份简历和岗位内容会命中SQLite结果缓存（`data/cache.db`）。重复查看不会再次调用模型，也不会重复扣费；重启本地服务后缓存仍然有效。

缓存键由协议版本、模型别名、提示词指纹和规范化后的简历/岗位内容组成，单纯的空格、换行差异不会造成重复调用。岗位评分表按同一规则单独缓存。缓存数据库已加入`.gitignore`，本地服务也不会通过静态文件接口提供`.db`文件。

首页提供“忽略缓存，强制重新分析”开关；接口层对应请求体中的`"fresh": true`（评测脚本默认使用该参数）。分析过程中页面会通过SSE显示当前阶段和已用时间，命中缓存或失败时会明确提示，失败可直接点“重试”。浏览器使用`sessionStorage`保存当前输入和本次报告；关闭浏览器会话后会被清理。在网址后加`?stream=0`可关闭SSE，回退到一次性JSON返回，便于排查环境兼容问题。

### 隐私与删除

- 首次分析前必须勾选同意[隐私与数据说明](./privacy.html)；页面会说明PDF在浏览器本地解析、文字经本地服务转发给DeepSeek。
- 分析缓存默认保留30天，可通过环境变量`CACHE_TTL_DAYS`调整；本地服务启动时会自动清理过期记录。
- 报告页右上角“删除本次记录”会调用`POST /api/forget`，按简历与岗位原文定位并删除对应缓存及关联调用日志，同时清空当前标签页中的输入、报告和模拟面试。
- 缓存中保存分析结论、报告引用的简历原句、协议版本、token用量和内容哈希，不单独保存完整的简历与岗位原文。调用审计默认只记录请求哈希；只有设置`LOG_RAW_RESPONSES=1`才保存模型原始返回。

启动前可先运行检查：

```powershell
npm run preflight
npm run demo-check
```

`demo-check`要求本地服务已启动，会检查关键文件、密钥配置、SQLite存储、缓存保留期限、配置文件与数据库是否被静态服务暴露，以及空请求是否被正确拒绝。

重复运行一致性评测（需要本地服务已启动，会真实调用模型并扣费）：

```powershell
npm run eval:consistency
```

直接打分基线与评分表流程的对照实验（同时需要本地服务和`.env.local`中的密钥）：

```powershell
npm run eval:baseline
```

基线对照的目的不是证明流程分更稳定，而是量化两种口径的差异：直接打分往往更稳定，但它不提供逐条证据，也不会因为硬性条件不满足而封顶；评分表流程的价值在于可解释、可复现和门槛约束。结果中同时记录硬门槛是否触发。

评测案例放在`tools/eval-cases/`，语义近似改写案例放在`tools/eval-near-cases/`，报告输出到`output/eval/`。

验证同一事实只改写措辞后是否仍得到相近结果（每组独立调用3次）：

```powershell
node tools/eval-consistency.mjs --cases tools/eval-near-cases --runs 3
```

2026-11-07 使用提示词`6558b0c9`复跑的结果：评分表流程T01–T07每组3次，极差0–12分（平均4分），T02/T07完全一致；直接打分7组极差均为0，但T06（无关经历+提示词注入）直接得72分、T07（专业硬性不符）直接得82分，说明“稳定”不等于“判断正确”。语义近似案例N03三次均为44分并触发硬门槛；N01为45–48分，N02为49分。报告保存在`output/eval/`（不进入Git）。

DeepSeek请求失败时会明确显示错误，不再静默切换到分数口径不同的本地模拟报告。

## 目录说明

```text
index.html                 当前MVP页面，包含PDF上传
styles.css                 页面样式
app.js                     PDF选择、诊断请求和页面流程
analysis-core.js           本地模拟分析逻辑
scoring-core.js            两表提示词、证据校验、确定性评分和准备度计算
browser-api.js             双击打开时的两阶段DeepSeek测试直连
pdf-extractor.js           浏览器内PDF文字读取
config.example.js          浏览器配置占位文件
config.local.js            本地测试配置（默认占位，不进入Git）
report.html                独立求职诊断报告页
report.css                 报告页样式
report.js                  报告渲染、评分明细、硬门槛提示和删除记录
privacy.html               隐私与数据说明
server.mjs                 本地后台、DeepSeek接口、缓存和静态文件服务
progress-events.mjs        SSE分析阶段事件编码
storage/sqlite-store.mjs   SQLite结果缓存、评分表缓存、调用审计和过期清理
tools/demo-check.mjs       演示前环境与接口自检
tools/eval-baseline.mjs    直接打分基线与评分表流程对照评测
package.json               本地启动命令和项目信息
data/examples.js           示例简历与岗位
data/cache.db              本地缓存数据库（自动生成，不进入Git）
deepseek-training/         提示词、测试案例和修改记录
tests/                     评分稳定性、硬性门槛、缓存删除、进度事件和一致性统计测试
tools/eval-cases/          T01–T07虚构评测案例
tools/eval-near-cases/     N01–N03语义近似改写案例
tools/eval-consistency.mjs 重复运行一致性评测
tools/preflight.mjs        启动前环境检查
docs/                      竞品分析、PDF简历和虚拟形象方案
assets/diagrams/           项目流程图和路线图
output/pdf/                项目实施手册PDF
output/eval/               一致性评测报告（自动生成，不进入Git）
vendor/pdfjs/              随项目分发的PDF.js及许可证
```

## 后续接入点

1. 增加扫描图片型PDF的OCR兼容。
2. 将当前测试直连切换为登录后的服务端代理调用。
3. 限制每个测试账号的调用次数并设置每日额度。
4. 增加简历隐私提示、删除记录和更多文件格式。
5. 继续扩充岗位匹配测试集，校准证据等级和维度权重。

## 安全要求

- 正式环境不在HTML或浏览器JavaScript中保存DeepSeek Key。
- 真实Key只放在服务端环境变量中；当前 `config.local.js` 仅限受控测试。
- `.env`、`.env.local`、临时文件和个人测试材料不提交到Git。
- `config.local.js`、测试压缩包不得公开分享或部署。
- PDF和真实简历功能加入后，应使用自建、模拟或获得授权的脱敏数据测试。
