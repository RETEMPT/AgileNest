# 贡献指南

先阅读 [AGENTS.md](AGENTS.md) 的硬约束与 [docs/TEAM.md](docs/TEAM.md) 的模块 Owner/公开契约。环境见 [docs/WINDOWS.md](docs/WINDOWS.md)，业务见 [docs/DESIGN.md](docs/DESIGN.md)；分支、迁移、PR、版本和发布统一见 [docs/WORKFLOW.md](docs/WORKFLOW.md)。

按明确问题或功能拆分贡献：确认模块范围 → 从约定基线创建分支 → 实现并同步契约 → 检查 → PR。默认使用 `codex/<描述>`，PR 指向已确认的 main 或集成分支，不假定存在 develop。

## 必要规则

- 只修改所属 Owner 目录；跨模块链路先登记范围，通过根 `index.ts` 或登记的浏览器安全 `client/ui/views` 协作。
- 路由只做壳，service 先 ACL，任务状态只走 `transitionTask()`；按钮/拖动使用 `availableTransitions()`，负责人按姓名选择。
- schema 仅授权追加，历史迁移和数据保留；登录、core、依赖与格式文件遵守 AGENTS 锁定规则。
- TypeScript strict，边界用 Zod，日期 `YYYY-MM-DD`、工时整数分钟，错误可中文展示。
- UI 复用共享组件与 StatusPill；取消/失败保留草稿，角色、键盘、窄屏与 URL 条件按 [docs/UX.md](docs/UX.md) 检查。
- 公开签名变化同步 TEAM；每模块至少 6 条契约测试，覆盖正常、越权和非法状态转移。

## 提交与检查

Windows 提交前必须通过：

```powershell
npm test
npm run build
```

集成测试只使用 `agilecampus_test`，由集成人串行运行，不重置开发库。无 DB 的有限检查不能代替完整验收，细节见 WORKFLOW。

Commit 使用 `<type>(<scope>): <说明>`，type 为 `feat/fix/chore/docs/test/refactor/perf`。PR 用仓库模板，说明最终行为、对应 Owner、契约/迁移/依赖变化、证据和限制；Review 核对范围、ACL、状态机、版本冲突、契约同步与 Windows 检查。版本统一由集成人维护，不在成员 PR 抢占版本号。
