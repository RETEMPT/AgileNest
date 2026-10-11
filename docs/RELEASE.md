# AgileNest · Windows 一键运行与阶段汇总（0.5.0）

当前正式源码 **0.5.0** 面向研究、课程、竞赛和软件项目，补齐分类内主题目录、资料回收恢复、统一消息与本地草稿入口，以及绑定真实通过版本的阶段交付。管理者发布时填写验收要求；成员领取、提交证据、收到逐项意见并重交；验收后进入交付清单、问题处理、归档和导出。已提交及已完成的目标与要求只读，重开或打回后才能调整范围。实际检查见[更新日志](../CHANGELOG.md)和[UX](UX.md)，公开契约见[TEAM](TEAM.md)。

本轮候选通过完整链路与独立运行包检查，PR #10 合入 main 后重新通过617条契约和Windows构建。正式包的发布记录、首启/升级结果与校验附件见 [0.5.0 Release](https://github.com/RETEMPT/AgileNest/releases/tag/v0.5.0)。已有 [rc.4 候选包](https://github.com/RETEMPT/AgileNest/releases/tag/v0.4.0-rc.4) 与 [0.3.0 历史稳定包](https://github.com/RETEMPT/AgileNest/releases/tag/v0.3.0) 保留。GitHub 自动生成的 Source code 是源码，运行包须选择 Windows ZIP。

## 运行发布包

在对应版本的 GitHub Release 下载 `AgileNest-<版本>-windows-x64.zip`，完整解压到可写的本地文件夹后双击 **start.bat**。需要 Windows 10/11 x64；自带 Node.js、PostgreSQL 和已编译网站，无需安装 npm、Docker 或数据库，首次启动也不需要联网下载依赖。请先解压，不要在压缩包里直接运行。

首次启动创建本机数据库和示例空间，完成后自动打开 `http://localhost:3000`。**从 0.3.1-rc.1 构建的新包只有 start.bat 一个运行入口，保持窗口打开，关闭窗口或按 Ctrl+C 即停止网站。** 重复启动会提示原窗口仍在运行；个人资料、任务和日程保留。

已经下载的 0.3.0 包保持原行为：网站在后台运行，使用包内 stop.bat 停止。仓库整理不会改变旧 ZIP。

| 演示账号 | 初始密码 | 职务 |
|---|---|---|
| admin@agilecampus.local | password123 | 管理员、组员 |
| teacher@agilecampus.local | password123 | 指导老师 |
| student@agilecampus.local | password123 | 组员 |

示例仅初始化一次，后续启动不覆盖姓名、职务、头像或任务。也可在登录页注册个人账号，建立自己的团队。网站和数据库均只监听本机地址。

## 数据、升级与排错

- `data/pgdata` 保存业务数据；`data/config.json` 是本机生成的连接信息与随机密钥；`data/logs` 保存启动、数据库和网站日志。分享发布包时请分享原始 ZIP，自己的 data 文件夹应独立保留。
- 中文目录会自动使用一个空闲临时盘符供数据库运行；数据仍在原解压目录，停止时仅解除本包的映射。已有盘符不会覆盖；如所有可用盘符均已占用，启动提示改用纯英文目录。
- 升级前先停止旧包并备份完整 `data`；旧版 0.3.0 使用 stop.bat，后续包使用下文的维护停止命令。将停止后的完整 `data` 复制到新解压包根目录，再启动。数据库大版本须一致（本版为 PostgreSQL 17），新包只运行尚未执行的追加迁移，包括 business-completion、discussions、collaboration-foundations、member-deputy 和 collaboration-v050。已有数据不重新初始化；上传文件在数据库中保留。
- 新包正常退出会停止本包数据库。强制关闭窗口时网站立即退出，数据库可能继续运行；备份、移动目录或升级前，关闭启动窗口，再在包目录执行 `powershell -NoProfile -ExecutionPolicy Bypass -File .\launcher\start-release.ps1 -Stop`，确认数据库停止后复制完整 data。不要覆盖运行中的数据库文件。
- 默认网站端口 3000，数据库端口 55432。端口占用时会保留错误提示，不关闭其他程序。需要并行试用可在本包目录执行 `.\start.bat -WebPort 3001`。
- 首次安装如需更换数据库端口，可给同一命令增加 `-DbPort 55433`。已有安装应先停止，然后修改 data/config.json 的 dbPort。诊断启动可增加 `-NoBrowser`。
- 启动失败会保留窗口，请查看对应日志；不要通过删除 data 来尝试修复已有资料。
- 可用 `Get-FileHash .\AgileNest-0.5.0-windows-x64.zip -Algorithm SHA256` 对照 Release 附件 `AgileNest-0.5.0-windows-x64.sha256.txt` 校验文件；候选包用其完整候选版本号。

