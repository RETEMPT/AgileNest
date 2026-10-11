# TEAM.md — 模块 · 分支 · 契约

一份文档说清「谁做什么、接口长什么样、怎么不撞车」。

本次身份权限补丁由 foundation 在 `feature/core-patch/member-capabilities` 实施：`getTeamMembership` 追加 `positions`，`getProjectForUser` 追加 `positions/capabilities`，既有字段与调用保持兼容。`identity/client` 是公开纯函数入口，导出学术身份、职务元数据、兼容角色映射及 `capabilitiesFor(positions, projectKind)`；不加载数据库或 session。实验室与竞赛队长可管理该类项目、指派任务；验收由指导老师/管理员负责。身份仅供展示和团队确认，不影响权限。

---

## 1. 模块地图

```
src/modules/
  core/        错误 · 权限 · session · 日期 · 表单     foundation
  identity/    团队 · 成员 · 角色 · 项目               foundation
  resources/   团队/项目文档 · 文件 · 交付证据          foundation
  discussions/ 任务讨论 · 回复 · 历史 · 附件引用        C / root
  tasks/       任务 CRUD · 子任务 · 五态状态机         A
  board/       看板 + 表格 · 筛选 · 拖拽               B
  review/      双端工作台 · 验收台 · 活动流            C
  worklog/     工时 · 完成度 · 贡献（含原 stats）      D
  calendar/    项目月历/跨天排期 · 本人日程 CRUD       E
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
新增表归属：`team_profiles/team_announcements` → identity；`task_requirements/task_submissions/task_submission_reviews` → tasks；`team_resources/resource_revisions/resource_references` → resources。
rc.7 追加：`task_discussion_posts/task_discussion_revisions/discussion_resource_references` → discussions，原文件存储仍归 resources。
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
| foundation（本轮 AI 与个人中心） | `codex/ai-settings-workspace` | 共享 AI UI · 浏览器草稿与偏好 · identity 设置 | `/ai` `/settings`，仅界面与本地存储 |
| foundation + A/B/C/D/E（本轮体验） | `codex/experience-integration` | 共享外壳/详情及各 Owner 的直接入口 | 项目任务、工作台、验收、统计、日历与通知；见执行记录 |
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

## AgileNest 体验集成 · 0.4.0-rc.5 · 2026-10-10

用户授权分步执行体验方案并使用子代理；基线为 `2301a6d` / `0.4.0-rc.4`，在 `codex/experience-integration` 按 Owner 集成。foundation 负责 AppShell/AppSidebar、共享 TaskDrawer/活动展示/状态 tokens、identity 项目上下文与空项目口径；A 负责任务内容和渐进表单；B 负责看板/表格及筛选；C 负责工作台/验收组合；D 负责工时口径与顶层任务下钻；E 负责项目日历与通知入口。各模块 service、状态机、登录、core、schema、依赖均保留原契约。

新增公开 UI 入口如下，均不把 DB/session/service 运行时代码带入客户端：

```ts
// identity/ui：由项目布局消费，取代重复项目横向导航
ProjectContextHeader({ projectId: string, name: string, positions: TeamPosition[] })

// tasks/ui：共享只读展示，由独立详情页和共享抽屉消费
TaskDetailSummary({
  task: TaskDTO,
  subtasks?: readonly TaskDTO[],
  milestoneName?: string | null,
  loggedMinutes?: number,
  headingLevel?: "h1" | "h2" // 默认 h2
})

// review/views：服务端验收页组合，路由只做壳
ReviewView({ params: Promise<{ projectId: string }> })

