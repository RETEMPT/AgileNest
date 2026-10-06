"use client";

import { useId, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  ArrowUpRight,
  GripVertical,
  LayoutGrid,
  List,
  Plus,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFeedback } from "@/components/ui/feedback";
import { StatusPill, PriorityPill } from "@/components/ui/badge";
import {
  TASK_STATUSES,
  STATUS_DESCRIPTIONS,
  STATUS_LABELS,
  availableTransitions,
  type TaskDTO,
  type TransitionRule,
} from "@/modules/tasks/client";
import {
  CreateTaskForm,
  TaskActions,
  TaskWorkflow,
  TransitionDialog,
  type AssigneeOption,
} from "@/modules/tasks/ui";
import {
  BOARD_STATUS_ORDER,
  applyFilters,
  deriveColumns,
  getMoveTransition,
  serializeFilters,
  type BoardFilters,
  type ColumnDef,
  type GroupBy,
} from "./model";
import { moveTaskAction } from "./actions";
import type { TeamRole } from "@/db/schema";

type WorkspaceProps = {
  projectId: string;
  projectName: string;
  tasks: TaskDTO[];
  role: TeamRole;
  actorId: string;
  members: AssigneeOption[];
  milestones: { id: string; title: string }[];
  filters: BoardFilters;
  groupBy: GroupBy;
  view: "board" | "table";
};

