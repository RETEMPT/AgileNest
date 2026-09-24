# gantt · 项目时间线（路牌）

**状态**：未实现（PPT 列为「重要需求」）
**Owner**：未分配
**建议分支**：`feature/gantt-timeline`

## 要做的事
- 同一份 `tasks` 数据的第 4 视图（Board / Table / Calendar / **Timeline**）
- 任务按 `startDate`–`dueDate` 画条形；里程碑打点；逾期标红；今日竖线
- 与 `modules/board` 共享筛选（URL sync）

## 契约
- UI：`src/app/(app)/p/[projectId]/timeline/`（未建，建侧栏时一并加）
- 复用：`src/modules/tasks` 的 `listProjectTasks`、`src/modules/core/dates`