// review/ui：客户端入口，由验收页消费
ReviewTaskDetails({ task: TaskDTO, role: TeamRole, actorId: string })
```

共享 `TaskDrawer` 保留 `task/role/actorId/isOpen/onClose`，追加可选 `members?: AssigneeOption[]` 和 `milestoneName?: string | null`，由 board 直接传入已授权的成员和里程碑摘要。未加载工时/子任务的抽屉不伪造零值；完整页显示真实查询结果。活动使用既有任务事件接口，并按账号、任务、更新时间和重试标识隔离响应。

看板与表格保留 `q/status/assigneeId/priority/milestoneId/groupBy`，搜索提交保留已存在的多值条件；任务池仍有独立入口和旧 URL。本轮后置 `task` query、任务池共享筛选、项目日历统一筛选。个人日程版本与隐私不变，日历里程碑通过公开 `board/client.serializeFilters` 下钻。证据与后续入口见 [执行记录](AGILENEST-EXECUTION.md)。


## 当前业务集成 · 0.4.0-rc.6 · 2026-10-10

分支 `codex/business-completion`，基线 `7c53f70`。identity（foundation）负责团队资料、公告、邀请和成员管理；tasks（A）负责要求、提交和逐项验收；board/review（B/C）负责 URL、筛选和证据历史；resources（foundation）负责共享资料与文件绑定；root 串行集成追加表、公开契约、遗漏修复和版本。锁定登录、core 和依赖不变。

`tasks/client` 公开 DeliveryInput/ReviewInput/SubmissionDTO/TaskDeliveryDTO 与浏览器安全的 deliverySchema/reviewSchema，内部状态仍以 TRANSITIONS 为唯一真相。`TransitionInput` 增加 delivery?/review?；普通动作兼容，新 submit/resubmit 不能仅传 note。必须提供至少一项验收要求、要求版本、完成说明、验证结果和链接或文件。accept/reject 绑定当前 submissionId；打回需至少一项未通过、逐项问题位置/通过条件和总体修改要求。历史提交明确标记 legacy，不伪造证据。

`TaskActions/TransitionDialog` 追加 `onPendingChange?`，写入和上传期间外层关闭保护同源。公开 `review/ui` 提供 `SubmissionTimeline({taskId,updatedAt?,compact?})`、`ReviewSubmissionEvidence`；`review/client` 提供 `parseTaskDeliveryPayload(input,taskId)` 和 `sortSubmissionVersions`，读取返回的真实版本并隔离旧请求。

`board/client` 增加 `parseTaskQuery(params)`、`taskDetailUrl(pathname,params,taskId|null)`、`workspaceUrl({projectId,view,filters,groupBy?,taskId?})`；`ProjectWorkspace` 增加 selectedTask?。看板/表格的 task URL 经项目权限检查，打开 push、切换 replace、关闭只清 task；任务池使用共用 q/status/priority/assigneeId/milestoneId 筛选，详情仍是独立页。项目日历筛选统一后置。

`identity/client` 增加 TeamInformationDTO/TeamAnnouncementDTO；`identity/views.TeamSettingsView({teamId})` 组合设置页。`identity/ui.TeamSectionLinks({teamId,current})` 连通 projects/members/settings/resources；TeamMemberRemovalButton、TeamSettingsWorkspace 与 InviteCode 的 expiresOn? 支持当前团队操作。

本轮保留必要自动检查与关键入口试用，全面手工验收按用户最新要求留到最后迭代。统一文档入口与后续计划见 [PROJECT-STATE](PROJECT-STATE.md)。

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
getTeamInformation(actorId, teamId)     // 团队信息中心、邀请有效期与公开联系方式
updateTeamInformation(actorId, teamId, input)
rotateTeamInvite(actorId, teamId, input)
listTeamAnnouncements(actorId, teamId)
createTeamAnnouncement(actorId, teamId, input)
updateTeamAnnouncement(actorId, teamId, announcementId, input)
deleteTeamAnnouncement(actorId, teamId, announcementId, version)
leaveTeam(actorId, teamId)              // 保护最后管理员及仍承担未完成任务成员
removeTeamMember(actorId, teamId, targetUserId)
// re-export: getTeamMembership / getProjectForUser / requireTeamRole
```

`createTeam`/`createProject` 校验并去除名称首尾空白；项目日期校验真实日历日期及开始≤结束。`updateMemberRole` 在事务中锁定团队，拒绝降级最后一位管理员。公开 UI：`identity/ui` 提供场景选择、创建/加入、成员职务与邀请码组件；`identity/views` 提供团队、成员、项目、个人设置、项目设置、团队信息设置和项目概览页面。团队场景是引导选择，数据库实体仍为团队，课程/实验室/竞赛类型存于项目。

### `@/modules/tasks`（A）

```ts
type TaskDTO / TaskPatch / TransitionInput / TransitionAction
type AcceptanceCriterion / DeliveryInput / ReviewInput / SubmissionDTO / TaskDeliveryDTO

listProjectTasks(actorId, projectId, filters?)
getTaskDetail(actorId, taskId)                    // 含 subtasks
createTask(actorId, projectId, input)
updateTask(actorId, taskId, patch)
deleteTask(actorId, taskId)
transitionTask(actorId, taskId, action, input?)   // 唯一状态入口
createSubtask(actorId, parentTaskId, input)
listSubtasks(actorId, parentTaskId)
setDueDate(actorId, taskId, dueDate)
getTaskDelivery(actorId, taskId)
saveTaskRequirements(actorId, taskId, { version, criteria })
deliverySchema / reviewSchema

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
type MovePatch = { status?, assigneeId?, priority?, milestoneId?, sortOrder?, note?, delivery?, review? }
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
monthView(actorId, projectId, year, month)   // 42 格；兼容 tasks/milestones，追加 events/isWeekend
listAgenda(actorId, projectId, { from?, to?, filters? }) / listAgendaDays(actorId, projectId, range?)
calendarBoard(actorId, projectId, { year, month, horizonDays?, range?, filters? })
parseCalendarFilters(params) / parseCalendarQuery(params, today?) / serializeCalendarQuery(query)
agendaWindow(query, today?)
listMySchedules(actorId, year, month)       // 本人自然月，YYYY-MM-DD / HH:mm
createSchedule(actorId, input: ScheduleInput): Promise<ScheduleDTO>
updateSchedule(actorId, scheduleId, version, input: ScheduleInput): Promise<ScheduleDTO>
deleteSchedule(actorId, scheduleId, version): Promise<void>
schedulesGET(request) / schedulesPOST(request)
projectCalendarGET(request): Promise<Response>
schedulePUT(request, { params }) / scheduleDELETE(request, { params })
```

