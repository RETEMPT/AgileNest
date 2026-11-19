import Link from "next/link";
import { Bell, ArrowUpRight } from "lucide-react";
import { requireUser } from "@/modules/core";
import { listMyNotifications } from "./service";
import { MarkReadButton } from "./ui";
import { notificationLabel, notificationTarget, isWorkNotification, latestWorkNotifications } from "./client";

export async function NotificationsView({
  searchParams,
}: {
  searchParams: Promise<{ unread?: string; category?: string }>;
}) {
  const user = await requireUser();
  const query = await searchParams;
  const unreadOnly = query.unread === "1";
  const category = query.category === "all" || query.category === "activity" ? query.category : "work";
  const recent = await listMyNotifications(user.id, { unreadOnly });
  const notifications = category === "work" ? latestWorkNotifications(recent) : recent.filter((item) => category === "all" || !isWorkNotification(item.type));
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">消息中心</h1>
        </div>
        <Link
          href="/settings?section=notifications"
          className="text-sm text-brand hover:underline"
        >
          通知偏好 ↗
        </Link>
      </header>
      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <nav
          aria-label="消息筛选"
          className="flex gap-6 border-b border-border px-5"
        >
          {[
            ["?category=work", "工作消息"],
            ["?category=activity", "其他动态"],
            ["?category=all", "全部消息"],
          ].map(([suffix, label]) => (
            <Link
              key={label}
              href={`/notifications${suffix}${unreadOnly ? "&unread=1" : ""}`}
              aria-current={suffix.includes(category) ? "page" : undefined}
              className={`border-b-2 py-4 text-sm ${suffix.includes(category) ? "border-brand font-medium text-brand" : "border-transparent text-muted-foreground"}`}
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="px-5 py-3 text-xs"><Link className="text-brand" href={`/notifications?category=${category}${unreadOnly ? "" : "&unread=1"}`}>{unreadOnly ? "显示已读和未读" : "仅看未读"}</Link></div>
        {!notifications.length ? (
          <div className="py-16 text-center">
            <Bell className="mx-auto mb-4 h-9 w-9 text-brand/40" />
            <h2 className="font-medium">
              {unreadOnly ? "暂无未读消息" : "暂无消息"}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              与你有关或你关注的事项更新将按通知偏好显示在这里。
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
                    <div className="min-w-0">
                      <h2 className="break-words text-sm font-semibold">{item.title}</h2>
                      <p className={`mt-1 text-xs ${item.readAt ? "text-muted-foreground" : "font-medium text-brand"}`}>{notificationLabel(item.type)} · {item.readAt ? "已读" : "未读"}</p>
                    </div>
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
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    {notificationTarget(item.link) && (
                      <Link
                        href={notificationTarget(item.link)!}
                        className="flex items-center gap-1 text-xs font-medium text-brand"
                      >
                        查看相关内容
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
          从最近 100 条{unreadOnly ? "未读" : ""}消息中筛选。{category === "work" ? "同一事项显示最近一条，完整历史在全部消息。" : ""}
        </p>
      </section>
    </div>
  );
}
