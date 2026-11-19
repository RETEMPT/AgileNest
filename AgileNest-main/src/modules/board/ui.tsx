"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
import { CircleAlert, Copy, FileText, GripVertical, LayoutGrid, List, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormFeedback, useFeedback } from "@/components/ui/feedback";
import { EmptyState } from "@/components/ui/empty-state";
import { TaskDrawer } from "@/components/cards/task-drawer";
import { StatusPill, PriorityPill } from "@/components/ui/badge";
import {
  TASK_STATUSES,
  STATUS_LABELS,
  availableTransitions,
  transitionNeedsDialog,
  taskDependencyMessage,
  type TaskDTO,
  type TransitionRule,
} from "@/modules/tasks/client";
import {
  CreateTaskForm,
  TransitionDialog,
  TaskLabelFilter,
  TaskLabelPill,
  type AssigneeOption,
} from "@/modules/tasks/ui";
import {
  BOARD_STATUS_ORDER,
  applyFilters,
  deriveColumns,
  getMoveTransition,
  parseTaskQuery,
  serializeFilters,
  taskDetailUrl,
  workspaceUrl,
  type BoardFilters,
  type ColumnDef,
  type GroupBy,
} from "./model";
import { moveTaskAction } from "./actions";
import { SavedTaskViews } from "./saved-views-ui";
import type { TeamRole } from "@/db/schema";

export { SavedTaskViews } from "./saved-views-ui";
export type { SavedTaskViewsProps } from "./saved-views-ui";

type WorkspaceProps = {
  projectId: string;
  projectName: string;
  tasks: TaskDTO[];
  selectedTask?: TaskDTO | null;
  role: TeamRole;
  actorId: string;
  members: AssigneeOption[];
  milestones: { id: string; title: string }[];
  filters: BoardFilters;
  groupBy: GroupBy;
  view: "board" | "table";
};

export function CopyWorkspaceLink({ href }: { href: string }) {
  return <CopyWorkspaceLinkInner key={href} href={href} />;
}

function CopyWorkspaceLinkInner({ href }: { href: string }) {
  const [pending, setPending] = useState(false);
  const [manualLink, setManualLink] = useState("");
  const notify = useFeedback();
  return <div className="min-w-0">
    <Button type="button" variant="ghost" size="sm" disabled={pending} loading={pending} title="复制当前已应用的筛选和视图；链接不会授予项目访问权限" onClick={async () => {
      const link = new URL(href, window.location.origin).toString();
      setPending(true);
      try {
        if (!navigator.clipboard) throw new Error("当前浏览器不支持自动复制");
        await navigator.clipboard.writeText(link); setManualLink(""); notify("视图链接已复制，打开时会保留当前筛选。项目访问权限仍需验证。");
      } catch { setManualLink(link); }
      finally { setPending(false); }
    }}><Copy aria-hidden="true" className="h-3.5 w-3.5" />复制视图链接</Button>
    {manualLink && <div className="mt-2 max-w-sm space-y-1"><p role="status" className="text-xs text-muted-foreground">无法自动复制，请选中下方链接手动复制。</p><Input aria-label="当前视图链接" readOnly value={manualLink} onFocus={(event) => event.currentTarget.select()} className="h-8 text-xs" /></div>}
  </div>;
}

function LabelFilterField({ projectId, value }: { projectId: string; value: string }) {
  const [labelId, setLabelId] = useState(value);
  return <div className="min-w-0"><p className="mb-1 text-xs text-muted-foreground">项目标签</p><input type="hidden" name="labelId" value={labelId} /><TaskLabelFilter projectId={projectId} value={labelId} onChange={setLabelId} /></div>;
}

