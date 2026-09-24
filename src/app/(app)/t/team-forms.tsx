"use client";

import { useActionState } from "react";
import { createTeamAction, joinTeamAction } from "./actions";

type FormState = { error: string } | null;

export function CreateTeamForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    createTeamAction,
    null,
  );
  return (
    <form action={formAction} className="space-y-3 rounded-xl border border-border bg-card p-5">
      <h2 className="font-display text-base font-semibold">创建团队</h2>
      <input
        name="name"
        placeholder="团队名称（如：软件工程课程组）"
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      <button
        disabled={pending}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-brand-hover disabled:opacity-50"
      >
        {pending ? "创建中…" : "创建"}
      </button>
    </form>
  );
}

export function JoinTeamForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    joinTeamAction,
    null,
  );
  return (
    <form action={formAction} className="space-y-3 rounded-xl border border-border bg-card p-5">
      <h2 className="font-display text-base font-semibold">凭邀请码加入</h2>
      <input
        name="inviteCode"
        placeholder="邀请码"
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      <button
        disabled={pending}
        className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
      >
        {pending ? "加入中…" : "加入"}
      </button>
    </form>
  );
}
