# 贡献指南

## 新人 3 分钟上手

1. 读 [docs/WINDOWS.md](docs/WINDOWS.md) → 跑 `setup.bat` + `start.bat`
2. 读 [docs/DESIGN.md](docs/DESIGN.md) 理解链路与五态
3. 读 [docs/BRANCHES.md](docs/BRANCHES.md) 找到**你的分支与目录**
4. 读 [docs/CONTRACTS.md](docs/CONTRACTS.md) 里**你的模块签名**
5. 从 `develop` 拉你的分支：`git checkout develop && git pull && git checkout -b feature/<你的分支名>`

## 开发规则（重要）

- **只改你 owner 的目录**。越界会冲突；要动 core → `feature/core-patch/<slug>` 或开 issue
- **路由文件只做壳**，业务写在 `src/modules/<m>/service.ts`
- **每个 service 函数先做 ACL**（`requireProjectForUser` / `requireTaskWrite` / `requireReviewer`）
- **状态流转只能走 `transitionTask`**，不要直接 `update status`
- **契约测试 ≥ 6 条**：happy path + 越权 + 非法状态转移
- **Windows 上 `npm test` + `npm run build` 必须绿**再开 PR

## 提 PR

用仓库模板（`.github/PULL_REQUEST_TEMPLATE.md`）。标题用 Conventional Commits。

## 代码风格

- TypeScript strict；Zod 校验一切边界输入
- 日期一律 `YYYY-MM-DD` 字符串（`core/dates.ts`）
- 错误抛 `AppError` / `ForbiddenError` / `ConflictError`，message 可直接展示
- UI 组件优先复用 `src/components/ui/*`；状态用 `<StatusPill>`