function TaskOrganizationBadges({ task, tasks }: { task: TaskDTO; tasks: TaskDTO[] }) {
  const labels = task.labels ?? [];
  if (!labels.length && !task.blocked) return null;
  return <div className="mt-2 flex max-w-full flex-wrap items-center gap-1.5" aria-label="任务标签与先后顺序">
    {labels.slice(0, 3).map((label) => <TaskLabelPill key={label.id} label={label} />)}
    {labels.length > 3 && <span title={labels.slice(3).map((label) => label.name).join("、")} className="rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[10px] text-muted-foreground" aria-label={`另 ${labels.length - 3} 个标签，可在任务详情查看`}>+{labels.length - 3}</span>}
    {task.blocked && <span title={taskDependencyMessage(task, tasks) ?? undefined} className="inline-flex items-center gap-1 rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:text-amber-200"><CircleAlert aria-hidden="true" className="h-3 w-3 shrink-0" />等待其他任务验收</span>}
  </div>;
}

function MultiValueFilter({
  id,
  name,
  label,
  values,
  options,
}: {
  id: string;
  name: "status" | "priority";
  label: string;
  values: string[];
  options: { value: string; label: string }[];
}) {
  const [selected, setSelected] = useState(values);
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1 block text-xs text-muted-foreground">
        {label}
      </label>
      {selected.map((value, index) => (
        <input key={`${value}-${index}`} type="hidden" name={name} value={value} />
      ))}
      <select
        id={id}
        value={selected.length > 1 ? "multiple" : selected[0] || ""}
        onChange={(event) => setSelected(event.target.value ? [event.target.value] : [])}
        className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
      >
        <option value="">全部{label}</option>
        {selected.length > 1 && (
          <option value="multiple">已选 {selected.length} 项</option>
        )}
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </div>
  );
}