个人日程表 `personal_schedules` 归 calendar（E）。UI 公开 `calendar/views.PersonalCalendarView/ProjectCalendarView/CalendarWorkspaceView`，路由只做壳；`calendar/ui.ScheduleControls` 提供个人日程弹窗，另公开 `CalendarWorkspace/MonthGrid/AgendaList/EventChip` 项目组件。`calendar/client` 公开 DTO、`ScheduleInput`、优先级元数据、输入/月校验、个人日程的 `parseCalendarQuery/calendarUrl/selectSchedules/scheduleTimeLabel`，另公开项目 `ProjectCalendarQuery/CalendarEvent/CalendarCell/CalendarFilters/AgendaDay` 与 model 纯日期、事件、筛选函数，不加载 DB/session。根入口 `parseCalendarQuery` 用于项目 URL，兼容 `year/month/view/status/assigneeId/milestoneId/risk`；个人 URL 使用 `y/m/date/q/priority`，两种查询不混用。

服务只通过当前 actorId 管理本人日程，职务与身份不扩展权限；更新/删除以版本条件写入，404 不泄露他人记录，409 防旧页面覆盖。项目日历来自 PR #7，保留项目 ACL、跨天任务和里程碑；`calendarBoard` 用同一批任务/节点生成月格和所选日程窗口，支持历史月份和一致筛选，长跨度仅展开可见窗口。年份统一 1900–2100，窗口天数 1–366。日期范围、HTTP 输入、追加迁移及源文件取舍见 [SCHEDULES.md](SCHEDULES.md)。

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

### `@/modules/resources`（foundation）

```ts
listResources(actorId, opts: { projectId?, teamId? })
getResource(actorId, resourceId)
createResource(actorId, input: { projectId?, teamId?, kind: "document" | "link", title, body?, url?, tags?, category? })
uploadResource(actorId, scope: { projectId?, teamId? }, file: { name: string, bytes: Uint8Array }, title?)
updateResource(actorId, resourceId, patch: { version: number, title: string, body?, url?, tags?, category? })
deleteResource(actorId, resourceId, version)
listResourceRevisions(actorId, resourceId)
getResourceFile(actorId, resourceId)
bindSubmissionResources(actorId, projectId, resourceIds, submissionId, tx)
resourcesGET(request) / resourcesPOST(request)
resourceGET(request, context) / resourcePATCH(request, context) / resourceDELETE(request, context)
resourceFileGET(request, context)
type ResourceDTO
```

资源分为可编辑 Markdown 文档、外部链接与原文件。文本/Markdown/CSV/JSON 文件有真实正文预览；图片/PDF 浏览器预览，Office/ZIP 下载，不宣称已提取正文。文档版本保存历史，文件原内容不可覆盖，引用文件禁止删除；ResourceDTO 追加 referenced，客户端据此禁用删除，服务端继续锁与重新检查。

公开 `resources/client` 导出 DTO、类别/容量、真实文本整理及安全 URL/Marker 产物解析纯函数；`resources/ui` 导出 `ResourcesWorkspace({initialResources,teamId,projectId?,scopeName})`、`ResourcePicker({projectId,selectedIds,onChange,disabled?,onUploadingChange?,label?})` 和 `ResourceMarkdown({text,idPrefix?})`。公开 `resources/views` 提供 `TeamResourcesView/ProjectResourcesView({params})`，路由只做壳。

## 飞书为主的协作空间 · rc.7

分支 `codex/collaboration-workspace`，基线 `1fdce10` / rc.6。用户授权分多轮扩展协作与右下角通知入口；本轮按模块实施项目路径、讨论/附件、资料浏览和通知助手。范围/后续优先顺序见 [COLLABORATION-WORKSPACE](COLLABORATION-WORKSPACE.md)。foundation/identity 复用现有项目数据组织路径；foundation/resources 维护资料 UI；C/root 实施 discussions 和任务详情组合；E/foundation 实施 notify 与共享 bot。root 集成公开契约、追加迁移和版本，不改其他成员分支、core、登录或依赖。

