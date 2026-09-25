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

`setup.bat` 做了什么：起 Postgres → 生成 `.env`（含随机 `AUTH_SECRET`）→ `npm install` → `db:push`（dev+test 库）→ `db:seed`（演示账号）。

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

测试库 `agilecampus_test` 由 `scripts/init-test-db.sql` 在**首次**初始化数据卷时创建。若改过该脚本或测试库缺失：

```powershell
docker compose down -v
docker compose up -d
npm run db:push
npm run db:push:test
```

> `down -v` 会清空本地开发数据，慎用。
>
> **本机无 Docker / Postgres 时**：DB 用例（identity/user/team/project）会连不上库；纯函数用例仍可单独跑：
> ```powershell
> npx vitest run tests/contract/exports.test.ts tests/contract/core tests/contract/identity/password.test.ts
> ```

## 无 Docker 的替代

本机已有 Postgres 16 时：

1. 建库：`CREATE DATABASE agilecampus;` 与 `CREATE DATABASE agilecampus_test;`
2. `.env` / `.env.test` 里改 `DATABASE_URL` 为你的连接串
3. 跳过 `setup.bat` 里的 docker 步骤，直接 `npm install && npm run db:push && npm run db:push:test`

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
| `EACCES` / 端口占用 | 关掉占用 3000 / 5432 的进程，或改端口 |
| 中文乱码 | `.bat` 已 `chcp 65001`；IDE 请用 UTF-8（`.editorconfig` 已声明） |
| `db:push` 报连不上 | 确认 `docker compose ps` 里 `db` 是 healthy |
| 换行符报警 | 已有 `.gitattributes`（`* text=auto eol=lf`）；`git add --renormalize .` 一次 |
| `next dev` 首次编译慢 | 正常；Turbopack 缓存在 `.next/`，`npm run clean` 可清 |
