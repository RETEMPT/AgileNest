import type { ProjectKind, TaskAction, TeamRole } from "@/db/schema";
export { projectDirectorySchema, projectSpacePath, projectSpaceMoveError, projectSpaceMutationSchema, PROJECT_SPACE_DEPTH } from "./space-client";
export type { ProjectDirectoryDTO, ProjectSpaceDTO, ProjectSpaceMutation } from "./space-client";
export type { TeamInformationDTO, TeamAnnouncementDTO } from "./team-client";

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
export const TEAM_POSITIONS = ["admin", "deputy", "advisor", "leader", "member"] as const;
export type TeamPosition = (typeof TEAM_POSITIONS)[number];
export const POSITION_META: Record<
  TeamPosition,
  { label: string; description: string }
> = {
  admin: {
    label: "管理员",
    description: "管理团队权限与职务、确认身份，并负责全部项目和验收",
  },
  deputy: {
    label: "副管理员",
    description: "维护团队资料与公告、整理目录和资料，协调全部项目、指派与验收；不可授予职务",
  },
  advisor: {
    label: "指导老师",
    description: "安排任务负责人、验收成果、通过或打回",
  },
  leader: {
    label: "队长",
    description: "创建实验室和竞赛项目，协调这些项目的任务指派；验收由管理员、副管理员或指导老师处理",
  },
  member: { label: "组员", description: "认领任务、提交自己的成果和修改重交" },
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
    : positions.includes("advisor") || positions.includes("deputy")
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
  const deputy = positions.includes("deputy");
  const manageDaily = admin || deputy;
  const advisor = positions.includes("advisor");
  const execute =
    manageDaily || positions.includes("member") || positions.includes("leader");
  const coordinate =
    manageDaily ||
    advisor ||
    (positions.includes("leader") && (kind === "lab" || kind === "contest"));
  const actions: TaskAction[] = ["create", "update"];
  if (execute) actions.push("claim", "submit", "resubmit", "unclaim");
  if (coordinate) actions.push("assign", "unclaim");
  if (manageDaily || advisor) actions.push("accept", "reject", "reopen", "delete");
  return {
    manageMembers: admin,
    manageTeamInformation: manageDaily,
    manageProjectDirectory: manageDaily,
    manageResources: manageDaily,
    manageProject:
      manageDaily ||
      (positions.includes("leader") && (kind === "lab" || kind === "contest")),
    execute,
    review: manageDaily || advisor,
    task: {
      actions: [...new Set(actions)],
      submitForOthers: admin,
      unclaimForOthers: coordinate,
    } satisfies TaskPermissions,
  };
}

export function canRemoveTeamMember(actorPositions: readonly TeamPosition[], targetPositions: readonly TeamPosition[]) {
  return actorPositions.includes("admin") || (actorPositions.includes("deputy") && !targetPositions.some((position) => position === "admin" || position === "deputy"));
}
