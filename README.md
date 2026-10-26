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

当前为本地静态MVP：

- 可粘贴简历文字。
- 可粘贴岗位招聘要求。
- 可生成岗位适配、证据、差距和建议的模拟报告。
- 暂不连接DeepSeek，不产生API调用费用。
- 暂不部署，不接数据库和账号。
- 暂不支持PDF，但输入和分析流程已经为PDF预留扩展位置。

## 查看方式

### 本地模拟模式

直接双击根目录中的 `index.html`，使用浏览器打开即可。当前以文件方式打开时不会调用DeepSeek，只展示模拟结果。

### 本地DeepSeek模式

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

`deepseek-flash`是DeepSeek官方API中的模型别名，目前由DeepSeek-V4.1-Flash-1017提供服务。不要在浏览器代码或公开仓库中填写真实密钥。

查询当前账户余额：

```powershell
npm run check-balance
```

同一份简历和岗位内容在同一次服务运行期间会使用结果缓存。重复查看不会再次调用模型，也不会重复扣费。

## 目录说明

```text
index.html                 当前MVP页面
styles.css                 页面样式
app.js                     输入、模拟分析和结果渲染
analysis-core.js           本地模拟分析逻辑
report.html                独立求职诊断报告页
report.css                 报告页样式
report.js                  报告渲染和标签切换
server.mjs                 本地后台、DeepSeek接口和静态文件服务
package.json               本地启动命令和项目信息
data/examples.js           示例简历与岗位
deepseek-training/         提示词、测试案例和修改记录
docs/                      竞品分析、PDF简历和虚拟形象方案
assets/diagrams/           项目流程图和路线图
output/pdf/                项目实施手册PDF
tools/                     文档和图片生成工具
```

## 后续接入点

1. PDF上传后先提取文字，并放回现有简历输入框供用户确认。
2. 在 `deepseek-training/` 中确认提示词和输出格式。
3. 增加服务端接口，读取环境变量中的DeepSeek Key。
4. 将 `app.js` 中的 `analyzeResumeText()` 从模拟分析替换为服务端请求。
5. 保持返回字段不变，继续复用当前结果页面。

## 安全要求

- 不在HTML或浏览器JavaScript中保存DeepSeek Key。
- 真实Key只放在服务端环境变量中。
- `.env`、`.env.local`、临时文件和个人测试材料不提交到Git。
- PDF和真实简历功能加入后，应使用自建、模拟或获得授权的脱敏数据测试。
