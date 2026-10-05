# TEAM.md — 模块 · 分支 · 契约

一份文档说清「谁做什么、接口长什么样、怎么不撞车」。

本次身份权限补丁由 foundation 在 `feature/core-patch/member-capabilities` 实施：`getTeamMembership` 追加 `positions`，`getProjectForUser` 追加 `positions/capabilities`，既有字段与调用保持兼容。`identity/client` 是公开纯函数入口，导出学术身份、职务元数据、兼容角色映射及 `capabilitiesFor(positions, projectKind)`；不加载数据库或 session。实验室与竞赛队长可管理该类项目、指派任务；验收由指导老师/管理员负责。身份仅供展示和团队确认，不影响权限。

---

## 1. 模块地图

```
src/modules/
  core/        错误 · 权限 · session · 日期 · 表单     foundation
  identity/    团队 · 成员 · 角色 · 项目               foundation
  tasks/       任务 CRUD · 子任务 · 五态状态机         A
  board/       看板 + 表格 · 筛选 · 拖拽               B
  review/      双端工作台 · 验收台 · 活动流            C
  worklog/     工时 · 完成度 · 贡献（含原 stats）      D
  calendar/    项目月视图 · 本人日程 CRUD              E
  milestone/   开题/中期/结题/答辩节点                 E
  notify/      站内消息 + cron；可选飞书私信待接入      E
```

每个模块目录：

```
schema.ts    若有表（可选）
service.ts   纯业务 + ACL
actions.ts   Server Actions 薄壳
api.ts       /api/v1/<m>/* 薄壳
ui/          本模块 React 组件
index.ts     唯一对外契约
client.ts    可选：浏览器安全的公开纯函数/类型
ui.tsx       可选：公开客户端组件
views.tsx    可选：公开服务端页面组合
```

数据表归属：`users/teams/team_members/projects/academic_profiles/member_positions/academic_confirmations` → identity · `tasks` → tasks · `milestones` → milestone · `worklogs` → worklog · `task_acceptance_events` → review · `notifications` → notify。
`src/db/schema.ts` 是 barrel，本期集中放一份，**只追加不重排**。

---

## 2. 分支 ↔ Owner

```
main  ──  可部署
 └─ develop ──  集成
     ├─ feature/tasks-status       A
     ├─ feature/board-views        B
     ├─ feature/review-portal      C
     ├─ feature/worklog-stats      D
     ├─ feature/calendar-notify    E
     └─ test/contract-suite        E + 全员
```

| 人 | 分支 | 模块 | 路由 |
|---|---|---|---|
| foundation | `chore/foundation` | core · identity · ui · lib | `/login` `/register` `/t/*` `/settings` `/api/auth/**` |
| foundation（本轮 AI 界面） | `codex/collaboration-completion` | 共享 AI UI · 浏览器草稿 | `/ai`，仅界面与本地存储 |
| A | `feature/tasks-status` | tasks | `/p/[id]/tasks/**` |
| B | `feature/board-views` | board | `/p/[id]/board` `/p/[id]/table` |
| C | `feature/review-portal` | review | `/home/student` `/home/teacher` `/p/[id]/review` |
| D | `feature/worklog-stats` | worklog | `/p/[id]/stats`（工时面板嵌任务详情） |
| E | `feature/calendar-notify` | calendar · milestone · notify | `/p/[id]/{calendar,milestones}` `/api/cron/**` |
| E（本轮个人日程） | `codex/calendar-schedules` → 集成分支 | calendar · 日程表/迁移；导航由 foundation 配合 | `/calendar` `/api/v1/calendar/schedules/**` |

### 冲突面规则

1. 默认**不跨 Owner 目录改文件**。用户明确授权的跨模块体验迭代先登记范围，按 Owner 分别评审；本次集成范围为 identity、tasks、board 和相关共享 UI。要动 core / `package.json` → `feature/core-patch/<slug>` 或开 issue。
2. 路由文件只做壳，业务写在模块 `service.ts`。
3. schema 只追加到 `src/db/schema.ts` 末尾并注释 `// <module>`。
4. 依赖只在 foundation 阶段加；后续加依赖先声明理由。
5. PR 必须 Windows 上 `npm test` + `npm run build` 全绿。

---

## 3. 公开契约（`index.ts`）

> 填实 stub 后**必须**更新本节。`tests/contract/exports.test.ts` 做静态断言。

