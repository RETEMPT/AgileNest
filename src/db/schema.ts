import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  uniqueIndex,
  date,
  integer,
  doublePrecision,
  index,
  check,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ============================================================
// identity：users / teams / team_members / projects
// ============================================================

export const teamRoleEnum = pgEnum("team_role", ["admin", "teacher", "student"]);
export type TeamRole = (typeof teamRoleEnum.enumValues)[number];

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  feishuOpenId: text("feishu_open_id").unique(),
  feishuName: text("feishu_name"),
  feishuBoundAt: timestamp("feishu_bound_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const teams = pgTable("teams", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  inviteCode: text("invite_code").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const teamMembers = pgTable(
  "team_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: teamRoleEnum("role").notNull().default("student"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("team_members_team_user_unique").on(t.teamId, t.userId)],
);

export const projectStatusEnum = pgEnum("project_status", ["active", "archived"]);
export const projectKindEnum = pgEnum("project_kind", ["course", "lab", "contest"]);
export type ProjectStatus = (typeof projectStatusEnum.enumValues)[number];
export type ProjectKind = (typeof projectKindEnum.enumValues)[number];

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    kind: projectKindEnum("kind"),
    status: projectStatusEnum("status").notNull().default("active"),
    startDate: date("start_date"),
    endDate: date("end_date"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("projects_team_idx").on(t.teamId)],
);

// ============================================================
// milestone
// ============================================================

export const milestoneKindEnum = pgEnum("milestone_kind", [
  "open_topic",
  "midterm",
  "final",
  "defense",
  "custom",
]);
export const milestoneStatusEnum = pgEnum("milestone_status", ["open", "done"]);
export type MilestoneKind = (typeof milestoneKindEnum.enumValues)[number];
export type MilestoneStatus = (typeof milestoneStatusEnum.enumValues)[number];

export const milestones = pgTable(
  "milestones",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    kind: milestoneKindEnum("kind").notNull().default("custom"),
    targetDate: date("target_date"),
    status: milestoneStatusEnum("status").notNull().default("open"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("milestones_project_idx").on(t.projectId)],
);

// ============================================================
// tasks（五态状态机）
// ============================================================

export const taskStatusEnum = pgEnum("task_status", [
  "unclaimed",
  "in_progress",
  "submitted",
  "accepted",
  "rejected",
]);
export const taskPriorityEnum = pgEnum("task_priority", ["low", "medium", "high"]);
export type TaskStatus = (typeof taskStatusEnum.enumValues)[number];
export type TaskPriority = (typeof taskPriorityEnum.enumValues)[number];

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    milestoneId: uuid("milestone_id").references(() => milestones.id, {
      onDelete: "set null",
    }),
    parentTaskId: uuid("parent_task_id").references((): AnyPgColumn => tasks.id, {
      onDelete: "cascade",
    }),
    title: text("title").notNull(),
    description: text("description"),
    completionNote: text("completion_note"),
    rejectReason: text("reject_reason"),
    assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    startDate: date("start_date"),
    dueDate: date("due_date"),
    estimatedMinutes: integer("estimated_minutes"),
    status: taskStatusEnum("status").notNull().default("unclaimed"),
    priority: taskPriorityEnum("priority").notNull().default("medium"),
    claimedAt: timestamp("claimed_at"),
    submittedAt: timestamp("submitted_at"),
    acceptedAt: timestamp("accepted_at"),
    acceptedById: uuid("accepted_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    rejectedAt: timestamp("rejected_at"),
    rejectedById: uuid("rejected_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    sortOrder: doublePrecision("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("tasks_project_idx").on(t.projectId),
    index("tasks_assignee_idx").on(t.assigneeId),
    index("tasks_parent_idx").on(t.parentTaskId),
    index("tasks_status_idx").on(t.status),
  ],
);

// ============================================================
// review：任务流转审计（活动流）
// ============================================================

export const taskActionEnum = pgEnum("task_action", [
  "claim",
  "unclaim",
  "assign",
  "submit",
  "resubmit",
  "accept",
  "reject",
  "reopen",
  "update",
  "create",
  "delete",
]);
export type TaskAction = (typeof taskActionEnum.enumValues)[number];

export const taskAcceptanceEvents = pgTable(
  "task_acceptance_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: taskActionEnum("action").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("task_events_task_idx").on(t.taskId)],
);

// ============================================================
// worklog：工时登记
// ============================================================

export const worklogs = pgTable(
  "worklogs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workDate: date("work_date").notNull(),
    minutes: integer("minutes").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("worklogs_task_idx").on(t.taskId),
    index("worklogs_user_date_idx").on(t.userId, t.workDate),
  ],
);