```ts
// discussions 根入口：全部先检查当前项目成员；写入在事务中重新验证
listTaskDiscussions(actorId, taskId): Promise<DiscussionListDTO>
createTaskDiscussion(actorId, taskId, { body?, resourceIds?, parentId? }): Promise<DiscussionPostDTO>
updateTaskDiscussion(actorId, taskId, postId, { version, body }): Promise<DiscussionPostDTO>
withdrawTaskDiscussion(actorId, taskId, postId, version): Promise<DiscussionPostDTO>
setDiscussionResolved(actorId, taskId, postId, { version, resolved }): Promise<DiscussionPostDTO>
listDiscussionRevisions(actorId, taskId, postId): Promise<DiscussionRevisionDTO[]>
taskDiscussionsGET / taskDiscussionsPOST / taskDiscussionGET / taskDiscussionPATCH

// discussions/client：浏览器安全 DTO、输入与响应 Zod schema；不含 DB/session
DiscussionListDTO // {posts, truncated, limit}，最近200条及回复所属根主题
DiscussionPostDTO // 内容、版本、父主题、附件快照、撤回/解决、本人操作能力
discussionListSchema / discussionPostSchema / discussionHistorySchema / discussionRevisionSchema
discussionCreateSchema / discussionEditSchema / discussionResolveSchema

// discussions/ui：完整页与共享任务抽屉共用
TaskDiscussions({ taskId, projectId, actorId, onBusyChange?, onDirtyChange? })

// resources 根入口：仅当前项目/团队共享文件，tx 内锁定并保留引用
bindDiscussionResources(actorId, projectId, resourceIds, postId, tx): Promise<DiscussionResourceDTO[]>

// resources/client：资料浏览连续性，不引入权限或服务运行时
ResourceQuery / parseResourceQuery(params)
resourceWorkspaceUrl(pathname, params, changes)
selectResources(rows, query) / resourceUploadError({name, size})

// notify 根入口：本人摘要与已读；旧接口继续兼容
getMyNotificationFeed(actorId): Promise<{notifications: NotificationDTO[], unreadCount: number}>
markAllRead(actorId): Promise<number>
notificationsGET / notificationsPOST
notifyTaskDiscussion(actorId, taskId, postId, tx?): Promise<void>

// notify/client：浏览器安全的消息响应、内部链接校验与分类文案
NotificationItem / NotificationFeed
parseNotificationFeed(value) / notificationTarget(link) / notificationLabel(type)

// notify/ui：右下角共享助手；旧 MarkReadButton 保留
useNotificationFeed() // 摘要、等待/错误、更新时间、已读等待、refresh/mark
NotificationDockPanel({ state, onNavigate })
```

API：`/api/v1/tasks/:taskId/discussions` GET/POST、`/:postId?history` GET、`/:postId` PATCH `op=edit|withdraw|resolve`。新讨论/回复只通知任务负责人和被回复作者，排除本人/离队成员，通知与新内容同事务提交。撤回保留历史与文件引用，不改任务状态。源码追加迁移 `discussions.sql`、`migrate-discussions.mjs`；开发/测试库分别应用，旧业务迁移不改哈希。

资料 URL 为 `q/category/kind/scope/resource`（具体值以 `ResourceQuery` 为准），关闭资料详情保留筛选；复制链接仍需当前成员鉴权。`ResourcePicker.label?` 默认“成果附件”，讨论使用“任务附件”，其余签名兼容。

通知摘要 API 为 `GET /api/v1/notify?summary=1`，最近 20 条与全部本人未读数一起返回，响应 private/no-store；原 GET 列表继续兼容。`POST ?all=1` 标记本人全部消息，`POST ?id=UUID` 保留单条语义；本人范围由会话确定，不接受 userId。客户端每 60 秒在可见页面更新，focus/visibility 与 `agilenest:notifications-changed` 触发刷新；错误保留上次消息，卸载终止请求。`CollaborationDock({userId,projects,aiEnabled?})` 按账号重新挂载，保留 `openAiFloating()` 事件和 AI 草稿保存保护；没有 Web Push、模型或飞书私信契约。

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

tasks 的 `createSubtask` 输入追加 `priority?`。创建与更新校验真实日期、起止顺序、标题、预计工时和当前项目的里程碑；父任务只能在创建时关联，不允许继续嵌套。父任务验收需全部子任务通过；已提交/完成的父任务不能追加子任务，重开已完成子任务需先重开父任务。`tasks/ui` 内提供 `CreateTaskForm({ projectId, parentTaskId?, onCreated?, onPendingChange? })`；编辑表单是模块内实现，由 `tasks/views` 调用，仍使用统一任务服务。

review 的 `getWorkbench` 用成员关联查询进行访问隔离，按项目能力分类，归档项目不进入当前队列。公开 `review/views` 提供 `WorkbenchView`，兼容原 student/teacher 路由；纯队员在教师入口看到空验收视图，不报错。DTO 直接带权限快照，避免每张卡再请求权限。

`projectCompletion` 的 `{ done, total, ratio }` 为已验收顶层任务数/顶层总数，单次聚合查询；`completionRatio` 在有子任务时为已验收子任务数/直接子任务总数，两者在 UI 明确标识。工时仅执行职务且当前负责人可记；`tasks/ui.WorklogForm` 接收 `{ taskId, projectId, defaultDate }`，默认日期由服务端的 `todayISO` 提供。公开 `worklog/views` 提供 `StatsView`。