### `@/modules/core`

```ts
AppError / ForbiddenError / NotFoundError / ConflictError / NotImplementedError
isUniqueViolation(e): boolean

requireUser() / tryUser()

getProjectForUser(actorId, projectId)
requireProjectForUser(actorId, projectId)
getTeamMembership(userId, teamId)
requireTeamRole(userId, teamId, allowed: TeamRole[])
requireTaskWrite(actorId, projectId)      // admin + student
requireReviewer(actorId, projectId)       // admin + teacher

todayISO(d?) / isValidISODate(s) / addDaysISO(iso, days) / daysBetween(from, to)
isOverdue(due, today?) / isDueSoon(due, withinDays?, today?)
formatMinutes(mins) / monthGrid(year, month)

type FormState = { error: string } | null
toFormError(e, fallback?): string
```

### `@/modules/identity`

```ts
createTeam(userId, name)
joinTeam(userId, inviteCode)
listMyTeams(userId)
listTeamSpaces(actorId)                   // 当前用户的空间，含 memberCount / projectCount（active）
listTeamMembers(actorId, teamId)          // 必须先检查团队访问权限
updateMemberRole(actorId, teamId, targetUserId, role)
updateMemberPositions(actorId, teamId, targetUserId, positions: TeamPosition[])
getAcademicProfile(actorId)
saveAcademicProfile(actorId, { identity, institution?, department?, researchFocus? })
confirmAcademicIdentity(actorId, teamId, targetUserId, profileVersion)
getAccountProfile(actorId)               // 本人最新姓名、邮箱、简介、头像 URL
saveAccountProfile(actorId, { name, bio?, avatar? })
getAvatar(actorId, targetId)             // 本人或同团队；返回 PNG bytes / hash
avatarGET(request, context)             // session → service → private PNG / 304
getFeishuConnection(actorId)            // 本人连接摘要；不返回 openId 或凭据
disconnectFeishu(actorId, { bindingVersion }) // 事务锁定本人账号，校验连接版本与登录方式
createProject(actorId, teamId, input)
listTeamProjects(actorId, teamId)
updateProject(actorId, projectId, patch)
listMyProjects(actorId)
// re-export: getTeamMembership / getProjectForUser / requireTeamRole
```

`createTeam`/`createProject` 校验并去除名称首尾空白；项目日期校验真实日历日期及开始≤结束。`updateMemberRole` 在事务中锁定团队，拒绝降级最后一位管理员。公开 UI：`identity/ui` 提供场景选择、创建/加入、成员职务与邀请码组件；`identity/views` 提供团队、成员、项目、个人设置、项目设置和项目概览页面。团队场景是引导选择，数据库实体仍为团队，课程/实验室/竞赛类型存于项目。

### `@/modules/tasks`（A）

```ts
type TaskDTO / TaskPatch / TransitionInput / TransitionAction

listProjectTasks(actorId, projectId, filters?)
getTaskDetail(actorId, taskId)                    // 含 subtasks
createTask(actorId, projectId, input)
updateTask(actorId, taskId, patch)
deleteTask(actorId, taskId)
transitionTask(actorId, taskId, action, input?)   // 唯一状态入口
createSubtask(actorId, parentTaskId, input)
listSubtasks(actorId, parentTaskId)
setDueDate(actorId, taskId, dueDate)

availableTransitions(task: { status, assigneeId, permissions? }, role, actorId): TransitionRule[]
STATUS_DESCRIPTIONS / canDeleteTask(role)
```

状态机唯一真相是模块内部 `states.ts` 的 `TRANSITIONS`，外部通过 `@/modules/tasks` 或浏览器安全的 `@/modules/tasks/client` 使用。`TaskDTO.permissions?: TaskPermissions` 是当前操作者的权限引导快照，任务服务返回时按职务与场景计算；`availableTransitions` 同时处理状态、能力和负责人限制。纯函数旧调用未提供快照时保留三态角色兼容；服务端总是重新计算当前能力。`toDTO(row)` 签名保持不变，旧工作台 DTO 由共享 TaskActions 在显示前补齐权限。`claim` 由当前用户认领，管理员保留代提交权限。`transitionTask` 在行锁事务中同时写状态与活动事件，通知在提交后发送。公开 UI：`tasks/ui` 的 `TaskWorkflow`、`TaskActions`、`TransitionDialog`、`CreateTaskForm`；`tasks/views` 的任务池与详情组合。详情页必须检查 URL 的 projectId 与任务归属一致。

