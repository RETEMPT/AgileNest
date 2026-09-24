import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/modules/core/session";
import { getProjectForUser } from "@/modules/core/permissions";

export default async function ProjectSettings({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const user = await requireUser();
  const access = await getProjectForUser(user.id, projectId);
  if (!access) notFound();
  const p = access.project;

  return (
    <main className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-semibold">项目设置</h1>
      </header>
      <div className="space-y-2 rounded-xl border border-border bg-card p-5 text-sm">
        <p>
          名称：<span className="font-medium">{p.name}</span>
        </p>
        <p>
          类型：{p.kind ?? "—"} · 状态：{p.status}
        </p>
        <p>
          起止：{p.startDate ?? "—"} ~ {p.endDate ?? "—"}
        </p>
        <p className="text-muted-foreground">
          编辑表单由 identity 模块后续补全（<code className="rounded bg-muted px-1">updateProject</code> 已就位）。
        </p>
        <p>
          <Link href={`/t/${p.teamId}/projects`} className="text-primary hover:underline">
            ← 返回团队项目列表
          </Link>
        </p>
      </div>
    </main>
  );
}