notify 公开 `notify/views` 的 `NotificationsView` 和 `notify/ui` 的 `MarkReadButton`，收件箱按 actorId 隔离，展示最近 100 条，可筛选未读并进入对应任务。标记他人消息返回 NotFoundError，不暴露消息存在性。

## 6. 工作台与产品文案迭代 · 2026-10-04

本轮范围及 Owner：foundation（identity、共享导航），A（任务流程入口文案），B（看板文案），C（工作台筛选与排序），E（系统通知）。沿用集成分支，不调整 core、登录、数据结构或依赖。

## 交互反馈与阶段发布 · 2026-10-06

用户授权优化操作反馈并发布一键运行版本。foundation 负责共享 Button 的 `loading?`、FeedbackProvider/useFeedback/FormFeedback、侧栏与任务详情抽屉、个人设置及 Windows 发布工具；A 负责任务创建/编辑/流转反馈，B 负责看板拖动与创建弹窗，E 负责日程交互和 PR #7 项目日历集成。任务创建入口 `onPendingChange?` 让外层弹窗共享等待状态，提交期间阻止关闭；完成提示放在 AppShell，表单失败保留输入。

`projectCalendarGET` 是项目日历 HTTP 薄壳的模块入口。月格保留 tasks/milestones 的既有 DTO 数组并追加 events；日程按所选月份默认读取，两处应用同一筛选。运行包不新增依赖、业务表或登录逻辑，初始化使用既有 SQL 与独立迁移记录，后续启动不重置记录。阶段边界和使用方式见 [RELEASE.md](RELEASE.md)。

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

## 仓库与单一启动入口整理 · 2026-10-07

用户要求 GitHub 仓库简洁、只保留 start 一个入口，关闭启动窗口即停止网站。foundation 在 `codex/single-launcher-cleanup` 负责根目录重复脚本清理、`scripts/windows` 启动/初始化、Windows 发布包生命周期、对应检查和使用文档。根目录公开入口仅 start.bat，首次初始化和诊断通过选项完成；发布包内部文件按实际运行需要复制。

网站及 Next.js 子进程纳入 Windows Job Object，启动窗口退出后由 Windows 终止；同一目录的启动锁防止并发初始化。端口冲突只报错，已有配置、开发数据库及课设资料保留，示例仅在空用户表初始化。此轮不改变业务模块、公开契约、core、登录文件、schema 或依赖声明；候选版本为 0.3.1-rc.1。

## 数据库启动卡住修复 · 2026-10-07

foundation 在 `codex/fix-postgres-launch-hang` 修复 Windows PowerShell 等待 Postgres 继承输出管道的问题，范围为 `scripts/windows`、对应初始化/发布包调用与打包复制、Windows 回归检查及版本/使用文档。只等待 pg_ctl 进程并设置启动超时，启动日志与数据库日志分开；数据库子进程继续运行，现有数据保留。不修改业务模块、core、登录、schema 或依赖声明，候选版本为 0.3.1-rc.2。

## AI 工作区与个人中心 · 2026-10-07

用户授权参照提供的 DeepSeek Harness 界面重整 AI 和个人中心布局、拆分资料/项目/AI/外观功能。foundation 在 `codex/ai-settings-workspace` 负责 `components/ai`、共享 AppShell、浏览器偏好与主题 tokens、identity 设置组合/分区、对应检查和文档；保留上一轮启动修复，不调整 core、登录、成员业务模块、schema 或依赖。

公开 `identity/views.SettingsView` 的 `searchParams` 追加可选 `section`（profile/academic/projects/ai/appearance/connections）；飞书回调 notice 仍优先进入账号连接。内部 `settings-workspace` 只负责分区交互，现有资料/身份/连接表单保持原服务与 action，项目来自既有 `listMyProjects/listTeamSpaces` 的账号范围。共享 `AiWorkspace` 追加 `compact?` 供悬浮窗复用；没有新业务接口或模型执行。

主题与悬浮窗偏好键为 `agilenest:preferences:v1:<userId>`，客户端校验、读写失败反馈和账号隔离由共享 store 管理，不带 DB/session 运行时。偏好不跨设备同步。此轮候选版本为 0.4.0-rc.1。

## 项目会话、插件入口与联系方式 · 0.4.0-rc.2 · 2026-10-07

用户继续授权输入框置底、按项目整理会话、交互动画、模型配置与插件入口，明确选择暂不发起模型请求。foundation 沿用 `codex/ai-settings-workspace`，负责共享 AI/导航/偏好、identity 个人中心和资料服务、追加 `personal_contacts` 表/迁移及发布包迁移列表；不调整成员业务模块、core、登录或依赖声明。