function TaskTile({
  task,
  tasks,
  draggable,
  showStatus,
  onOpen,
}: {
  task: TaskDTO;
  tasks: TaskDTO[];
  draggable: boolean;
  showStatus: boolean;
  onOpen: (trigger: HTMLElement) => void;
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
      <div className="flex items-start gap-2">
        <button type="button" onClick={(event) => onOpen(event.currentTarget)} aria-label={`查看任务详情：${task.title}`} title="查看任务详情" className="mt-0.5 shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><FileText aria-hidden="true" className="h-4 w-4" /></button>
        <button
          type="button"
          onClick={(event) => onOpen(event.currentTarget)}
          title={task.title}
          className="min-w-0 flex-1 rounded text-left text-sm font-semibold leading-6 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="line-clamp-2 break-words">{task.title}</span>
        </button>
        {draggable && (
          <button
            type="button"
            {...attributes}
            {...listeners}
            aria-label={`拖动任务：${task.title}`}
            className="shrink-0 touch-none rounded p-1 text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <GripVertical className="h-4 w-4" />
          </button>
        )}
      </div>
      <TaskOrganizationBadges task={task} tasks={tasks} />
      <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <PriorityPill priority={task.priority} />
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <span aria-hidden="true" className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs text-brand">
            {task.assigneeName?.slice(0, 1) || "·"}
          </span>
          <span className="truncate">{task.assigneeName || "等待认领"}</span>
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="tabular-nums">{task.dueDate ? `截止 ${task.dueDate}` : "未设截止"}</span>
        {showStatus ? (
          <StatusPill status={task.status} />
        ) : (
          <span>查看任务详情</span>
        )}
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
    selectedTask,
    role,
    actorId,
    members,
    milestones,
    filters,
    groupBy,
    view,
  } = props;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const notify = useFeedback();
  const id = useId();
  const [activeId, setActiveId] = useState<string | null>(null);
  const openedId = parseTaskQuery(new URLSearchParams(searchParams));
  const [createOpen, setCreateOpen] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const createReturnFocus = useRef<HTMLElement | null>(null);
  const workspaceRef = useRef<HTMLElement | null>(null);
  const detailReturnFocus = useRef<HTMLElement | null>(null);
  const hadDetail = useRef(false);
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
  const openedTask = tasks.find((task) => task.id === openedId) ?? (selectedTask?.id === openedId && selectedTask.projectId === projectId ? selectedTask : null);
  useEffect(() => {
    if (openedTask) hadDetail.current = true;
    else if (hadDetail.current) {
      hadDetail.current = false;
      if (detailReturnFocus.current?.isConnected) detailReturnFocus.current.focus();
      else workspaceRef.current?.focus();
    }
  }, [openedTask]);
  const query = serializeFilters(filters);
  if (groupBy !== "status") query.set("groupBy", groupBy);
  if (openedId) query.set("task", openedId);
  const suffix = query.size ? `?${query}` : "";
  const resetHref = workspaceUrl({ projectId, view, filters: {}, groupBy, taskId: openedId });
  const selectedFilters = [
    ...(filters.q ? [{ name: "q", value: filters.q, label: `搜索：${filters.q}` }] : []),
    ...(filters.status ?? []).map((status) => ({
      name: "status", value: status, label: STATUS_LABELS[status as TaskDTO["status"]],
    })),
    ...(filters.assigneeId ? [{
      name: "assigneeId", value: filters.assigneeId,
      label: filters.assigneeId === actorId
        ? "我的任务"
        : `负责人：${members.find((member) => member.id === filters.assigneeId)?.name || "所选成员"}`,
    }] : []),
    ...(filters.priority ?? []).map((priority) => ({
      name: "priority", value: priority,
      label: `优先级：${priority === "high" ? "高" : priority === "medium" ? "中" : "低"}`,
    })),
    ...(filters.milestoneId ? [{
      name: "milestoneId", value: filters.milestoneId,
      label: `里程碑：${milestones.find((milestone) => milestone.id === filters.milestoneId)?.title || "所选节点"}`,
    }] : []),
    ...(filters.labelId ? [{ name: "labelId", value: filters.labelId, label: `标签：${tasks.flatMap((task) => task.labels ?? []).find((label) => label.id === filters.labelId)?.name ?? "所选标签"}` }] : []),
    ...(filters.blocked !== undefined ? [{ name: "blocked", value: filters.blocked ? "1" : "0", label: filters.blocked ? "等待其他任务验收" : "无需等待其他任务" }] : []),
  ];
  const completed = tasks.filter((task) => task.status === "accepted").length;
  const percent = tasks.length
    ? Math.round((completed / tasks.length) * 100)
    : 0;

  function withoutFilter(name: string, value: string) {
    const next = new URLSearchParams(query);
    const retained = next.getAll(name).filter((item) => item !== value);
    next.delete(name);
    retained.forEach((item) => next.append(name, item));
    return `/p/${projectId}/${view}${next.size ? `?${next}` : ""}`;
  }

  function openTask(taskId: string, trigger: HTMLElement) {
    detailReturnFocus.current = trigger;
    const next = taskDetailUrl(pathname, new URLSearchParams(searchParams), taskId);
    if (openedId) router.replace(next, { scroll: false });
    else router.push(next, { scroll: false });
  }

  function closeTask() {
    router.replace(taskDetailUrl(pathname, new URLSearchParams(searchParams), null), { scroll: false });
  }

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
    if (transitionNeedsDialog(rule)) {
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
    <main ref={workspaceRef} tabIndex={-1} className="min-w-0 space-y-5 focus:outline-none">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="mb-1 break-words text-sm text-muted-foreground">
            <Link href={`/p/${projectId}`} className="hover:text-brand hover:underline">{projectName}</Link> / 项目任务
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            项目任务
          </h1>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          新建任务
        </Button>
      </header>
      <dl className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-border pb-4 text-sm">
        {[
          { label: "项目顶层任务", value: tasks.length },
          {
            label: "待验收",
            value: tasks.filter((task) => task.status === "submitted").length,
          },
          {
            label: "待修改",
            value: tasks.filter((task) => task.status === "rejected").length,
          },
          { label: "等待其他任务验收", value: tasks.filter((task) => task.blocked).length },
          {
            label: "顶层验收完成",
            value: tasks.length ? `${completed}/${tasks.length} · ${percent}%` : "暂无完成度",
          },
        ].map((item) => (
          <div key={item.label} className="flex items-baseline gap-2">
            <dt className="text-muted-foreground">{item.label}</dt>
            <dd className="font-semibold tabular-nums">{item.value}</dd>
          </div>
        ))}
      </dl>
      <div className="space-y-3 rounded-xl border border-border bg-card p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <Button asChild variant="ghost" size="sm">
              <Link href={workspaceUrl({ projectId, view: "tasks", filters, groupBy, taskId: openedId })}>任务池</Link>
            </Button>
            <nav aria-label="任务视图" className="flex gap-1 rounded-lg bg-muted p-1">
              <Button asChild variant={view === "board" ? "outline" : "ghost"} size="sm">
                <Link href={`/p/${projectId}/board${suffix}`} aria-current={view === "board" ? "page" : undefined}>
                  <LayoutGrid className="h-3.5 w-3.5" />
                  看板
                </Link>
              </Button>
              <Button asChild variant={view === "table" ? "outline" : "ghost"} size="sm">
                <Link href={`/p/${projectId}/table${suffix}`} aria-current={view === "table" ? "page" : undefined}>
                  <List className="h-3.5 w-3.5" />
                  表格
                </Link>
              </Button>
            </nav>
          </div>
          <div className="flex flex-wrap items-center gap-2"><SavedTaskViews projectId={projectId} layout={view} groupBy={groupBy} filters={filters} /><CopyWorkspaceLink href={workspaceUrl({ projectId, view, filters, groupBy, taskId: openedId })} /><span className="text-xs text-muted-foreground">
            {selectedFilters.length ? `匹配 ${filtered.length} / ${tasks.length}` : `共 ${tasks.length}`} 个顶层任务
          </span></div>
        </div>
        <form
          key={`${groupBy}:${serializeFilters(filters)}`}
          action={`/p/${projectId}/${view}`}
          method="get"
          className="grid grid-cols-2 items-end gap-3 sm:flex sm:flex-wrap"
        >
          {openedId && <input type="hidden" name="task" value={openedId} />}
          <div className="col-span-2 min-w-0 sm:min-w-44 sm:flex-1">
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
          <MultiValueFilter id={`${id}-status`} name="status" label="状态" values={filters.status ?? []} options={BOARD_STATUS_ORDER.map((status) => ({ value: status, label: STATUS_LABELS[status] }))} />
          <div className="min-w-0">
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
              className="h-9 w-full max-w-40 rounded-md border border-input bg-background px-2 text-xs"
            >
              <option value="">全部成员</option>
              <option value={actorId}>只看我的任务</option>
              {filters.assigneeId && filters.assigneeId !== actorId && !members.some((member) => member.id === filters.assigneeId) && <option value={filters.assigneeId}>所选成员</option>}
              {members
                .filter((member) => member.id !== actorId)
                .map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
            </select>
          </div>
          <MultiValueFilter id={`${id}-priority`} name="priority" label="优先级" values={filters.priority ?? []} options={[{ value: "high", label: "高" }, { value: "medium", label: "中" }, { value: "low", label: "低" }]} />
          <LabelFilterField projectId={projectId} value={filters.labelId ?? ""} />
          <div className="min-w-0"><label htmlFor={`${id}-blocked`} className="mb-1 block text-xs text-muted-foreground">任务先后</label><select id={`${id}-blocked`} name="blocked" defaultValue={filters.blocked === undefined ? "" : filters.blocked ? "1" : "0"} className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs"><option value="">全部任务</option><option value="1">等待其他任务验收</option><option value="0">无需等待其他任务</option></select></div>
          {(milestones.length > 0 || filters.milestoneId) && (
            <div className="min-w-0">
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
                className="h-9 w-full max-w-40 rounded-md border border-input bg-background px-2 text-xs"
              >
                <option value="">全部节点</option>
                {filters.milestoneId && !milestones.some((milestone) => milestone.id === filters.milestoneId) && <option value={filters.milestoneId}>所选节点</option>}
                {milestones.map((milestone) => (
                  <option key={milestone.id} value={milestone.id}>
                    {milestone.title}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="min-w-0">
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
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
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
            <Link href={resetHref}>清除筛选</Link>
          </Button>
        </form>
        {selectedFilters.length > 0 && <div className="flex flex-wrap gap-2" aria-label="当前筛选条件">
          {selectedFilters.map((filter, index) => <Link key={`${filter.name}-${filter.value}-${index}`} href={withoutFilter(filter.name, filter.value)} className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-muted/50 px-2 py-1 text-xs text-muted-foreground hover:border-brand/30 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`移除筛选：${filter.label}`}>
            <span className="truncate">{filter.label}</span><X aria-hidden="true" className="h-3 w-3 shrink-0" />
          </Link>)}
        </div>}
      </div>
      <div aria-live="polite">
        {pending && <p className="text-sm text-brand">正在更新任务…</p>}
        <FormFeedback message={notice?.error} />
        <FormFeedback message={notice?.ok} tone="success" />
        {searchParams.has("task") && !openedTask && (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-muted-foreground">此任务暂不可用，可能已删除或不属于当前可访问的项目。</p>
            <Button variant="outline" size="sm" onClick={closeTask}>关闭任务提示</Button>
          </div>
        )}
      </div>
      {tasks.length === 0 ? (
        <EmptyState icon={<LayoutGrid className="h-6 w-6" />} title="项目尚无任务" description="创建一个可交付任务，成员即可认领并按流程提交验收。" actionText="新建任务" onAction={() => setCreateOpen(true)} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={<Search className="h-6 w-6" />} title="没有匹配的任务" description="调整上方条件或清除筛选，查看项目中已有的任务。" actionText="清除筛选" actionHref={resetHref} />
      ) : (
        <>
          {view === "board" ? (
            <>
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
                <div className="max-w-full overflow-x-auto pb-3">
                  <div
                    className="grid gap-3"
                    style={{
                      gridTemplateColumns: `repeat(${columns.length}, minmax(272px, 1fr))`,
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
                            tasks={tasks}
                            showStatus={groupBy !== "status"}
                            draggable={
                              groupBy === "status" &&
                              !pending &&
                              availableTransitions(task, role, actorId).length >
                                0
                            }
                            onOpen={(trigger) => openTask(task.id, trigger)}
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
                <caption className="sr-only">{projectName}：{filtered.length} 个匹配的顶层任务</caption>
                <thead className="border-b border-border bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    {["任务", "状态", "优先级", "负责人", "截止日期"].map(
                      (label) => (
                        <th key={label} scope="col" className="p-3 font-medium">
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
                          onClick={(event) => openTask(task.id, event.currentTarget)}
                          className="max-w-96 rounded text-left font-medium leading-6 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <span className="inline-flex items-start gap-2"><FileText aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" /><span>{task.title}</span></span>
                        </button>
                        <TaskOrganizationBadges task={task} tasks={tasks} />
                      </td>
                      <td className="p-3">
                        <StatusPill status={task.status} />
                      </td>
                      <td className="p-3">
                        <PriorityPill priority={task.priority} />
                      </td>
                      <td className="p-3 whitespace-nowrap">{task.assigneeName || "未认领"}</td>
                      <td className="p-3 whitespace-nowrap tabular-nums text-muted-foreground">
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
      <TaskDrawer
        task={openedTask ? { ...openedTask, projectName } : null}
        role={role}
        actorId={actorId}
        members={members}
        milestoneName={milestones.find((milestone) => milestone.id === openedTask?.milestoneId)?.title}
        isOpen={Boolean(openedTask)}
        onClose={closeTask}
      />
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
                setNotice(selectedFilters.length ? { error: "", ok: "任务已创建。如果未显示，请调整当前筛选条件。" } : null);
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
