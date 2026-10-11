import Link from "next/link";
import { UserAvatar } from "@/components/ui/user-avatar";
import type { ProjectKind } from "@/db/schema";
import { notFound } from "next/navigation";
import {
  ArrowRight,
  BookOpen,
  FlaskConical,
  Trophy,
  Users,
} from "lucide-react";
import { requireUser, getTeamMembership } from "@/modules/core";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  listMyTeams,
  listTeamMembers,
  listTeamSpaces,
  getAcademicProfile,
} from "./service";
import { TeamEntryActions, CreateProjectButton, InviteCode } from "./ui";
export { ProjectOverviewView, ProjectSettingsView } from "./project-view";
export { SettingsView } from "./settings-view";
export { TeamSettingsView } from "./team-settings-view";
import { TeamMemberRemovalButton, TeamSectionLinks } from "./team-settings";
import { TeamProjectGuide } from "./project-journey";
import { getProjectDirectory } from "./space-service";
import { ProjectDirectory } from "./space-ui";
import { ACADEMIC_LABELS, POSITION_META, capabilitiesFor, canRemoveTeamMember } from "./client";
import {
  AcademicProfileForm,
  ConfirmIdentityButton,
  MemberPositionsForm,
} from "./academic-ui";

const KIND_META = {
  course: { title: "课程协作", icon: BookOpen },
  lab: { title: "实验室课题", icon: FlaskConical },
  contest: { title: "竞赛战队", icon: Trophy },
};

