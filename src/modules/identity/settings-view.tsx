import { requireUser } from "@/modules/core";
import { getAcademicProfile } from "./service";
import { getAccountProfile } from "./profile-service";
import { AccountProfileForm } from "./profile-ui";
import { AcademicProfileForm } from "./academic-ui";
import { getFeishuConnection } from "./connection-service";
import { FeishuConnectionPanel } from "./connection-ui";

export async function SettingsView({
  searchParams,
}: {
  searchParams: Promise<{ feishu?: string; notice?: string }>;
}) {
  const user = await requireUser();
  const [profile, academic, connection, query] = await Promise.all([
    getAccountProfile(user.id),
    getAcademicProfile(user.id),
    getFeishuConnection(user.id),
    searchParams,
  ]);
  return (
    <div className="mx-auto max-w-5xl space-y-7">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">
          个人中心
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          管理头像、个人资料、学术身份和飞书账号绑定。
        </p>
      </header>
      <div className="grid items-start gap-6 lg:grid-cols-[180px_1fr]">
        <aside className="space-y-4 lg:sticky lg:top-6">
          <nav
            aria-label="个人设置分区"
            className="flex flex-wrap gap-1 lg:flex-col"
          >
            {[
              ["profile", "个人资料"],
              ["academic", "学术身份"],
              ["notify", "飞书连接"],
            ].map(([id, label]) => (
              <a
                key={id}
                href={"#" + id}
                className="rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-brand-soft hover:text-brand"
              >
                {label}
                <span className="float-right ml-3" aria-hidden="true">
                  ↗
                </span>
              </a>
            ))}
          </nav>
          <p className="hidden border-t border-border px-3 pt-4 text-xs leading-6 text-muted-foreground lg:block">
            加入于 {profile.createdAt.toLocaleDateString("zh-CN")}
            <br />
            学术身份与团队职务分别管理。
          </p>
        </aside>
        <div className="min-w-0 space-y-6">
          <section id="profile" className="scroll-mt-6">
            <AccountProfileForm profile={profile} feishuName={connection.name} />
          </section>
          <section id="academic" className="scroll-mt-6">
            <AcademicProfileForm profile={academic} />
          </section>
          <section id="notify" className="scroll-mt-6">
            <FeishuConnectionPanel
              connection={connection}
              notice={query.feishu ?? query.notice ?? null}
            />
          </section>
        </div>
      </div>
    </div>
  );
}
