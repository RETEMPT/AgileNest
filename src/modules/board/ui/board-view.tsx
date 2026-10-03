"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { PriorityPill, StatusPill } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ACTION_LABELS, allowedActions, findTransition } from "@/modules/tasks/states";
import type { TaskPriority, TeamRole } from "@/db/schema";
import type { TaskDTO, TransitionAction } from "@/modules/tasks";
import { moveTaskAction, transitionTaskAction } from "../actions";
import type { ColumnDef, GroupBy, MoveTaskPatch } from "../types";

/** 相邻两卡的 sortOrder 中值；两端用 ±1 拉开。 */
function computeSortOrder(list: TaskDTO[], insertIndex: number): number {
  const prev = insertIndex > 0 ? list[insertIndex - 1].sortOrder : null;
  const next = insertIndex < list.length ? list[insertIndex].sortOrder : null;
  if (prev !== null && next !== null) return (prev + next) / 2;
  if (next !== null) return next - 1;
  if (prev !== null) return prev + 1;
  return 0;
}

type ActionHandler = (task: TaskDTO, action: TransitionAction) => void;

function TaskCard({
  task,
  role,
  canDrag,
  onAction,
}: {
  task: TaskDTO;
  role: TeamRole;
  canDrag: boolean;
  onAction: ActionHandler;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
    disabled: !canDrag,
  });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: task.id });
  const actions = allowedActions(task.status, role) as TransitionAction[];

  return (
    <div
      ref={(node) => {
        setNodeRef(node);
        setDropRef(node);
      }}
      className={cn(
        "rounded-lg border border-border bg-card p-3 shadow-sm",
        isDragging && "opacity-40",
        isOver && "ring-2 ring-brand",
      )}
    >
      <div className="flex items-start gap-2">
        {canDrag && (
          <span
            {...attributes}
            {...listeners}
            className="mt-0.5 cursor-grab select-none text-muted-foreground hover:text-foreground"
          >
            ⠿
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium leading-snug">{task.title}</p>
            <PriorityPill priority={task.priority} />
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <StatusPill status={task.status} />
            {task.assigneeName && (
              <span className="text-xs text-muted-foreground">{task.assigneeName}</span>
            )}
            {task.dueDate && (
              <span className="text-xs text-muted-foreground">截止 {task.dueDate}</span>
            )}
          </div>
          {actions.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {actions.map((a) => (
                <Button key={a} size="sm" variant="outline" onClick={() => onAction(task, a)}>
                  {ACTION_LABELS[a]}
                </Button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Column({
  col,
  role,
  canDrag,
  onAction,
}: {
  col: ColumnDef;
  role: TeamRole;
  canDrag: boolean;
  onAction: ActionHandler;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${col.id}` });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-64 shrink-0 flex-col gap-2 rounded-xl border border-border bg-muted/40 p-2",
        isOver && "border-brand bg-brand-soft/40",
      )}
    >
      <div className="flex items-center justify-between px-1 py-1">
        <span className="text-sm font-semibold">{col.title}</span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {col.tasks.length}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {col.tasks.map((t) => (
          <TaskCard key={t.id} task={t} role={role} canDrag={canDrag} onAction={onAction} />
        ))}
      </div>
    </div>
  );
}

function DragPreview({ task }: { task: TaskDTO }) {
  return (
    <div className="w-60 rounded-lg border border-brand bg-card p-3 shadow-lg">
      <p className="text-sm font-medium">{task.title}</p>
    </div>
  );
}

export function BoardView({
  projectId,
  columns,
  role,
  groupBy,
  members,
}: {
  projectId: string;
  columns: ColumnDef[];
  role: TeamRole;
  groupBy: GroupBy;
  members: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [activeTask, setActiveTask] = useState<TaskDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [assign, setAssign] = useState<{ task: TaskDTO; assigneeId: string } | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  // teacher 只读：不参与排序/字段拖拽（requireTaskWrite = admin+student）
  const canDrag = role !== "teacher";

  const findColumn = (taskId: string) =>
    columns.find((c) => c.tasks.some((t) => t.id === taskId));

  async function onAction(task: TaskDTO, action: TransitionAction) {
    const rule = findTransition(action, task.status);
    if (rule?.noteRequired) {
      const note = window.prompt(`${rule.label}：填写说明`);
      if (note === null) return;
      if (!note.trim()) {
        setError("需要填写说明");
        return;
      }
      const res = await transitionTaskAction(projectId, task.id, action, {
        note: note.trim(),
      });
      if ("error" in res) setError(res.error);
      else router.refresh();
      return;
    }
    if (action === "assign") {
      setAssign({ task, assigneeId: members[0]?.id ?? "" });
      return;
    }
    const res = await transitionTaskAction(projectId, task.id, action);
    if ("error" in res) setError(res.error);
    else router.refresh();
  }

  async function confirmAssign() {
    if (!assign || !assign.assigneeId) return;
    const res = await transitionTaskAction(projectId, assign.task.id, "assign", {
      assigneeId: assign.assigneeId,
    });
    if ("error" in res) setError(res.error);
    else router.refresh();
    setAssign(null);
  }

  function onDragStart(e: DragStartEvent) {
    const task = columns.flatMap((c) => c.tasks).find((t) => t.id === e.active.id);
    setActiveTask(task ?? null);
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveTask(null);
    const { active, over } = e;
    if (!over || over.id === active.id) return;

    const taskId = String(active.id);
    const src = findColumn(taskId);
    if (!src) return;

    let targetCol: ColumnDef | undefined;
    let insertIndex: number | undefined;

    if (String(over.id).startsWith("col:")) {
      targetCol = columns.find((c) => c.id === String(over.id).slice(4));
    } else {
      const overTaskId = String(over.id);
      targetCol = columns.find((c) => c.tasks.some((t) => t.id === overTaskId));
      if (targetCol) {
        const list = targetCol.tasks.filter((t) => t.id !== taskId);
        const idx = list.findIndex((t) => t.id === overTaskId);
        insertIndex = idx >= 0 ? idx : list.length;
      }
    }
    if (!targetCol) return;

    // 状态分组禁止跨列（状态只能走状态机按钮）
    if (src.id !== targetCol.id && groupBy === "status") return;

    const list = targetCol.tasks.filter((t) => t.id !== taskId);
    const idx = insertIndex ?? list.length;
    const patch: MoveTaskPatch = { sortOrder: computeSortOrder(list, idx) };

    if (src.id !== targetCol.id) {
      if (groupBy === "priority") patch.priority = targetCol.id as TaskPriority;
      else if (groupBy === "milestone")
        patch.milestoneId = targetCol.id === "none" ? null : targetCol.id;
      else if (groupBy === "assignee") {
        if (targetCol.id === "unassigned") return; // 不支持拖回未指派
        patch.assigneeId = targetCol.id;
      }
    }

    moveTaskAction(projectId, taskId, patch).then((res) => {
      if ("error" in res) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      {error && (
        <div className="flex items-center justify-between rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <span>{error}</span>
          <button className="text-destructive" onClick={() => setError(null)}>
            ×
          </button>
        </div>
      )}
      {assign && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm">
          <span className="text-muted-foreground">
            指派「{assign.task.title}」给：
          </span>
          <select
            value={assign.assigneeId}
            onChange={(e) => setAssign({ ...assign, assigneeId: e.target.value })}
            className="h-8 rounded-md border border-input bg-background px-2 text-sm"
          >
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <Button size="sm" onClick={confirmAssign} disabled={!assign.assigneeId}>
            确认
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setAssign(null)}>
            取消
          </Button>
        </div>
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <div className="flex items-start gap-3 overflow-x-auto pb-4">
          {columns.map((col) => (
            <Column
              key={col.id}
              col={col}
              role={role}
              canDrag={canDrag}
              onAction={onAction}
            />
          ))}
        </div>
        <DragOverlay>{activeTask ? <DragPreview task={activeTask} /> : null}</DragOverlay>
      </DndContext>
    </div>
  );
}
