"use client";

import { useActionState } from "react";
import Link from "next/link";
import { registerAction, type FormState } from "./actions";

export default function RegisterPage() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    registerAction,
    null,
  );

  return (
    <main className="mx-auto mt-24 w-full max-w-sm space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm">
      <h1 className="font-display text-2xl font-semibold">注册 AgileCampus</h1>
      <form action={formAction} className="space-y-3">
        <input
          name="name"
          placeholder="姓名"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <input
          name="email"
          type="email"
          placeholder="邮箱"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <input
          name="password"
          type="password"
          placeholder="密码（至少 8 位）"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
        <button
          disabled={pending}
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {pending ? "注册中…" : "注册"}
        </button>
      </form>
      <p className="text-sm text-muted-foreground">
        已有账号？
        <Link href="/login" className="text-primary hover:underline">
          去登录
        </Link>
      </p>
    </main>
  );
}
