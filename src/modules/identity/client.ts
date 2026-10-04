import type { ProjectKind, TaskAction, TeamRole } from "@/db/schema";

export type FeishuConnection = {
  connected: boolean;
  configured: boolean;
  name: string | null;
  boundAt: string | null;
  bindingVersion: string | null;
  canDisconnect: boolean;
};

export const ACADEMIC_IDENTITIES = [
  "undergraduate",
  "master",
  "doctoral",
  "teacher",
] as const;
export type AcademicIdentity = (typeof ACADEMIC_IDENTITIES)[number];
export const ACADEMIC_LABELS: Record<AcademicIdentity, string> = {
  undergraduate: "本科生",
  master: "硕士生",
  doctoral: "博士生",
  teacher: "老师",
};
export const TEAM_POSITIONS = ["admin", "advisor", "leader", "member"] as const;
export type TeamPosition = (typeof TEAM_POSITIONS)[number];
export const POSITION_META: Record<
  TeamPosition,
  { label: string; description: string }
> = {
  admin: {
    label: "管理员",
    description: "管理成员职务、确认身份、管理所有项目与任务",
  },
  advisor: {
    label: "指导老师",
    description: "安排任务负责人、验收成果、通过或打回",
  },
  leader: {
    label: "队长",
    description: "创建实验室和竞赛项目，协调任务指派；验收需指导老师或管理员",
  },
  member: { label: "队员", description: "认领任务、提交自己的成果和修改重交" },
};

export function positionsFromRole(role: TeamRole): TeamPosition[] {
  return [
    role === "admin" ? "admin" : role === "teacher" ? "advisor" : "member",
  ];
}
export function roleFromPositions(
  positions: readonly TeamPosition[],
): TeamRole {
  return positions.includes("admin")
    ? "admin"
    : positions.includes("advisor")
      ? "teacher"
      : "student";
}
export type TaskPermissions = {
  actions: TaskAction[];
  submitForOthers: boolean;
  unclaimForOthers: boolean;
};
export function capabilitiesFor(
  positions: readonly TeamPosition[],
  kind?: ProjectKind | null,
) {
  const admin = positions.includes("admin");
  const advisor = positions.includes("advisor");
  const execute =
    admin || positions.includes("member") || positions.includes("leader");
  const coordinate =
    admin ||
    advisor ||
    (positions.includes("leader") && (kind === "lab" || kind === "contest"));
  const actions: TaskAction[] = ["create", "update"];
  if (execute) actions.push("claim", "submit", "resubmit", "unclaim");
  if (coordinate) actions.push("assign", "unclaim");
  if (admin || advisor) actions.push("accept", "reject", "reopen", "delete");
  return {
    manageMembers: admin,
    manageProject:
      admin ||
      (positions.includes("leader") && (kind === "lab" || kind === "contest")),
    execute,
    review: admin || advisor,
    task: {
      actions: [...new Set(actions)],
      submitForOthers: admin,
      unclaimForOthers: coordinate,
    } satisfies TaskPermissions,
  };
}
