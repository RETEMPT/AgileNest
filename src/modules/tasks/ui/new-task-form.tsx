"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import type { TaskPriority } from "@/db/schema";
import { createTaskAction } from "../actions";

export function NewTaskForm({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("请填写标题");
      return;
    }
    const res = await createTaskAction(projectId, {
      title: title.trim(),
      description: description.trim() || undefined,
      priority,
      dueDate: dueDate || undefined,
    });
    if ("error" in res) setError(res.error);
    else {
      setTitle("");
      setDescription("");
      setDueDate("");
      setError(null);
      router.refresh();
    }
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-border bg-card p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="new-task-title">标题</Label>
          <Input
            id="new-task-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="新任务标题"
          />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="new-task-desc">描述</Label>
          <Textarea
            id="new-task-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="可选"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="new-task-priority">优先级</Label>
          <Select
            id="new-task-priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value as TaskPriority)}
          >
            <option value="high">高</option>
            <option value="medium">中</option>
            <option value="low">低</option>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="new-task-due">截止日期</Label>
          <Input
            id="new-task-due"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      <Button type="submit" className="mt-3">
        新建任务
      </Button>
    </form>
  );
}
