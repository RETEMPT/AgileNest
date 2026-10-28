# Windows 快速开始

根目录只有一个运行入口：**start.bat**。辅助实现归入 `scripts/windows/`；npm scripts 保持跨平台。无需开发环境的试用者见 [Windows 发布包](RELEASE.md)。

## 模型配置存储与网络

当前源码候选的 API 服务商按账号加密保存在运行目录 `.data/ai-providers`；可在本机 `.env.local` 用 `AI_PROVIDER_STORE_DIR` 指定持久目录。备份时同时保留目录和原 `AUTH_SECRET`（或 `NEXTAUTH_SECRET`），勿将它们提交或附在错误报告中。更换登录密钥前先安排重新配置/迁移，损坏文件不能直接覆盖为空。服务异常退出遗留 `.lock` 时，先确认没有网站进程在写入，再由管理员移除对应锁文件。

插件功能开关和远程MCP连接使用独立的 `.data/ai-plugins` 加密目录，可用 `AI_PLUGIN_STORE_DIR` 指定；同样随原登录密钥备份。它不包含在运行包中，不与浏览器偏好或模型提供商文件互相覆盖。外部服务须本人填写完整HTTP MCP端点；校内/本机地址仍受服务器精确origin允许名单约束，连接令牌不进入浏览器持久存储。

