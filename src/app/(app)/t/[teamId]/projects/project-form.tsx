"use client";

import { useActionState } from "react";
import { createProjectAction } from "./actions";

type FormState = { error: string } | null;

export function ProjectForm({ teamId }: { teamId: string }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    createProjectAction,
    null,
  );
  return (
    <form action={formAction} className="space-y-3 rounded-xl border border-border bg-card p-5">
      <h2 className="font-display text-base font-semibold">新建项目</h2>
      <input type="hidden" name="teamId" value={teamId} />
      <input
        name="name"
        placeholder="项目名称"
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
      <textarea
        name="description"
        placeholder="描述（可选）"
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
      <select
        name="kind"
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        defaultValue="course"
      >
        <option value="course">课程</option>
        <option value="lab">实验室</option>
        <option value="contest">竞赛</option>
      </select>
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      <button
        disabled={pending}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-brand-hover disabled:opacity-50"
      >
        {pending ? "创建中…" : "创建项目"}
      </button>
    </form>
  );
}
