# 模块契约（`index.ts` 公开签名）

> 各 owner 填实 stub 后**必须**更新本文件对应小节。`tests/contract/exports.test.ts` 做静态断言。

## `@/modules/core`

```ts
class AppError(message: string, status?: number)
class ForbiddenError(message?)
class NotFoundError(message?)
class ConflictError(message?)
class NotImplementedError(fn?)
function isUniqueViolation(e: unknown): boolean

function requireUser(): Promise<{ id: string; ... }>
function tryUser(): Promise<User | null>

function getProjectForUser(actorId, projectId)
function requireProjectForUser(actorId, projectId)
function getTeamMembership(userId, teamId)
function requireTeamRole(userId, teamId, allowed: TeamRole[])
function requireTaskWrite(actorId, projectId)
function requireReviewer(actorId, projectId)

function todayISO(d?): string
function isValidISODate(s): boolean
function addDaysISO(iso, days): string
function daysBetween(from, to): number
function isOverdue(due, today?): boolean
function isDueSoon(due, withinDays?, today?): boolean
function formatMinutes(mins): string
function monthGrid(year, month): { iso: string; inMonth: boolean }[]

type FormState = { error: string } | null
function toFormError(e: unknown, fallback?): string
```

## `@/modules/identity`

```ts
createTeam(userId, name)
joinTeam(userId, inviteCode)
listMyTeams(userId)
listTeamMembers(teamId)
updateMemberRole(actorId, teamId, targetUserId, role)
createProject(actorId, teamId, input)
listTeamProjects(actorId, teamId)
updateProject(actorId, projectId, patch)
listMyProjects(actorId)
getTeamMembership / getProjectForUser / requireTeamRole  // re-export
```

## `@/modules/tasks`（Owner A）

```ts
type TaskDTO
type TaskPatch
type TransitionInput

listProjectTasks(actorId, projectId, filters?): Promise<TaskDTO[]>
getTaskDetail(actorId, taskId): Promise<TaskDTO & { subtasks: TaskDTO[] }>
createTask(actorId, projectId, input): Promise<TaskDTO>
updateTask(actorId, taskId, patch): Promise<TaskDTO>
deleteTask(actorId, taskId): Promise<void>
transitionTask(actorId, taskId, action, input?): Promise<TaskDTO>
createSubtask(actorId, parentTaskId, input): Promise<TaskDTO>
listSubtasks(actorId, parentTaskId): Promise<TaskDTO[]>
setDueDate(actorId, taskId, dueDate): Promise<TaskDTO>
```

状态机：`@/modules/tasks/states` 的 `TRANSITIONS` 表（已就位）。

## `@/modules/board`（Owner B）

```ts
deriveColumns(tasks, groupBy): ColumnDef[]
applyFilters(tasks, f): TaskDTO[]
parseFilters(params: URLSearchParams): BoardFilters
serializeFilters(f): URLSearchParams
moveTask(actorId, taskId, patch): Promise<TaskDTO>
```

## `@/modules/review`（Owner C）

```ts
listMyTodo(actorId): Promise<TaskDTO[]>
listMyInProgress(actorId): Promise<TaskDTO[]>
listMyRejected(actorId): Promise<TaskDTO[]>
listUnclaimedPool(actorId, projectId): Promise<TaskDTO[]>
listPendingReview(actorId, projectId): Promise<ReviewItem[]>
listOverdueRisks(actorId, projectId): Promise<TaskDTO[]>
listTaskEvents(actorId, taskId): Promise<EventDTO[]>
```

## `@/modules/worklog`（Owner D）

```ts
addWorklog(actorId, taskId, input): Promise<WorklogDTO>
listWorklogs(actorId, taskId): Promise<WorklogDTO[]>
deleteWorklog(actorId, worklogId): Promise<void>
```

## `@/modules/stats`（Owner D）

```ts
completionRatio(actorId, taskId): Promise<Completion>
projectCompletion(actorId, projectId): Promise<Completion>
taskHours(actorId, projectId, range?): Promise<HoursRollup[]>
memberContribution(actorId, projectId): Promise<Contribution[]>
```

## `@/modules/calendar`（Owner E）

```ts
monthView(actorId, projectId, year, month): Promise<CalendarCell[]>
```

## `@/modules/milestone`（Owner E）

```ts
listMilestones(actorId, projectId): Promise<MilestoneDTO[]>
createMilestone(actorId, projectId, input): Promise<MilestoneDTO>
updateMilestone(actorId, milestoneId, patch): Promise<MilestoneDTO>
deleteMilestone(actorId, milestoneId): Promise<void>
```

## `@/modules/notify`（Owner E）

```ts
notifyAssigned(taskId): Promise<void>
notifySubmitted(taskId): Promise<void>
notifyAccepted(taskId): Promise<void>
notifyRejected(taskId, reason): Promise<void>
scanAndNotifyDue(): Promise<{ scanned: number; notified: number }>
listMyNotifications(actorId, opts?): Promise<NotificationDTO[]>
markRead(actorId, id): Promise<void>
```
