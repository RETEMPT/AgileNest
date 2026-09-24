"use client";

import { Suspense, useActionState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { loginAction, type FormState } from "./actions";
import { FeishuLogin } from "./feishu-login";

function LoginForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    loginAction,
    null,
  );
  const registered = useSearchParams().get("registered");

  return (
    <main className="mx-auto mt-24 w-full max-w-sm space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm">
      <h1 className="font-display text-2xl font-semibold">登录 AgileCampus</h1>
      {registered && <p className="text-sm text-emerald-600">注册成功，请登录。</p>}
      <form action={formAction} className="space-y-3">
        <input
          name="email"
          type="email"
          placeholder="邮箱"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <input
          name="password"
          type="password"
          placeholder="密码"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
        <button
          disabled={pending}
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {pending ? "登录中…" : "登录"}
        </button>
      </form>
      <p className="text-sm text-muted-foreground">
        没有账号？
        <Link href="/register" className="text-primary hover:underline">
          去注册
        </Link>
      </p>
      <FeishuLogin />
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
