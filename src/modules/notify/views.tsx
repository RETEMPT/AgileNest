import Link from "next/link";
import { Bell, ArrowUpRight } from "lucide-react";
import { requireUser } from "@/modules/core";
import { listMyNotifications } from "./service";
import { MarkReadButton } from "./ui";

export async function NotificationsView({
  searchParams,
}: {
  searchParams: Promise<{ unread?: string }>;
}) {
  const user = await requireUser();
  const unreadOnly = (await searchParams).unread === "1";
  const notifications = await listMyNotifications(user.id, { unreadOnly });
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-brand">
            INBOX / 消息中心
          </p>
          <h1 className="mt-2 text-3xl font-semibold">协作动态</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            任务指派、交付和验收结果，及时找到对应事项。
          </p>
        </div>
        <Link
          href="/settings#notify"
          className="text-sm text-brand hover:underline"
        >
          管理飞书绑定 ↗
        </Link>
      </header>
      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <nav
          aria-label="消息筛选"
          className="flex gap-6 border-b border-border px-5"
        >
          {[
            ["", "全部消息"],
            ["?unread=1", "未读消息"],
          ].map(([suffix, label]) => (
            <Link
              key={label}
              href={`/notifications${suffix}`}
              aria-current={unreadOnly === Boolean(suffix) ? "page" : undefined}
              className={`border-b-2 py-4 text-sm ${unreadOnly === Boolean(suffix) ? "border-brand font-medium text-brand" : "border-transparent text-muted-foreground"}`}
            >
              {label}
            </Link>
          ))}
        </nav>
        {!notifications.length ? (
          <div className="py-16 text-center">
            <Bell className="mx-auto mb-4 h-9 w-9 text-brand/40" />
            <h2 className="font-medium">
              {unreadOnly ? "未读消息已处理完毕" : "暂时没有协作消息"}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              有新的任务与验收动态时，会显示在这里。
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {notifications.map((item) => (
              <li
                key={item.id}
                className={`flex gap-3 p-5 ${!item.readAt ? "bg-brand-soft/40" : ""}`}
              >
                <span
                  className={`mt-2 h-2 w-2 shrink-0 rounded-full ${item.readAt ? "bg-border" : "bg-brand"}`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap justify-between gap-2">
                    <h2 className="break-words text-sm font-semibold">
                      {item.title}
                    </h2>
                    <time
                      className="text-xs text-muted-foreground"
                      dateTime={item.createdAt.toISOString()}
                    >
                      {item.createdAt.toLocaleString("zh-CN", {
                        timeZone: "Asia/Shanghai",
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                  </div>
                  {item.body && (
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">
                      {item.body}
                    </p>
                  )}
                  <div className="mt-3 flex items-center justify-between gap-3">
                    {item.link?.startsWith("/p/") && (
                      <Link
                        href={item.link}
                        className="flex items-center gap-1 text-xs font-medium text-brand"
                      >
                        查看对应任务
                        <ArrowUpRight className="h-3 w-3" />
                      </Link>
                    )}
                    {!item.readAt && <MarkReadButton id={item.id} />}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
          显示最近 100 条{unreadOnly ? "未读" : ""}消息。
        </p>
      </section>
    </div>
  );
}