// ============================================================
// notify：站内消息（骨架）
// ============================================================

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    link: text("link"),
    readAt: timestamp("read_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("notifications_user_idx").on(t.userId)],
);

// identity：学术信息与团队职务独立，保留既有登录与角色字段。
export const academicIdentityEnum = pgEnum("academic_identity", [
  "undergraduate",
  "master",
  "doctoral",
  "teacher",
]);
export const teamPositionEnum = pgEnum("team_position", [
  "admin",
  "advisor",
  "leader",
  "member",
]);
export const academicProfiles = pgTable("academic_profiles", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  identity: academicIdentityEnum("identity").notNull(),
  institution: text("institution").notNull().default(""),
  department: text("department").notNull().default(""),
  researchFocus: text("research_focus").notNull().default(""),
  version: integer("version").notNull().default(1),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export const memberPositions = pgTable("member_positions", {
  membershipId: uuid("membership_id")
    .primaryKey()
    .references(() => teamMembers.id, { onDelete: "cascade" }),
  positions: teamPositionEnum("positions").array().notNull(),
  updatedById: uuid("updated_by_id").references(() => users.id, {
    onDelete: "set null",
  }),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export const academicConfirmations = pgTable("academic_confirmations", {
  membershipId: uuid("membership_id")
    .primaryKey()
    .references(() => teamMembers.id, { onDelete: "cascade" }),
  profileVersion: integer("profile_version").notNull(),
  confirmedById: uuid("confirmed_by_id").references(() => users.id, {
    onDelete: "set null",
  }),
  confirmedAt: timestamp("confirmed_at").notNull().defaultNow(),
});

export const personalProfiles = pgTable("personal_profiles", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  bio: text("bio").notNull().default(""),
  avatarData: text("avatar_data"),
  avatarHash: text("avatar_hash"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// calendar：个人日程独立于项目任务，仅本人可读写。
export const personalSchedules = pgTable("personal_schedules", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  scheduleDate: date("schedule_date").notNull(),
  startTime: text("start_time"),
  endTime: text("end_time"),
  priority: integer("priority").$type<0 | 1 | 2>().notNull().default(0),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("personal_schedules_user_date_idx").on(t.userId, t.scheduleDate),
  check("personal_schedules_title_check", sql`char_length(btrim(${t.title})) between 1 and 100`),
  check("personal_schedules_description_check", sql`char_length(${t.description}) <= 500`),
  check("personal_schedules_date_check", sql`${t.scheduleDate} between date '1900-01-01' and date '2100-12-31'`),
  check("personal_schedules_priority_check", sql`${t.priority} between 0 and 2`),
  check("personal_schedules_version_check", sql`${t.version} > 0`),
  check("personal_schedules_time_check", sql`(${t.startTime} is null and ${t.endTime} is null) or (${t.startTime} is not null and ${t.endTime} is not null and ${t.startTime} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and ${t.endTime} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and ${t.startTime} < ${t.endTime})`),
]);

export const personalContacts = pgTable("personal_contacts", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  phone: text("phone").notNull().default(""),
  contactEmail: text("contact_email").notNull().default(""),
  officeAddress: text("office_address").notNull().default(""),
  qq: text("qq").notNull().default(""),
  wechat: text("wechat").notNull().default(""),
  x: text("x").notNull().default(""),
  github: text("github").notNull().default(""),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

import { boolean, jsonb } from "drizzle-orm/pg-core";

// identity：团队资料和公告不复用私有个人资料。
export const teamProfiles = pgTable("team_profiles", {
  teamId: uuid("team_id").primaryKey().references(() => teams.id, { onDelete: "cascade" }),
  description: text("description").notNull().default(""),
  website: text("website"),
  contactEmail: text("contact_email"),
  version: integer("version").notNull().default(1),
  inviteExpiresOn: date("invite_expires_on"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export const teamAnnouncements = pgTable("team_announcements", {
  id: uuid("id").primaryKey().defaultRandom(),
  teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  title: text("title").notNull(), body: text("body").notNull(),
  pinned: boolean("pinned").notNull().default(false), version: integer("version").notNull().default(1),
  authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
  updatedById: uuid("updated_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(), updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [index("team_announcements_team_idx").on(t.teamId)]);

// resources：文件内容不可覆盖，文档编辑保留历史；提交引用阻止删除证据。
export const teamResources = pgTable("team_resources", {
  id: uuid("id").primaryKey().defaultRandom(),
  teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
  kind: text("kind").$type<"file" | "document" | "link">().notNull(),
  title: text("title").notNull(), body: text("body"), url: text("url"),
  fileName: text("file_name"), mimeType: text("mime_type"), size: integer("size").notNull().default(0),
  contentBase64: text("content_base64"),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  category: text("category").notNull().default("general"),
  version: integer("version").notNull().default(1),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
  updatedById: uuid("updated_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(), updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [index("team_resources_scope_idx").on(t.teamId, t.projectId)]);
export const resourceRevisions = pgTable("resource_revisions", {
  id: uuid("id").primaryKey().defaultRandom(),
  resourceId: uuid("resource_id").notNull().references(() => teamResources.id, { onDelete: "cascade" }),
  version: integer("version").notNull(), title: text("title").notNull(), body: text("body").notNull(),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("resource_revisions_version_idx").on(t.resourceId, t.version)]);
export const resourceReferences = pgTable("resource_references", {
  id: uuid("id").primaryKey().defaultRandom(),
  resourceId: uuid("resource_id").notNull().references(() => teamResources.id, { onDelete: "restrict" }),
  submissionId: uuid("submission_id").notNull().references(() => taskSubmissions.id, { onDelete: "cascade" }),
}, (t) => [uniqueIndex("resource_references_pair_idx").on(t.resourceId, t.submissionId)]);
export const taskRequirements = pgTable("task_requirements", {
  taskId: uuid("task_id").primaryKey().references(() => tasks.id, { onDelete: "cascade" }),
  version: integer("version").notNull().default(1),
  criteria: jsonb("criteria").$type<{ id: string; text: string }[]>().notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const taskSubmissions = pgTable("task_submissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  taskId: uuid("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  submittedById: uuid("submitted_by_id").references(() => users.id, { onDelete: "set null" }),
  submittedByName: text("submitted_by_name"),
  submittedAt: timestamp("submitted_at").notNull().defaultNow(),
  summary: text("summary").notNull(),
  verification: text("verification").notNull(),
  links: jsonb("links").$type<{ title: string; url: string }[]>().notNull(),
  resources: jsonb("resources").$type<{ id: string; title: string; fileName: string | null; mimeType: string | null; size: number }[]>().notNull(),
  criteria: jsonb("criteria").$type<{ id: string; text: string; met: boolean; note?: string }[]>().notNull(),
  source: text("source").$type<"structured" | "legacy">().notNull(),
}, (table) => [uniqueIndex("task_submissions_task_version_unique").on(table.taskId, table.version)]);

export const taskSubmissionReviews = pgTable("task_submission_reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  submissionId: uuid("submission_id").notNull().references(() => taskSubmissions.id, { onDelete: "cascade" }),
  reviewerId: uuid("reviewer_id").references(() => users.id, { onDelete: "set null" }),
  reviewerName: text("reviewer_name"),
  action: text("action").$type<"accept" | "reject">().notNull(),
  summary: text("summary").notNull(),
  checks: jsonb("checks").$type<{ criterionId: string; passed: boolean; note?: string }[]>().notNull(),
  reviewedAt: timestamp("reviewed_at").notNull().defaultNow(),
}, (table) => [uniqueIndex("task_submission_reviews_submission_unique").on(table.submissionId)]);

// discussions：讨论独立于状态机，编辑和撤回不删除原附件与历史。
export const taskDiscussionPosts = pgTable("task_discussion_posts", {
  id: uuid("id").primaryKey().defaultRandom(),
  taskId: uuid("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  parentId: uuid("parent_id").references((): AnyPgColumn => taskDiscussionPosts.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  version: integer("version").notNull().default(1),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
  withdrawn: boolean("withdrawn").notNull().default(false),
  resolved: boolean("resolved").notNull().default(false),
  resources: jsonb("resources").$type<{ id: string; title: string; fileName: string | null; mimeType: string | null; size: number }[]>().notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [index("task_discussion_posts_task_idx").on(t.taskId, t.createdAt), check("task_discussion_posts_version_check", sql`${t.version} > 0`), check("task_discussion_posts_body_check", sql`char_length(${t.body}) <= 10000`)]);
export const taskDiscussionRevisions = pgTable("task_discussion_revisions", {
  id: uuid("id").primaryKey().defaultRandom(),
  postId: uuid("post_id").notNull().references(() => taskDiscussionPosts.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  body: text("body").notNull(),
  kind: text("kind").$type<"create" | "edit" | "withdraw" | "resolve" | "reopen">().notNull(),
  changedById: uuid("changed_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("task_discussion_revisions_version_idx").on(t.postId, t.version)]);
export const discussionResourceReferences = pgTable("discussion_resource_references", {
  id: uuid("id").primaryKey().defaultRandom(),
  resourceId: uuid("resource_id").notNull().references(() => teamResources.id, { onDelete: "restrict" }),
  postId: uuid("post_id").notNull().references(() => taskDiscussionPosts.id, { onDelete: "cascade" }),
}, (t) => [uniqueIndex("discussion_resource_references_pair_idx").on(t.resourceId, t.postId)]);
