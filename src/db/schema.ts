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
  "deputy",
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

// notify：关注保留取消墓碑，偏好和投递幂等独立于历史消息。
export const notificationPreferences = pgTable("notification_preferences", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  taskUpdates: boolean("task_updates").notNull().default(true),
  discussions: boolean("discussions").notNull().default(true),
  mentions: boolean("mentions").notNull().default(true),
  resourceUpdates: boolean("resource_updates").notNull().default(true),
  reminders: boolean("reminders").notNull().default(true),
  showBubble: boolean("show_bubble").notNull().default(true),
  version: integer("version").notNull().default(1), updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [check("notification_preferences_version_check", sql`${t.version} > 0`)]);
export const notificationFollows = pgTable("notification_follows", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
  taskId: uuid("task_id").references(() => tasks.id, { onDelete: "cascade" }),
  resourceId: uuid("resource_id").references(() => teamResources.id, { onDelete: "cascade" }),
  active: boolean("active").notNull().default(true), version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at").notNull().defaultNow(), updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("notification_follows_project_unique").on(t.userId, t.projectId), uniqueIndex("notification_follows_task_unique").on(t.userId, t.taskId), uniqueIndex("notification_follows_resource_unique").on(t.userId, t.resourceId), index("notification_follows_targets_idx").on(t.projectId, t.taskId, t.resourceId), check("notification_follows_target_check", sql`num_nonnulls(${t.projectId}, ${t.taskId}, ${t.resourceId}) = 1`), check("notification_follows_version_check", sql`${t.version} > 0`)]);
export const collaborationNotificationEvents = pgTable("collaboration_notification_events", {
  id: uuid("id").primaryKey().defaultRandom(), actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
  taskId: uuid("task_id").references(() => tasks.id, { onDelete: "cascade" }),
  resourceId: uuid("resource_id").references(() => teamResources.id, { onDelete: "cascade" }),
  eventKey: text("event_key").notNull(), createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("collaboration_notification_events_key_unique").on(t.eventKey), check("collaboration_notification_events_target_check", sql`num_nonnulls(${t.projectId}, ${t.taskId}, ${t.resourceId}) = 1`)]);

// tasks：组织信息单独版本化，既有任务五态和表块保持原样。
export const projectTaskLabels = pgTable("project_task_labels", {
  id: uuid("id").primaryKey().defaultRandom(), projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(), color: text("color").$type<"brand" | "slate" | "cyan" | "green" | "amber" | "red" | "violet">().notNull().default("brand"),
  version: integer("version").notNull().default(1), createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(), updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [index("project_task_labels_project_idx").on(t.projectId), uniqueIndex("project_task_labels_name_unique").on(t.projectId, sql`lower(${t.name})`), check("project_task_labels_name_check", sql`char_length(btrim(${t.name})) between 1 and 40`), check("project_task_labels_color_check", sql`${t.color} in ('brand', 'slate', 'cyan', 'green', 'amber', 'red', 'violet')`), check("project_task_labels_version_check", sql`${t.version} > 0`)]);
export const taskLabelAssignments = pgTable("task_label_assignments", {
  taskId: uuid("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }), labelId: uuid("label_id").notNull().references(() => projectTaskLabels.id, { onDelete: "cascade" }),
}, (t) => [uniqueIndex("task_label_assignments_pair_unique").on(t.taskId, t.labelId)]);
export const taskDependencies = pgTable("task_dependencies", {
  id: uuid("id").primaryKey().defaultRandom(), projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  blockerTaskId: uuid("blocker_task_id").notNull().references(() => tasks.id, { onDelete: "restrict" }), blockedTaskId: uuid("blocked_task_id").notNull().references(() => tasks.id, { onDelete: "restrict" }),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }), createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("task_dependencies_pair_unique").on(t.blockerTaskId, t.blockedTaskId), index("task_dependencies_project_idx").on(t.projectId), index("task_dependencies_blocked_idx").on(t.blockedTaskId), check("task_dependencies_self_check", sql`${t.blockerTaskId} <> ${t.blockedTaskId}`)]);
export const taskOrganizationStates = pgTable("task_organization_states", {
  taskId: uuid("task_id").primaryKey().references(() => tasks.id, { onDelete: "cascade" }), version: integer("version").notNull().default(1), updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [check("task_organization_states_version_check", sql`${t.version} > 0`)]);

// resources：目录、互链、评论和协作者授权独立追加。
export const resourceFolders = pgTable("resource_folders", {
  id: uuid("id").primaryKey().defaultRandom(),
  teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
  parentId: uuid("parent_id").references((): AnyPgColumn => resourceFolders.id, { onDelete: "restrict" }),
  name: text("name").notNull(), version: integer("version").notNull().default(1),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(), updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [index("resource_folders_scope_idx").on(t.teamId, t.projectId), check("resource_folders_version_check", sql`${t.version} > 0`), check("resource_folders_name_check", sql`char_length(btrim(${t.name})) between 1 and 80`)]);
export const resourcePlacements = pgTable("resource_placements", {
  resourceId: uuid("resource_id").primaryKey().references(() => teamResources.id, { onDelete: "cascade" }),
  folderId: uuid("folder_id").references(() => resourceFolders.id, { onDelete: "restrict" }),
  pinned: boolean("pinned").notNull().default(false), version: integer("version").notNull().default(1),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [index("resource_placements_folder_idx").on(t.folderId), check("resource_placements_version_check", sql`${t.version} > 0`)]);
export const resourceLinks = pgTable("resource_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  sourceResourceId: uuid("source_resource_id").notNull().references(() => teamResources.id, { onDelete: "cascade" }),
  targetResourceId: uuid("target_resource_id").references(() => teamResources.id, { onDelete: "cascade" }),
  targetTaskId: uuid("target_task_id").references(() => tasks.id, { onDelete: "cascade" }),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }), createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("resource_links_resource_pair_idx").on(t.sourceResourceId, t.targetResourceId), uniqueIndex("resource_links_task_pair_idx").on(t.sourceResourceId, t.targetTaskId), check("resource_links_target_check", sql`(${t.targetResourceId} is not null and ${t.targetTaskId} is null and ${t.sourceResourceId} <> ${t.targetResourceId}) or (${t.targetResourceId} is null and ${t.targetTaskId} is not null)`)]);
export const resourceCollaboration = pgTable("resource_collaboration", {
  resourceId: uuid("resource_id").primaryKey().references(() => teamResources.id, { onDelete: "cascade" }),
  commentScope: text("comment_scope").$type<"team" | "collaborators">().notNull().default("team"),
  version: integer("version").notNull().default(1), updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [check("resource_collaboration_scope_check", sql`${t.commentScope} in ('team', 'collaborators')`), check("resource_collaboration_version_check", sql`${t.version} > 0`)]);
export const resourceCollaborators = pgTable("resource_collaborators", {
  id: uuid("id").primaryKey().defaultRandom(),
  resourceId: uuid("resource_id").notNull().references(() => teamResources.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  permission: text("permission").$type<"comment" | "edit">().notNull(), grantedById: uuid("granted_by_id").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("resource_collaborators_pair_idx").on(t.resourceId, t.userId), check("resource_collaborators_permission_check", sql`${t.permission} in ('comment', 'edit')`)]);
export const resourceComments = pgTable("resource_comments", {
  id: uuid("id").primaryKey().defaultRandom(), resourceId: uuid("resource_id").notNull().references(() => teamResources.id, { onDelete: "cascade" }),
  parentId: uuid("parent_id").references((): AnyPgColumn => resourceComments.id, { onDelete: "cascade" }),
  body: text("body").notNull(), resourceVersion: integer("resource_version").notNull(), selectedQuote: text("selected_quote"), line: integer("line"),
  version: integer("version").notNull().default(1), withdrawn: boolean("withdrawn").notNull().default(false), resolved: boolean("resolved").notNull().default(false),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(), updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [index("resource_comments_resource_idx").on(t.resourceId, t.createdAt), check("resource_comments_version_check", sql`${t.version} > 0 and ${t.resourceVersion} > 0`), check("resource_comments_body_check", sql`char_length(btrim(${t.body})) between 1 and 10000`), check("resource_comments_anchor_check", sql`(${t.line} is null or ${t.line} > 0) and (${t.selectedQuote} is null or char_length(${t.selectedQuote}) <= 2000)`)]);
export const resourceCommentRevisions = pgTable("resource_comment_revisions", {
  id: uuid("id").primaryKey().defaultRandom(), commentId: uuid("comment_id").notNull().references(() => resourceComments.id, { onDelete: "cascade" }),
  version: integer("version").notNull(), body: text("body").notNull(), kind: text("kind").$type<"create" | "edit" | "withdraw" | "resolve" | "reopen">().notNull(),
  changedById: uuid("changed_by_id").references(() => users.id, { onDelete: "set null" }), createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("resource_comment_revisions_version_idx").on(t.commentId, t.version)]);

// tasks：行动项保留明确的文档来源与防重键。
export const taskActionItemOrigins = pgTable("task_action_item_origins", {
  id: uuid("id").primaryKey().defaultRandom(), taskId: uuid("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  resourceId: uuid("resource_id").notNull().references(() => teamResources.id, { onDelete: "restrict" }), resourceTitle: text("resource_title").notNull(),
  sourceVersion: integer("source_version").notNull(), quote: text("quote"), requestKey: uuid("request_key").notNull(),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }), createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("task_action_item_origins_task_unique").on(t.taskId), uniqueIndex("task_action_item_origins_request_unique").on(t.resourceId, t.requestKey), check("task_action_item_origins_version_check", sql`${t.sourceVersion} > 0`)]);

// calendar：提醒不把私人日程转为团队任务。
export const personalScheduleReminders = pgTable("personal_schedule_reminders", {
  scheduleId: uuid("schedule_id").primaryKey().references(() => personalSchedules.id, { onDelete: "cascade" }),
  enabled: boolean("enabled").notNull().default(false), minutes: integer("minutes").notNull().default(15), version: integer("version").notNull().default(1),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [check("personal_schedule_reminders_minutes_check", sql`${t.minutes} in (0, 5, 10, 15, 30, 60, 1440)`), check("personal_schedule_reminders_version_check", sql`${t.version} > 0`)]);
export const personalReminderDeliveries = pgTable("personal_reminder_deliveries", {
  id: uuid("id").primaryKey().defaultRandom(), scheduleId: uuid("schedule_id").notNull().references(() => personalSchedules.id, { onDelete: "cascade" }),
  scheduleVersion: integer("schedule_version").notNull(), reminderVersion: integer("reminder_version").notNull(),
  notificationId: uuid("notification_id").references(() => notifications.id, { onDelete: "set null" }), deliveredAt: timestamp("delivered_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("personal_reminder_deliveries_version_unique").on(t.scheduleId, t.scheduleVersion, t.reminderVersion)]);

// discussions：每个版本的成员提及快照，编辑不能抹去原提及。
export const taskDiscussionMentions = pgTable("task_discussion_mentions", {
  id: uuid("id").primaryKey().defaultRandom(), postId: uuid("post_id").notNull().references(() => taskDiscussionPosts.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }), version: integer("version").notNull(), nameSnapshot: text("name_snapshot").notNull(),
}, (t) => [uniqueIndex("task_discussion_mentions_version_unique").on(t.postId, t.version, t.userId)]);

// identity：项目目录仅组织入口，不改变项目所属团队和授权。
export const projectSpaces = pgTable("project_spaces", {
  id: uuid("id").primaryKey().defaultRandom(), teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  parentId: uuid("parent_id").references((): AnyPgColumn => projectSpaces.id, { onDelete: "restrict" }),
  name: text("name").notNull(), version: integer("version").notNull().default(1), updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [index("project_spaces_team_idx").on(t.teamId), check("project_spaces_version_check", sql`${t.version} > 0`), check("project_spaces_name_check", sql`char_length(btrim(${t.name})) between 1 and 80`)]);
export const projectSpaceAssignments = pgTable("project_space_assignments", {
  projectId: uuid("project_id").primaryKey().references(() => projects.id, { onDelete: "cascade" }), spaceId: uuid("space_id").references(() => projectSpaces.id, { onDelete: "restrict" }),
  version: integer("version").notNull().default(1), updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [check("project_space_assignments_version_check", sql`${t.version} > 0`)]);

export const resourceCommentMentions = pgTable("resource_comment_mentions", {
  id: uuid("id").primaryKey().defaultRandom(),
  commentId: uuid("comment_id").notNull().references(() => resourceComments.id, { onDelete: "cascade" }),
  commentVersion: integer("comment_version").notNull(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  name: text("name").notNull(), createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("resource_comment_mentions_version_idx").on(t.commentId, t.commentVersion, t.userId), check("resource_comment_mentions_version_check", sql`${t.commentVersion} > 0`)]);

// board：私人保存项仅复用公开筛选，不存任意跳转地址。
export const personalTaskViews = pgTable("personal_task_views", {
  id: uuid("id").primaryKey().defaultRandom(), userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }), name: text("name").notNull(),
  layout: text("layout").$type<"tasks" | "board" | "table">().notNull(), groupBy: text("group_by").$type<"status" | "assignee" | "priority" | "milestone">().notNull(),
  filters: jsonb("filters").$type<{ status?: string[]; priority?: string[]; assigneeId?: string; milestoneId?: string; labelId?: string; blocked?: boolean; q?: string }>().notNull(),
  schemaVersion: integer("schema_version").notNull().default(1), version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at").notNull().defaultNow(), updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("personal_task_views_name_unique").on(t.userId, t.projectId, sql`lower(${t.name})`), index("personal_task_views_user_project_idx").on(t.userId, t.projectId), check("personal_task_views_name_check", sql`char_length(btrim(${t.name})) between 1 and 80`), check("personal_task_views_layout_check", sql`${t.layout} in ('tasks', 'board', 'table')`), check("personal_task_views_group_check", sql`${t.groupBy} in ('status', 'assignee', 'priority', 'milestone')`), check("personal_task_views_schema_check", sql`${t.schemaVersion} = 1`), check("personal_task_views_version_check", sql`${t.version} > 0`)]);

export const resourceFolderCategories = pgTable("resource_folder_categories", {
  folderId: uuid("folder_id").primaryKey().references(() => resourceFolders.id, { onDelete: "cascade" }),
  category: text("category").$type<"general" | "specification" | "research" | "delivery" | "meeting">().notNull().default("general"),
}, (t) => [check("resource_folder_categories_category_check", sql`${t.category} in ('general', 'specification', 'research', 'delivery', 'meeting')`)]);

export const resourceTrash = pgTable("resource_trash", {
  resourceId: uuid("resource_id").primaryKey().references(() => teamResources.id, { onDelete: "cascade" }),
  version: integer("version").notNull().default(1),
  trashedById: uuid("trashed_by_id").references(() => users.id, { onDelete: "set null" }),
  trashedAt: timestamp("trashed_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [check("resource_trash_version_check", sql`${t.version} > 0`)]);

export const deliveryBatches = pgTable("delivery_batches", {
  id: uuid("id").primaryKey().defaultRandom(),
  teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(), description: text("description").notNull().default(""),
  ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
  dueDate: date("due_date", { mode: "string" }),
  checklist: jsonb("checklist").$type<import("@/modules/delivery/client").DeliveryCheck[]>().notNull().default([]),
  status: text("status").$type<"draft" | "completed">().notNull().default("draft"),
  archived: boolean("archived").notNull().default(false), version: integer("version").notNull().default(1),
  completedById: uuid("completed_by_id").references(() => users.id, { onDelete: "set null" }),
  completedAt: timestamp("completed_at"),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(), updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [index("delivery_batches_project_idx").on(t.projectId), check("delivery_batches_name_check", sql`char_length(btrim(${t.name})) between 1 and 120`), check("delivery_batches_status_check", sql`${t.status} in ('draft', 'completed')`), check("delivery_batches_version_check", sql`${t.version} > 0`)]);

export const deliveryEntries = pgTable("delivery_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  batchId: uuid("batch_id").notNull().references(() => deliveryBatches.id, { onDelete: "cascade" }),
  taskId: uuid("task_id").notNull().references(() => tasks.id, { onDelete: "restrict" }),
  submissionId: uuid("submission_id").notNull().references(() => taskSubmissions.id, { onDelete: "restrict" }),
  snapshot: jsonb("snapshot").$type<import("@/modules/tasks").ApprovedTaskSubmission>().notNull(),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("delivery_entries_batch_task_unique").on(t.batchId, t.taskId), index("delivery_entries_submission_idx").on(t.submissionId)]);

export const deliveryIssues = pgTable("delivery_issues", {
  id: uuid("id").primaryKey().defaultRandom(),
  batchId: uuid("batch_id").notNull().references(() => deliveryBatches.id, { onDelete: "cascade" }),
  taskId: uuid("task_id").references(() => tasks.id, { onDelete: "restrict" }),
  title: text("title").notNull(), detail: text("detail").notNull().default(""),
  ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
  resolution: text("resolution"), resolved: boolean("resolved").notNull().default(false),
  version: integer("version").notNull().default(1),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(), updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [index("delivery_issues_batch_idx").on(t.batchId), check("delivery_issues_title_check", sql`char_length(btrim(${t.title})) between 1 and 200`), check("delivery_issues_version_check", sql`${t.version} > 0`)]);

export const deliveryRecords = pgTable("delivery_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  batchId: uuid("batch_id").notNull().references(() => deliveryBatches.id, { onDelete: "restrict" }),
  action: text("action").$type<import("@/modules/delivery/client").DeliveryRecordAction>().notNull(),
  version: integer("version").notNull(),
  actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
  nameSnapshot: text("name_snapshot"),
  snapshot: jsonb("snapshot").$type<import("@/modules/delivery/client").DeliverySnapshot>().notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("delivery_records_batch_version_unique").on(t.batchId, t.version), check("delivery_records_version_check", sql`${t.version} > 0`), check("delivery_records_action_check", sql`${t.action} in ('create', 'edit', 'bind', 'unbind', 'issue', 'resolve', 'reopenIssue', 'complete', 'reopen', 'archive', 'restore')`)]);

// ============================================================
// comments：项目评论（师生都可发表，作者可编辑/撤回）
// ============================================================

export const projectComments = pgTable("project_comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  parentId: uuid("parent_id").references((): AnyPgColumn => projectComments.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  version: integer("version").notNull().default(1),
  withdrawn: boolean("withdrawn").notNull().default(false),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(), updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [index("project_comments_project_idx").on(t.projectId, t.createdAt), check("project_comments_version_check", sql`${t.version} > 0`), check("project_comments_body_check", sql`char_length(btrim(${t.body})) between 1 and 10000`)]);

// ============================================================
// assets：团队级资源池与占用申请
// ============================================================

export const assets = pgTable("assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  totalQuantity: integer("total_quantity").notNull(),
  note: text("note").notNull().default(""),
  version: integer("version").notNull().default(1),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(), updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [index("assets_team_idx").on(t.teamId), check("assets_name_check", sql`char_length(btrim(${t.name})) between 1 and 80`), check("assets_quantity_check", sql`${t.totalQuantity} > 0`), check("assets_version_check", sql`${t.version} > 0`)]);

export const assetRequests = pgTable("asset_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  assetId: uuid("asset_id").notNull().references(() => assets.id, { onDelete: "cascade" }),
  applicantId: uuid("applicant_id").references(() => users.id, { onDelete: "set null" }),
  quantity: integer("quantity").notNull(),
  purpose: text("purpose").notNull().default(""),
  status: text("status").$type<"pending" | "approved" | "rejected" | "returned" | "withdrawn">().notNull().default("pending"),
  decidedById: uuid("decided_by_id").references(() => users.id, { onDelete: "set null" }),
  decidedAt: timestamp("decided_at"),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at").notNull().defaultNow(), updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [index("asset_requests_asset_idx").on(t.assetId), index("asset_requests_applicant_idx").on(t.applicantId), check("asset_requests_quantity_check", sql`${t.quantity} > 0`), check("asset_requests_status_check", sql`${t.status} in ('pending', 'approved', 'rejected', 'returned', 'withdrawn')`), check("asset_requests_version_check", sql`${t.version} > 0`)]);
