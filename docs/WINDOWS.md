# Windows 快速开始

根目录只有一个运行入口：**start.bat**。辅助实现归入 `scripts/windows/`；npm scripts 保持跨平台。无需开发环境的试用者见 [Windows 发布包](RELEASE.md)。

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
.\start.bat
```

迁移按事务执行且可重复运行，细节见 [IDENTITY.md](IDENTITY.md)。

## 验证与排错

```powershell
npm test
npm run build
powershell -NoProfile -ExecutionPolicy Bypass -File .\tests\windows\launcher.ps1
```

无数据库时，至少验证纯函数：

```powershell
npx vitest run tests/contract/exports.test.ts tests/contract/core tests/contract/identity/password.test.ts
```

| 现象 | 处理 |
|---|---|
| 已有启动窗口 | 关闭原窗口，待网站停止后重新启动 |
| 端口占用 | 检查占用程序，或用 `-WebPort`；脚本不会终止其他程序 |
| 数据库连接失败 | 检查连接配置、数据库是否存在及 Docker 状态 |
| 显示 `server started` 后停住 | 使用 0.3.1-rc.2 或更新源码，关闭旧启动窗口后重新运行 start.bat；数据库启动输出见 `.tools/pg.log.startup.log`，错误见 `.tools/pg.log.startup-error.log` |
| 依赖安装失败 | 检查 Node.js/npm 与网络后，用 `-Setup` 重试 |
| 首次编译慢 | 等待 Next.js 编译；缓存由 `npm run clean` 清理 |
| 中文乱码 | 使用 UTF-8；start.bat 已切换终端编码 |

启动窗口关闭只停止网站。需要停止开发数据库时，在项目目录执行 `docker compose stop db`；使用本机或便携数据库则由其管理工具停止，停止前确认没有其他应用正在使用。