### `@/modules/board`（B）

```ts
deriveColumns(tasks, groupBy)
applyFilters(tasks, f)
parseFilters(params) / serializeFilters(f)
moveTask(actorId, taskId, patch)   // 只调 tasks.updateTask / transitionTask
getMoveTransition(task, targetStatus, role, actorId): TransitionRule | null
type MovePatch = { status?, assigneeId?, priority?, milestoneId?, sortOrder?, note? }
movePatchSchema
```

`BoardFilters` 增加 `q?: string`，搜索标题和描述；URL 保留状态、负责人、优先级、里程碑和搜索。状态移动支持 `note`，提交/重交/打回均不能省略说明。状态、负责人和属性分别提交，组合写入会明确拒绝，避免丢弃半个操作。API `deriveColumns` 的历史五列顺序保持兼容；页面用 `BOARD_STATUS_ORDER` 展示待认领→进行中→待验收→待修改→已完成，并单独说明打回分支。只有按状态分组支持拖动；其他分组用于浏览。公开 UI：`board/client`（纯函数）、`board/ui`（`ProjectWorkspace`）、`board/views`（页面组合）。

### `@/modules/review`（C）

```ts
listMyTodo(actorId) / listMyInProgress(actorId) / listMyRejected(actorId)
listUnclaimedPool(actorId, projectId)
listPendingReview(actorId, projectId)
listOverdueRisks(actorId, projectId)
listTaskEvents(actorId, taskId)
getWorkbench(actorId) // { mine, review, pool }，附项目名与当前操作者权限
```

### `@/modules/worklog`（D，含 stats）

```ts
addWorklog(actorId, taskId, input) / listWorklogs(actorId, taskId) / deleteWorklog(actorId, worklogId)
completionRatio(actorId, taskId) / projectCompletion(actorId, projectId)
taskHours(actorId, projectId, range?)
memberContribution(actorId, projectId)
```

### `@/modules/calendar`（E）

```ts
monthView(actorId, projectId, year, month)   // month: 1-12
listMySchedules(actorId, year, month)       // 本人自然月，YYYY-MM-DD / HH:mm
createSchedule(actorId, input: ScheduleInput): Promise<ScheduleDTO>
updateSchedule(actorId, scheduleId, version, input: ScheduleInput): Promise<ScheduleDTO>
deleteSchedule(actorId, scheduleId, version): Promise<void>
schedulesGET(request) / schedulesPOST(request)
schedulePUT(request, { params }) / scheduleDELETE(request, { params })
```

个人日程表 `personal_schedules` 归 calendar（E）。UI 公开 `calendar/views.PersonalCalendarView/ProjectCalendarView`，路由只做壳；`calendar/ui.ScheduleControls` 提供日程弹窗，`calendar/client` 公开 DTO、`ScheduleInput`、优先级元数据、输入/月校验、`parseCalendarQuery/calendarUrl/selectSchedules/scheduleTimeLabel`，均为浏览器安全的纯实现。服务只通过当前 actorId 管理本人记录，职务与身份不扩展权限；更新/删除以版本条件写入，404 不泄露他人记录，409 防旧页面覆盖。日期范围、HTTP 输入、追加迁移及源文件取舍见 [SCHEDULES.md](SCHEDULES.md)。原项目月视图返回结构和 ACL 保留，新增年月边界校验。

### `@/modules/milestone`（E）

```ts
listMilestones(actorId, projectId)
createMilestone(actorId, projectId, input)
updateMilestone(actorId, milestoneId, patch)
deleteMilestone(actorId, milestoneId)
```

### `@/modules/notify`（E）

```ts
notifyAssigned(taskId) / notifySubmitted(taskId) / notifyAccepted(taskId) / notifyRejected(taskId, reason)
scanAndNotifyDue()                            // cron
listMyNotifications(actorId, opts?) / markRead(actorId, id)
```

---

## 4. PR 检查清单

- [ ] 模块归属正确（上表）
- [ ] 契约签名变了？→ 已同步本文档第 3 节
- [ ] 契约测试 ≥ 6 条（happy + 越权 + 非法状态转移）
- [ ] Windows：`npm test` + `npm run build` 绿
- [ ] 未改不属于自己的目录
- [ ] 本轮集成版本递增，包与锁文件版本、README、CHANGELOG、PR 和对应 tag 一致；候选/正式状态准确，正式版已合入主分支并验证

