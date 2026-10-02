"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { TeamRole } from "@/db/schema";
import { ACTION_LABELS, allowedActions, findTransition } from "@/modules/tasks/states";
import type { TaskDTO, TransitionAction } from "@/modules/tasks";
import { transitionTaskAction } from "../actions";

export function TaskActions({
  projectId,
  task,
  role,
  members,
}: {
  projectId: string;
  task: TaskDTO;
  role: TeamRole;
  members: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [assign, setAssign] = useState<{ assigneeId: string } | null>(null);

  const actions = allowedActions(task.status, role) as TransitionAction[];

  async function run(action: TransitionAction) {
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
      setAssign({ assigneeId: members[0]?.id ?? "" });
      return;
    }
    const res = await transitionTaskAction(projectId, task.id, action);
    if ("error" in res) setError(res.error);
    else router.refresh();
  }

  async function confirmAssign() {
    if (!assign || !assign.assigneeId) return;
    const res = await transitionTaskAction(projectId, task.id, "assign", {
      assigneeId: assign.assigneeId,
    });
    if ("error" in res) setError(res.error);
    else router.refresh();
    setAssign(null);
  }

  if (actions.length === 0 && !assign) return null;

  if (assign) {
    return (
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">指派给：</span>
        <select
          value={assign.assigneeId}
          onChange={(e) => setAssign({ assigneeId: e.target.value })}
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
    );
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1">
      {actions.map((a) => (
        <Button key={a} size="sm" variant="outline" onClick={() => run(a)}>
          {ACTION_LABELS[a]}
        </Button>
      ))}
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
