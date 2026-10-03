import { eq } from "drizzle-orm";
import { requireUser } from "@/modules/core/session";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getAcademicProfile } from "./service";
import { AcademicProfileForm } from "./academic-ui";
import { FeishuCard } from "@/app/(app)/settings/feishu-card";

function fmt(d: Date | null): string | null {
  if (!d) return null;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export async function SettingsView({
  searchParams,
}: {
  searchParams: Promise<{ feishu?: string }>;
}) {
  const user = await requireUser();

  const [row] = await db
    .select({
      feishuName: users.feishuName,
      feishuBoundAt: users.feishuBoundAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, user.id));
  const { feishu } = await searchParams;
  const profile = await getAcademicProfile(user.id);

  return (
    <main className="mx-auto max-w-2xl space-y-6">
      <header className="border-b border-border pb-4">
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
          个人与系统偏好
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">
          管理你的账号基本信息、通知绑定与安全设置。
        </p>
      </header>

      {/* 个人身份卡片 */}
      <section className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-xs">
        <h2 className="font-display text-sm font-semibold text-foreground">
          个人基本资料
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 text-xs">
          <div className="rounded-xl bg-muted/40 p-3">
            <span className="text-muted-foreground block text-[11px]">
              姓名
            </span>
            <span className="font-semibold text-foreground text-sm mt-0.5 block">
              {user.name || "未填写"}
            </span>
          </div>
          <div className="rounded-xl bg-muted/40 p-3">
            <span className="text-muted-foreground block text-[11px]">
              登录邮箱
            </span>
            <span className="font-mono text-foreground text-xs mt-0.5 block">
              {user.email || "—"}
            </span>
          </div>
          <div className="rounded-xl bg-muted/40 p-3">
            <span className="text-muted-foreground block text-[11px]">
              用户 ID
            </span>
            <span className="font-mono text-muted-foreground text-[11px] truncate block mt-0.5">
              {user.id}
            </span>
          </div>
          <div className="rounded-xl bg-muted/40 p-3">
            <span className="text-muted-foreground block text-[11px]">
              注册时间
            </span>
            <span className="text-muted-foreground text-[11px] block mt-0.5">
              {row?.createdAt
                ? new Date(row.createdAt).toLocaleDateString("zh-CN")
                : "—"}
            </span>
          </div>
        </div>
      </section>

      <AcademicProfileForm profile={profile} />

      {/* 飞书集成卡片 */}
      <div id="notify">
        <FeishuCard
          boundName={row?.feishuName ?? null}
          boundAtLabel={fmt(row?.feishuBoundAt ?? null)}
          notice={feishu ?? null}
        />
      </div>
    </main>
  );
}