## 阶段完成情况

核心协作已覆盖团队 → 成员身份和职务 → 课程/实验室/竞赛项目 → 五态任务 → 成果验收。任务池、看板与表格共用状态规则和筛选，支持指派、子任务、说明、退回和重交；权限在服务端重新校验，身份信息不赋予权限。

工作台、任务详情、工时、贡献统计、项目概览、里程碑、站内消息、个人资料与头像已衔接。成员 PR #7 的月历、跨天排期和日程视图已整合；个人日历仅保存本人安排，和项目任务相互独立。历史月份日程、长跨度展开与筛选一致性完成修正。

资料按分类 → 主题 → 子文件夹组织，最多八层；当前位置决定新建和上传的分类/目录。回收后可恢复原文件、版本与路径，成果、讨论、行动项等引用受到保护。任务与阶段交付绑定通过的具体提交，阶段问题由责任人处理，确认时逐项核对；每次变更保留独立记录，可按历史版本导出 Markdown/JSON。归档和恢复保留交付证据。

右下角只有一个协作图标，集中查看真实消息、未读、提及和本地草稿。短时预览自动收起，角标持续保留；确认弹窗优先聚焦取消、Esc 返回原按钮，等待时阻止重复操作，失败保留输入。提交/验收/新通知的写入时刻统一，旧证据不被重写。

飞书保持可选连接，账号资料由本人确认后采用；私信投递与自动截止提醒尚未完成业务联调。AI 页提供按账号区分的浏览器草稿，模型调用、三级 Agent、甘特、Sprint、作品集和模板库仍在路线图中。实验室范围为成员、课题和任务协作。

## 构建发布包（维护者）

源码开发使用根目录 start.bat。发布前运行完整 `npm test`、Windows `npm run build` 和 `tests/windows/launcher.ps1`，在对应已验证版本提交上打包；正式发布须先合入 main 并重新验证。产物位于忽略目录 `.tools/releases`，不提交二进制到 Git。

1. 从 [Node.js 官方目录](https://nodejs.org/dist/v22.23.3/) 下载 `node-v22.23.3-win-x64.zip`，按同目录 SHASUMS256.txt 校验，解压到 `.tools/release-runtime/node-v22.23.3-win-x64`。
2. 从 [EDB 二进制页](https://www.enterprisedb.com/download-postgresql-binaries) 下载 PostgreSQL **17.11 Windows x64**（[本版来源](https://sbp.enterprisedb.com/getfile.jsp?fileid=1260616)），原 ZIP 保存为 `.tools/release-runtime/postgresql-17.11-windows-x64.zip`，解压到 `.tools/release-runtime/postgresql-17.11/pgsql`。来源由 [PostgreSQL 官方 Windows 页面](https://www.postgresql.org/download/windows/) 推荐。两份 ZIP 保留在缓存，打包按 `scripts/release/runtime-sources.json` 校验本轮原始文件的 SHA256。
3. 执行 `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\package-release.ps1 -SkipBuild`；省略 SkipBuild 则先构建。也可通过 NodeRoot / PostgresRoot 指定已准备的对应版本目录。
4. 在独立解压目录验证首次初始化、登录、重复启动、停止、重启后资料保留及端口冲突，再上传 ZIP 与 SHA256 附件。

打包排除开发 .env 和运行数据，附带 Node/PostgreSQL 及 EDB 包内运行库版权说明；依赖许可证随独立构建保留。standalone 静态文件按 [Next.js 官方说明](https://nextjs.org/docs/app/api-reference/config/next-config-js/output) 复制。本发布包面向本机试用；在线部署请按仓库部署文档另行配置。
