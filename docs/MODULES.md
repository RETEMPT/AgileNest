# 模块地图

每个模块独占一个目录，`index.ts` 只导出稳定契约。跨模块调用一律 `@/modules/<m>`，不深链文件。

## 本期实现（刚需）

| 模块 | 路径 | 职责 | Owner | 分支 |
|---|---|---|---|---|
| `core` | `src/modules/core` | 错误 · 权限 · session · 日期 · 表单 | 我 | `chore/foundation` |
| `identity` | `src/modules/identity` | 团队 · 成员 · 角色 · 项目 | 我 | `chore/foundation` |
| `tasks` | `src/modules/tasks` | 任务 CRUD · 子任务 · **五态状态机** | A | `feature/tasks-status` |
| `board` | `src/modules/board` | 看板 + 表格多视图 · 筛选分组 · 拖拽 | B | `feature/board-views` |
| `review` | `src/modules/review` | 学生工作台 · 教师验收台 · 活动流 | C | `feature/review-portal` |
| `worklog` | `src/modules/worklog` | 工时登记 | D | `feature/worklog-stats` |
| `stats` | `src/modules/stats` | 完成度 · 工时汇总 · 贡献 | D | `feature/worklog-stats` |
| `calendar` | `src/modules/calendar` | 月视图（任务截止 + 里程碑） | E | `feature-calendar-notify` |
| `milestone` | `src/modules/milestone` | 开题/中期/结题/答辩节点 | E | `feature-calendar-notify` |
| `notify` | `src/modules/notify` | 站内消息 + 飞书私信 + cron | E | `feature-calendar-notify` |

## 路牌（本期不实现）

| 模块 | 文档 | 建议分支 |
|---|---|---|
| `gantt` | `src/modules/gantt/ROADMAP.md` | `feature/gantt-timeline` |
| `sprint` | `src/modules/sprint/ROADMAP.md` | `feature/sprint` |
| `ai` | `src/modules/ai/ROADMAP.md` | `feature/ai-l1` |
| `agent-api` | `src/modules/agent-api/ROADMAP.md` | `feature/agent-api` |
| `portfolio` | `src/modules/portfolio/ROADMAP.md` | `feature/portfolio` |
| `templates` | `src/modules/templates/ROADMAP.md` | `feature/templates` |

## 目录约定

```
src/modules/<m>/
  schema.ts    # 若有表：只放本模块的 pgTable / pgEnum
  service.ts   # 纯业务函数 + ACL（不碰 FormData / Next Response）
  actions.ts   # Server Actions（薄壳：session → service → revalidate）
  api.ts       # /api/v1/<m>/* Route Handlers（薄壳）
  ui/          # 本模块独占的 React 组件
  index.ts     # 唯一对外契约（其它模块只能 import 这里）
  ROADMAP.md   # 路牌模块专用
```

## 数据表归属

| 表 | 模块 |
|---|---|
| `users` `teams` `team_members` `projects` | `identity` |
| `tasks` | `tasks` |
| `milestones` | `milestone` |
| `worklogs` | `worklog` |
| `task_acceptance_events` | `review` |
| `notifications` | `notify` |

`src/db/schema.ts` 只做 barrel（本期集中放一份，Phase 1 若冲突再拆到各模块 `schema.ts` 再 re-export）。
