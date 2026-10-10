# AgileNest · Windows 一键运行与阶段汇总（0.4.0-rc.3）

当前源码候选版 **0.4.0-rc.3** 增加紧凑 AI 输入框、文件与图片资料、本地读取与结构整理，保留项目会话、模型配置与插件、选填联系方式和数据库启动修复，尚未正式发布；候选包见 [v0.4.0-rc.3](https://github.com/RETEMPT/AgileNest/releases/tag/v0.4.0-rc.3)（`AgileNest-0.4.0-rc.3-windows-x64.zip`）。已发布稳定版为 **0.3.0**，集成 PR [#6](https://github.com/RETEMPT/AgileNest/pull/6) 已合入主分支，[下载稳定版](https://github.com/RETEMPT/AgileNest/releases/tag/v0.3.0) 请选择 Windows ZIP；GitHub 自动生成的 Source code 是源码包。候选版通过 32 个文件、308 条测试与 Windows 生产构建，验收记录见 [UX.md](UX.md)。

## 运行发布包

在 GitHub Releases 下载 `AgileNest-0.4.0-rc.3-windows-x64.zip`（稳定版对应 `AgileNest-0.3.0-windows-x64.zip`），完整解压到可写的本地文件夹后双击 **start.bat**。需要 Windows 10/11 x64；自带 Node.js、PostgreSQL 和已编译网站，无需安装 npm、Docker 或数据库，首次启动也不需要联网下载依赖。请先解压，不要在压缩包里直接运行。

首次启动创建本机数据库和示例空间，完成后自动打开 `http://localhost:3000`。**从 0.3.1-rc.1 构建的新包只有 start.bat 一个运行入口，保持窗口打开，关闭窗口或按 Ctrl+C 即停止网站。** 重复启动会提示原窗口仍在运行；个人资料、任务和日程保留。

已经下载的 0.3.0 包保持原行为：网站在后台运行，使用包内 stop.bat 停止。仓库整理不会改变旧 ZIP。

| 演示账号 | 初始密码 | 职务 |
|---|---|---|
| admin@agilecampus.local | password123 | 管理员、队员 |
| teacher@agilecampus.local | password123 | 指导老师 |
| student@agilecampus.local | password123 | 队员 |

示例仅初始化一次，后续启动不覆盖姓名、职务、头像或任务。也可在登录页注册个人账号，建立自己的团队。网站和数据库均只监听本机地址。

## 数据、升级与排错

- `data/pgdata` 保存业务数据；`data/config.json` 是本机生成的连接信息与随机密钥；`data/logs` 保存启动、数据库和网站日志。分享发布包时请分享原始 ZIP，自己的 data 文件夹应独立保留。
- 中文目录会自动使用一个空闲临时盘符供数据库运行；数据仍在原解压目录，停止时仅解除本包的映射。已有盘符不会覆盖；如所有可用盘符均已占用，启动提示改用纯英文目录。
- 升级旧版 0.3.0 时先运行旧包 stop.bat，将旧包完整 `data` 文件夹复制到新包根目录，再启动。数据库大版本须一致（本版为 PostgreSQL 17），新包只运行尚未执行的追加迁移。已有数据不重新初始化。
- 新包正常退出会停止本包数据库。强制关闭窗口时网站立即退出，数据库可能继续运行；备份、移动目录或升级前，关闭启动窗口，再在包目录执行 `powershell -NoProfile -ExecutionPolicy Bypass -File .\launcher\start-release.ps1 -Stop`，确认数据库停止后复制完整 data。不要覆盖运行中的数据库文件。
- 默认网站端口 3000，数据库端口 55432。端口占用时会保留错误提示，不关闭其他程序。需要并行试用可在本包目录执行 `.\start.bat -WebPort 3001`。
- 首次安装如需更换数据库端口，可给同一命令增加 `-DbPort 55433`。已有安装应先停止，然后修改 data/config.json 的 dbPort。诊断启动可增加 `-NoBrowser`。
- 启动失败会保留窗口，请查看对应日志；不要通过删除 data 来尝试修复已有资料。
- 可用 `Get-FileHash .\AgileNest-0.4.0-rc.3-windows-x64.zip -Algorithm SHA256` 对照 Release 附件 `AgileNest-0.4.0-rc.3-windows-x64.sha256.txt` 校验文件。

## 阶段完成情况

核心协作已覆盖团队 → 成员身份和职务 → 课程/实验室/竞赛项目 → 五态任务 → 成果验收。任务池、看板与表格共用状态规则和筛选，支持指派、子任务、说明、退回和重交；权限在服务端重新校验，身份信息不赋予权限。

工作台、任务详情、工时、贡献统计、项目概览、里程碑、站内消息、个人资料与头像已衔接。成员 PR #7 的月历、跨天排期和日程视图已整合；个人日历仅保存本人安排，和项目任务相互独立。历史月份日程、长跨度展开与筛选一致性完成修正。

本轮统一按钮等待指示、提交时防重复操作、表单错误、完成提示、弹窗关闭保护与轻量动效；支持键盘焦点与系统减少动画设置。完成提示保留在页面外层，弹窗关闭后仍可看到结果。

飞书保持可选连接，账号资料由本人确认后采用；私信投递与自动截止提醒尚未完成业务联调。AI 页提供按账号区分的浏览器草稿，模型调用、三级 Agent、甘特、Sprint、作品集和模板库仍在路线图中。实验室范围为成员、课题和任务协作。

## 构建发布包（维护者）

源码开发使用根目录 start.bat。发布前运行完整 `npm test`、Windows `npm run build` 和 `tests/windows/launcher.ps1`，在对应已验证版本提交上打包；正式发布须先合入 main 并重新验证。产物位于忽略目录 `.tools/releases`，不提交二进制到 Git。

1. 从 [Node.js 官方目录](https://nodejs.org/dist/v22.23.3/) 下载 `node-v22.23.3-win-x64.zip`，按同目录 SHASUMS256.txt 校验，解压到 `.tools/release-runtime/node-v22.23.3-win-x64`。
2. 从 [EDB 二进制页](https://www.enterprisedb.com/download-postgresql-binaries) 下载 PostgreSQL **17.11 Windows x64**（[本版来源](https://sbp.enterprisedb.com/getfile.jsp?fileid=1260616)），原 ZIP 保存为 `.tools/release-runtime/postgresql-17.11-windows-x64.zip`，解压到 `.tools/release-runtime/postgresql-17.11/pgsql`。来源由 [PostgreSQL 官方 Windows 页面](https://www.postgresql.org/download/windows/) 推荐。两份 ZIP 保留在缓存，打包按 `scripts/release/runtime-sources.json` 校验本轮原始文件的 SHA256。
3. 执行 `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\package-release.ps1 -SkipBuild`；省略 SkipBuild 则先构建。也可通过 NodeRoot / PostgresRoot 指定已准备的对应版本目录。
4. 在独立解压目录验证首次初始化、登录、重复启动、停止、重启后资料保留及端口冲突，再上传 ZIP 与 SHA256 附件。

打包排除开发 .env 和运行数据，附带 Node/PostgreSQL 及 EDB 包内运行库版权说明；依赖许可证随独立构建保留。standalone 静态文件按 [Next.js 官方说明](https://nextjs.org/docs/app/api-reference/config/next-config-js/output) 复制。本发布包面向本机试用；在线部署请按仓库部署文档另行配置。
