# AgileCampus · 高校轻量化敏捷项目管理平台

> 让敏捷从产业走向教育 —— 低门槛建立清晰、持续、可追踪的项目协作流程。

课设仓库。**只保留登录链路**，其余按模块重做，供 5 人并行分支协作。

## 主循环

**认领 → 做事（子任务 / 工时）→ 提交 → 教师验收通过 / 打回待修改**

任务五态：`待认领 · 进行中 · 待验收 · 已完成 · 待修改`

## Windows 一键

```bat
setup.bat
start.bat
```

详见 [docs/WINDOWS.md](docs/WINDOWS.md)。种子账号 `admin@` / `student@agilecampus.local`，密码 `password123`。

## 路由

| 路由 | 说明 |
|---|---|
| `/login` `/register` | 登录 / 注册（邮箱 + 飞书） |
| `/home/student` | 学生今日工作台 |
| `/home/teacher` | 教师监督台 |
| `/t` `/t/[teamId]/…` | 团队 · 项目 · 成员 |
| `/p/[projectId]` | 项目工作区：任务池 · 看板 · 表格 · 日历 · 里程碑 · 验收台 · 统计 |
| `/settings` | 账号 · 飞书绑定 |

## 技术栈

Next.js 16 (App Router) · React 19 · TypeScript · PostgreSQL 16 + Drizzle ORM · Auth.js v5 · Tailwind CSS v4 · shadcn 风格 UI · Vitest

## 模块化

```
src/modules/<m>/{schema,service,actions,api,ui,index.ts}
```

- 刚需模块（tasks / board / review / worklog / stats / calendar / milestone / notify）本期填实
- 路牌模块（gantt / sprint / ai / agent-api / portfolio / templates）只留 `ROADMAP.md`

见 [docs/MODULES.md](docs/MODULES.md)。

## 协作

5 人按**模块**分工（不按前后端切）：

| 人 | 分支 | 模块 |
|---|---|---|
| 我 | `chore/foundation` | core · identity · UI 原语 |
| A | `feature/tasks-status` | tasks（含五态状态机） |
| B | `feature/board-views` | board（看板 + 表格） |
| C | `feature/review-portal` | review（双端 + 验收） |
| D | `feature/worklog-stats` | worklog · stats |
| E | `feature/calendar-notify` | calendar · milestone · notify |

见 [docs/BRANCHES.md](docs/BRANCHES.md) · [docs/CONTRACTS.md](docs/CONTRACTS.md) · [CONTRIBUTING.md](CONTRIBUTING.md)

## 文档

- [docs/DESIGN.md](docs/DESIGN.md) — 链路 · IA · 借鉴点（Notion / Linear / GitHub Projects）
- [docs/ROADMAP.md](docs/ROADMAP.md) — 分期计划
- [docs/opening/](docs/opening/) — 开题 PPT · 分工 Word 归档
