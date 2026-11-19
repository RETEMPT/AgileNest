"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, Link2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { FeishuConnection } from "./client";
import type { IdentityFormState } from "./actions";
import { disconnectFeishuAction } from "./connection-actions";

const NOTICES: Record<string, { text: string; ok: boolean }> = {
  bound: { text: "飞书账号已绑定，可在个人资料中选择使用飞书姓名。", ok: true },
  state_error: { text: "绑定校验已失效，请重新发起绑定。", ok: false },
  conflict: { text: "该飞书账号已绑定其他用户，请换一个账号。", ok: false },
  error: { text: "绑定失败，请稍后重试。", ok: false },
  feishu_not_configured: {
    text: "飞书连接暂未启用，平台账号与站内消息可正常使用。",
    ok: false,
  },
};

export function FeishuConnectionPanel({
  connection,
  notice,
}: {
  connection: FeishuConnection;
  notice: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(
    async (prev: IdentityFormState, data: FormData) => {
      const result = await disconnectFeishuAction(prev, data);
      if (!result?.error) setOpen(false);
      return result;
    },
    null,
  );
  const message = notice ? NOTICES[notice] : null;
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5 sm:p-6">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Link2 className="h-5 w-5 text-brand" />
          飞书连接
        </h2>
        <Badge variant={connection.connected ? "success" : "secondary"}>
          {connection.connected
            ? "已绑定"
            : connection.configured
              ? "未绑定"
              : "暂未启用"}
        </Badge>
      </div>
      <div className="space-y-5 p-5 sm:p-6">
        <p className="text-sm leading-6 text-muted-foreground">
          可选的账号连接。绑定后可使用飞书登录，并由你决定是否采用飞书姓名。
        </p>
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <p className="flex items-start gap-2">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
            平台独立维护资料、身份与职务
          </p>
          <p className="flex items-start gap-2">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
            任务与验收消息在站内接收
          </p>
        </div>
        {connection.connected ? (
          <div className="space-y-3 rounded-xl bg-muted/40 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <p className="break-words text-sm font-medium">
                  {connection.name || "已绑定飞书账号"}
                </p>
                {connection.boundAt && (
                  <p className="text-xs text-muted-foreground">
                    绑定于 {new Date(connection.boundAt).toLocaleString("zh-CN", {
                      timeZone: "Asia/Shanghai",
                    })}
                  </p>
                )}
              </div>
              {connection.canDisconnect && (
                <Dialog.Root
                  open={open}
                  onOpenChange={(value) => {
                    if (!pending) setOpen(value);
                  }}
                >
                  <Dialog.Trigger asChild>
                    <Button variant="outline" size="sm">解绑飞书</Button>
                  </Dialog.Trigger>
                  <Dialog.Portal>
                    <Dialog.Overlay className="dialog-overlay fixed inset-0 z-50 bg-black/35" />
                    <Dialog.Content className="dialog-surface fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-xl">
                      <Dialog.Title className="pr-8 text-lg font-semibold">
                        解绑飞书账号
                      </Dialog.Title>
                      <Dialog.Description className="mt-3 text-sm leading-6 text-muted-foreground">
                        解绑后请使用平台邮箱和密码登录。个人资料、团队职务和任务记录会保留。
                      </Dialog.Description>
                      <Dialog.Close asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="关闭"
                          disabled={pending}
                          className="absolute right-3 top-3"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </Dialog.Close>
                      <form action={action} className="mt-5 space-y-4">
                        <input
                          type="hidden"
                          name="bindingVersion"
                          value={connection.bindingVersion ?? ""}
                        />
                        {state?.error && (
                          <p role="alert" className="text-sm text-destructive">
                            {state.error}
                          </p>
                        )}
                        <div className="flex justify-end gap-2">
                          <Dialog.Close asChild>
                            <Button type="button" variant="outline" disabled={pending}>
                              取消
                            </Button>
                          </Dialog.Close>
                          <Button type="submit" variant="destructive" disabled={pending} loading={pending}>
                            {pending ? "解绑中…" : "确认解绑"}
                          </Button>
                        </div>
                      </form>
                    </Dialog.Content>
                  </Dialog.Portal>
                </Dialog.Root>
              )}
            </div>
            {!connection.canDisconnect && (
              <p className="text-xs leading-6 text-muted-foreground">
                此账号使用飞书生成的登录地址，需保留绑定以免失去登录方式。
              </p>
            )}
            {!connection.configured && (
              <p className="text-xs leading-6 text-muted-foreground">
                飞书连接当前暂未启用，已有绑定记录仍保留。
              </p>
            )}
          </div>
        ) : connection.configured ? (
          <Button asChild>
            <Link href="/api/auth/feishu/login">绑定飞书账号</Link>
          </Button>
        ) : (
          <div className="rounded-xl bg-muted/40 p-4 text-sm leading-6 text-muted-foreground">
            飞书连接尚未启用。需要使用时，请联系平台管理员。
          </div>
        )}
        {state?.ok ? (
          <p role="status" className="text-sm text-brand">{state.ok}</p>
        ) : message && (
          <p
            role={message.ok ? "status" : "alert"}
            className={`text-sm ${message.ok ? "text-brand" : "text-destructive"}`}
          >
            {message.text}
          </p>
        )}
        <p className="border-t border-border pt-4 text-xs leading-6 text-muted-foreground">
          资料不会自动覆盖，学术身份仍由团队确认。飞书私信提醒尚未启用；可在
          <Link href="/notifications" className="mx-1 text-brand underline-offset-4 hover:underline">
            消息中心
          </Link>
          查看协作消息。
        </p>
      </div>
    </section>
  );
}
