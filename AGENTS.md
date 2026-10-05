# AGENTS.md — 本仓库 Agent 约束

> 给任何编码 Agent（Claude / Cursor / Copilot 等）的硬规则。**先读完再改代码。**
> 人类协作者请看 [docs/TEAM.md](docs/TEAM.md)。

## 0. 工作区与身份

- 只动 `E:\AgileCampus`（本仓）。**不要**改 `E:\agilecampus-master\`（旧仓，只读参照）。
- 目标平台是 **Windows**。禁止 bash-only 语法（`export`、`rm -rf`、`&&` 链式脚本）；npm scripts 必须跨平台。
- 本期目标：课设框架，**刚需完整 + 重要占位 + 创新只挂路牌**。用户已授权 AI 侧栏入口、对话界面与本地草稿；不实现模型调用、三级 Agent / Agent API / 甘特 / Sprint / 作品集 / 模板库。

## 1. 目录边界（最重要）

默认按单模块 Owner 开发。用户明确要求跨模块的完整体验链路时，可在同一集成分支内按模块分别落实，并在变更说明列出范围与对应 Owner；仍通过公开契约协作，不做顺手重构。本次体验迭代范围为 identity、tasks、board 及直接服务这些入口的共享 UI。用户随后确认学术身份与可叠加职务；foundation 通过短分支 `feature/core-patch/member-capabilities` 调整统一 ACL，以支持按场景计算权限。登录文件继续锁定。

| 路径 | 谁可以改 | 规则 |
|---|---|---|
| `src/modules/<m>/**` | 仅该模块 Owner | **禁止跨模块改文件** |
| `src/lib/{auth,password,feishu,user}.ts` | 锁定 | 登录链路逻辑**原样保留**，不重构、不换库 |
| `src/modules/core/**` | 仅 foundation | 要改 → 说明理由，走短分支 `feature/core-patch/<slug>` |
| `src/db/schema.ts` | 谨慎 | 只**追加**本模块表到文件末尾，不重排既有块 |
| `package.json` 依赖 | 锁定 | 不新增依赖；确需则在 PR 里单独声明理由 |
| 路由 `src/app/**/page.tsx` | 对应 Owner | **只做壳**：调本模块 `ui/`，不写业务 |
| `tests/contract/<m>/**` | 对应 Owner | 每模块 ≥6 条 |
| `docs/TEAM.md` 契约节 | 对应 Owner | 改了 `index.ts` 签名必须同步 |

模块地图：

| 模块 | Owner | 分支 | 职责 |
|---|---|---|---|
| `core` `identity` `components/ui` `lib/*` | foundation | `chore/foundation` | 错误/ACL/session/日期 · 团队项目 · UI 原语 |
| `tasks` | A | `feature/tasks-status` | 任务 CRUD · 子任务 · **五态状态机** |
| `board` | B | `feature/board-views` | 看板 + 表格 · 筛选分组 · 拖拽 |
| `review` | C | `feature/review-portal` | 双端工作台 · 验收台 · 活动流 |
| `worklog`（含 stats） | D | `feature/worklog-stats` | 工时 · 完成度 · 贡献 |
| `calendar` `milestone` `notify` | E | `feature/calendar-notify` | 日历 · 节点 · 提醒 |

本轮用户继续要求完整协作、个人资料及成员 PR 集成；集成分支按职责覆盖 identity/shared UI（foundation）、tasks（A）、board（B）、review（C）、worklog/stats（D）、notify（E），详见 docs/TEAM.md。本轮不调整 core 或登录文件。

## 2. 架构不变量

1. **模块化单体**：`src/modules/<m>/{schema,service,actions,api,ui,index}.ts`
   - 业务跨模块只准 `import ... from "@/modules/<m>"`（`index.ts` 契约），**不准深链**内部文件。
   - 明确的 UI 公开入口例外：`@/modules/<m>/client`（浏览器安全的纯函数/类型）、`/ui`（客户端组件）、`/views`（服务端页面组合）。这些入口须登记在 `docs/TEAM.md`，不得把 DB/session/service 运行时代码带入 `client.ts`，内部 `service/actions/schema/model` 仍禁止深链。
   - `service.ts` 纯业务 + ACL；`actions.ts` / `api.ts` 薄壳（session → service → revalidate）。
2. **状态机唯一真相**：`src/modules/tasks/states.ts` 的 `TRANSITIONS`。
   - 一切状态变更必须走 `transitionTask()`，**禁止**直接 `update tasks.status`。
   - 非法转移抛 `ConflictError`（409）。
3. **ACL 先行**：每个 service 函数入口先调
   `requireProjectForUser` / `requireTaskWrite`（具有执行职务）/ `requireReviewer`（管理员/指导老师）/ `requireTeamRole`。任务能力由 `identity/client.capabilitiesFor` 按职务并集和项目场景计算，身份不得参与授权。
4. **错误**：只抛 `AppError` / `ForbiddenError` / `NotFoundError` / `ConflictError`；message 可直接展示给用户（中文）。
5. **日期**：一律 `YYYY-MM-DD` 字符串（用 `@/modules/core/dates`）；工时用 `minutes: number`。
6. **校验**：边界输入用 Zod v4；DB 信任内部调用。
7. **UI**：复用 `src/components/ui/*`；状态用 `<StatusPill>`；设计 tokens 在 `globals.css`（品牌 `#294a78`，点缀 `#bf6a34`）。
8. **交互同源**：按钮、拖拽目标和服务端权限都使用 `availableTransitions()`；不得复制角色×状态按钮表。提交/重交需完成说明，打回需修改意见，指派选择团队成员，禁止让用户输入数据库 ID。
9. **一致性**：`transitionTask()` 在事务中锁住任务后查转移表，状态与事件一同提交；并发认领不能覆盖负责人。失败或取消时卡片保留原列，成功后刷新相关视图。
10. **产品链路**：团队空间 → 成员与角色 → 项目/课题 → 任务 → 验收。实验室在本期是团队空间内的 `lab` 类型项目；不新增实验数据、文件库和设备管理。

## 3. 禁止事项

- AI 本轮仅做用户确认的对话界面与本地草稿（foundation 共享 UI），明确模型未接入；不接入 AI SDK、不生成模拟回答、不自动读写任务。模型执行、agent-api、gantt、sprint、portfolio、templates 只在 `docs/ROADMAP.md` 留条目。
- 不要引入 AI SDK、MSW、重型状态库、CSS 框架以外的 UI 套件。
- 不要写多段 docstring / 注释块；注释只写非显而易见的 WHY。
- 不要为不可能的分支加 fallback；不要留半成品抽象。
- 不要改登录语义（Credentials + 飞书双 provider、JWT session、bcrypt）。
- 不要用 `any`；不要关 `strict`。
- 不要动 `.gitattributes` / `.editorconfig`（LF + UTF-8）。

## 4. 完成定义（DoD）

提交前必须：

```powershell
npm test          # 全绿
npm run build     # Windows 上零改动通过
```

- 新增/改动模块行为 → 契约测试覆盖 happy path + 越权 + 非法状态转移。
- 改了 `index.ts` 导出 → 同步 [docs/TEAM.md](docs/TEAM.md) 对应契约节。
- 只包含本模块相关文件；不顺手重构别人的目录。
- 体验改动按 [docs/UX.md](docs/UX.md) 检查空状态、姓名指派、取消/失败、角色权限、键盘操作与窄屏；看板/表格切换保留 URL 筛选。

## 5. 测试约定

- 集成测试打真实 Postgres `agilecampus_test`（见 `.env.test`），`fileParallelism: false`。
- 夹具用 `tests/helpers.ts` 的 `resetDb()` / `makeUser()`。
- 无 Docker / DB 时，至少保证纯函数用例绿：
  ```powershell
  npx vitest run tests/contract/exports.test.ts tests/contract/core tests/contract/identity/password.test.ts
  ```

## 6. 常用命令

```powershell
setup.bat          # 首次：起库 + .env + install + db:push + seed
start.bat          # 开发：docker compose up + next dev
npm run db:push    # schema → dev 库
npm run db:push:test
npm run db:seed    # 演示账号 admin@ / student@agilecampus.local
npm test
npm run build
npm run clean      # 清 .next / coverage
```

细节见 [docs/WINDOWS.md](docs/WINDOWS.md) · 链路与状态机见 [docs/DESIGN.md](docs/DESIGN.md)。

## 7. 身份与职务补充约束

- 学术身份由本人填写、另一位团队管理员按当前资料版本确认；修改资料使旧确认失效，确认不得跨团队复用。
- 职务管理必须验证操作者、目标归属并保留至少一名管理员。兼容三态 role 由职务派生，不赋予学术身份任何权限。
- 队长仅管理实验室/竞赛项目与指派；验收保持管理员/指导老师权限。按钮、拖动和服务端共享能力及转移规则。
- schema 只追加，已有库升级运行 `node scripts/migrate-identity.mjs`，不得通过清空历史数据消除约束差异。
- 调整身份/职务/状态行为时同步 [docs/IDENTITY.md](docs/IDENTITY.md) 与契约测试；PR 来源与取舍记录在 [docs/PR-RESEARCH.md](docs/PR-RESEARCH.md)。

## 8. 可选外部连接

- 平台账号、资料、团队权限、任务和验收独立于飞书；外部资料仅在本人确认后采用，不自动覆盖姓名、头像或身份。
- 连接摘要不暴露 openId、密码或应用密钥；解绑只允许会话本人，校验当前绑定版本并保留可用登录方式。历史 `@feishu.local` 占位邮箱账号当前禁止解绑。
- 尚未接入业务投递的飞书私信不显示启用开关或成功承诺；实际能力与联调范围同步 [docs/FEISHU.md](docs/FEISHU.md)。公共验证归 foundation，成员模块继续按 Owner 协作。
