# 分支模型与分工

## 分支拓扑

```
main                 # 可部署、始终绿
 └─ develop          # 集成分支，每人从这里拉
     ├─ chore/foundation          (我)   已合入
     ├─ feature/tasks-status      (A)
     ├─ feature/board-views       (B)
     ├─ feature/review-portal     (C)
     ├─ feature/worklog-stats     (D)
     ├─ feature/calendar-notify   (E)
     └─ test/contract-suite       (E + 全员)
```

## Owner 表

| 人 | 分支 | 模块目录 | 路由 | 允许改动的文件 |
|---|---|---|---|---|
| **我** | `chore/foundation` | `core` `identity` `components/ui` `lib/{auth,password,feishu,user,utils}` | `/` `/home/*` `/t/*` `/settings` `/api/auth/**` | 地基期全部；期后走 `feature/core-patch/*` |
| **A** | `feature/tasks-status` | `tasks` | `/p/[id]/tasks/**` | `src/modules/tasks/**` `src/app/**/tasks/**` `tests/contract/tasks/**` |
| **B** | `feature/board-views` | `board` | `/p/[id]/board` `/p/[id]/table` | `src/modules/board/**` `src/app/**/{board,table}/**` `tests/contract/board/**` |
| **C** | `feature/review-portal` | `review` | `/home/student` `/home/teacher` `/p/[id]/review` | `src/modules/review/**` `src/app/**/{home,review}/**` `tests/contract/review/**` |
| **D** | `feature/worklog-stats` | `worklog` `stats` | `/p/[id]/stats` | `src/modules/{worklog,stats}/**` `src/app/**/stats/**` `tests/contract/{worklog,stats}/**` |
| **E** | `feature/calendar-notify` | `calendar` `milestone` `notify` | `/p/[id]/{calendar,milestones}` `/api/cron/**` | `src/modules/{calendar,milestone,notify}/**` `src/app/**/{calendar,milestones}/**` `src/app/api/cron/**` `tests/contract/{calendar,milestone}/**` |

## 冲突面规则

1. **不跨目录改文件**。要动 `core` / `identity` / `package.json` → 走 `feature/core-patch/<slug>` 短分支，或开 issue 给我。
2. **路由文件只做壳**：`page.tsx` 只调本模块 `ui/` 组件，不写业务。
3. **schema 集中在 `src/db/schema.ts`**（本期）。若与他人撞行，**追加到文件末尾**并注明 `// <module>`，不要重排既有块。
4. **依赖只在 `chore/foundation` 阶段加**。后续要加依赖先在 PR 描述声明，等我合 `feature/core-patch`。
5. **PR 必须 Windows 上绿**：`npm test` + `npm run build`。

## PR 检查清单

- [ ] 模块归属正确（见上表）
- [ ] 是否动契约（`index.ts` 签名）？动了 → 同步 `docs/CONTRACTS.md`
- [ ] 契约测试 ≥ 6 条（happy path + 越权 + 非法状态转移）
- [ ] Windows 上 `npm test` / `npm run build` 通过
- [ ] 未改不属于自己的目录

## Commit 约定

Conventional Commits：

```
feat(tasks): 五态状态机 claim/submit/accept/reject
fix(board): 拖拽跨列非法转移时回滚
test(review): 验收台越权矩阵
chore(deps): 加 @tanstack/react-table
```