模型地址被代理解析为 `198.18.*` 时，先检查代理DNS模式；对确认可信的服务，可在 `.env.local` 的 `AI_ALLOWED_LOCAL_ORIGINS` 中逐项允许完整origin，例如 `https://models.example.edu`，多个用逗号分隔，不包含 `/api/v1` 路径。此设置不随源码传播，重启网站或确认开发服务已重新加载环境后生效。不要放开整个网段或关闭证书校验；详细诊断见 [AI](AI.md#代理虚拟-dns-与校内地址)。

## 前置

- Node.js 22 LTS（包含 npm）。
- Docker Desktop，或已运行的 PostgreSQL 16/17。
- Git；项目目录需要可写。

## 启动与初始化

```powershell
.\start.bat
```

首次克隆缺少 `.env` 或项目依赖时，会从示例生成缺失配置、启动数据库、运行 `npm ci`、推送开发/测试库 schema，并仅在用户表为空时创建演示数据。已有配置不覆盖，已有用户和任务不重新播种。

后续运行直接启动开发网站并打开浏览器，地址为 <http://localhost:3000/login>。**保持启动窗口打开；关闭窗口或按 Ctrl+C 即停止网站及其子进程。** 开发数据库保持运行，已有数据保留。重复运行会提示关闭原启动窗口；端口被占用时显示错误，保留其他程序。

| 选项 | 用途 |
|---|---|
| `start.bat -Setup` | 显式重新安装锁定依赖、应用 schema，再启动 |
| `start.bat -ConfigOnly` | 仅生成缺失环境配置，然后退出 |
| `start.bat -WebPort 3001` | 使用其他网站端口 |
| `start.bat -NoBrowser` | 启动后不自动打开浏览器 |
| `start.bat -NoPause` | 失败时不等待按键，适合自动化 |

选项可以组合，例如 `.\start.bat -WebPort 3001 -NoBrowser -NoPause`。正常运行一直等待网站退出；失败默认保留错误提示。内部脚本按 UTF-8 加载，兼容 Windows PowerShell 5.1 和中文、空格目录。

## 停止服务

除关闭启动窗口或按 Ctrl+C 停止网站外，平台提供与 `start.bat` 对称的停止脚本：

```powershell
.\stop.bat
```

默认停止开发服务器并释放 3000 端口，开发数据库保持运行便于后续调试。

| 选项 | 用途 |
|---|---|
| `stop.bat -All` | 一并停止开发服务器与数据库（内置 Postgres 或 Docker 容器） |
| `stop.bat -StopDb` | 明确停止数据库服务 |
| `stop.bat -OnlyDb` | 仅停止数据库服务，不影响开发服务器 |
| `stop.bat -WebPort 3001` | 停止指定端口的开发服务器 |
| `stop.bat -NoPause` | 退出时不等待按键，适合自动化测试与脚本集成 |

本机 PostgreSQL 用户先配置连接：

```powershell
.\start.bat -ConfigOnly
# 创建 agilecampus / agilecampus_test 两个数据库，编辑 .env / .env.test 的 DATABASE_URL
.\start.bat -Setup
```

`-Setup` 面向新库初始化。已有版本升级请先备份，再执行下方追加迁移，避免用 schema 推送替代升级迁移。默认 Docker 测试库由 `scripts/init-test-db.sql` 在首次初始化数据卷时创建；已有卷缺少测试库时：

```powershell
docker compose up -d db
docker compose exec db psql -U agilecampus -d postgres -c "CREATE DATABASE agilecampus_test;"
npm run db:push:test
```

演示账号密码均为 `password123`：`admin@agilecampus.local`、`teacher@agilecampus.local`、`student@agilecampus.local`。首次播种提供示例团队、项目及五态任务。

## 共享给协作者

提交源码、契约测试、锁文件、数据库 schema 与迁移、环境示例、根目录 start.bat 和 `scripts/` 中必需实现。接收者安装开发环境后运行 start.bat；运行环境完整的 ZIP 通过 GitHub Releases 分发。

本机 `.env` / `.env.test`、`node_modules/`、`.next/`、`coverage/`、`.tools/` 与日志不提交。`.tools/` 内的便携 PostgreSQL、数据与历史发布包保留在本机，不属于 GitHub 仓库清理范围。

旧版本曾跟踪 `.env.test`；更新前先复制为 `.env.test.local-backup`，更新后恢复自己的连接信息。备份也被 Git 忽略，初始化不会覆盖已有环境文件。

## 已有数据库升级

开发库与独立测试库分别执行追加迁移，保留现有表、约束和数据：

```powershell
node scripts/migrate-identity.mjs
node scripts/migrate-identity.mjs --test
node scripts/migrate-profiles.mjs
node scripts/migrate-profiles.mjs --test
node scripts/migrate-schedules.mjs
node scripts/migrate-schedules.mjs --test
node scripts/migrate-business.mjs
node scripts/migrate-business.mjs --test
node scripts/migrate-discussions.mjs
node scripts/migrate-discussions.mjs --test
node scripts/migrate-collaboration-foundations.mjs
node scripts/migrate-collaboration-foundations.mjs --test
node scripts/migrate-member-deputy.mjs
node scripts/migrate-collaboration-v050.mjs
node scripts/migrate-member-deputy.mjs --test
node scripts/migrate-collaboration-v050.mjs --test
.\start.bat
```

迁移按事务执行且可重复运行，细节见 [IDENTITY.md](IDENTITY.md)。

## 验证与排错

```powershell
npm test
npm run build
powershell -NoProfile -ExecutionPolicy Bypass -File .\tests\windows\launcher.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\tests\windows\stop.ps1
```

无数据库时，至少验证纯函数：

```powershell
npx vitest run tests/contract/exports.test.ts tests/contract/core tests/contract/identity/password.test.ts
```

| 现象 | 处理 |
|---|---|
| 已有启动窗口 | 关闭原窗口，或运行 `.\stop.bat` 停止后重新启动 |
| 端口占用 | 检查占用程序，或运行 `.\stop.bat -WebPort <Port>` 清理残留 |
| 数据库连接失败 | 检查连接配置、数据库是否存在及 Docker 状态 |
| 显示 `server started` 后停住 | 使用 0.3.1-rc.2 或更新源码，关闭旧启动窗口后重新运行 start.bat；数据库启动输出见 `.tools/pg.log.startup.log`，错误见 `.tools/pg.log.startup-error.log` |
| 依赖安装失败 | 检查 Node.js/npm 与网络后，用 `-Setup` 重试 |
| 首次编译慢 | 等待 Next.js 编译；缓存由 `npm run clean` 清理 |
| 中文乱码 | 使用 UTF-8；start.bat 已切换终端编码 |

启动窗口关闭只停止网站。需要停止全部服务（含开发数据库）时，可直接在项目根目录运行 `.\stop.bat -All`；单独停止数据库可运行 `.\stop.bat -OnlyDb`。