公开 `getAccountProfile(actorId)` 返回值追加 `contacts: { phone, contactEmail, officeAddress, qq, wechat, x, github }`，字段均为字符串，未填写为空。`saveAccountProfile(actorId,input)` 追加可选 `contacts`，不传时保留原联系方式，传空串时清空；资料 action 以当前会话用户为唯一更新对象，成功返回 contacts 更新还原基线。联系方式不进入成员列表，不改变学术确认或职务权限。

共享 `AiWorkspace` 接收已通过公开 `listMyProjects` 查询的 projects 摘要，悬浮窗复用 AppShell 的同一摘要；不加载任务、文件或成员信息。旧 v1 草稿追加可选 projectId/messages，读取保持兼容；每份最多 20 条本地记录，按项目过滤、搜索包括记录正文。偏好 v1 追加 ai.model/ai.plugins 并为旧数据补齐默认值；模型密钥只记录环境变量名。没有模型 API 或外部插件执行契约。

## AI 本地资料与紧凑输入 · 0.4.0-rc.3 · 2026-10-08

用户授权缩小输入框、整理加号菜单并增加文件资料读取与整理。foundation 沿用 `codex/ai-settings-workspace`，范围仅共享 `components/ai`、相关 tokens、契约检查与版本/体验文档。没有新增模块导出、业务 API、依赖或模型请求，保留 rc.2 的个人资料与启动修复。

草稿/消息 v1 追加可选 `materials: {id,name,kind,size,createdAt}[]`；正文与 Blob 在 IndexedDB 按 `[userId,id]` 组织，旧草稿兼容，编辑正文合并最新资料元数据。每份会话最多 10 份、合计 50 MB，单文件 10 MB。文本读取、分页、搜索、标题/表格/JSON 字段整理完全在浏览器执行；PDF 与图片只预览，不宣称文字提取或 AI 总结。附件单独记录后仍随消息保留；移除或删除草稿清理不再引用的文件。用户手动选择文件，不自动读取项目任务、文件系统或服务端资料。

## 评审修正 · 0.4.0-rc.4 · 2026-10-10

对 rc.3 候选运行独立只读评审后，foundation 在同一分支修正并发与状态缺陷，范围仍为共享 `components/ai`、`components/preferences*`、identity 设置组合与对应契约用例，无新增导出、依赖或数据库变更。

共享 `AiWorkspace` 的编辑器在自身未编辑时采用 store 中更新的正文，避免多标签覆盖与旧视图继续编辑；同一 store 的 `saveText` 语义与既有「未编辑不覆盖」约定不变。个人资料 action 仅在表单包含联系方式字段时传递 `contacts`，`saveAccountProfile` 的「缺省保留」契约不变。偏好 store 追加 `reset()`（需要 `removeItem`），identity 失败提示改为「重置偏好」。`SettingsWorkspace` 在软导航时同步请求分区，分区切换改用 `pushState` 并监听 `popstate`。

## 协作基础与知识库 · 0.4.0-rc.8

集成分支 `codex/collaboration-foundations`，用户授权尽可能完善协作、参考官方资料并清理失效文档。foundation/root负责identity目录、共享详情/个人设置、讨论提及分页、schema/迁移/版本；A负责任务组织与行动项；resources Owner负责知识库；E负责站内订阅与本人提醒；B/root委托代理负责board和tasks/pool-filters单文件、本人保存视图。各模块服务与API仍通过根入口调用，共享schema由root串行追加，不改core/登录/依赖。

### identity

- 根入口 `getProjectDirectory(actorId,teamId):Promise<ProjectDirectoryDTO>`、`mutateProjectDirectory(actorId,teamId,ProjectSpaceMutation):Promise<void>`；HTTP薄壳 `projectDirectoryGET/POST`。
- `identity/client` 导出目录DTO/变更类型、Zod、`projectSpacePath`、`projectSpaceMoveError`；`identity/ui.ProjectDirectory({teamId,initial,kind?})`。
- POST `/api/v1/teams/:teamId/project-spaces` op=create/update/delete/place：update/delete带目录version；place带projectId/spaceId和placement version（首次0）。管理员/副管理员整理、成员读取，团队锁后复核，四层子树/循环/范围保护，空目录才能删除。
- `SettingsView` 的section新增notifications，复用notify公开面板。本人项目、学术资料与可选飞书连接契约不变。
- 用户后续职务授权：`TEAM_POSITIONS` 增加deputy，member显示组员；`capabilitiesFor` 增加manageTeamInformation/manageProjectDirectory/manageResources，admin/deputy均可日常管理，manageMembers仅admin。`canRemoveTeamMember(actorPositions,targetPositions)`供成员入口计算移除权限。
- 根入口`requireTeamCapability(actorId,teamId,capability,tx?)`，capability为manageMembers/manageTeamInformation/manageProjectDirectory/manageResources；identity事务在团队锁后重查实际职务。`updateMemberPositions(actorId,teamId,targetUserId,positions,positionVersion?)`新增可选版本参数，返回positionVersion；`listTeamMembers`增加positionVersion:string|null，页面强制携带。旧服务调用保留兼容，最后主管理员不因副管理员存在而放行降级/退出。