function CollaborationPath({ current }: { current: number }) {
  const steps = ["团队空间", "成员与分工", "项目与课题", "任务看板"];
  return (
    <nav
      aria-label="团队协作流程"
      className="grid grid-cols-2 gap-2 sm:grid-cols-4"
    >
      {steps.map((step, index) => (
        <div
          key={step}
          className={`flex items-center gap-3 rounded-xl border p-3 ${index === current ? "border-brand/30 bg-brand-soft" : "border-border bg-card"}`}
          aria-current={index === current ? "step" : undefined}
        >
          <span
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${index === current ? "bg-brand text-white" : "bg-muted text-muted-foreground"}`}
          >
            {index + 1}
          </span>
          <span className="text-sm font-medium">{step}</span>
          {index < 3 && (
            <ArrowRight className="ml-auto hidden h-3 w-3 text-muted-foreground sm:block" />
          )}
        </div>
      ))}
    </nav>
  );
}

export async function TeamSpacesView() {
  const user = await requireUser();
  const teams = await listTeamSpaces(user.id);
  return (
    <main className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">团队空间</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            管理团队成员、项目与课题。
          </p>
        </div>
        {teams.length > 0 && <TeamEntryActions />}
      </header>
      {teams.length === 0 && <CollaborationPath current={0} />}
      {teams.length === 0 ? (
        <section className="space-y-5 rounded-2xl border border-border bg-card p-5 sm:p-8">
          <div>
            <h2 className="text-xl font-semibold">暂无团队</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              创建团队，或使用邀请码加入已有团队。
            </p>
          </div>
          <TeamEntryActions large />
        </section>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">
              我的团队{" "}
              <span className="ml-2 text-muted-foreground">{teams.length}</span>
            </h2>
            <span className="text-xs text-muted-foreground">
              职务以各团队内的设置为准
            </span>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {teams.map((team) => (
              <Card
                key={team.id}
                className="overflow-hidden transition hover:border-brand/35 hover:shadow-sm"
              >
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
                      <Users className="h-6 w-6" />
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {team.positions.map((position) => (
                        <Badge key={position} variant="secondary">
                          {POSITION_META[position].label}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <CardTitle className="pt-3">
                    <Link
                      href={`/t/${team.id}/projects`}
                      className="hover:text-brand"
                    >
                      {team.name}
                    </Link>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 rounded-lg bg-muted/60 p-3">
                    <div>
                      <p className="text-xl font-semibold">
                        {team.memberCount}
                      </p>
                      <p className="text-xs text-muted-foreground">协作成员</p>
                    </div>
                    <div>
                      <p className="text-xl font-semibold">
                        {team.projectCount}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        进行中的项目
                      </p>
                    </div>
                  </div>
                  <InviteCode code={team.inviteCode} expiresOn={team.inviteExpiresOn} />
                  <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
                    <Link href={`/t/${team.id}/settings`} className="text-brand hover:underline">团队信息与公告</Link>
                    <Link href={`/t/${team.id}/resources`} className="text-muted-foreground hover:text-brand">资料中心</Link>
                  </div>
                  <div className="flex items-center justify-between border-t border-border pt-4">
                    <Link
                      href={`/t/${team.id}/members`}
                      className="text-xs text-muted-foreground hover:text-brand"
                    >
                      成员与分工
                    </Link>
                    <Button asChild size="sm">
                      <Link href={`/t/${team.id}/projects`}>
                        查看项目
                        <ArrowRight className="h-3 w-3" />
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </main>
  );
}

export async function TeamProjectsView({
  teamId,
  kind,
}: {
  teamId: string;
  kind?: string;
}) {
  const user = await requireUser();
  const membership = await getTeamMembership(user.id, teamId);
  if (!membership) notFound();
  const [teams, directory, members] = await Promise.all([
    listMyTeams(user.id),
    getProjectDirectory(user.id, teamId),
    listTeamMembers(user.id, teamId),
  ]);
  const projects = directory.projects;
  const team = teams.find((item) => item.id === teamId);
  if (!team) notFound();
  const allowedKinds: ProjectKind[] = (["course", "lab", "contest"] as const).filter((projectKind) => capabilitiesFor(membership.positions, projectKind).manageProject);
  const canCreate = allowedKinds.length > 0;
  const selected: ProjectKind | undefined = [
    "course",
    "lab",
    "contest",
  ].includes(kind ?? "")
    ? (kind as ProjectKind)
    : undefined;
  return (
    <main className="space-y-6">
      <header>
        <Link
          href="/t"
          className="text-xs text-muted-foreground hover:text-brand"
        >
          团队空间 /
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              {team.name}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {members.length} 位成员 · {projects.length} 个项目
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href={`/t/${teamId}/members`}>
                <Users className="h-4 w-4" />
                成员与分工
              </Link>
            </Button>
            {canCreate && (
              <CreateProjectButton
                key={selected ?? "all"}
                teamId={teamId}
                defaultKind={selected}
                allowedKinds={allowedKinds}
              />
            )}
          </div>
        </div>
      </header>
      <TeamSectionLinks teamId={teamId} current="projects" />
      <TeamProjectGuide teamId={teamId} />
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
        <div>
          <h2 className="text-sm font-semibold">邀请团队成员</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            分享邀请码；加入后，管理员可设置副管理员、指导老师、队长和组员等可叠加职务。
          </p>
        </div>
        <InviteCode code={team.inviteCode} expiresOn={team.inviteExpiresOn} />
      </section>
      <h2 id="team-project-list" tabIndex={-1} className="scroll-mt-6 text-base font-semibold">团队项目</h2>
      <nav aria-label="项目类型筛选" className="flex flex-wrap gap-2">
        <Button asChild variant={!selected ? "default" : "outline"} size="sm">
          <Link href={`/t/${teamId}/projects`}>全部项目 {projects.length}</Link>
        </Button>
        {Object.entries(KIND_META).map(([key, meta]) => (
          <Button
            asChild
            key={key}
            variant={selected === key ? "default" : "outline"}
            size="sm"
          >
            <Link href={`/t/${teamId}/projects?kind=${key}`}>
              <meta.icon className="h-3.5 w-3.5" />
              {meta.title}{" "}
              {projects.filter((project) => project.kind === key).length}
            </Link>
          </Button>
        ))}
      </nav>
      <ProjectDirectory key={teamId} teamId={teamId} initial={directory} kind={selected} />
    </main>
  );
}

export async function TeamMembersView({ teamId }: { teamId: string }) {
  const user = await requireUser();
  const membership = await getTeamMembership(user.id, teamId);
  if (!membership) notFound();
  const [members, teams, profile] = await Promise.all([
    listTeamMembers(user.id, teamId),
    listMyTeams(user.id),
    getAcademicProfile(user.id),
  ]);
  const team = teams.find((item) => item.id === teamId);
  if (!team) notFound();
  return (
    <main className="space-y-6">
      <header>
        <Link
          href={`/t/${teamId}/projects`}
          className="text-xs text-muted-foreground hover:text-brand"
        >
          ← {team.name} / 团队项目
        </Link>
        <h1 id="team-members-heading" tabIndex={-1} className="mt-3 text-3xl font-semibold">成员与分工</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          设置管理员、副管理员和组员等协作职务；一位成员可以承担多项职务，权限按职务叠加。
        </p>
      </header>
      <TeamSectionLinks teamId={teamId} current="members" />
      <CollaborationPath current={1} />
      <section
        className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 xl:grid-cols-5"
        aria-label="团队职务权限说明"
      >
        {Object.entries(POSITION_META).map(([key, meta]) => (
          <div key={key}>
            <h2 className="text-sm font-semibold text-brand">{meta.label}</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {meta.description}
            </p>
          </div>
        ))}
      </section>
      <p className="text-xs text-muted-foreground">
        身份由本人在
        <Link className="text-brand underline" href="/settings">
          个人设置
        </Link>
        填写，团队管理员确认，作为补充资料展示。身份不自动授予权限；队长的项目管理与指派权限限实验室和竞赛。
      </p>
      {!profile && <details className="rounded-xl border border-border bg-card p-4"><summary className="cursor-pointer text-sm font-medium">补充我的学术资料（选填）</summary><div className="mt-4"><AcademicProfileForm profile={null} /></div></details>}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {members.map((member) => (
          <Card
            key={`${member.id}-${member.positions.join("-")}-${member.positionVersion}-${member.profile?.version}`}
          >
            <CardHeader>
              <div className="flex items-center gap-3">
                <UserAvatar
                  name={member.name}
                  src={member.avatarUrl}
                  className="h-11 w-11 text-lg"
                />
                <div className="min-w-0">
                  <CardTitle>
                    {member.name}
                    {member.id === user.id && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        我
                      </span>
                    )}
                  </CardTitle>
                  <CardDescription className="truncate">
                    {member.email}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {member.positions.map((position) => (
                  <Badge key={position} variant="secondary">
                    {POSITION_META[position].label}
                  </Badge>
                ))}
              </div>
              {member.bio && (
                <p className="break-words text-sm text-muted-foreground">
                  {member.bio}
                </p>
              )}
              <div className="rounded-xl bg-muted/50 p-3 space-y-2">
                <p className="text-xs text-muted-foreground">学术资料 · 不决定协作权限</p>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">
                    {member.profile
                      ? ACADEMIC_LABELS[member.profile.identity]
                      : "未填写学术身份"}
                  </span>
                  {member.profile && (
                    <Badge
                      variant={
                        member.identityConfirmed ? "default" : "secondary"
                      }
                    >
                      {member.identityConfirmed ? "团队已确认" : "待管理员确认"}
                    </Badge>
                  )}
                </div>
                {member.profile && (
                  <>
                    <p className="text-xs text-muted-foreground">
                      {[member.profile.institution, member.profile.department]
                        .filter(Boolean)
                        .join(" · ") || "未填写学校与院系"}
                    </p>
                    {member.profile.researchFocus && (
                      <p className="break-words text-xs">
                        研究方向：{member.profile.researchFocus}
                      </p>
                    )}
                  </>
                )}
                {membership.positions.includes("admin") &&
                  member.id !== user.id &&
                  member.profile &&
                  !member.identityConfirmed && (
                    <ConfirmIdentityButton
                      teamId={teamId}
                      userId={member.id}
                      version={member.profile.version}
                    />
                  )}
                {member.id === user.id &&
                  member.profile &&
                  !member.identityConfirmed && (
                    <p className="text-xs text-muted-foreground">
                      {member.positions.includes("admin")
                        ? "请联系另一位团队管理员确认身份资料。"
                        : "请联系团队管理员确认身份资料。"}
                    </p>
                  )}
              </div>
              {capabilitiesFor(membership.positions).manageMembers && (
                <MemberPositionsForm teamId={teamId} member={member} />
              )}
              {(member.id === user.id || canRemoveTeamMember(membership.positions, member.positions)) && <div className="border-t border-border pt-3">
                <TeamMemberRemovalButton teamId={teamId} userId={member.id} name={member.id === user.id ? team.name : member.name} self={member.id === user.id} />
              </div>}
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}
