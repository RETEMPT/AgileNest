# AgileCampus · 高校轻量化敏捷项目管理平台

> 让敏捷从产业走向教育 —— 认领 → 做事 → 提交 → 验收，课设用 5 人可并行的模块化框架。

## 快速开始（Windows）

```bat
setup.bat
start.bat
```

打开 <http://localhost:3000/login> · 种子账号 `admin@` / `student@agilecampus.local`（密码 `password123`）。
细节：[docs/WINDOWS.md](docs/WINDOWS.md)

## 任务五态

`待认领 → 进行中 → 待验收 → 已完成 / 待修改`
状态机唯一真相：[src/modules/tasks/states.ts](src/modules/tasks/states.ts)

## 目录一览

```
src/
  app/                  路由壳（只调模块 ui，不写业务）
    (auth)/             登录 / 注册（原样保留）
    (app)/home/         学生工作台 · 教师监督台
    (app)/t/            团队 · 项目 · 成员
    (app)/p/[projectId]/  任务池 · 看板 · 表格 · 日历 · 里程碑 · 验收台 · 统计
    api/                auth · cron/reminders · v1
  modules/
    core/  identity/                 地基
    tasks/  board/  review/  worklog/  calendar/  milestone/  notify/
  lib/                  登录链路（auth / password / feishu / user）
  components/ui/        UI 原语 + StatusPill
  db/                   schema barrel + drizzle 客户端
tests/contract/         每模块契约测试
docs/                   TEAM · DESIGN · WINDOWS · ROADMAP · opening/
AGENTS.md               Agent 约束（硬规则）
```

## 技术栈

Next.js 16 · React 19 · TypeScript strict · PostgreSQL 16 + Drizzle · Auth.js v5 · Tailwind v4 · Vitest

## 协作

5 人按**模块**分工（不按前后端切）：

| 人 | 分支 | 模块 |
|---|---|---|
| foundation | `chore/foundation` | core · identity · ui |
| A | `feature/tasks-status` | tasks |
| B | `feature/board-views` | board |
| C | `feature/review-portal` | review |
| D | `feature/worklog-stats` | worklog |
| E | `feature/calendar-notify` | calendar · milestone · notify |

接口与规则：**[docs/TEAM.md](docs/TEAM.md)** · Agent 必读：**[AGENTS.md](AGENTS.md)**

## 更多

- [docs/DESIGN.md](docs/DESIGN.md) — 链路 · IA · 五态图 · 借鉴点
- [docs/ROADMAP.md](docs/ROADMAP.md) — 本期 / 下期 / 远期路牌
- [docs/opening/](docs/opening/) — 开题 PPT · 分工 Word
