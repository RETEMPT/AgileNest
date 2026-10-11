# AgileNest · 高校敏捷项目协作

面向课程设计、实验室课题和竞赛团队，覆盖团队空间 → 成员与职务 → 项目 → 任务协作 → 教师验收。

当前源码版本：**0.5.0**，以飞书协作为主参考，适用于课题研究、课程、竞赛与软件项目。新增分类内主题/多层资料、可恢复回收站、统一消息与本地草稿入口，以及绑定真实通过版本的阶段交付、评审问题、清单和版本导出；原有任务组织、资料协作、个人提醒及成果验收保留。GitHub 是可选成果证据，实时共同编辑、群聊及外部同步仍为独立后续方案。[当前能力与分步计划](docs/COLLABORATION-WORKSPACE.md)、[Agent文档入口](docs/PROJECT-STATE.md)、[模块契约](docs/TEAM.md)。实际检查与升级记录见 [CHANGELOG](CHANGELOG.md)。

## 开始使用

源码开发需要 Node.js 22 LTS，以及 Docker Desktop 或本机 PostgreSQL。双击根目录的 **start.bat**，或在项目目录执行：

```powershell
.\start.bat
```

首次运行自动生成缺失的本机配置、安装锁定依赖并初始化数据库；以后直接启动网站并打开浏览器。**保持启动窗口打开，关闭窗口或按 Ctrl+C 即停止网站。** 已有配置和业务数据保留。

本机 PostgreSQL 用户应先运行 `.\start.bat -ConfigOnly`，填写 `.env` / `.env.test` 的连接信息，再运行 `.\start.bat -Setup`。详细要求、已有库迁移和排错见 [Windows 使用说明](docs/WINDOWS.md)。

无需开发环境的试用者请从 [0.5.0 Release](https://github.com/RETEMPT/AgileNest/releases/tag/v0.5.0) 选择 `AgileNest-0.5.0-windows-x64.zip` 与 SHA256 文件，完整解压后运行其中的 start.bat；网站、Node.js 和 PostgreSQL 均已包含。GitHub 自动生成的 Source code 是源码。历史版本与旧 data 保留，升级前停止旧包并备份完整 data，见 [发布与数据备份](docs/RELEASE.md)。

| 演示账号 | 初始密码 | 职务 |
|---|---|---|
| admin@agilecampus.local | password123 | 管理员、组员 |
| teacher@agilecampus.local | password123 | 指导老师 |
| student@agilecampus.local | password123 | 组员 |

已有数据库升级先执行 rc.6 的 `node scripts/migrate-business.mjs`、rc.7 的 `node scripts/migrate-discussions.mjs`、rc.8 的 `node scripts/migrate-collaboration-foundations.mjs` 和 `node scripts/migrate-member-deputy.mjs`，再执行本轮 `node scripts/migrate-collaboration-v050.mjs`（测试库均加 `--test`），保留历史任务与文件；新数据库仍沿用初始化流程，Windows 运行包自动追加迁移。

## 已实现

- 团队、学术身份确认与可叠加管理员/副管理员/指导老师/队长/组员职务，课程、实验室和竞赛项目。
- 发布时明确验收要求与分工，五态任务、子任务、姓名指派、看板拖动与表格筛选，成果提交和逐项验收。
- 成果说明、验证结果、链接/文件证据、逐项自检及不可变提交版本；按指定版本逐项验收与打回。
- 团队资料、公告、邀请码有效期、成员退出/移除保护；团队/项目资料分类、搜索、文档历史与文件预览下载。
- 项目与资料目录、互链、引文评论、协作者权限、文档/会议行动项；资料/任务/项目关注与提及。
- 分类内主题与多层资料，按目录上传/创建、移动、回收恢复及引用证据保护；旧混合目录兼容。
- 阶段交付清单、真实通过版本、评审问题与责任人、不可变交付记录、归档恢复及 Markdown/JSON 导出。
- 任务标签、依赖守卫、统一筛选与本人保存视图；通知偏好和本人日程提醒。
- 工作台、工时、贡献统计、里程碑、站内消息与个人资料。
- 一个右下角协作入口集中查看消息、未读、提及和本地 AI 草稿。
- 个人日历、项目日历和跨天排期；个人安排仅本人可访问。
- 可选飞书账号连接；AI 对话界面与按账号区分的浏览器草稿，模型尚未接入。

任务状态为待认领、进行中、待验收、待修改、已完成；提交后由具有验收职务的成员逐项核对，打回填写问题位置与通过条件。提交及通过阶段的目标和要求保持只读；调整范围先打回或重开，历史证据保留。编辑使用版本检查，失败保留输入。权限按团队职务与项目场景计算，学术身份不赋予权限。详细功能与边界见 [阶段汇总](docs/RELEASE.md) 和 [体验验收](docs/UX.md)。

## 仓库导航

| 位置 | 内容 |
|---|---|
| `start.bat` | 唯一公开运行入口 |
| `src/app/` | 路由与页面壳 |
| `src/modules/` | 按 Owner 划分的业务模块 |
| `src/components/` | 共享界面组件 |
| `src/db/`、`drizzle/` | 数据结构与追加迁移 |
| `scripts/windows/` | 启动、首次初始化与窗口进程管理 |
| `scripts/release/` | Windows 发布包内部启动与打包辅助文件 |
| `tests/` | 契约测试与 Windows 启动生命周期检查 |
| `docs/` | 使用、协作、设计和验收文档；`opening/` 保留课设资料 |
| `public/` | 网站静态资源 |

`.env`、依赖、构建缓存、本机数据库与发布产物由 Git 忽略。共享代码时保留环境示例、锁文件、迁移和必需脚本；运行包在 GitHub Releases 分发。

## 开发与验证

技术栈：Next.js 16、React 19、TypeScript strict、Tailwind CSS 4、Drizzle、PostgreSQL、Zod 4。模块通过公开契约协作，边界与 Owner 见 [TEAM.md](docs/TEAM.md)。

```powershell
npm test
npm run build
powershell -NoProfile -ExecutionPolicy Bypass -File .\tests\windows\launcher.ps1
```

集成测试使用独立库 `agilecampus_test`，串行执行。GitHub Verify 检查 PostgreSQL 契约、Windows 生产构建及关闭启动窗口后的进程清理。

## 文档

| 使用与开发 | 设计与功能 |
|---|---|
| [Windows 快速开始](docs/WINDOWS.md) | [数据链路与状态机](docs/DESIGN.md) |
| [发布、升级与备份](docs/RELEASE.md) | [体验设计与验收](docs/UX.md) |
| [贡献指南](CONTRIBUTING.md) | [身份与权限](docs/IDENTITY.md) |
| [开发工作流与版本规则](docs/WORKFLOW.md) | [日历与日程](docs/SCHEDULES.md) |
| [模块分工与公开契约](docs/TEAM.md) | [飞书边界](docs/FEISHU.md)、[AI 草稿](docs/AI.md) |
| [Agent 约束](AGENTS.md) | [功能路线图](docs/ROADMAP.md) |
| [文档提炼与当前计划](docs/PROJECT-STATE.md) | [前端设计指南](docs/FRONTEND-DESIGN-GUIDE.md) |
