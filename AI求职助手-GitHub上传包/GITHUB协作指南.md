# GitHub协作指南

本项目建议使用私有仓库，不需要GitHub Team版本。GitHub Free个人账号可以在公开或私有仓库中邀请不限数量的协作者。

官方说明：

- [GitHub Free计划](https://docs.github.com/en/get-started/learning-about-github/githubs-plans)
- [邀请个人仓库协作者](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/repository-access-and-collaboration/inviting-collaborators-to-a-personal-repository)

## 一、第一次上传

### 1. 新建GitHub仓库

1. 登录GitHub。
2. 点击右上角`+`，选择`New repository`。
3. 仓库名建议填写`ai-job-assistant`。
4. 可见性选择`Private`。
5. 不要勾选自动生成README、`.gitignore`或许可证，因为上传包中已经包含README和`.gitignore`。
6. 点击`Create repository`。

### 2. 解压上传包

将`AI求职助手-GitHub上传包.zip`解压到一个固定位置，例如：

```text
D:\Codex\projects\ai-job-assistant
```

不要直接在ZIP压缩包里面编辑文件。

### 3. 使用Git命令行首次上传

打开PowerShell，进入解压后的项目目录：

```powershell
cd "D:\Codex\projects\ai-job-assistant"
git init -b main
git add .
git commit -m "chore: initialize AI job assistant project"
git remote add origin https://github.com/你的用户名/ai-job-assistant.git
git push -u origin main
```

如果Git提示需要登录，请使用浏览器登录GitHub。不要将GitHub密码直接写进命令或文件。

### 4. 使用GitHub Desktop上传

如果不熟悉命令行：

1. 安装[GitHub Desktop](https://desktop.github.com/)。
2. 登录GitHub账号。
3. 选择`File` → `Add local repository`。
4. 选择解压后的项目文件夹。
5. 点击`Publish repository`。
6. 取消勾选`Keep this code private`前，确认仓库要公开还是私有；本项目建议保持私有。

GitHub网页的上传功能不会自动解压ZIP。如果使用网页上传，需要先解压，再逐个拖入文件和文件夹；这不如GitHub Desktop稳定。

## 二、邀请队友

1. 打开GitHub仓库。
2. 点击`Settings`。
3. 左侧选择`Collaborators`。
4. 点击`Add people`。
5. 输入队友的GitHub用户名。
6. 队友接受邮件邀请后即可读写仓库。

GitHub Free允许在私有仓库中邀请协作者，不需要购买Team。

## 三、分支约定

| 分支 | 用途 | 谁能直接修改 |
| --- | --- | --- |
| `main` | 稳定、可展示版本 | 只通过合并更新 |
| `dev` | 团队日常集成版本 | 所有成员通过Pull Request合并 |
| `feature/xxx` | 单个具体功能 | 对应功能负责人 |

第一次上传完成后，由负责人创建`dev`分支：

```powershell
git switch main
git switch -c dev
git push -u origin dev
```

建议后续统一从`dev`创建功能分支：

```powershell
git switch dev
git pull
git switch -c feature/pdf-import
```

完成功能后：

```powershell
git add .
git commit -m "feat: add PDF import"
git push -u origin feature/pdf-import
```

然后在GitHub网页上创建`feature/pdf-import` → `dev`的Pull Request。

## 四、推荐的功能分支

- `feature/resume-analysis`：简历与岗位证据分析。
- `feature/resume-builder`：简历编辑器和PDF导出。
- `feature/pdf-import`：PDF和OCR导入。
- `feature/auth-database`：邮箱账号、数据库和历史记录。
- `feature/interview`：模拟面试。
- `feature/ui-polish`：视觉统一和移动端优化。
- `feature/docs`：文档、申报材料和演示材料。

一个分支只完成一类工作，避免同时修改多个模块。

## 五、队友第一次下载

队友接受邀请后执行：

```powershell
git clone https://github.com/仓库所有者/ai-job-assistant.git
cd ai-job-assistant
git switch dev
```

如果已经克隆过，之后每次开始工作前执行：

```powershell
git switch dev
git pull
git switch -c feature/自己的功能名
```

## 六、Pull Request规则

1. Pull Request目标分支选择`dev`，不要直接提交到`main`。
2. 一个Pull Request只解决一个问题。
3. 提交前确认本地页面可打开，主要按钮和输入流程正常。
4. 附上一张页面截图，说明修改内容。
5. 至少一名队友查看后再合并。
6. `main`只在阶段性版本验收通过后更新。

GitHub Free的私有仓库可能不提供完整的强制分支保护功能。如果设置中找不到分支保护，必须通过团队约定和Pull Request审查来避免直接修改`main`。

## 七、禁止上传的内容

以下内容已经被`.gitignore`排除，不要强行提交：

- `.env`或`.env.local`等真实环境变量文件。
- DeepSeek和其他平台的API Key。
- 真实简历、测试用户个人信息和照片。
- `赛事文件/`中的申报表和个人信息。
- `output/docx/`中的个人申报表。
- `tmp/`中的截图、浏览器缓存和临时导出。
- `node_modules/`、`.next/`和构建产物。

如果仓库需要公开，提交前再次搜索姓名、手机号、邮箱、学号、API Key和`.env`文件。
