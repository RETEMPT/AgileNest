# Windows 快速开始

本仓以 Windows 为第一开发环境。所有 npm scripts 跨平台；一键脚本为 `.bat` / `.ps1` 双份。

## 前置

| 项 | 版本 | 说明 |
|---|---|---|
| Node.js | 22 LTS | `node -v` |
| Docker Desktop | 最新 | 起 Postgres；若已有本机 Postgres 可跳过（改 `.env` 的 `DATABASE_URL`） |
| Git | 最新 | |

## 一键

```bat
setup.bat
start.bat
```

等价 PowerShell：

```powershell
.\setup.ps1
.\start.ps1
```

浏览器开 <http://localhost:3000/login>。

双击 `start.bat` 会结束当前项目已有的 Next.js 开发服务，再在 3000 端口启动一个新实例。脚本按完整项目路径与进程创建时间核对归属，同项目在其他端口运行的旧开发实例也会结束；数据库继续运行。若 3000 端口属于其他程序，会显示对应 PID 并停止启动。

开发服务器运行期间保持窗口；启动失败或服务器退出时，窗口会保留提示，按键后才关闭。

两个入口共用 `scripts/start-local.ps1`，`start.ps1` 显式按 UTF-8 加载它，兼容 Windows 自带 PowerShell 5.1。自动化或已打开的终端可使用 `start.bat -NoPause` / `.\start.ps1 -NoPause` 跳过等待按键；退出代码仍表示启动是否成功。

`setup.bat` 做了什么：从 `.env.example` / `.env.test.example` 生成缺失的本机配置（含随机 `AUTH_SECRET`）→ 起 Postgres → `npm install` → `db:push`（dev+test 库）→ `db:seed`（演示账号）。已有 `.env` / `.env.test` 不会被覆盖。

首次克隆默认使用 Docker 的数据库账号；若使用本机 Postgres，先生成配置，再填写两个库的连接串：

```powershell
.\setup.ps1 -InitEnvOnly
# 编辑 .env 和 .env.test 的 DATABASE_URL 后，再运行 setup.bat
```

### 共享给协作者

提交源码、契约测试、依赖锁文件、数据库 schema 与迁移、环境示例、初始化/启动/停止/状态脚本及使用说明。`scripts/start-local.ps1` 是两个启动入口的必需文件；已有数据库还需要 `scripts/migrate-identity.mjs`。

本机 `.env` / `.env.test`、`node_modules/`、`.next/`、`coverage/`、`.tools/` 与日志不随代码传输。`.tools/` 中的便携式 Postgres 和数据库数据仅在本机保留；接收者安装 Docker 或自己的 Postgres，按上述步骤初始化。

旧版本曾跟踪 `.env.test`；协作者更新前先将它复制为 `.env.test.local-backup`，更新后恢复为 `.env.test`，保留自己的数据库连接。备份文件同样被 Git 忽略；缺少配置时再从 `.env.test.example` 生成。初始化脚本不会覆盖已有配置。

种子账号：
- `admin@agilecampus.local` / `password123`（管理员）
- `teacher@agilecampus.local` / `password123`（教师 / 验收）
- `student@agilecampus.local` / `password123`（学生）

种子还带一批示例任务（五态都有），登录后可直接点：工作台 → 项目 → 任务池 / 看板 / 验收台。

## 测试

```powershell
npm test           # 一次性
npm run test:watch # 监听
```

测试库 `agilecampus_test` 由 `scripts/init-test-db.sql` 在**首次**初始化数据卷时创建。已有 Docker 数据卷缺少测试库时，先建测试库再推送 schema：

```powershell
docker compose up -d db
docker compose exec db psql -U agilecampus -d postgres -c "CREATE DATABASE agilecampus_test;"
npm run db:push:test
```

> **本机无 Docker / Postgres 时**：DB 用例（identity/user/team/project）会连不上库；纯函数用例仍可单独跑：
> ```powershell
> npx vitest run tests/contract/exports.test.ts tests/contract/core tests/contract/identity/password.test.ts
> ```

## 无 Docker 的替代

本机已有 Postgres 16 时：

1. 建库：`CREATE DATABASE agilecampus;` 与 `CREATE DATABASE agilecampus_test;`
2. `.env` / `.env.test` 里改 `DATABASE_URL` 为你的连接串
3. 跳过 `setup.bat` 里的 docker 步骤，依次运行 `npm install`、`npm run db:push`、`npm run db:push:test`。

## 定时提醒（可选）

`POST /api/cron/reminders`，Bearer `CRON_SECRET`。Windows 任务计划每日 9:00：

```powershell
schtasks /create /tn "AgileCampusReminders" /sc daily /st 09:00 ^
  /tr "curl.exe -fsS -X POST http://localhost:3000/api/cron/reminders -H \"Authorization: Bearer %CRON_SECRET%\""
```

（`CRON_SECRET` 先写进 `.env` 并在上式里替成真值。）

## 常见坑

| 现象 | 处理 |
|---|---|
| 双击启动后提示「重启」 | 正在结束当前项目的旧开发服务，随后会启动一个新实例 |
| 启动失败 | 窗口会保留具体错误；检查 Node.js、`.env`、依赖和数据库，修复后再运行 |
| `EACCES` / 端口占用 | 关掉占用 3000 / 5432 的进程，或改端口 |
| 中文乱码 | `.bat` 已 `chcp 65001`；IDE 请用 UTF-8（`.editorconfig` 已声明） |
| `db:push` 报连不上 | 确认 `docker compose ps` 里 `db` 是 healthy |
| 换行符报警 | 已有 `.gitattributes`（`* text=auto eol=lf`）；`git add --renormalize .` 一次 |
| `next dev` 首次编译慢 | 正常；Turbopack 缓存在 `.next/`，`npm run clean` 可清 |

## 已有数据库升级身份与职务

本次新增表使用追加迁移，开发库与独立测试库分别执行，保留现有表、约束和数据：

```powershell
node scripts/migrate-identity.mjs
node scripts/migrate-identity.mjs --test
```

随后运行 `npm test` 和 `npm run build`。新库仍按原有初始化流程执行 `db:push`。迁移按事务执行且可重复运行，细节见 [IDENTITY.md](IDENTITY.md)。
