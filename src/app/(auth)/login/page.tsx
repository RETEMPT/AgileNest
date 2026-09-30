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
  const searchParams = useSearchParams();
  const registered = searchParams.get("registered");
  const authError = searchParams.get("error");

  return (
    <main className="mx-auto mt-24 w-full max-w-sm space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
          登录 AgileNest
        </h1>
        <p className="text-xs text-muted-foreground">高校轻量敏捷项目管理平台</p>
      </div>

      {registered && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-2.5 text-xs text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-400">
          ✅ 注册成功，请使用新账号登录。
        </div>
      )}

      {authError === "feishu_not_configured" && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-2.5 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-400">
          ⚠️ 飞书自建应用未配置（缺少 <code>FEISHU_APP_ID</code>）。请使用账号密码登录，或在 <code>.env</code> 中配置后重启。
        </div>
      )}

      <form action={formAction} className="space-y-3 pt-1">
        <input
          name="email"
          type="email"
          placeholder="邮箱 (如: student@agilecampus.local)"
          required
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <input
          name="password"
          type="password"
          placeholder="密码 (默认: password123)"
          required
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
        {state?.error && <p className="text-xs text-destructive">{state.error}</p>}
        <button
          disabled={pending}
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition"
        >
          {pending ? "登录中…" : "登录"}
        </button>
      </form>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>演示账号密码: password123</span>
        <Link href="/register" className="text-primary hover:underline font-medium">
          注册新账号 →
        </Link>
      </div>
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
