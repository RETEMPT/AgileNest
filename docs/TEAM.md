# TEAM.md — 模块 Owner 与公开契约

本文维护当前模块边界、公开入口与调用语义。业务流程见 [DESIGN.md](DESIGN.md)，实际交互验收见 [UX.md](UX.md)，未来能力见 [ROADMAP.md](ROADMAP.md)；版本历史统一见 [CHANGELOG.md](../CHANGELOG.md)。

## 1. 模块与 Owner

| 模块 / 路径 | Owner | 职责 / 主要入口 |
|---|---|---|
| core、identity、components/ui、lib | foundation | ACL/session/日期、团队成员与项目、共享 UI；/t/*、/settings |
| resources | foundation | 团队/项目文档、文件、目录、评论、引用与回收 |
| tasks、delivery | A | 五态任务、提交验收、阶段交付；/p/:id/tasks、/p/:id/delivery |
| board | B | 看板、表格、统一筛选与本人保存视图 |
| review、discussions | C（root 集成） | 工作台、验收台、活动流、任务讨论 |
| worklog（含 stats） | D | 工时、完成度、贡献；/p/:id/stats |
| calendar、milestone、notify | E | 项目排期、本人日程、里程碑、站内消息与提醒 |
| components/ai、共享偏好、Windows 发布工具 | foundation | 本地 AI 草稿、统一浮窗、主题与发布生命周期 |

模块目录使用 schema/service/actions/api/ui/index；可登记 client（浏览器安全的纯函数/类型）、ui（客户端组件）、views（服务端组合）。跨模块业务只从根 index 导入，禁止深链内部 service/actions/schema/model；client 不加载 DB/session/service。路由只调用登记入口，service 先 ACL，actions/API 只负责 session → service → 刷新。

默认仅 Owner 修改所属目录；完整链路迭代须先登记模块范围和 Owner，再通过公开契约集成。不顺手重构、接管成员分支。core 修补由 foundation 说明理由并使用 feature/core-patch/<slug>；登录文件锁定，依赖变更单独声明理由。schema 仅在 src/db/schema.ts 末尾追加，不重排旧块；迁移和 DB 检查由集成人串行执行，旧 SQL/hash、历史业务数据保留。

表归属：identity 管理账号、团队/成员/职务/学术确认、项目目录、团队资料公告和本人联系方式；tasks 管理任务、要求、不可变提交/评审、标签、依赖和行动项；resources 管理资料/版本/目录/授权/评论/双向引用/回收；discussions 管理讨论/修订/提及与附件引用；delivery 管理批次/条目/问题/历史快照；calendar 管理本人日程与提醒；milestone/worklog/notify/review 各管理对应节点、工时、消息/订阅/偏好、任务活动。

## 2. 公开契约

签名或公开入口变化必须同步本节与契约测试。以下省略公共类型中的字段细节，完整定义以模块根入口及登记的 client 为准；不得通过本文绕过服务端权限和事务检查。

### `@/modules/core`

```ts
AppError / ForbiddenError / NotFoundError / ConflictError / NotImplementedError
isUniqueViolation(e): boolean

requireUser() / tryUser()

getProjectForUser(actorId, projectId)
requireProjectForUser(actorId, projectId)
getTeamMembership(userId, teamId)
requireTeamRole(userId, teamId, allowed: TeamRole[])
requireTaskWrite(actorId, projectId)      // 按当前执行职务与项目场景
requireReviewer(actorId, projectId)       // 管理员/副管理员/指导老师

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
updateMemberPositions(actorId, teamId, targetUserId, positions: TeamPosition[], positionVersion?: string)
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

- 根入口 `getProjectDirectory(actorId,teamId):Promise<ProjectDirectoryDTO>`、`mutateProjectDirectory(actorId,teamId,ProjectSpaceMutation):Promise<void>`；HTTP薄壳 `projectDirectoryGET/POST`。
- `identity/client` 导出目录DTO/变更类型、Zod、`projectSpacePath`、`projectSpaceMoveError`；`identity/ui.ProjectDirectory({teamId,initial,kind?})`。
- POST `/api/v1/teams/:teamId/project-spaces` op=create/update/delete/place：update/delete带目录version；place带projectId/spaceId和placement version（首次0）。管理员/副管理员整理、成员读取，团队锁后复核，四层子树/循环/范围保护，空目录才能删除。
- `identity/client` 提供学术身份/职务元数据、兼容角色映射和 `capabilitiesFor(positions,projectKind)`；不加载 DB/session。`getTeamMembership` 返回 positions，`getProjectForUser` 返回 positions/capabilities，学术身份不参与授权。
- `SettingsView` 的 section 支持 profile/academic/projects/ai/appearance/connections/notifications，飞书回调 notice 优先进入连接；通知分区复用 notify 公开面板。
- 职务能力：`TEAM_POSITIONS` 增加deputy，member显示组员；`capabilitiesFor` 增加manageTeamInformation/manageProjectDirectory/manageResources，admin/deputy均可日常管理，manageMembers仅admin。`canRemoveTeamMember(actorPositions,targetPositions)`供成员入口计算移除权限。
- 根入口`requireTeamCapability(actorId,teamId,capability,tx?)`，capability为manageMembers/manageTeamInformation/manageProjectDirectory/manageResources；identity事务在团队锁后重查实际职务。`updateMemberPositions(actorId,teamId,targetUserId,positions,positionVersion?)`可选版本参数，返回positionVersion；`listTeamMembers`增加positionVersion:string|null，页面强制携带。旧服务调用保留兼容，最后主管理员不因副管理员存在而放行降级/退出。

身份补充：`listTeamMembers` 返回 `positions/profile/confirmedVersion/confirmedAt/identityConfirmed/canExecute`；`listTeamSpaces` 返回 `positions`。`updateMemberRole` 兼容旧调用，同步唯一对应职务；新 UI 使用 `updateMemberPositions`。成员变更刷新团队、项目与工作台。学术资料需另一位管理员按当前版本确认，姓名/资料改变使旧确认失效，确认不跨团队复用。细节见 [IDENTITY.md](IDENTITY.md)。`academic-ui` 由公开 `views` 组合，不是跨模块深链入口；团队资料 DTO 为 `TeamInformationDTO/TeamAnnouncementDTO`，通过 identity 根入口/client 使用。

identity 根入口 `getAccountProfile(actorId)`、`saveAccountProfile(actorId, { name, bio?, avatar? })`、`getAvatar(actorId, targetId)`、API 薄壳 `avatarGET(request, context)`。`avatar` 省略表示保留，`remove` 表示移除，上传为客户端处理的 256×256 PNG data URL；返回资料只含头像 URL，不含图片内容。头像仅本人或同团队成员可读。成员 DTO 追加 `bio/avatarUrl/avatarHash`。保存姓名使学术资料版本增加，旧确认失效。

公开 `getAccountProfile(actorId)` 返回值追加 `contacts: { phone, contactEmail, officeAddress, qq, wechat, x, github }`，字段均为字符串，未填写为空。`saveAccountProfile(actorId,input)` 追加可选 `contacts`，不传时保留原联系方式，传空串时清空；资料 action 以当前会话用户为唯一更新对象，成功返回 contacts 更新还原基线。联系方式不进入成员列表，不改变学术确认或职务权限。

`identity/client` 追加浏览器安全的 `FeishuConnection` 类型：`connected/configured/name/boundAt/bindingVersion/canDisconnect`。设置页面通过本人 service 取摘要，连接 UI 与 action 归 identity 内部，由公开 `identity/views.SettingsView` 组合；不从路由目录反向导入业务组件。配置状态只检查应用 ID、密钥及回调地址是否填写，不等同于飞书联调成功。

解绑的 `actorId` 仅来自会话，输入不接受目标用户 ID。连接版本是开放标识与绑定时间的摘要，事务中锁定账号后比较；旧页面不能清除新绑定。历史飞书创建的 `@feishu.local` 占位邮箱没有用户可用的本地密码，保守禁止解绑。其余账号可确认解绑，重复提交幂等；资料、团队职务、学术确认和任务记录保留。

个人资料 action 成功返回已保存的姓名、简介和头像 URL，客户端以此更新还原基线、清空头像上传草稿；无修改时不重复提交。飞书姓名只填入本地表单草稿，沿用本人保存、姓名变更使旧身份确认失效的规则。飞书私信投递仍由 E 的后续独立实现负责，当前仅站内消息可用，参见 [FEISHU.md](FEISHU.md)。

公开 `identity/views.TeamSettingsView({teamId})` 与 `identity/ui.TeamSectionLinks({teamId,current})` 连通 projects/members/settings/resources；另提供 TeamMemberRemovalButton、TeamSettingsWorkspace、InviteCode（支持 expiresOn?）。场景队长只管理实验室/竞赛项目与指派，验收保持管理员/副管理员/指导老师权限。

### `@/modules/tasks`（A）

```ts
type TaskDTO / TaskPatch / TransitionInput / TransitionAction / TransitionContext
type AcceptanceCriterion / DeliveryInput / ReviewInput / SubmissionDTO / TaskDeliveryDTO

listProjectTasks(actorId, projectId, filters?)
getTaskDetail(actorId, taskId)                    // 含 subtasks
createTask(actorId, projectId, input)
updateTask(actorId, taskId, patch, expectedUpdatedAt?: string)
deleteTask(actorId, taskId)
transitionTask(actorId, taskId, action, input?)   // 唯一状态入口
createSubtask(actorId, parentTaskId, input)
listSubtasks(actorId, parentTaskId)
setDueDate(actorId, taskId, dueDate)
getTaskDelivery(actorId, taskId)
saveTaskRequirements(actorId, taskId, { version, criteria })
deliverySchema / reviewSchema

availableTransitions(task: TransitionContext, role, actorId): TransitionRule[]
STATUS_DESCRIPTIONS / canDeleteTask(role)
```

状态机唯一真相是模块内部 `states.ts` 的 `TRANSITIONS`，外部通过 `@/modules/tasks` 或浏览器安全的 `@/modules/tasks/client` 使用。`TaskDTO.permissions?: TaskPermissions` 是当前操作者的权限引导快照，任务服务返回时按职务与场景计算；`availableTransitions` 同时处理状态、能力、负责人、依赖和子任务限制。纯函数旧调用未提供快照时保留三态角色兼容；服务端总是重新计算当前能力。`toDTO(row)` 签名保持不变，消费方必须保留公开任务查询返回的权限与守卫字段。`claim` 由当前用户认领，管理员保留代提交权限。`transitionTask` 在行锁事务中同时写状态与活动事件，通知路径依公开事务契约执行，成功后刷新相关视图。公开 UI：`tasks/ui` 的 `TaskWorkflow`、`TaskActions`、`TransitionDialog`、`CreateTaskForm`；`tasks/views` 的任务池与详情组合。详情页必须检查 URL 的 projectId 与任务归属一致。

- 根入口 `listProjectTaskLabels(actorId,projectId)`、`createProjectTaskLabel(actorId,projectId,{name,color?})`、`updateProjectTaskLabel(actorId,projectId,labelId,{name,color?,version})`、`deleteProjectTaskLabel(actorId,projectId,labelId,version)`。
- `getTaskOrganization(actorId,taskId,query?)` 与 `changeTaskOrganization(actorId,taskId,TaskOrganizationMutation)`：op=labels带labelIds和organization version；addDependency带otherTaskId/direction=blockedBy|blocking，removeDependency带dependencyId，均按公开Zod校验，前置与后续同项目，无环，版本和权限统一检查。组织读取使用repeatable-read。
- `createTaskActionItem(actorId,projectId,{resourceId,sourceVersion,requestKey,title,description?,dueDate?,quote?}):Promise<TaskDTO>`；POST `/api/v1/projects/:projectId/task-action-items`，先锁团队，调用resources公开源绑定，再原子创建任务/事件/来源；稳定requestKey重试仅复用本人同项目记录。
- TaskDTO可选追加labels/blockedByIds/blockingIds/blocked/reopenBlocked/actionItemOrigin。`listProjectTasks`过滤追加labelId/blocked；`availableTransitions`与服务端依赖守卫同时检查，无第六状态。被阻塞禁止提交/重交/通过；已提交或通过的后续任务保护前置重开；删除不能绕过关系。
- `tasks/client`导出组织DTO、schemas、颜色、`matchesTaskOrganization`、`wouldCreateTaskDependencyCycle`；`tasks/ui`导出`TaskOrganization({taskId,projectId,onBusyChange?})`、`TaskLabelFilter({projectId,value,onChange,disabled?})`、`TaskLabelPill`。TaskDetailSummary展示带accessible标志的来源卡片；不可见来源标题/摘录置null且隐藏链接。
- API：`/tasks/:taskId/organization` GET/PATCH；`/projects/:projectId/task-labels` GET/POST；`/:labelId` PATCH/DELETE。API薄壳均从tasks根入口导出。

- `createTask(actorId,projectId,input)` 的输入结构（服务内部名 `TaskCreateInput`，不是命名导出）追加 `acceptanceCriteria?: AcceptanceCriterion[]`、`requestKey?: string`。`AcceptanceCriterion={id:string,text:string}`；服务保留旧调用缺省兼容，GUI 发布必须有 1–30 项不重复的验收要求，并将任务、负责人、要求 v1 和创建事件原子保存。`criteria` 字段用于 `saveTaskRequirements(actorId,taskId,{version,criteria})`，不能替代创建输入的 `acceptanceCriteria`。
- `createSubtask(actorId,parentTaskId,{title,description?,dueDate?,priority?,assigneeId?,acceptanceCriteria?,requestKey?})` 复用同一创建校验、事务与权限；不能继续嵌套，也不能向 submitted/accepted 的父任务增加子任务。负责人从当前团队可执行成员按姓名选择；有指派能力可指定他人，否则仅本人或任务池。
- 创建任务和子任务使用稳定 UUID `requestKey` 防重复提交；响应丢失后以原键重试只复用本人同项目、同父任务的原任务，不覆盖内容、不增加创建事件或重复指派通知。跨账号、项目或父任务复用同键返回 409。成功后 GUI 才生成下一次请求键，失败保留输入。
- `updateTask(actorId,taskId,patch,expectedUpdatedAt?:string)` 的可选第四参兼容旧服务调用；GUI 编辑 action 必须传原 `TaskDTO.updatedAt.toISOString()`。锁定后检查版本，不匹配返回 409 并保留草稿。submitted/accepted 冻结 title、description 和验收要求，需先打回/重开才可更改；排期、优先级等仍可调整。保存验收要求至少保留一项，旧版提交/评审快照不可覆盖。
- `TaskDTO` 和 `TransitionContext` 追加 `acceptBlocked?:boolean`，表示仍有未验收通过的子任务；`getTaskDetail/listProjectTasks` 查询真实子任务，不能因列表筛选而丢失该守卫。`availableTransitions` 为 true 时不提供 accept，reject 仍按原权限可用；服务端事务再次检查。review 工作台/验收台按项目通过公开 `listProjectTasks` 补齐并保留 blocked/reopenBlocked/acceptBlocked，不复制状态机或只用裸 `toDTO` 判断可操作入口。
- 提交/重交仍须要求版本、完成说明、验证结果、链接或真实附件及逐项对应；accept/reject 指定当前 submissionId，打回保留逐项问题和总体意见。负责人变化后原负责人不能继续提交；状态仍只有 unclaimed/in_progress/submitted/rejected/accepted，发布→指派/认领→执行→提交→打回/重交→逐项通过→重开都走 `transitionTask`。
- 发布、编辑、验收要求保存和状态流转路径中新写入任务/验收要求/活动事件显式传入 Date，提交 submittedAt、评审 reviewedAt 与同次状态操作的任务时间、事件时间共用一个时刻，不依赖数据库会话本地 defaultNow。已有提交/评审版本不修改时间；历史 legacy 提交转换继续沿用其原 submittedAt。
- tasks 根导出 `ApprovedTaskSubmission={taskId:string,taskTitle:string,submission:SubmissionDTO}`、`listApprovedTaskSubmissions(actorId,projectId):Promise<ApprovedTaskSubmission[]>` 和 `getApprovedTaskSubmission(actorId,projectId,taskId,submissionId,tx?):Promise<ApprovedTaskSubmission>`；当前项目 ACL、真实 accepted 状态、提交属于任务且存在 accept 评审。写调用传入同一事务，getter 持有同源任务行锁；候选可以包含同一当前已通过任务的历史通过版本。

`tasks/client` 公开 DeliveryInput/ReviewInput/SubmissionDTO/TaskDeliveryDTO 与浏览器安全的 deliverySchema/reviewSchema，内部状态仍以 TRANSITIONS 为唯一真相。`TransitionInput` 增加 delivery?/review?；普通动作兼容，新 submit/resubmit 不能仅传 note。必须提供至少一项验收要求、要求版本、完成说明、验证结果和链接或文件。accept/reject 绑定当前 submissionId；打回需至少一项未通过、逐项问题位置/通过条件和总体修改要求。历史提交明确标记 legacy，不伪造证据。

创建与更新校验真实日期、起止顺序、标题、预计工时和当前项目里程碑；父任务只能在创建时关联，重开已通过子任务须先重开父任务。`tasks/ui.CreateTaskForm({projectId,parentTaskId?,onCreated?,onPendingChange?})` 支持主/子任务发布；编辑表单由 `tasks/views` 组合，仍使用统一任务服务。根公开 `listOpenTasksDueBetween(fromISO,toISO)` 供提醒生产者使用，不是跨账号读取 UI 的入口。

`TaskActions/TransitionDialog` 追加 `onPendingChange?`，写入和上传期间外层关闭保护同源。

公开 tasks/ui 的 TaskDetailSummary({task,subtasks?,milestoneName?,loggedMinutes?,headingLevel?}) 供完整页和抽屉只读展示；headingLevel 默认 h2。WorklogForm({taskId,projectId,defaultDate}) 的默认日期由服务端 todayISO 提供。根 API 另导出 taskDeliveryGET/taskTransitionPOST；状态元数据与 findTransition/allowedActions/transitionNeedsDialog 从根或 client 使用，TRANSITIONS 仍是唯一真相。

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

- `BoardFilters` 支持 `labelId?:string`、`blocked?:boolean`；URL labelId 为合法 UUID、blocked=1/0，重复/非法条件忽略，parse/serialize/applyFilters 统一。看板、表格和任务池复用 TaskLabelFilter/Pill，显示真实阻塞信息。
- `board/ui.CopyWorkspaceLink({href})`，失败提供手动复制；`SavedTaskViews({projectId,layout,groupBy,filters})`用于三个视图。保存项只存白名单条件、布局和分组，私有/项目范围与更新版本保护；失效标签条件保留，不偷换成全部任务。
- 根入口 `listMyTaskViews(actorId,projectId)`、`createMyTaskView(actorId,projectId,input)`、`updateMyTaskView(actorId,projectId,viewId,{version,name,layout,groupBy,filters})`、`deleteMyTaskView(actorId,projectId,viewId,version)`；API `/projects/:projectId/task-views` GET/POST、`/:viewId` PATCH/DELETE。团队锁后复核当前成员，view按本人过滤。
- `board/client`导出SavedTaskViewDTO/Input/Update/Layout、白名单Zod与savedTaskViewUrl/Summary；schemaVersion1，名字忽略大小写在本人/项目唯一。分享用workspaceUrl，保存项不存任意URL、task详情或授予访问权。

`board/client` 提供 `parseTaskQuery(params)`、`taskDetailUrl(pathname,params,taskId|null)`、`workspaceUrl({projectId,view,filters,groupBy?,taskId?})`；`ProjectWorkspace` 支持 selectedTask?。看板/表格的 task URL 经项目权限检查，打开 push、切换 replace、关闭只清 task；任务池使用共用 q/status/priority/assigneeId/milestoneId/labelId/blocked 筛选，详情仍是独立页。搜索提交保留既有多值条件，项目日历通过公开筛选入口下钻。

### `@/modules/review`（C）

```ts
listMyTodo(actorId) / listMyInProgress(actorId) / listMyRejected(actorId)
listUnclaimedPool(actorId, projectId)
listPendingReview(actorId, projectId)
listOverdueRisks(actorId, projectId)
listTaskEvents(actorId, taskId)
getWorkbench(actorId) // { mine, review, pool }，附项目名与当前操作者权限
```

`listTaskEvents` 的指派说明返回团队成员姓名；已离队目标显示“原团队成员”。只转换 action=assign 的纯 UUID 说明，数据库原事件与其他成果/评审文字保留；详情和共享抽屉复用该查询，不自行映射内部编号。

review 的 `getWorkbench` 用成员关联查询进行访问隔离，按项目能力分类，归档项目不进入当前队列。公开 `review/views` 提供 `WorkbenchView`，兼容原 student/teacher 路由；纯队员在教师入口看到空验收视图，不报错。DTO 直接带权限快照，避免每张卡再请求权限。

公开 `review/client` 为浏览器安全的纯函数入口，导出 `WorkbenchQuery`、`WorkbenchSearchParams`、`parseWorkbenchQuery(params)`、`workbenchUrl(query, changes?)`、`selectWorkbenchItems(items, query, today)` 与 `paginateWorkbenchItems(items, requestedPage)`，仅使用 Zod 和纯日期函数，不引入 DB/session/service。工作台 `view/q/projectId/due/status/sort/page` 保存在 URL；分类切换保留关键词、项目、日期和排序，清除旧分类的状态条件并回第一页，其他条件修改也回第一页，翻页保留条件。

`due` 支持 all/overdue/today/soon/undated；`soon` 为今天至第六天，逾期不含今天。`status` 支持 all/unclaimed/in_progress/rejected/submitted，始终在原权限队列内筛选，不从其他分类补任务。默认 `sort=smart` 按逾期、优先级、截止日期、sortOrder、createdAt、id 排序；due 优先截止日期（未设日期置后），updated 优先 updatedAt 倒序，再采用默认稳定顺序。分页每页 12 项，解析页码须为安全正整数，超出总页数时显示末页，空结果范围为 0–0。筛选、排序、分页不修改输入或扩大 `getWorkbench` 的权限范围；分页只限制页面渲染，查询仍使用现有完整权限队列。

工作台待办速览从现有 mine/review 队列计算今天到期、逾期、需修改与待我验收数量，采用与列表相同的筛选函数。摘要明确覆盖全部活跃项目，不受当前列表筛选影响；快捷入口打开对应条件并重置旧列表条件。搜索常驻，高级筛选可展开，已选条件可单独移除。

公开 review/ui 提供 `SubmissionTimeline({taskId,updatedAt?,compact?})`、`ReviewSubmissionEvidence`；`review/client` 提供 `parseTaskDeliveryPayload(input,taskId)` 和 `sortSubmissionVersions`，读取返回的真实版本并隔离旧请求。

公开 review/views.ReviewView({params:Promise<{projectId:string}>})、review/ui.ReviewTaskDetails({task,role,actorId})；ReviewView 与 WorkbenchView 均为薄路由使用的服务端组合。

### `@/modules/worklog`（D，含 stats）

```ts
addWorklog(actorId, taskId, input) / listWorklogs(actorId, taskId) / deleteWorklog(actorId, worklogId)
completionRatio(actorId, taskId) / projectCompletion(actorId, projectId)
taskHours(actorId, projectId, range?)
memberContribution(actorId, projectId)
```

`projectCompletion` 的 `{ done, total, ratio }` 为已验收顶层任务数/顶层总数，单次聚合查询；`completionRatio` 在有子任务时为已验收子任务数/直接子任务总数，两者在 UI 明确标识。工时仅执行职务且当前负责人可记；`tasks/ui.WorklogForm` 接收 `{ taskId, projectId, defaultDate }`，默认日期由服务端的 `todayISO` 提供。公开 `worklog/views` 提供 `StatsView`。

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

服务只通过当前 actorId 管理本人日程，职务与身份不扩展权限；更新/删除以版本条件写入，404 不泄露他人记录，409 防旧页面覆盖。项目日历保留项目 ACL、跨天任务和里程碑；`calendarBoard` 用同一批任务/节点生成月格和所选窗口，支持历史月份和一致筛选，长跨度只展开可见窗口。年份 1900–2100，窗口天数 1–366。日期范围与 HTTP 输入见 [SCHEDULES.md](SCHEDULES.md)，来源取舍见 [PR-RESEARCH.md](PR-RESEARCH.md)。

- calendar 根入口 `getMyScheduleReminder(actorId,scheduleId)`、`saveMyScheduleReminder(actorId,scheduleId,{scheduleVersion,reminderVersion,enabled,minutes})`、`collectMyScheduleReminders(actorId,now?)`，及 scheduleReminderGET/PUT 薄壳。
- `/calendar/schedules/:scheduleId/reminder` GET/PUT；提醒初次version0，双版本当前本人校验，提前量0/5/10/15/30/60/1440分钟；明确+08换算、全天09:00、24小时补发、unique收据与通知同事务。关闭提醒类别仍处理收据，仅本人，无calendar→notify运行时循环。

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

- 根入口 `getFollowState(actorId,target)`、`updateFollowState(actorId,{target,following,version})`、`listMyFollows(actorId)`。target={kind:project/task/resource,id}，首次version0，取消保留版本墓碑；每次当前团队ACL，事项取消覆盖项目继承。
- `getNotificationPreferences(actorId)`、`updateNotificationPreferences(actorId,input)`：version初次0，taskUpdates/discussions/mentions/resourceUpdates/reminders/showBubble。本人持久化，409不覆盖；关闭类别记录已处理事件，不在事后重放。
- `enqueueCollaborationNotice(actorId,{target,event,title,body?,link,mentionedUserIds?,participantUserIds?,eventKey},tx?)`，event=discussion/resource_comment/resource_update/task_update。提供调用方tx时事务一致；内部参与者去重后按当前团队过滤，无100名协作者加作者的隐含失败。长业务正文在生产者取通知摘要，原业务内容保留。
- `notifyAssigned/Submitted/Accepted(taskId,actorId?)`、`notifyRejected(taskId,reason,actorId?)`；兼容旧调用，传actor走关注/偏好/排本人。`notifyTaskDiscussion(actorId,taskId,postId,tx?,mentionedUserIds?)`同事务通知负责人/根作者/@成员与关注者。
- API：`/notify/follows` GET/PUT、`/notify/preferences` GET/PUT，no-store；summary追加preferences.showBubble并收集本人到期提醒。共享bot消费该开关。
- `notify/ui.FollowButton({target})`、`NotificationPreferencesPanel({compact?})`；项目、任务、资料和设置/消息中心复用。失败保留输入，动态取消不改其他成员。

通知摘要 API 为 `GET /api/v1/notify?summary=1`，最近 20 条与全部本人未读数一起返回，响应 private/no-store；原 GET 列表继续兼容。`POST ?all=1` 标记本人全部消息，`POST ?id=UUID` 保留单条语义；本人范围由会话确定，不接受 userId。客户端每 60 秒在可见页面更新，focus/visibility 与 `agilenest:notifications-changed` 触发刷新；错误保留上次消息，卸载终止请求。`CollaborationDock({userId,projects,aiEnabled?})` 按账号重新挂载，保留 `openAiFloating()` 事件和 AI 草稿保存保护；没有 Web Push、模型或飞书私信契约。

notify 公开 `notify/views` 的 `NotificationsView` 和 `notify/ui` 的 `MarkReadButton`，收件箱按 actorId 隔离，展示最近 100 条，可筛选未读并进入对应任务。标记他人消息返回 NotFoundError，不暴露消息存在性。

系统指派/验收通知使用客观状态说明。旧版这两类通知的固定文案在 DTO 展示时兼容转换，历史数据和成员填写的成果说明、修改意见不变。

根契约另有 getMyNotificationFeed(actorId):Promise<{notifications:NotificationDTO[],unreadCount:number}>、markAllRead(actorId):Promise<number>、notificationsGET/POST、notificationPreferencesGET/PUT、notificationFollowsGET/PUT；导出 FollowedItem/CollaborationNoticeInput/FollowState/FollowTarget/NotificationPreferences 类型。notify/client 提供 NotificationItem/NotificationFeed、parseNotificationFeed/notificationTarget/notificationLabel，校验消息响应和内部目标链接；notify/ui 提供 useNotificationFeed() 与 NotificationDockPanel({state,onNavigate})。

### `@/modules/resources`（foundation）

```ts
listResources(actorId, opts: { projectId?, teamId? })
getResource(actorId, resourceId)
createResource(actorId, input: { projectId?, teamId?, kind: "document" | "link", title, body?, url?, tags?, category? })
uploadResource(actorId, scope: { projectId?, teamId? }, file: { name: string, bytes: Uint8Array }, title?, placement?: {folderId?, category?})
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

公开 `resources/client` 导出 DTO、类别/容量、真实文本整理及安全 URL/Marker 产物解析纯函数；`resources/ui` 导出 `ResourcesWorkspace({initialResources,actorId,teamId,projectId?,scopeName})`、`ResourcePicker({projectId,selectedIds,onChange,disabled?,onUploadingChange?,label?})` 和 `ResourceMarkdown({text,idPrefix?})`。公开 `resources/views` 提供 `TeamResourcesView/ProjectResourcesView({params})`，路由只做壳。

- 原有ResourceDTO追加folderId/folderName/placementVersion/pinned、canEdit/canComment；getResource/listResources仍按团队/项目当前读取范围计算。作者/admin/deputy管理，协作者edit可改文档/link正文，不能管理授权/删除或改原文件。
- 根入口`listResourceFolders(actorId,scope)`、`createResourceFolder(actorId,input)`、`updateResourceFolder(actorId,input)`、`placeResource(actorId,input)`。folder输入teamId/projectId、name/parentId；update带folderId/version，placement带resourceId/version/folderId/pinned。八层限制计算完整子树，同名/循环/范围和版本冲突明确返回。
- `getResourceCollaboration(actorId,resourceId)`、`setResourceCollaboration(actorId,{resourceId,version,commentScope,collaborators})`；commentScope=team/collaborators，授权comment/edit只向当前成员授予；读取仍同团队。
- `linkResource(actorId,{sourceResourceId,targetResourceId?|targetTaskId?})`、`unlinkResource(actorId,linkId)`、`listResourceLinks(actorId,resourceId)`、`listTaskResourceLinks(actorId,taskId)`、`getResourceWorkspace(actorId,scope)`。资料双方读写与任务项目归属校验；双向展示不重复存边。
- `listResourceComments(actorId,resourceId)`、`createResourceComment(actorId,{resourceId,body,resourceVersion,parentId?,selectedQuote?,line?,mentionedUserIds?})`、`updateResourceComment(actorId,{commentId,version,action,body?,mentionedUserIds?})`、`listResourceCommentHistory(actorId,commentId)`；action=edit/withdraw/resolve/reopen。正文引文必须真实，版本/行号核对；作者编辑、作者或管理者撤回、管理者处理顶层评论。结构处理复制提及快照，通知/评论/版本同事务。
- `bindTaskActionItemSource(actorId,projectId,{resourceId,sourceVersion,quote?},tx)`返回{id,title,version}；仅可读真实文档、同项目或团队共享，摘录校验；来源引用保护删除。`accessibleResourceIds(actorId,ids,tx?)`批量过滤当前可见ID，供任务DTO掩码。
- `/api/v1/resources/workspace` GET读取scope/资料知识区、POST op+data调用上述服务。公开`resourceWorkspaceGET/POST`根入口；Zod在resources内部，不让消费方深链schema/service。
- `resources/ui.ResourceTaskLinks({taskId,projectId,onBusyChange?})`用于完整详情/抽屉。`ResourcesWorkspace`必选actorId（服务端会话传入），评论草稿按本人/资料保存；URL revision显示真实源版本，历史模式不创建当前引文/行动项。

- `createResource(actorId,input)` 追加可空 `folderId`；`uploadResource(actorId,scope,file,title?,placement?)` 的可选第五参为 `{folderId?,category?}`，兼容原四参调用。新建/上传在同事务校验空间、分类与目录并归位。
- `ResourceFolderDTO` 追加 `category?`、`legacy?`；`folder.create` 分类缺省继承父目录或 general。新目录按分类组织并禁止跨分类/空间移动；缺少分类元数据的旧目录用兼容视图保留原混合分类资料与位置，禁止静默丢失内容。
- 当前团队成员可建立本人主题/子文件夹，创建者或管理员/副管理员可管理目录。`deleteResourceFolder(actorId,{folderId,version})` 仅删除空目录，含回收资料的位置引用也阻止删除。
- `deleteResource(actorId,id,version)` 与资源 DELETE 语义为可恢复回收，原文件、正文版本与引用保留；绑定成果、讨论或行动项的证据拒绝回收。普通列表、正文/历史/文件流与关注入口排除回收资料。
- `listResourceTrash(actorId,{teamId?,projectId?}): ResourceTrashDTO[]` 与 `restoreResource(actorId,{resourceId,version}): ResourceDTO` 根导出；作者或管理员/副管理员可恢复，版本再次递增，旧恢复请求 409。无永久删除/30天自动清理。
- workspace GET `?trash=true&projectId/teamId`；POST 增加 `folder.delete`、`resource.restore`。公开 `resources/ui` 继续为唯一跨模块 UI 入口。

资料 URL 为 `q/category/kind/scope/resource`（具体值以 `ResourceQuery` 为准），关闭资料详情保留筛选；复制链接仍需当前成员鉴权。`ResourcePicker.label?` 默认“成果附件”，讨论使用“任务附件”，其余签名兼容。

根入口 bindDiscussionResources(actorId,projectId,resourceIds,postId,tx):Promise<DiscussionResourceDTO[]> 锁定并保留当前可读共享文件引用。resources/client 另导出 ResourceQuery/parseResourceQuery、resourceWorkspaceUrl、selectResources、resourceUploadError；复制链接和历史文件读取仍须当前成员鉴权。

### `@/modules/discussions`（C）

```ts
// 根入口：当前项目成员读取；写入事务重新验证
listTaskDiscussions(actorId, taskId, {before?, around?}?): Promise<DiscussionListDTO>
createTaskDiscussion(actorId, taskId, { body?, resourceIds?, parentId?, mentionedUserIds? }): Promise<DiscussionPostDTO>
updateTaskDiscussion(actorId, taskId, postId, { version, body, mentionedUserIds? }): Promise<DiscussionPostDTO>
withdrawTaskDiscussion(actorId, taskId, postId, version): Promise<DiscussionPostDTO>
setDiscussionResolved(actorId, taskId, postId, { version, resolved }): Promise<DiscussionPostDTO>
listDiscussionRevisions(actorId, taskId, postId): Promise<DiscussionRevisionDTO[]>
taskDiscussionsGET / taskDiscussionsPOST / taskDiscussionGET / taskDiscussionPATCH

// discussions/client：浏览器安全 DTO、输入与响应 Zod schema；不含 DB/session
DiscussionListDTO // {posts, truncated, limit, nextCursor?}，分页包含回复所属根主题
DiscussionPostDTO // 内容、版本、父主题、附件快照、撤回/解决、本人操作能力
discussionListSchema / discussionPostSchema / discussionHistorySchema / discussionRevisionSchema
discussionCreateSchema / discussionEditSchema / discussionResolveSchema

// discussions/ui：完整页与共享任务抽屉共用
TaskDiscussions({ taskId, projectId, actorId, onBusyChange?, onDirtyChange? })
```

- `listDiscussionMembers(actorId,taskId)`只返回当前团队姓名/ID供明确选择。
- `createTaskDiscussion`增加mentionedUserIds默认[]；`updateTaskDiscussion`可传mentionedUserIds，缺省延续旧快照而不重新提醒离队成员；编辑显式新提及仍要求当前成员。resolve/withdraw复制该版快照，DTO/history可选mentions={userId,name}[]。
- `listTaskDiscussions(actorId,taskId,{before?,around?}={})`返回nextCursor可空。createdAt+id稳定分页，补齐回复根主题；before必须当前任务，around用于旧通知定位。裁剪游标保留边界，避免遗漏旧回复。GET列表?members读取名单，?before/?around浏览历史。
- 原TaskDiscussions共享UI增加姓名提及、任务关注、加载较早记录；草稿与409输入保留，文件引用和五态不变。

API：`/api/v1/tasks/:taskId/discussions` GET/POST、`/:postId?history` GET、`/:postId` PATCH `op=edit|withdraw|resolve`。新讨论/回复按当前关注与偏好通知负责人、被回复作者和明确提及的成员，排除本人/离队成员，通知与新内容同事务提交。撤回保留历史与文件引用，不改任务状态。独立迁移 `discussions.sql`、`migrate-discussions.mjs` 分别用于开发/测试库，旧业务迁移不改哈希。

### `@/modules/delivery`（A）

- 根契约：`getProjectDeliveries(actorId,projectId):Promise<DeliveryProjectDTO>`、`getDeliveryBatch(actorId,batchId):Promise<DeliveryBatchDTO>`、`createDeliveryBatch(actorId,projectId,input:DeliveryBatchInput,requestKey?:string):Promise<string>`、`mutateDeliveryBatch(actorId,batchId,input:DeliveryMutation):Promise<DeliveryBatchDTO>`、`exportDeliveryRecord(actorId,batchId,version,format:"markdown"|"json"):Promise<{fileName:string,body:string}>`。根导出 DeliveryBatchDTO/DeliveryProjectDTO/DeliveryBatchInput/DeliveryMutation/DeliveryCheck/DeliverySnapshot/DeliveryRecordDTO；浏览器安全 `client` 另提供校验和展示纯函数。`delivery/ui`、`delivery/views.DeliveryProjectView({params,searchParams})` 登记为公共 UI/页面组合入口。
- 交付创建 POST 体追加可选 UUID requestKey，GUI 必传稳定键；同账号、同项目重试返回原批次 ID，不覆盖第一次成功内容或增加记录，其他账号/项目复用返回 409。取得创建成功 ID 后先清理新建输入并选中批次，再刷新列表；刷新失败明确显示已建立，不能提示用户重复建立。
- 项目管理或验收职务可整理批次，管理员/副管理员/指导老师确认或重开；普通组员可处理分配给自己的评审问题。按团队→批次→任务锁后重验当前职务与归属。日期真实有效，责任人按姓名选当前团队成员。
- `DeliveryCheck={id:string,text:string,checked:boolean,note:string}`，checked/note 都必填；mutation 含 edit/bind/unbind/issue/resolve/reopenIssue/complete/reopen/archive/restore，并携带批次版本，问题处理还携带问题版本。确认要求责任人、逐项清单、至少一个真实通过版本及全部问题处理完成；再次核对当前真实 task/submission。已确认记录只允许明确重开、归档和恢复，不覆盖旧快照；重开取消当前清单勾选、保留旧记录。
- deliveryEntries 固定绑定任务/通过 submissionId，证据沿用真实提交文件引用，无任意 resourceId 快照；独立历史 snapshot 与 deliveryRecords 每批次/版本唯一。后来任务重开时显示当前状态差异；任务/子任务删除保护当前和历史交付引用。批次读取带最近 40 条记录，指定历史记录版本仍可 Markdown/JSON 导出；导出重新检查当前项目读取权，使用当时快照而不是当前批次覆盖历史。
- 所有业务确认使用复用 Radix 弹窗；默认聚焦取消，Esc 取消后返回原触发按钮，提交期间禁止关闭和重复操作。确认捕获打开时批次版本，旧版本明确提示重新核对。新写入批次、条目、问题和历史记录都显式使用 UTC Date；同次操作的 completedAt/updatedAt/record.createdAt 一致，不混用数据库会话本地 defaultNow。
- 页面 `/p/:projectId/delivery`；API `/projects/:projectId/delivery` GET/POST、`/delivery/:batchId` GET/PATCH、`/delivery/:batchId/export?version=&format=markdown|json` GET（均位于 `/api/v1`）。根薄壳导出 projectDeliveriesGET/POST、deliveryBatchGET/PATCH、deliveryExportGET，另有 GET/POST/BATCH_GET/BATCH_PATCH/EXPORT_GET 别名；路由只调用登记入口。

## 3. 共享 UI 与协作中心

AppSidebar 的项目上下文按账号存于浏览器 `agilenest:sidebar-project:v1:<userId>`，由共享 `sidebar-project` store 维护。项目地址优先决定选择并记住该项目；全局工作台、团队、日历、AI、消息和个人中心沿用最近选择，操作刷新不清空。首次没有记录时不默认选择首个项目，桌面/手机使用同一上下文；导航高亮仍对应当前地址。只有当前会话公开 `listMyProjects` 返回的可访问项目可显示，失效记录清除，不以浏览器 ID 授权。账号更换时重建侧栏，存储禁用/写入失败时保留本次访问中的选择，无法承诺刷新恢复。共享布局/props、登录与业务接口不改变。

同账号其他标签更新或清除本地记录时，全局页同步最近选择；项目页仍按自身地址展示，不能因外部同步反复回写。进入不同项目或在菜单明确选择时保存，重复选择当前项目也有效；修饰键/中键新开标签时由目标页面记录项目。存储读取只有原始值发生变化才更新内存，防止失败写入被旧值撤销。损坏记录按空选择处理，清理不因快照已空而跳过实际删除。侧栏收起/展开保留同一按钮的键盘焦点；手机抽屉在路径变化或进入桌面宽度时关闭，在手机宽度下关闭后焦点回到菜单按钮。

折叠偏好沿用浏览器键 `agilenest_sidebar_collapsed`，由共享 `sidebar-preference` store 维护；写入失败保留本次操作，跨标签更新/清除可同步，清除恢复默认展开。Ctrl+B/Cmd+B 仅在桌面非编辑区域响应，忽略组合输入、重复按键、其他修饰键和已处理事件。已有可访问项目但未选择时可直接打开项目菜单，无项目时保留创建/加入团队入口；菜单当前项目使用勾选与可访问名称标识，不冒充全局页面的当前位置。项目菜单在路径变化或跨越桌面/手机断点时关闭，返回原路径不重开；原入口已隐藏时，焦点返回当前可见的手机导航按钮或桌面项目选择按钮。

公开 identity/ui.ProjectContextHeader({projectId,name,positions}) 提供项目上下文；共享 TaskDrawer 保留 task/role/actorId/isOpen/onClose，支持 members?:AssigneeOption[]、milestoneName?:string|null。工时/子任务未加载时不伪造零值；任务活动请求按账号、任务、更新时间和重试标识隔离。

共享 Button 支持 loading；FeedbackProvider/useFeedback/FormFeedback 提供等待、成功、失败反馈。TaskActions/TransitionDialog/CreateTaskForm 的 onPendingChange? 让外层共享写入/上传状态，提交期间禁止关闭；失败或取消保留输入与原任务列。键盘、角色与窄屏标准见 [UX.md](UX.md)。

- `components/ai/floating.openCollaborationDock(panel?: "notifications"|"ai")`；原 `openAiFloating()`/旧事件兼容。右下角只一个图标，真实未读、消息类别/仅未读和本地草稿标签共用。通知偏好 `showBubble` 控制整个浮动入口，消息仍可从完整消息页读取。
- 草稿存储键与按账号隔离保持，切换/关闭先保存，导入等待或失败保留输入；模型不接入。站内消息只读预览不自动标已读。
- `components/ai/workspace.AiWorkspace({userId,projects,compact?,saveGuardRef?,busyRef?})`：projects 为 `{id,name,teamName}[]` 摘要；`saveGuardRef?:React.RefObject<(()=>boolean)|null>` 由工作区提供保存守卫；`busyRef?:React.RefObject<boolean>` 在资料读取/保存期间为 true，结束（含失败）归 false。浮窗据此阻止导入中关闭、切换或放弃；重复导入由同步锁拒绝，失败保留原输入。
- `components/ai/materials-ui.MaterialsDialog` 公开组件 props 为 `mode/onClose/items/userId/importError/importing/onImport/onAttachText/onPick`，追加可选 `onReturnFocus?:()=>void`；onImport 接收 File[] 返回 Promise<boolean>，onAttachText 返回错误串或 null。传入 onReturnFocus 时覆盖关闭自动聚焦，资料面板关闭后回到草稿输入框；其本地文件仍按账号存储，不等同于项目资料库。

公开 components/ai/view.AiWorkspaceView 为服务端组合，通过 core.requireUser 取得本人，不允许 URL 指定账号。drafts/draft-store 仅管理按账号命名的浏览器草稿，既有 v1 数据兼容 projectId/messages/materials；本地存储不是服务端 ACL。每份最多 20 条本地记录、10 份资料、合计 50 MB，单文件 10 MB。IndexedDB 正文/Blob 使用 [userId,id]；取消/失败、损坏或拒绝存储均反馈并保护输入，不自动读取项目任务或文件系统。图片/PDF 仅预览，不宣称 OCR、AI 总结或模型调用。

编辑器仅在自身未编辑时接纳 store 新正文，防止多标签覆盖。MaterialsDialog 关闭返回草稿输入，删除草稿清理未引用文件。偏好键 agilenest:preferences:v1:<userId> 按账号隔离并校验，reset() 清除本人偏好；只存模型密钥的环境变量名，不执行模型或插件，不跨设备同步。SettingsWorkspace 软导航/后退同步分区，联系方式缺省保留，个人资料成功返回新还原基线。细节见 [AI.md](AI.md)、[IDENTITY.md](IDENTITY.md)。

## 4. 契约变更与检查

- 只修改登记 Owner 的模块，跨模块通过公开入口，登录、core 和依赖遵守 [AGENTS.md](../AGENTS.md)。
- 每模块至少 6 条契约测试，覆盖正常路径、越权、非法状态转移；新行为同时检查并发、版本冲突与真实引用。
- 提交前 npm test 与 Windows npm run build 全绿；UI 按 [UX.md](UX.md) 检查姓名指派、空状态、失败/取消、键盘、窄屏和 URL 保留。
- 版本、迁移、PR 与 Release 的唯一流程见 [WORKFLOW.md](WORKFLOW.md#8-迭代版本与发布)，不在模块文档重复记录发布历史。
