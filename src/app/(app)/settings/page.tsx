import { eq } from "drizzle-orm";
import { requireUser } from "@/modules/core/session";
import { db } from "@/db";
import { users } from "@/db/schema";
import { FeishuCard } from "./feishu-card";

function fmt(d: Date | null): string | null {
  if (!d) return null;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ feishu?: string }>;
}) {
  const user = await requireUser();

  const [row] = await db
    .select({ feishuName: users.feishuName, feishuBoundAt: users.feishuBoundAt })
    .from(users)
    .where(eq(users.id, user.id));
  const { feishu } = await searchParams;

  return (
    <main className="mx-auto max-w-2xl space-y-8">
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-semibold">设置</h1>
        <p className="text-sm text-muted-foreground">账号与通知设置。</p>
      </header>

      <FeishuCard
        boundName={row?.feishuName ?? null}
        boundAtLabel={fmt(row?.feishuBoundAt ?? null)}
        notice={feishu ?? null}
      />
    </main>
  );
}