function TaskTile({
  task,
  draggable,
  onOpen,
}: {
  task: TaskDTO;
  draggable: boolean;
  onOpen: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: task.id, disabled: !draggable });
  return (
    <article
      ref={setNodeRef}
      style={{
        transform: transform
          ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
          : undefined,
      }}
      className={`rounded-xl border border-border bg-card p-3 shadow-xs ${isDragging ? "opacity-30" : "transition hover:border-brand/35 hover:shadow-sm"}`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] text-muted-foreground">
          #{task.id.slice(0, 6)}
        </span>
        <div className="flex items-center gap-1">
          <PriorityPill priority={task.priority} />
          {draggable && (
            <button
              type="button"
              {...attributes}
              {...listeners}
              aria-label={`拖动任务：${task.title}`}
              className="touch-none rounded p-1 text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <GripVertical className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onOpen}
        className="w-full rounded text-left text-sm font-semibold leading-relaxed hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {task.title}
      </button>
      {task.description && (
        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          {task.description}
        </p>
      )}
      {task.status === "submitted" && task.completionNote && (
        <p className="mt-3 line-clamp-2 rounded-md bg-amber-50 p-2 text-xs text-amber-900">
          成果：{task.completionNote}
        </p>
      )}
      {task.status === "rejected" && task.rejectReason && (
        <p className="mt-3 line-clamp-2 rounded-md bg-red-50 p-2 text-xs text-red-800">
          修改：{task.rejectReason}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-soft text-[10px] text-brand">
            {task.assigneeName?.slice(0, 1) || "·"}
          </span>
          {task.assigneeName || "等待认领"}
        </span>
        <span>{task.dueDate || "未设截止"}</span>
      </div>
    </article>
  );
}

function BoardColumn({
  column,
  active,
  allowed,
  children,
}: {
  column: ColumnDef;
  active: boolean;
  allowed: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `column:${column.id}`,
    disabled: active && !allowed,
  });
  const status = TASK_STATUSES.find((status) => status === column.id);
  return (
    <section
      ref={setNodeRef}
      aria-label={`${column.title}，${column.tasks.length}个任务`}
      className={`min-h-64 min-w-0 rounded-xl border p-3 transition-colors ${isOver ? "border-brand bg-brand-soft" : active && allowed ? "border-brand/40 bg-brand-soft/40" : "border-border bg-muted/35"} ${active && !allowed ? "opacity-50" : ""}`}
    >
      <div className="mb-3 flex items-center justify-between">
        {status ? (
          <StatusPill status={status} />
        ) : (
          <h2 className="truncate text-sm font-semibold">{column.title}</h2>
        )}
        <span className="rounded-full bg-card px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {column.tasks.length}
        </span>
      </div>
      {status && (
        <p className="mb-3 min-h-8 text-[11px] leading-relaxed text-muted-foreground">
          {STATUS_DESCRIPTIONS[status]}
        </p>
      )}
      <div className="space-y-3">
        {children}
        {column.tasks.length === 0 && (
          <div className="rounded-lg border border-dashed border-border p-5 text-center text-xs text-muted-foreground">
            {active
              ? allowed
                ? "松开以推进任务"
                : "当前不能移到这里"
              : "暂无任务"}
          </div>
        )}
      </div>
    </section>
  );
}

export function ProjectWorkspace(props: WorkspaceProps) {
  const {
    projectId,
    projectName,
    tasks,
    role,
    actorId,
    members,
    milestones,
    filters,
    groupBy,
    view,
  } = props;
  const router = useRouter();
  const notify = useFeedback();
  const id = useId();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [openedId, setOpenedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const detailReturnFocus = useRef<HTMLElement | null>(null);
  const createReturnFocus = useRef<HTMLElement | null>(null);
  const [dialog, setDialog] = useState<{
    task: TaskDTO;
    rule: TransitionRule;
  } | null>(null);
  const [notice, setNotice] = useState<{ error: string; ok: string } | null>(
    null,
  );
  const [pending, startTransition] = useTransition();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 7 } }),
    useSensor(KeyboardSensor),
  );
  const filtered = applyFilters(tasks, filters);
  const columns = deriveColumns(filtered, groupBy);
  if (groupBy === "status")
    columns.sort(
      (a, b) =>
        BOARD_STATUS_ORDER.indexOf(a.id as TaskDTO["status"]) -
        BOARD_STATUS_ORDER.indexOf(b.id as TaskDTO["status"]),
    );
  if (groupBy === "milestone")
    for (const column of columns)
      column.title =
        milestones.find((milestone) => milestone.id === column.id)?.title ||
        "无里程碑";
  const activeTask = tasks.find((task) => task.id === activeId);
  const openedTask = tasks.find((task) => task.id === openedId);
  const query = serializeFilters(filters);
  if (groupBy !== "status") query.set("groupBy", groupBy);
  const suffix = query.size ? `?${query}` : "";
  const completed = tasks.filter((task) => task.status === "accepted").length;
  const percent = tasks.length
    ? Math.round((completed / tasks.length) * 100)
    : 0;

  function move(event: DragEndEvent) {
    setActiveId(null);
    const task = tasks.find((task) => task.id === event.active.id);
    const target = TASK_STATUSES.find(
      (status) => `column:${status}` === event.over?.id,
    );
    if (!task || !target || target === task.status) return;
    const rule = getMoveTransition(task, target, role, actorId);
    if (!rule) {
      setNotice({ error: "当前状态或权限不允许移到该列", ok: "" });
      return;
    }
    if (rule.noteRequired || rule.setsAssignee) {
      setDialog({ task, rule });
      return;
    }
    startTransition(async () => {
      const result = await moveTaskAction(task.id, { status: target });
      setNotice(result);
      if (!result.error) { notify(result.ok || "任务状态已更新"); router.refresh(); }
    });
  }

  return (
    <main className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="mb-1 text-xs text-muted-foreground">
            {projectName} / 任务协作
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {view === "board" ? "项目看板" : "任务表格"}
          </h1>
          <p className="mt-2 text-xs text-muted-foreground">
            {view === "board"
              ? "按状态查看任务，拖动卡片可调整状态。"
              : "集中查看负责人、状态与排期，点击任务查看操作。"}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          新建任务
        </Button>
      </header>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "全部任务", value: tasks.length },
          {
            label: "待验收",
            value: tasks.filter((task) => task.status === "submitted").length,
          },
          {
            label: "待修改",
            value: tasks.filter((task) => task.status === "rejected").length,
          },
          { label: "验收完成", value: `${percent}%` },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-xl border border-border bg-card p-4"
          >
            <p className="text-xs text-muted-foreground">{item.label}</p>
            <p className="mt-2 text-2xl font-semibold">{item.value}</p>
          </div>
        ))}
      </div>
      <details className="rounded-xl border border-border bg-card p-3">
        <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
          查看任务流程与权限
        </summary>
        <div className="mt-3">
          <TaskWorkflow />
        </div>
      </details>
      <div className="space-y-3 rounded-xl border border-border bg-card p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <nav
            aria-label="任务视图"
            className="flex gap-1 rounded-lg bg-muted p-1"
          >
            <Button
              asChild
              variant={view === "board" ? "outline" : "ghost"}
              size="sm"
            >
              <Link href={`/p/${projectId}/board${suffix}`}>
                <LayoutGrid className="h-3.5 w-3.5" />
                看板
              </Link>
            </Button>
            <Button
              asChild
              variant={view === "table" ? "outline" : "ghost"}
              size="sm"
            >
              <Link href={`/p/${projectId}/table${suffix}`}>
                <List className="h-3.5 w-3.5" />
                表格
              </Link>
            </Button>
          </nav>
          <span className="text-xs text-muted-foreground">
            显示 {filtered.length} / {tasks.length} 个任务
          </span>
        </div>
        <form
          key={suffix}
          action={`/p/${projectId}/${view}`}
          method="get"
          className="flex flex-wrap items-end gap-2"
        >
          <div className="min-w-36 flex-1">
            <label
              className="mb-1 block text-xs text-muted-foreground"
              htmlFor={`${id}-q`}
            >
              搜索任务
            </label>
            <Input
              id={`${id}-q`}
              name="q"
              defaultValue={filters.q || ""}
              placeholder="标题或描述"
              className="h-9"
            />
          </div>
          <div>
            <label
              htmlFor={`${id}-status`}
              className="mb-1 block text-xs text-muted-foreground"
            >
              状态
            </label>
            <select
              id={`${id}-status`}
              name="status"
              defaultValue={filters.status?.[0] || ""}
              className="h-9 rounded-md border border-input bg-background px-2 text-xs"
            >
              <option value="">全部状态</option>
              {BOARD_STATUS_ORDER.map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor={`${id}-member`}
              className="mb-1 block text-xs text-muted-foreground"
            >
              负责人
            </label>
            <select
              id={`${id}-member`}
              name="assigneeId"
              defaultValue={filters.assigneeId || ""}
              className="h-9 max-w-40 rounded-md border border-input bg-background px-2 text-xs"
            >
              <option value="">全部成员</option>
              <option value={actorId}>只看我的任务</option>
              {members
                .filter((member) => member.id !== actorId)
                .map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label
              htmlFor={`${id}-priority`}
              className="mb-1 block text-xs text-muted-foreground"
            >
              优先级
            </label>
            <select
              id={`${id}-priority`}
              name="priority"
              defaultValue={filters.priority?.[0] || ""}
              className="h-9 rounded-md border border-input bg-background px-2 text-xs"
            >
              <option value="">全部优先级</option>
              <option value="high">高</option>
              <option value="medium">中</option>
              <option value="low">低</option>
            </select>
          </div>
          {milestones.length > 0 && (
            <div>
              <label
                htmlFor={`${id}-milestone`}
                className="mb-1 block text-xs text-muted-foreground"
              >
                里程碑
              </label>
              <select
                id={`${id}-milestone`}
                name="milestoneId"
                defaultValue={filters.milestoneId || ""}
                className="h-9 max-w-40 rounded-md border border-input bg-background px-2 text-xs"
              >
                <option value="">全部节点</option>
                {milestones.map((milestone) => (
                  <option key={milestone.id} value={milestone.id}>
                    {milestone.title}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label
              htmlFor={`${id}-group`}
              className="mb-1 block text-xs text-muted-foreground"
            >
              分组
            </label>
            <select
              id={`${id}-group`}
              name="groupBy"
              defaultValue={groupBy}
              className="h-9 rounded-md border border-input bg-background px-2 text-xs"
            >
              <option value="status">按状态</option>
              <option value="assignee">按负责人</option>
              <option value="priority">按优先级</option>
              <option value="milestone">按里程碑</option>
            </select>
          </div>
          <Button type="submit" variant="outline" size="sm" className="h-9">
            <Search className="h-3 w-3" />
            筛选
          </Button>
          <Button asChild variant="ghost" size="sm" className="h-9">
            <Link href={`/p/${projectId}/${view}`}>重置</Link>
          </Button>
        </form>
      </div>
      <div aria-live="polite">
        {pending && <p className="text-sm text-brand">正在更新任务…</p>}
        {notice?.error && (
          <p
            role="alert"
            className="rounded-lg bg-red-50 p-3 text-sm text-red-800"
          >
            {notice.error}
          </p>
        )}
        {notice?.ok && <p className="text-sm text-emerald-700">{notice.ok}</p>}
      </div>
      {tasks.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
          <LayoutGrid className="mx-auto mb-3 h-8 w-8 text-brand" />
          <h2 className="text-lg font-semibold">暂无任务</h2>
          <p className="mb-5 mt-2 text-sm text-muted-foreground">
            创建任务并设置负责人、优先级和截止日期。
          </p>
          <Button onClick={() => setCreateOpen(true)}>新建任务</Button>
        </section>
      ) : (
        <>
          {filtered.length === 0 && (
            <p
              role="status"
              className="rounded-lg border border-dashed border-border p-5 text-sm text-muted-foreground"
            >
              没有匹配的任务，可以调整筛选条件或重置。
            </p>
          )}
          {view === "board" ? (
            <>
              <p className="text-xs text-muted-foreground">
                {groupBy === "status"
                  ? "拖动把手可移动到高亮的合法状态列；提交、指派和打回会先补全必要信息。也可打开任务使用操作按钮。"
                  : "当前分组用于查看分工；需要拖动状态时，请切换为按状态分组。"}
              </p>
              <DndContext
                id={id}
                sensors={sensors}
                onDragStart={({ active }) => {
                  setActiveId(String(active.id));
                  setNotice(null);
                }}
                onDragCancel={() => setActiveId(null)}
                onDragEnd={move}
              >
                <div className="overflow-x-auto pb-3">
                  <div
                    className="grid gap-3"
                    style={{
                      gridTemplateColumns: `repeat(${columns.length}, minmax(240px, 1fr))`,
                    }}
                  >
                    {columns.map((column) => (
                      <BoardColumn
                        key={column.id}
                        column={column}
                        active={Boolean(activeTask)}
                        allowed={Boolean(
                          activeTask &&
                          TASK_STATUSES.some(
                            (status) =>
                              status === column.id &&
                              getMoveTransition(
                                activeTask,
                                status,
                                role,
                                actorId,
                              ),
                          ),
                        )}
                      >
                        {column.tasks.map((task) => (
                          <TaskTile
                            key={task.id}
                            task={task}
                            draggable={
                              groupBy === "status" &&
                              !pending &&
                              availableTransitions(task, role, actorId).length >
                                0
                            }
                            onOpen={() => setOpenedId(task.id)}
                          />
                        ))}
                      </BoardColumn>
                    ))}
                  </div>
                </div>
                <DragOverlay>
                  {activeTask && (
                    <div className="max-w-64 rounded-xl border border-brand bg-card p-4 text-sm font-semibold shadow-lg">
                      {activeTask.title}
                    </div>
                  )}
                </DragOverlay>
              </DndContext>
            </>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full min-w-160 text-left text-sm">
                <thead className="border-b border-border bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    {["任务", "状态", "优先级", "负责人", "截止日期"].map(
                      (label) => (
                        <th key={label} className="p-3">
                          {label}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((task) => (
                    <tr
                      key={task.id}
                      className="border-b border-border last:border-0 hover:bg-muted/30"
                    >
                      <td className="p-3">
                        <button
                          type="button"
                          onClick={() => setOpenedId(task.id)}
                          className="text-left font-medium hover:text-brand"
                        >
                          {task.title}
                        </button>
                      </td>
                      <td className="p-3">
                        <StatusPill status={task.status} />
                      </td>
                      <td className="p-3">
                        <PriorityPill priority={task.priority} />
                      </td>
                      <td className="p-3">{task.assigneeName || "未认领"}</td>
                      <td className="p-3 text-muted-foreground">
                        {task.dueDate || "未设置"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      <Dialog.Root
        open={Boolean(openedTask)}
        onOpenChange={(open) => {
          if (!open) setOpenedId(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay fixed inset-0 z-40 bg-black/35" />
          <Dialog.Content
            onOpenAutoFocus={() => {
              detailReturnFocus.current =
                document.activeElement instanceof HTMLElement
                  ? document.activeElement
                  : null;
            }}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              detailReturnFocus.current?.focus();
            }}
            className="dialog-surface fixed inset-y-0 right-0 z-40 w-full max-w-2xl overflow-y-auto border-l border-border bg-card p-5 shadow-xl sm:p-7"
          >
            {openedTask && (
              <>
                <Dialog.Title className="pr-12 text-xl font-semibold">
                  {openedTask.title}
                </Dialog.Title>
                <Dialog.Description className="mt-2 text-sm text-muted-foreground">
                  {projectName} · 负责人：{openedTask.assigneeName || "未认领"}
                </Dialog.Description>
                <Dialog.Close asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="关闭任务详情"
                    className="absolute right-3 top-3"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </Dialog.Close>
                <div className="my-5 flex gap-2">
                  <StatusPill status={openedTask.status} />
                  <PriorityPill priority={openedTask.priority} />
                </div>
                {openedTask.description && (
                  <p className="mb-5 whitespace-pre-wrap rounded-lg bg-muted p-4 text-sm">
                    {openedTask.description}
                  </p>
                )}
                <TaskWorkflow status={openedTask.status} />
                {openedTask.completionNote && (
                  <p className="mt-4 whitespace-pre-wrap rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                    {openedTask.status === "in_progress" ||
                    openedTask.status === "unclaimed"
                      ? "上次提交说明："
                      : "完成说明："}
                    {openedTask.completionNote}
                  </p>
                )}
                {openedTask.rejectReason && (
                  <p
                    className={`mt-4 whitespace-pre-wrap rounded-lg p-3 text-sm ${openedTask.status === "rejected" ? "bg-red-50 text-red-800" : "bg-muted text-muted-foreground"}`}
                  >
                    {openedTask.status === "rejected"
                      ? "修改意见："
                      : "上次修改意见："}
                    {openedTask.rejectReason}
                  </p>
                )}
                <section className="mt-5 space-y-3">
                  <h2 className="text-sm font-semibold">任务操作</h2>
                  <TaskActions
                    key={`${openedTask.id}-${openedTask.status}-${openedTask.assigneeId}`}
                    task={openedTask}
                    role={role}
                    actorId={actorId}
                    members={members}
                  />
                </section>
                <Button asChild variant="outline" className="mt-6">
                  <Link href={`/p/${projectId}/tasks/${openedTask.id}`}>
                    子任务、工时与活动记录
                    <ArrowUpRight className="h-4 w-4" />
                  </Link>
                </Button>
              </>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root open={createOpen} onOpenChange={(value) => { if (!createBusy) setCreateOpen(value); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay fixed inset-0 z-50 bg-black/35" />
          <Dialog.Content
            onEscapeKeyDown={(event) => { if (createBusy) event.preventDefault(); }}
            onPointerDownOutside={(event) => { if (createBusy) event.preventDefault(); }}
            onOpenAutoFocus={(event) => {
              createReturnFocus.current =
                document.activeElement instanceof HTMLElement
                  ? document.activeElement
                  : null;
              event.preventDefault();
              if (event.target instanceof HTMLElement) event.target.querySelector<HTMLInputElement>('input[name="title"]')?.focus();
            }}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              createReturnFocus.current?.focus();
            }}
            className="dialog-surface fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-card p-5 shadow-xl"
          >
            <Dialog.Title className="mb-2 text-lg font-semibold">
              创建项目任务
            </Dialog.Title>
            <Dialog.Description className="mb-4 text-xs text-muted-foreground">
              任务创建后进入任务池，可由成员认领或按权限指派。
            </Dialog.Description>
            <Dialog.Close asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="关闭创建任务"
                disabled={createBusy}
                className="absolute right-3 top-3"
              >
                <X className="h-4 w-4" />
              </Button>
            </Dialog.Close>
            <CreateTaskForm
              projectId={projectId}
              onPendingChange={setCreateBusy}
              onCreated={() => {
                setCreateOpen(false);
                router.refresh();
              }}
            />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      {dialog && (
        <TransitionDialog
          task={dialog.task}
          rule={dialog.rule}
          members={members}
          onClose={() => setDialog(null)}
          onSuccess={() => {
            setNotice({ error: "", ok: "任务状态已更新" });
            router.refresh();
          }}
        />
      )}
    </main>
  );
}
