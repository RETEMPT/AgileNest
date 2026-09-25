# 贡献指南

> 完整开发流程见 [docs/WORKFLOW.md](docs/WORKFLOW.md)。这里是速查版。

## 新人 3 分钟

1. [docs/WINDOWS.md](docs/WINDOWS.md) → `setup.bat` + `start.bat`
2. [docs/DESIGN.md](docs/DESIGN.md) — 理解主循环与五态
3. [docs/TEAM.md](docs/TEAM.md) — 找到你的模块、分支、契约
4. `git checkout develop && git pull && git checkout -b feature/<你的分支名>`

## 日常开发

```powershell
git checkout develop && git pull
git checkout -b feature/<分支名>
# ... 开发 ...
npm test && npm run build   # 全绿后
git add <文件> && git commit -m "feat(<模块>): ..."
git push origin feature/<分支名>
# GitHub 上开 PR 到 develop
```

详细步骤（含数据库变更、测试策略、发布流程）→ [docs/WORKFLOW.md](docs/WORKFLOW.md)

## 规则

- **只改你 owner 的目录**（见 TEAM.md）。要动 core / 依赖 → `feature/core-patch/<slug>` 或开 issue
- 路由只做壳；业务在 `src/modules/<m>/service.ts`
- 每个 service 先 ACL；状态变更只走 `transitionTask`
- 契约测试 ≥ 6 条（happy + 越权 + 非法状态转移）
- Windows 上 `npm test` + `npm run build` 绿后再开 PR（用仓库模板）
- 改了 `index.ts` 签名 → 同步 TEAM.md 契约节

## 提交规范

```
<type>(<scope>): <说明>

feat(tasks): add subtask completion ratio
fix(board): prevent drag to illegal status column
docs(worklog): update API contract
test(review): add bypass permission tests
```

type: `feat` `fix` `chore` `docs` `test` `refactor` `perf`

## 代码风格

- TypeScript strict；Zod 校验边界输入
- 日期 `YYYY-MM-DD` 字符串；工时 `minutes: int`
- 错误抛 `AppError` 家族，message 可直接展示（中文）
- UI 复用 `src/components/ui/*`；状态用 `<StatusPill>`

## Reviewer 快速检查

- [ ] 只改了 Owner 目录
- [ ] `npm test` + `npm run build` 全绿
- [ ] service 入口有 ACL
- [ ] 状态变更走 `transitionTask`
- [ ] 契约测试 ≥ 6 条
- [ ] 无新依赖（或已声明理由）
- [ ] `index.ts` 签名变更已同步 TEAM.md

给编码 Agent 的硬约束见 [AGENTS.md](AGENTS.md)。
