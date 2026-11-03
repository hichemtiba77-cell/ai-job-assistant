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
- 可生成岗位适配、证据、差距和建议报告。
- 岗位侧先生成固定评分表，简历侧再逐条填写证据矩阵，避免模型每次重新拆分要求。
- DeepSeek只提取岗位条款和简历证据；编号、权重、缺失补零、准备度、置信度和最终分数由程序计算。
- 支持本地服务调用DeepSeek，也支持双击`index.html`的测试直连模式。
- 暂不部署，不接数据库和账号。
- 当前读取PDF文字层；扫描图片型PDF需要先转换为可复制文字的PDF，或改用粘贴。

## 查看方式

### 双击打开（队友测试）

直接双击根目录中的 `index.html`。项目内的 `config.local.js` 提供本轮测试所需的浏览器直连配置，上传PDF并填写岗位后即可使用DeepSeek。

`config.local.js` 已加入 `.gitignore`，不会进入Git。它包含测试密钥，只应通过私密压缩包发给参与本轮测试的队友，不要发到公开群、公开仓库或部署到公网。

如果测试密钥更换，请更新 `.env.local` 后重新生成浏览器配置：

```powershell
npm run configure-browser
```

没有 `config.local.js` 时，双击页面仍可演示，但只显示本地模拟结果。

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

同一份简历和岗位内容在同一次服务运行期间会使用结果缓存。重复查看不会再次调用模型，也不会重复扣费。

岗位评分表会按规范化岗位内容单独缓存，同一服务进程内修改简历时不会重新拆分岗位要求。当前缓存只保存在本地服务进程中，不会写入磁盘。浏览器使用`sessionStorage`保存当前输入和本次报告，便于返回修改；关闭浏览器会话或重启本地服务后会被清理。

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
config.local.js            本地测试密钥配置（不进入Git）
report.html                独立求职诊断报告页
report.css                 报告页样式
report.js                  报告渲染和标签切换
server.mjs                 本地后台、DeepSeek接口和静态文件服务
package.json               本地启动命令和项目信息
data/examples.js           示例简历与岗位
deepseek-training/         提示词、测试案例和修改记录
tests/                     评分稳定性与敏感度单元测试
docs/                      竞品分析、PDF简历和虚拟形象方案
assets/diagrams/           项目流程图和路线图
output/pdf/                项目实施手册PDF
tools/                     文档和图片生成工具
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