### tasks

- 根入口 `listProjectTaskLabels(actorId,projectId)`、`createProjectTaskLabel(actorId,projectId,{name,color?})`、`updateProjectTaskLabel(actorId,projectId,labelId,{name,color?,version})`、`deleteProjectTaskLabel(actorId,projectId,labelId,version)`。
- `getTaskOrganization(actorId,taskId,query?)` 与 `changeTaskOrganization(actorId,taskId,TaskOrganizationMutation)`：op=labels带labelIds和organization version；addDependency带otherTaskId/direction=blockedBy|blocking，removeDependency带dependencyId，均按公开Zod校验，前置与后续同项目，无环，版本和权限统一检查。组织读取使用repeatable-read。
- `createTaskActionItem(actorId,projectId,{resourceId,sourceVersion,requestKey,title,description?,dueDate?,quote?}):Promise<TaskDTO>`；POST `/api/v1/projects/:projectId/task-action-items`，先锁团队，调用resources公开源绑定，再原子创建任务/事件/来源；稳定requestKey重试仅复用本人同项目记录。
- TaskDTO可选追加labels/blockedByIds/blockingIds/blocked/reopenBlocked/actionItemOrigin。`listProjectTasks`过滤追加labelId/blocked；`availableTransitions`与服务端依赖守卫同时检查，无第六状态。被阻塞禁止提交/重交/通过；已提交或通过的后续任务保护前置重开；删除不能绕过关系。
- `tasks/client`导出组织DTO、schemas、颜色、`matchesTaskOrganization`、`wouldCreateTaskDependencyCycle`；`tasks/ui`导出`TaskOrganization({taskId,projectId,onBusyChange?})`、`TaskLabelFilter({projectId,value,onChange,disabled?})`、`TaskLabelPill`。TaskDetailSummary展示带accessible标志的来源卡片；不可见来源标题/摘录置null且隐藏链接。
- API：`/tasks/:taskId/organization` GET/PATCH；`/projects/:projectId/task-labels` GET/POST；`/:labelId` PATCH/DELETE。API薄壳均从tasks根入口导出。

### resources

- 原有ResourceDTO追加folderId/folderName/placementVersion/pinned、canEdit/canComment；getResource/listResources仍按团队/项目当前读取范围计算。作者/admin/deputy管理，协作者edit可改文档/link正文，不能管理授权/删除或改原文件。
- 根入口新增`listResourceFolders(actorId,scope)`、`createResourceFolder(actorId,input)`、`updateResourceFolder(actorId,input)`、`placeResource(actorId,input)`。folder输入teamId/projectId、name/parentId；update带folderId/version，placement带resourceId/version/folderId/pinned。八层限制计算完整子树，同名/循环/范围和版本冲突明确返回。
- `getResourceCollaboration(actorId,resourceId)`、`setResourceCollaboration(actorId,{resourceId,version,commentScope,collaborators})`；commentScope=team/collaborators，授权comment/edit只向当前成员授予；读取仍同团队。
- `linkResource(actorId,{sourceResourceId,targetResourceId?|targetTaskId?})`、`unlinkResource(actorId,linkId)`、`listResourceLinks(actorId,resourceId)`、`listTaskResourceLinks(actorId,taskId)`、`getResourceWorkspace(actorId,scope)`。资料双方读写与任务项目归属校验；双向展示不重复存边。
- `listResourceComments(actorId,resourceId)`、`createResourceComment(actorId,{resourceId,body,resourceVersion,parentId?,selectedQuote?,line?,mentionedUserIds?})`、`updateResourceComment(actorId,{commentId,version,action,body?,mentionedUserIds?})`、`listResourceCommentHistory(actorId,commentId)`；action=edit/withdraw/resolve/reopen。正文引文必须真实，版本/行号核对；作者编辑、作者或管理者撤回、管理者处理顶层评论。结构处理复制提及快照，通知/评论/版本同事务。
- `bindTaskActionItemSource(actorId,projectId,{resourceId,sourceVersion,quote?},tx)`返回{id,title,version}；仅可读真实文档、同项目或团队共享，摘录校验；来源引用保护删除。`accessibleResourceIds(actorId,ids,tx?)`批量过滤当前可见ID，供任务DTO掩码。
- `/api/v1/resources/workspace` GET读取scope/资料知识区、POST op+data调用上述服务。公开`resourceWorkspaceGET/POST`根入口；Zod在resources内部，不让消费方深链schema/service。
- `resources/ui.ResourceTaskLinks({taskId,projectId,onBusyChange?})`用于完整详情/抽屉。`ResourcesWorkspace`新增必选actorId（服务端会话传入），评论草稿按本人/资料保存；URL revision显示真实源版本，历史模式不创建当前引文/行动项。

### discussions

