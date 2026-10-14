# AGENTS.md — 本仓库 Agent 约束

> 给任何编码 Agent（Claude / Cursor / Copilot 等）的硬规则。**先读完再改代码。**
> 人类协作者请看 [docs/TEAM.md](docs/TEAM.md)。

## 0. 工作区与身份

- 只动 `E:\AgileCampus`（本仓）。**不要**改 `E:\agilecampus-master\`（旧仓，只读参照）。
- 目标平台是 **Windows**。禁止 bash-only 语法（`export`、`rm -rf`、`&&` 链式脚本）；npm scripts 必须跨平台。
- 本期目标：课设框架，**刚需完整 + 重要占位 + 创新只挂路牌**。用户已授权 AI 侧栏入口、对话界面与本地草稿；不实现模型调用、三级 Agent / Agent API / 甘特 / Sprint / 作品集 / 模板库。

## 1. 模块边界与当前授权

默认单模块 Owner 开发；完整跨模块链路先登记范围，再由对应 Owner 通过公开契约协作。root 可接续已登记模块的集成遗漏，不覆盖成员分支、不顺手重构。

| 路径 | Owner / 规则 |
|---|---|
| `src/modules/<m>/**` | 仅该模块 Owner 修改 |
| `src/lib/{auth,password,feishu,user}.ts` | 锁定；登录原样保留，不换库 |
| `src/modules/core/**` | 仅 foundation；说明理由并走 `feature/core-patch/<slug>` |
| `src/db/schema.ts` | root 串行集成，只在末尾追加，不重排既有块 |
| `package.json` 依赖 | 锁定；确需新增在 PR 单独声明理由 |
| `src/app/**/page.tsx` | 对应 Owner；只调模块 UI/views，不写业务 |
| `tests/contract/<m>/**` | 对应 Owner；每模块至少 6 条 |
| `docs/TEAM.md` | 对应契约 Owner；改变 index.ts 签名必须同步 |

| 模块 | Owner | 职责 |
|---|---|---|
| core、identity、共享 UI、lib | foundation | ACL/session/日期、团队项目与职务、共享入口 |
| resources | foundation/resources Owner | 共享资料、目录、版本、权限、恢复与引用保护 |
| tasks、delivery | A | 五态任务、结构化成果/逐项验收、阶段交付 |
| board | B | 看板/表格、同源筛选、拖拽与本人视图 |
| review、discussions | C / root | 工作台、验收、活动、讨论及历史 |
| worklog（含 stats） | D | 工时、完成度与贡献 |
| calendar、milestone、notify | E | 日历、节点、关注/偏好与本人通知 |

0.5.0 跨模块协作与 R7 验收已完成，`codex/v050-collaboration-release` 已合入 main 并发布。现行能力与数据规则见 [DESIGN](docs/DESIGN.md)，契约见 [TEAM](docs/TEAM.md)，实际检查见 [UX](docs/UX.md)，历史范围见 CHANGELOG/Git。DB 检查、schema/迁移集成和最终发布由 root 串行执行。

当前授权保留团队/项目共享资料、身份与叠加职务、任务/讨论/验收/交付、本人日程提醒、统一通知和 AI 本地草稿；不调整 core、登录或依赖，不运行 OCR、产品模型、实时共同编辑、群聊或外部自动同步。Marker 仅导入真实转换产物。副管理员仅作为已追加的 deputy 枚举值，旧迁移与其他成员职务不改写。

文档整理已完成。用户随后授权修复侧栏项目选择丢失：foundation/root 仅调整共享 AppSidebar、按账号保存的浏览器项目上下文及对应契约测试/文档；全局页面沿用选中的可访问项目，进入另一项目时切换，不自动选取首个项目。保留现有文档整理，不调整业务、core、登录、数据库或依赖，不覆盖已发布 tag/Release。

接续优化包含共享 AppShell 的侧栏折叠存储与快捷键、AppSidebar 的项目选择空状态和选中提示，以及相应测试与文档，继续保持上述模块边界。

用户进一步授权完善现有功能与排版。本轮登记 root/review 工作台范围：基于现有 getWorkbench 权限结果增加待办摘要、状态/日期筛选、排序、分页与响应式布局，修改 review 的 client/views、对应契约和文档；通过已公开的 identity/tasks 契约读取项目与执行任务操作，不修改其他模块业务、core、登录、数据库或依赖。

2026-10-14 用户授权“更新 md 并 PR”：同步本轮文档，将已有文档整理、共享侧栏及 root/review 工作台成果、契约测试和截图提交到 `codex/v051-workbench-sidebar-docs`，创建目标为 main 的 PR。候选版本保持 `0.5.1-rc.5`；该授权取代此前仅本地修改的限制，不包含合并、tag、Release 或运行包发布。浏览器待测项继续如实保留在 UX。


## 2. 架构不变量

1. **模块化单体**：`src/modules/<m>/{schema,service,actions,api,ui,index}.ts`
   - 业务跨模块只准 `import ... from "@/modules/<m>"`（`index.ts` 契约），**不准深链**内部文件。
   - 明确的 UI 公开入口例外：`@/modules/<m>/client`（浏览器安全的纯函数/类型）、`/ui`（客户端组件）、`/views`（服务端页面组合）。这些入口须登记在 `docs/TEAM.md`，不得把 DB/session/service 运行时代码带入 `client.ts`，内部 `service/actions/schema/model` 仍禁止深链。
   - `service.ts` 纯业务 + ACL；`actions.ts` / `api.ts` 薄壳（session → service → revalidate）。
2. **状态机唯一真相**：`src/modules/tasks/states.ts` 的 `TRANSITIONS`。
   - 一切状态变更必须走 `transitionTask()`，**禁止**直接 `update tasks.status`。
   - 非法转移抛 `ConflictError`（409）。
3. **ACL 先行**：每个 service 函数入口先调
   `requireProjectForUser` / `requireTaskWrite`（具有执行职务）/ `requireReviewer`（管理员/副管理员/指导老师）/ `requireTeamRole`。任务能力由 `identity/client.capabilitiesFor` 按职务并集和项目场景计算，身份不得参与授权。
4. **错误**：只抛 `AppError` / `ForbiddenError` / `NotFoundError` / `ConflictError`；message 可直接展示给用户（中文）。
5. **日期**：一律 `YYYY-MM-DD` 字符串（用 `@/modules/core/dates`）；工时用 `minutes: number`。
6. **校验**：边界输入用 Zod v4；DB 信任内部调用。
7. **UI**：复用 `src/components/ui/*`；状态用 `<StatusPill>`；设计 tokens 在 `globals.css`（品牌 `#294a78`，点缀 `#bf6a34`）。
8. **交互同源**：按钮、拖拽目标和服务端权限都使用 `availableTransitions()`；不得复制角色×状态按钮表。提交/重交需完成说明，打回需修改意见，指派选择团队成员，禁止让用户输入数据库 ID。
9. **一致性**：`transitionTask()` 在事务中锁住任务后查转移表，状态与事件一同提交；并发认领不能覆盖负责人。失败或取消时卡片保留原列，成功后刷新相关视图。
10. **产品链路**：团队空间 → 成员与角色 → 项目/课题 → 任务 → 验收。实验室在本期是团队空间内的 `lab` 类型项目；不新增实验数据、实验专属文件库和设备管理。用户授权的通用团队/项目资料由 resources 模块管理。
11. **个人日程**：仅当前账号读写，团队职务不授予他人日程访问。日期仍为 `YYYY-MM-DD`，可选时间为同日 `HH:mm`；编辑/删除携带版本，旧版本返回 409，个人日程不修改项目任务。

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
- 每轮完成验收的集成迭代递增版本，同步 `package.json`、`package-lock.json` 根与根包版本、README 及 `CHANGELOG.md`。候选版递增 `rc` 序号，合入主分支并重新验证后才标正式版；只为本轮版本创建对应 tag，不覆盖历史 tag。规则见 [docs/WORKFLOW.md](docs/WORKFLOW.md#8-迭代版本与发布)。

## 5. 测试约定

- 集成测试打真实 Postgres `agilecampus_test`（见 `.env.test`），`fileParallelism: false`。
- 夹具用 `tests/helpers.ts` 的 `resetDb()` / `makeUser()`。
- 无 Docker / DB 时，至少保证纯函数用例绿：
  ```powershell
  npx vitest run tests/contract/exports.test.ts tests/contract/core tests/contract/identity/password.test.ts
  ```

## 6. 常用命令

```powershell
start.bat          # 首次自动初始化，以后直接启动；关闭窗口停止网站
start.bat -ConfigOnly # 仅生成缺失环境配置
start.bat -Setup    # 显式安装锁定依赖 + 新库 schema + 空库示例
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
- 队长仅管理实验室/竞赛项目与指派；验收保持管理员/副管理员/指导老师权限。按钮、拖动和服务端共享能力及转移规则。
- schema 只追加，已有库升级运行 `node scripts/migrate-identity.mjs`，不得通过清空历史数据消除约束差异。
- 调整身份/职务/状态行为时同步 [docs/IDENTITY.md](docs/IDENTITY.md) 与契约测试；PR 来源与取舍记录在 [docs/PR-RESEARCH.md](docs/PR-RESEARCH.md)。

## 8. 可选外部连接

- 平台账号、资料、团队权限、任务和验收独立于飞书；外部资料仅在本人确认后采用，不自动覆盖姓名、头像或身份。
- 连接摘要不暴露 openId、密码或应用密钥；解绑只允许会话本人，校验当前绑定版本并保留可用登录方式。历史 `@feishu.local` 占位邮箱账号当前禁止解绑。
- 尚未接入业务投递的飞书私信不显示启用开关或成功承诺；实际能力与联调范围同步 [docs/FEISHU.md](docs/FEISHU.md)。公共验证归 foundation，成员模块继续按 Owner 协作。

## 9. 任务交付边界

管理者发布至最终验收使用以下约束：A/tasks 与 delivery Owner 负责负责人、逐项验收要求、稳定请求键、编辑版本与草稿保护，以及指派/认领、执行、结构化提交、打回重交、逐项验收、重开和真实交付引用；C/review Owner 通过 tasks 公开查询与 `availableTransitions` 保留依赖、子任务与当前权限守卫，不复制状态机。创建输入实际字段为 acceptanceCriteria，验收要求保存使用 criteria；GUI 编辑必须携带 expectedUpdatedAt，submitted/accepted 的工作目标与验收要求冻结，变更需先打回或重开，历史提交/评审/交付快照保留。签名见 [docs/TEAM.md](docs/TEAM.md) 的公开契约。

该接续范围不增加第六状态，不修改 core、登录文件或依赖，不扩大为 Sprint、代码同步、模型调用、实时共同编辑或群聊；各 Owner 只修改自身模块并通过登记的公开契约协作。DB 检查、构建、综合 GUI 验收及最终 main/0.5.0 Release 仍由 root 串行完成，不以局部检查代替发布验收。