Commit 用 Conventional Commits：`feat(tasks): 五态状态机` · `fix(board): 非法拖拽回滚` · `test(review): 越权矩阵`

身份补充：`listTeamMembers` 追加 `positions/profile/confirmedVersion/confirmedAt/identityConfirmed/canExecute`；`listTeamSpaces` 追加 `positions`。`updateMemberRole` 兼容旧调用，同时同步唯一对应职务；新 UI 使用 `updateMemberPositions`。成员设置变更应刷新团队、项目、工作台入口。身份确认、职务并集和迁移细节见 [IDENTITY.md](IDENTITY.md)。身份、职务和项目编辑客户端组件在 `academic-ui` 内部，由公开 `views` 组合，不作为新的跨模块深链入口。

## 5. 协作闭环集成 · 2026-10-04

用户授权的集成范围：foundation 负责 identity、个人资料与共享 UI；A 负责任务编辑/拆分与校验；B 负责排序；C 负责工作台；D 负责验收口径/工时；E 负责消息收件箱。登录与 core 保持既有契约。

identity 根入口新增 `getAccountProfile(actorId)`、`saveAccountProfile(actorId, { name, bio?, avatar? })`、`getAvatar(actorId, targetId)`、API 薄壳 `avatarGET(request, context)`。`avatar` 省略表示保留，`remove` 表示移除，上传为客户端处理的 256×256 PNG data URL；返回资料只含头像 URL，不含图片内容。头像仅本人或同团队成员可读。成员 DTO 追加 `bio/avatarUrl/avatarHash`。保存姓名使学术资料版本增加，旧确认失效。

tasks 的 `createSubtask` 输入追加 `priority?`。创建与更新校验真实日期、起止顺序、标题、预计工时和当前项目的里程碑；父任务只能在创建时关联，不允许继续嵌套。父任务验收需全部子任务通过；已提交/完成的父任务不能追加子任务，重开已完成子任务需先重开父任务。`tasks/ui` 内提供 `CreateTaskForm({ projectId, parentTaskId?, onCreated? })`；编辑表单是模块内实现，由 `tasks/views` 调用，仍使用统一任务服务。

review 的 `getWorkbench` 用成员关联查询进行访问隔离，按项目能力分类，归档项目不进入当前队列。公开 `review/views` 提供 `WorkbenchView`，兼容原 student/teacher 路由；纯队员在教师入口看到空验收视图，不报错。DTO 直接带权限快照，避免每张卡再请求权限。

`projectCompletion` 的 `{ done, total, ratio }` 为已验收顶层任务数/顶层总数，单次聚合查询；`completionRatio` 在有子任务时为已验收子任务数/直接子任务总数，两者在 UI 明确标识。工时仅执行职务且当前负责人可记；`tasks/ui.WorklogForm` 接收 `{ taskId, projectId, defaultDate }`，默认日期由服务端的 `todayISO` 提供。公开 `worklog/views` 提供 `StatsView`。

notify 公开 `notify/views` 的 `NotificationsView` 和 `notify/ui` 的 `MarkReadButton`，收件箱按 actorId 隔离，展示最近 100 条，可筛选未读并进入对应任务。标记他人消息返回 NotFoundError，不暴露消息存在性。

## 6. 工作台与产品文案迭代 · 2026-10-04

本轮范围及 Owner：foundation（identity、共享导航），A（任务流程入口文案），B（看板文案），C（工作台筛选与排序），E（系统通知）。沿用集成分支，不调整 core、登录、数据结构或依赖。

## 公共基础与可选连接补充 · 2026-10-04

用户确认本轮限于公共基础、个人中心和飞书轻量接入；Owner 为 foundation。范围为 identity、个人设置壳下旧组件移除、公共 Next 配置、契约测试、文档、锁文件元数据和 `.github/workflows/verify.yml`，不接管成员模块分支。沿用集成分支，不修改 core、锁定登录文件、数据库结构或业务依赖声明。

`identity/client` 追加浏览器安全的 `FeishuConnection` 类型：`connected/configured/name/boundAt/bindingVersion/canDisconnect`。设置页面通过本人 service 取摘要，连接 UI 与 action 归 identity 内部，由公开 `identity/views.SettingsView` 组合；不从路由目录反向导入业务组件。配置状态只检查应用 ID、密钥及回调地址是否填写，不等同于飞书联调成功。

