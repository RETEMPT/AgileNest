"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { StatusPill } from "@/components/ui/badge";
import type { TeamRole } from "@/db/schema";
import type { TaskDTO } from "@/modules/tasks";
import { createSubtaskAction, setDueDateAction } from "../actions";
import { TaskActions } from "./task-actions";

export function SubtaskPanel({
  projectId,
  parent,
  subtasks,
  role,
  members,
}: {
  projectId: string;
  parent: TaskDTO;
  subtasks: TaskDTO[];
  role: TeamRole;
  members: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function addSubtask(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const res = await createSubtaskAction(projectId, parent.id, {
      title: title.trim(),
      dueDate: dueDate || undefined,
    });
    if ("error" in res) setError(res.error);
    else {
      setTitle("");
      setDueDate("");
      setError(null);
      router.refresh();
    }
  }

  async function changeDueDate(value: string) {
    const res = await setDueDateAction(projectId, parent.id, value || null);
    if ("error" in res) setError(res.error);
    else router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-2">
        <div className="space-y-1">
          <Label htmlFor="parent-due">截止日期</Label>
          <Input
            id="parent-due"
            type="date"
            value={parent.dueDate ?? ""}
            onChange={(e) => changeDueDate(e.target.value)}
            className="w-44"
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      <form onSubmit={addSubtask} className="flex flex-wrap gap-2">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="子任务标题"
          className="max-w-xs"
        />
        <Input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="w-40"
        />
        <Button type="submit" size="sm">
          添加子任务
        </Button>
      </form>

      <ul className="space-y-2">
        {subtasks.map((s) => (
          <li key={s.id} className="rounded-lg border border-border bg-card p-3">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill status={s.status} />
              <span className="font-medium">{s.title}</span>
              {s.assigneeName && (
                <span className="text-xs text-muted-foreground">{s.assigneeName}</span>
              )}
              {s.dueDate && (
                <span className="text-xs text-muted-foreground">截止 {s.dueDate}</span>
              )}
            </div>
            <TaskActions projectId={projectId} task={s} role={role} members={members} />
          </li>
        ))}
        {subtasks.length === 0 && (
          <p className="text-sm text-muted-foreground">还没有子任务。</p>
        )}
      </ul>
    </div>
  );
}
