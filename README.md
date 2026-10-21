# AgileNest · 高校项目协作

面向课程、研究、竞赛与软件项目，覆盖团队 → 项目资料与目标 → 任务分工 → 成果提交 → 逐项验收 → 阶段交付。当前集成候选 **0.6.0-rc.1** 汇总知识库阅读与收藏、里程碑进程、任务贡献、独立指引、真实模型对话与需本人确认的任务规划。API 提供商与插件凭据按账号在服务器加密保存；新增旧页面账号错配防护及发布包敏感信息门禁。对话、规划和附件仍为当前浏览器副本，不是跨设备同步。详见 [AI](docs/AI.md)、[检查记录](docs/UX.md)和[API 配置安全记录](docs/SECURITY-060.md)。正式版准备发布；当前已发布稳定版为 [0.5.0](https://github.com/RETEMPT/AgileNest/releases/tag/v0.5.0)。

知识库接续改为全宽页面式阅读与扁平导航，弱化表格和抽屉。本轮知识库增加 Markdown 文章目录、字号/版心调整、资料排序与按需展开的协作信息；个人侧栏新增「我的收藏」，服务端按账号保存并重新校验资料访问权限。针对检查与待测界面项见 UX。

登录页采用浅蓝建筑插画与深海军蓝标题/操作区，背景全屏覆盖，桌面右侧为较窄的半透明登录卡片；手机优先显示表单并使用独立山海全景背景；加入官网校徽，提供任务协作、知识共建、AI 搭档三项可切换介绍，支持密码显隐与失败输入保留。[设计与资源来源](docs/design/login-v060/README.md)、[项目评估](docs/PR-RESEARCH.md#项目评估与登录视觉--2026-10-20)分别记录本轮视觉和改进优先级。

## 开始使用

**直接试用**：下载 Release 中的 `AgileNest-0.5.0-windows-x64.zip` 和 SHA256 文件，完整解压后双击 **start.bat**。自带网站、Node.js 与 PostgreSQL，详情及旧数据升级见 [RELEASE](docs/RELEASE.md)。

**源码开发**：准备 Node.js 22 LTS、Docker Desktop 或 PostgreSQL，在项目目录运行：

```powershell
.\start.bat
```

首次自动生成缺失配置、安装锁定依赖并初始化空库；已有配置与业务数据保留。保持启动窗口打开，关闭窗口或 Ctrl+C 停止网站。本机数据库配置、追加迁移与排错统一见 [WINDOWS](docs/WINDOWS.md)，已有库不要用新库初始化替代升级迁移。

| 演示账号 | 初始密码 | 职务 |
|---|---|---|
| admin@agilecampus.local | password123 | 管理员、组员 |
| teacher@agilecampus.local | password123 | 指导老师 |
| student@agilecampus.local | password123 | 组员 |

## 当前能力

- 团队资料、公告、项目目录、成员管理与可叠加职务；学术身份独立，不授予权限。
- 五态任务、姓名指派/认领、子任务、标签与任务先后、讨论附件、同源筛选和本人保存视图。
- 结构化成果、逐项自检、不可变提交版本、按指定版本打回/重交/验收；阶段交付绑定通过版本，支持问题处理、归档恢复与历史导出。
- 分类主题和八层资料目录、当前位置上传/创建、文档历史、内容互链/评论、协作者权限、可恢复回收站与引用保护。
- 工作台、成员任务贡献、里程碑图形进程与模块任务、项目日历、本人日程与提醒；单一协作图标集中真实站内消息及 AI 对话。

飞书用于可选登录与绑定，GitHub 可作为成果链接。AI 支持手动配置模型 API、真实测试与对话、确认创建规划任务；OCR、实时共同编辑、群聊、外部同步和系统 Web Push 尚未接入。业务规则见 [DESIGN](docs/DESIGN.md)，未完成能力只在 [ROADMAP](docs/ROADMAP.md) 维护；实际验收与版本历史分别见 [UX](docs/UX.md)、[CHANGELOG](CHANGELOG.md)。

## 文档入口

| 要做的事 | 唯一主文档 |
|---|---|
| 配置源码与升级开发数据库 | [WINDOWS](docs/WINDOWS.md) |
| 下载、运行、备份与制作 Windows 包 | [RELEASE](docs/RELEASE.md) |
| 继续开发、确认权限与模块边界 | [AGENTS](AGENTS.md)、[TEAM](docs/TEAM.md) |
| 提交、PR、验证与版本发布 | [贡献速查](CONTRIBUTING.md)、[WORKFLOW](docs/WORKFLOW.md) |
| 理解业务流程与后续计划 | [DESIGN](docs/DESIGN.md)、[ROADMAP](docs/ROADMAP.md) |
| 实施视觉/交互与核对验收证据 | [前端指南](docs/FRONTEND-DESIGN-GUIDE.md)、[UX](docs/UX.md) |
| 查询专项规则 | [身份与职务](docs/IDENTITY.md)、[个人日程](docs/SCHEDULES.md)、[飞书](docs/FEISHU.md)、[AI 草稿](docs/AI.md) |
| 查来源与取舍 | [PR-RESEARCH](docs/PR-RESEARCH.md) |

文档按主题维护现行事实，不再追加新的阶段计划文件；历史过程留在 CHANGELOG 与 Git。旧概念 HTML 和历史截图仅作历史证据。冲突时按最新用户要求 → AGENTS → TEAM 契约 → 业务/设计文档处理。

## 仓库与验证

`src/app` 是路由壳，`src/modules` 是业务模块，`src/components` 是共享 UI；`src/db`、`drizzle` 与 `scripts` 保存数据结构、追加迁移和 Windows 运行实现。`tests` 保存契约与启动检查，`docs` 保存文档/截图，`opening` 保留课设原资料。`.env`、本机数据、依赖、构建缓存和发布产物由 Git 忽略。

技术栈为 Next.js 16、React 19、TypeScript strict、Tailwind CSS 4、Drizzle、PostgreSQL 与 Zod 4。业务变更按 [WORKFLOW](docs/WORKFLOW.md) 完成以下验证；集成测试仅使用独立 `agilecampus_test` 库，串行执行：

```powershell
npm test
npm run build
powershell -NoProfile -ExecutionPolicy Bypass -File .\tests\windows\launcher.ps1
```