解绑的 `actorId` 仅来自会话，输入不接受目标用户 ID。连接版本是开放标识与绑定时间的摘要，事务中锁定账号后比较；旧页面不能清除新绑定。历史飞书创建的 `@feishu.local` 占位邮箱没有用户可用的本地密码，保守禁止解绑。其余账号可确认解绑，重复提交幂等；资料、团队职务、学术确认和任务记录保留。

个人资料 action 成功返回已保存的姓名、简介和头像 URL，客户端以此更新还原基线、清空头像上传草稿；无修改时不重复提交。飞书姓名只填入本地表单草稿，沿用本人保存、姓名变更使旧身份确认失效的规则。飞书私信投递仍由 E 的后续独立实现负责，当前仅站内消息可用，参见 [FEISHU.md](FEISHU.md)。

公共 CI 的首次全新安装暴露历史锁文件中 Vitest/esbuild 平台项缺少可选标记。foundation 用 Node 22 对应的 npm 10 重新计算锁文件，恢复 optional/dev/peer 标记并补全既有 Tailwind WASM 包内置的可选依赖记录，同步已更名的包名；`package.json` 依赖声明与保留的包版本、来源和完整性值保持不变。Windows npm 10/11 全新安装均验证，避免仅按本机 npm 11 生成而遗漏 npm 10 所需的可选 peer 图。此为依赖图修复，不新增业务依赖。PR 触发检查全部分支，push 只检查 main/develop，避免同一 PR 推送重复运行。

公开 `review/client` 为浏览器安全的纯函数入口，导出 `WorkbenchQuery`、`WorkbenchSearchParams`、`parseWorkbenchQuery(params)`、`workbenchUrl(query, changes?)` 与 `selectWorkbenchItems(items, query, today)`，仅使用 Zod 和纯日期函数，不引入 DB/session/service。工作台 `view/q/projectId/due` 保存在 URL，分类切换保留筛选；`soon` 为今天至第六天，逾期不含今天。任务按逾期、优先级、截止日期、sortOrder、createdAt、id 排序，筛选和排序不修改输入，不扩大 `getWorkbench` 的权限范围。

## AI 对话界面 · 2026-10-05

用户确认本轮先做侧栏图标、对话页面与本地草稿，Owner 为 foundation；沿用 `codex/collaboration-completion` 集成分支。范围仅 `src/components/ai/*`、共享导航/图标、`/ai` 壳、foundation 草稿测试和文档；不修改成员模块、core、登录文件、数据库或依赖声明。

`@/components/ai/view.AiWorkspaceView` 是共享 UI 的服务端组合入口，调用公开 `core.requireUser()`，只把当前会话 userId 传入客户端，不接受 URL 指定的用户。`workspace.tsx` 负责 UI；`drafts.ts` 提供 Zod 边界与草稿纯函数，`draft-store.ts` 提供浏览器存储适配，均不导入 session/DB/service。没有新增业务模块、公开业务签名或模型 API。草稿按账号命名，服务端不保存；本地浏览器存储不等同于服务端 ACL。

正式测试仅扫描 `tests/**/*.test.ts`，避免 `.tools` 内的本地安装验证副本重复执行。新增草稿用例覆盖恢复、账号隔离、损坏数据保护、拒绝存储、写入失败/恢复、删除后的选择、容量/长度/索引约束与搜索；页面覆盖刷新水合、名称保留和取消操作。细节见 [AI.md](AI.md)。

系统指派/验收通知使用客观状态说明。旧版这两类通知的固定文案在 DTO 展示时兼容转换，历史数据和成员填写的成果说明、修改意见不变。

## 迭代版本管理 · 2026-10-05

用户要求每轮迭代有递增版本号。foundation 在 `feature/core-patch/iteration-version` 仅调整包与锁文件的本项目版本元数据、README、更新日志、Agent/协作约束、工作流和 PR 模板；验证后快速合入 `codex/collaboration-completion`。当前候选版为 `0.3.0-rc.1`，不更改依赖、模块契约、数据库、core 或登录文件。版本统一由集成人维护，成员模块分支不独立抢占下一版本；候选版和正式版的规则见 [WORKFLOW.md](WORKFLOW.md#9-迭代版本与发布)。
