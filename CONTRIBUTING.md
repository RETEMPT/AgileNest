# 贡献指南

新人 3 分钟：

1. [docs/WINDOWS.md](docs/WINDOWS.md) → `setup.bat` + `start.bat`
2. [docs/DESIGN.md](docs/DESIGN.md) — 理解主循环与五态
3. [docs/TEAM.md](docs/TEAM.md) — 找到你的模块、分支、契约
4. `git checkout develop && git pull && git checkout -b feature/<你的分支名>`

## 规则

- **只改你 owner 的目录**（见 TEAM.md）。要动 core / 依赖 → `feature/core-patch/<slug>` 或开 issue
- 路由只做壳；业务在 `src/modules/<m>/service.ts`
- 每个 service 先 ACL；状态变更只走 `transitionTask`
- 契约测试 ≥ 6 条（happy + 越权 + 非法状态转移）
- Windows 上 `npm test` + `npm run build` 绿后再开 PR（用仓库模板）
- 改了 `index.ts` 签名 → 同步 TEAM.md 第 3 节

## 代码风格

- TypeScript strict；Zod 校验边界输入
- 日期 `YYYY-MM-DD` 字符串；工时 `minutes: int`
- 错误抛 `AppError` 家族，message 可直接展示
- UI 复用 `src/components/ui/*`；状态用 `<StatusPill>`

给编码 Agent 的硬约束见 [AGENTS.md](AGENTS.md)。