- `listDiscussionMembers(actorId,taskId)`只返回当前团队姓名/ID供明确选择。
- `createTaskDiscussion`增加mentionedUserIds默认[]；`updateTaskDiscussion`可传mentionedUserIds，缺省延续旧快照而不重新提醒离队成员；编辑显式新提及仍要求当前成员。resolve/withdraw复制该版快照，DTO/history可选mentions={userId,name}[]。
- `listTaskDiscussions(actorId,taskId,{before?,around?}={})`返回nextCursor可空。createdAt+id稳定分页，补齐回复根主题；before必须当前任务，around用于旧通知定位。裁剪游标保留边界，避免遗漏旧回复。GET列表?members读取名单，?before/?around浏览历史。
- 原TaskDiscussions共享UI增加姓名提及、任务关注、加载较早记录；草稿与409输入保留，文件引用和五态不变。

### notify / calendar

- 根入口 `getFollowState(actorId,target)`、`updateFollowState(actorId,{target,following,version})`、`listMyFollows(actorId)`。target={kind:project/task/resource,id}，首次version0，取消保留版本墓碑；每次当前团队ACL，事项取消覆盖项目继承。
- `getNotificationPreferences(actorId)`、`updateNotificationPreferences(actorId,input)`：version初次0，taskUpdates/discussions/mentions/resourceUpdates/reminders/showBubble。本人持久化，409不覆盖；关闭类别记录已处理事件，不在事后重放。
- `enqueueCollaborationNotice(actorId,{target,event,title,body?,link,mentionedUserIds?,participantUserIds?,eventKey},tx?)`，event=discussion/resource_comment/resource_update/task_update。提供调用方tx时事务一致；内部参与者去重后按当前团队过滤，无100名协作者加作者的隐含失败。长业务正文在生产者取通知摘要，原业务内容保留。
- `notifyAssigned/Submitted/Accepted(taskId,actorId?)`、`notifyRejected(taskId,reason,actorId?)`；兼容旧调用，传actor走关注/偏好/排本人。`notifyTaskDiscussion(actorId,taskId,postId,tx?,mentionedUserIds?)`同事务通知负责人/根作者/@成员与关注者。
- API：`/notify/follows` GET/PUT、`/notify/preferences` GET/PUT，no-store；summary追加preferences.showBubble并收集本人到期提醒。共享bot消费该开关。
- `notify/ui.FollowButton({target})`、`NotificationPreferencesPanel({compact?})`；项目、任务、资料和设置/消息中心复用。失败保留输入，动态取消不改其他成员。
- `calendar`新增`getMyScheduleReminder(actorId,scheduleId)`、`saveMyScheduleReminder(actorId,scheduleId,{scheduleVersion,reminderVersion,enabled,minutes})`、`collectMyScheduleReminders(actorId,now?)`，及scheduleReminderGET/PUT薄壳。
- `/calendar/schedules/:scheduleId/reminder` GET/PUT；提醒初次version0，双版本当前本人校验，提前量0/5/10/15/30/60/1440分钟；明确+08换算、全天09:00、24小时补发、unique收据与通知同事务。关闭提醒类别仍处理收据，仅本人，无calendar→notify运行时循环。

### board

- BoardFilters新增labelId?:string、blocked?:boolean；URL labelId合法UUID、blocked=1/0，重复/非法忽略，parse/serialize/applyFilters统一。看板、表格和任务池复用TaskLabelFilter/Pill，显示真实阻塞信息。
- `board/ui.CopyWorkspaceLink({href})`，失败提供手动复制；`SavedTaskViews({projectId,layout,groupBy,filters})`用于三个视图。保存项只存白名单条件、布局和分组，私有/项目范围与更新版本保护；失效标签条件保留，不偷换成全部任务。
- 根入口 `listMyTaskViews(actorId,projectId)`、`createMyTaskView(actorId,projectId,input)`、`updateMyTaskView(actorId,projectId,viewId,{version,name,layout,groupBy,filters})`、`deleteMyTaskView(actorId,projectId,viewId,version)`；API `/projects/:projectId/task-views` GET/POST、`/:viewId` PATCH/DELETE。团队锁后复核当前成员，view按本人过滤。
- `board/client`导出SavedTaskViewDTO/Input/Update/Layout、白名单Zod与savedTaskViewUrl/Summary；schemaVersion1，名字忽略大小写在本人/项目唯一。分享用workspaceUrl，保存项不存任意URL、task详情或授予访问权。

22张表仅在schema末尾追加，独立可重复迁移`collaboration-foundations.sql`与脚本（dev/--test）。副管理员为用户后续授权的最小额外增量：既有team_position枚举末尾增加deputy，另立`member-deputy.sql`与脚本；不改旧表或历史SQL/hash。root串行应用并保留旧数据，运行包迁移列表末尾追加。全文实时共同编辑和群聊仅方案，当前服务不声称WebSocket、外部投递或模型调用已实现。
