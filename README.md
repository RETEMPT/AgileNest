# AgileNest · 高校敏捷项目协作

面向课程设计、实验室课题和竞赛团队，覆盖团队空间 → 成员与职务 → 项目 → 任务协作 → 教师验收。

当前源码版本：**0.4.0-rc.3**，AI 输入框收紧并固定底部，加号支持本地文件/图片、粘贴资料、读取与结构整理，保留项目会话、插件、模型配置草稿和选填联系方式。已发布的稳定版为 [0.3.0](https://github.com/RETEMPT/AgileNest/releases/tag/v0.3.0)；候选版尚未正式发布。已有库运行 `node scripts/migrate-profiles.mjs` 追加联系方式表，升级不清空数据。更新与升级要求见 [CHANGELOG.md](CHANGELOG.md)。

## 开始使用

源码开发需要 Node.js 22 LTS，以及 Docker Desktop 或本机 PostgreSQL。双击根目录的 **start.bat**，或在项目目录执行：

```powershell
.\start.bat
```

首次运行自动生成缺失的本机配置、安装锁定依赖并初始化数据库；以后直接启动网站并打开浏览器。**保持启动窗口打开，关闭窗口或按 Ctrl+C 即停止网站。** 已有配置和业务数据保留。

本机 PostgreSQL 用户应先运行 `.\start.bat -ConfigOnly`，填写 `.env` / `.env.test` 的连接信息，再运行 `.\start.bat -Setup`。详细要求、已有库迁移和排错见 [Windows 使用说明](docs/WINDOWS.md)。

无需开发环境的试用者可以下载 [候选版 Windows ZIP](https://github.com/RETEMPT/AgileNest/releases/tag/v0.4.0-rc.3) 或已发布的 [0.3.0 稳定版](https://github.com/RETEMPT/AgileNest/releases/tag/v0.3.0)，完整解压后运行其中的 start.bat。旧版 0.3.0 仍使用独立 stop.bat；本候选版的新包采用窗口关闭即停止网站的方式。见 [发布与数据备份](docs/RELEASE.md)。

| 演示账号 | 初始密码 | 职务 |
|---|---|---|
| admin@agilecampus.local | password123 | 管理员、队员 |
| teacher@agilecampus.local | password123 | 指导老师 |
| student@agilecampus.local | password123 | 队员 |

## 已实现

- 团队、学术身份确认与可叠加职务，课程、实验室和竞赛项目。
- 五态任务、子任务、姓名指派、看板拖动与表格筛选，成果提交和教师验收。
- 工作台、工时、贡献统计、里程碑、站内消息与个人资料。
- 个人日历、项目日历和跨天排期；个人安排仅本人可访问。
- 可选飞书账号连接；AI 对话界面与按账号区分的浏览器草稿，模型尚未接入。

任务状态为待认领、进行中、待验收、待修改、已完成；提交后由教师验收。权限按团队职务与项目场景计算，学术身份不赋予权限。详细功能与边界见 [阶段汇总](docs/RELEASE.md) 和 [体验验收](docs/UX.md)。

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
