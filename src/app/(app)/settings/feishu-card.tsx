"use client";

import { unbindFeishuAction } from "./actions";

type Props = {
  boundName: string | null;
  boundAtLabel: string | null;
  notice: string | null;
};

const NOTICE: Record<string, { text: string; ok: boolean }> = {
  bound: { text: "飞书绑定成功。", ok: true },
  state_error: { text: "绑定校验失败，请重试。", ok: false },
  conflict: { text: "该飞书账号已绑定其他用户。", ok: false },
  error: { text: "绑定失败，请稍后重试。", ok: false },
};

export function FeishuCard({ boundName, boundAtLabel, notice }: Props) {
  const n = notice ? NOTICE[notice] : null;
  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-5">
      <h2 className="font-display text-base font-semibold">飞书通知</h2>
      <p className="text-sm text-muted-foreground">
        绑定飞书后，任务被指派 / 提交 / 验收 / 打回，以及临期逾期时，你会收到飞书私信提醒。
      </p>
      {n && (
        <p className={`text-sm ${n.ok ? "text-emerald-600" : "text-destructive"}`}>{n.text}</p>
      )}
      {boundName ? (
        <div className="flex items-center justify-between gap-4">
          <div className="text-sm">
            已绑定：<span className="font-medium">{boundName}</span>
            {boundAtLabel && (
              <span className="ml-2 text-muted-foreground">（{boundAtLabel}）</span>
            )}
          </div>
          <form action={unbindFeishuAction}>
            <button
              type="submit"
              className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent"
            >
              解绑
            </button>
          </form>
        </div>
      ) : (
        <>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/api/auth/feishu/login"
            className="inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-brand-hover"
          >
            绑定飞书
          </a>
        </>
      )}
    </section>
  );
}
