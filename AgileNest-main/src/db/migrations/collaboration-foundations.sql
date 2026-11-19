-- Append-only collaboration foundations; existing data and migrations are preserved.

CREATE TABLE IF NOT EXISTS "notification_preferences" (
  "user_id" uuid PRIMARY KEY,
  "task_updates" boolean NOT NULL DEFAULT true,
  "discussions" boolean NOT NULL DEFAULT true,
  "mentions" boolean NOT NULL DEFAULT true,
  "resource_updates" boolean NOT NULL DEFAULT true,
  "reminders" boolean NOT NULL DEFAULT true,
  "show_bubble" boolean NOT NULL DEFAULT true,
  "version" integer NOT NULL DEFAULT 1,
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "notification_preferences_version_check" CHECK ("version" > 0)
);

CREATE TABLE IF NOT EXISTS "notification_follows" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "project_id" uuid,
  "task_id" uuid,
  "resource_id" uuid,
  "active" boolean NOT NULL DEFAULT true,
  "version" integer NOT NULL DEFAULT 1,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "notification_follows_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "notification_follows_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE,
  CONSTRAINT "notification_follows_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE,
  CONSTRAINT "notification_follows_resource_id_team_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "team_resources"("id") ON DELETE CASCADE,
  CONSTRAINT "notification_follows_target_check" CHECK (num_nonnulls("project_id", "task_id", "resource_id") = 1),
  CONSTRAINT "notification_follows_version_check" CHECK ("version" > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS "notification_follows_project_unique" ON "notification_follows" ("user_id", "project_id");
CREATE UNIQUE INDEX IF NOT EXISTS "notification_follows_task_unique" ON "notification_follows" ("user_id", "task_id");
CREATE UNIQUE INDEX IF NOT EXISTS "notification_follows_resource_unique" ON "notification_follows" ("user_id", "resource_id");
CREATE INDEX IF NOT EXISTS "notification_follows_targets_idx" ON "notification_follows" ("project_id", "task_id", "resource_id");

CREATE TABLE IF NOT EXISTS "collaboration_notification_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "actor_id" uuid,
  "project_id" uuid,
  "task_id" uuid,
  "resource_id" uuid,
  "event_key" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "collaboration_notification_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "collaboration_notification_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE,
  CONSTRAINT "collaboration_notification_events_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE,
  CONSTRAINT "collaboration_notification_events_resource_id_team_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "team_resources"("id") ON DELETE CASCADE,
  CONSTRAINT "collaboration_notification_events_target_check" CHECK (num_nonnulls("project_id", "task_id", "resource_id") = 1)
);
CREATE UNIQUE INDEX IF NOT EXISTS "collaboration_notification_events_key_unique" ON "collaboration_notification_events" ("event_key");

CREATE TABLE IF NOT EXISTS "project_task_labels" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL,
  "name" text NOT NULL,
  "color" text NOT NULL DEFAULT 'brand',
  "version" integer NOT NULL DEFAULT 1,
  "created_by_id" uuid,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "project_task_labels_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE,
  CONSTRAINT "project_task_labels_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "project_task_labels_name_check" CHECK (char_length(btrim("name")) between 1 and 40),
  CONSTRAINT "project_task_labels_color_check" CHECK ("color" in ('brand', 'slate', 'cyan', 'green', 'amber', 'red', 'violet')),
  CONSTRAINT "project_task_labels_version_check" CHECK ("version" > 0)
);
CREATE INDEX IF NOT EXISTS "project_task_labels_project_idx" ON "project_task_labels" ("project_id");
CREATE UNIQUE INDEX IF NOT EXISTS "project_task_labels_name_unique" ON "project_task_labels" ("project_id", lower("name"));

CREATE TABLE IF NOT EXISTS "task_label_assignments" (
  "task_id" uuid NOT NULL,
  "label_id" uuid NOT NULL,
  CONSTRAINT "task_label_assignments_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE,
  CONSTRAINT "task_label_assignments_label_id_project_task_labels_id_fk" FOREIGN KEY ("label_id") REFERENCES "project_task_labels"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "task_label_assignments_pair_unique" ON "task_label_assignments" ("task_id", "label_id");

CREATE TABLE IF NOT EXISTS "task_dependencies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL,
  "blocker_task_id" uuid NOT NULL,
  "blocked_task_id" uuid NOT NULL,
  "created_by_id" uuid,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "task_dependencies_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE,
  CONSTRAINT "task_dependencies_blocker_task_id_tasks_id_fk" FOREIGN KEY ("blocker_task_id") REFERENCES "tasks"("id") ON DELETE RESTRICT,
  CONSTRAINT "task_dependencies_blocked_task_id_tasks_id_fk" FOREIGN KEY ("blocked_task_id") REFERENCES "tasks"("id") ON DELETE RESTRICT,
  CONSTRAINT "task_dependencies_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "task_dependencies_self_check" CHECK ("blocker_task_id" <> "blocked_task_id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "task_dependencies_pair_unique" ON "task_dependencies" ("blocker_task_id", "blocked_task_id");
CREATE INDEX IF NOT EXISTS "task_dependencies_project_idx" ON "task_dependencies" ("project_id");
CREATE INDEX IF NOT EXISTS "task_dependencies_blocked_idx" ON "task_dependencies" ("blocked_task_id");

CREATE TABLE IF NOT EXISTS "task_organization_states" (
  "task_id" uuid PRIMARY KEY,
  "version" integer NOT NULL DEFAULT 1,
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "task_organization_states_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE,
  CONSTRAINT "task_organization_states_version_check" CHECK ("version" > 0)
);

CREATE TABLE IF NOT EXISTS "resource_folders" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "team_id" uuid NOT NULL,
  "project_id" uuid,
  "parent_id" uuid,
  "name" text NOT NULL,
  "version" integer NOT NULL DEFAULT 1,
  "created_by_id" uuid,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "resource_folders_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE,
  CONSTRAINT "resource_folders_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE,
  CONSTRAINT "resource_folders_parent_id_resource_folders_id_fk" FOREIGN KEY ("parent_id") REFERENCES "resource_folders"("id") ON DELETE RESTRICT,
  CONSTRAINT "resource_folders_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "resource_folders_version_check" CHECK ("version" > 0),
  CONSTRAINT "resource_folders_name_check" CHECK (char_length(btrim("name")) between 1 and 80)
);
CREATE INDEX IF NOT EXISTS "resource_folders_scope_idx" ON "resource_folders" ("team_id", "project_id");

CREATE TABLE IF NOT EXISTS "resource_placements" (
  "resource_id" uuid PRIMARY KEY,
  "folder_id" uuid,
  "pinned" boolean NOT NULL DEFAULT false,
  "version" integer NOT NULL DEFAULT 1,
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "resource_placements_resource_id_team_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "team_resources"("id") ON DELETE CASCADE,
  CONSTRAINT "resource_placements_folder_id_resource_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "resource_folders"("id") ON DELETE RESTRICT,
  CONSTRAINT "resource_placements_version_check" CHECK ("version" > 0)
);
CREATE INDEX IF NOT EXISTS "resource_placements_folder_idx" ON "resource_placements" ("folder_id");

CREATE TABLE IF NOT EXISTS "resource_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "source_resource_id" uuid NOT NULL,
  "target_resource_id" uuid,
  "target_task_id" uuid,
  "created_by_id" uuid,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "resource_links_source_resource_id_team_resources_id_fk" FOREIGN KEY ("source_resource_id") REFERENCES "team_resources"("id") ON DELETE CASCADE,
  CONSTRAINT "resource_links_target_resource_id_team_resources_id_fk" FOREIGN KEY ("target_resource_id") REFERENCES "team_resources"("id") ON DELETE CASCADE,
  CONSTRAINT "resource_links_target_task_id_tasks_id_fk" FOREIGN KEY ("target_task_id") REFERENCES "tasks"("id") ON DELETE CASCADE,
  CONSTRAINT "resource_links_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "resource_links_target_check" CHECK (("target_resource_id" is not null and "target_task_id" is null and "source_resource_id" <> "target_resource_id") or ("target_resource_id" is null and "target_task_id" is not null))
);
CREATE UNIQUE INDEX IF NOT EXISTS "resource_links_resource_pair_idx" ON "resource_links" ("source_resource_id", "target_resource_id");
CREATE UNIQUE INDEX IF NOT EXISTS "resource_links_task_pair_idx" ON "resource_links" ("source_resource_id", "target_task_id");

CREATE TABLE IF NOT EXISTS "resource_collaboration" (
  "resource_id" uuid PRIMARY KEY,
  "comment_scope" text NOT NULL DEFAULT 'team',
  "version" integer NOT NULL DEFAULT 1,
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "resource_collaboration_resource_id_team_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "team_resources"("id") ON DELETE CASCADE,
  CONSTRAINT "resource_collaboration_scope_check" CHECK ("comment_scope" in ('team', 'collaborators')),
  CONSTRAINT "resource_collaboration_version_check" CHECK ("version" > 0)
);

CREATE TABLE IF NOT EXISTS "resource_collaborators" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "resource_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "permission" text NOT NULL,
  "granted_by_id" uuid,
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "resource_collaborators_resource_id_team_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "team_resources"("id") ON DELETE CASCADE,
  CONSTRAINT "resource_collaborators_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "resource_collaborators_granted_by_id_users_id_fk" FOREIGN KEY ("granted_by_id") REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "resource_collaborators_permission_check" CHECK ("permission" in ('comment', 'edit'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "resource_collaborators_pair_idx" ON "resource_collaborators" ("resource_id", "user_id");

CREATE TABLE IF NOT EXISTS "resource_comments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "resource_id" uuid NOT NULL,
  "parent_id" uuid,
  "body" text NOT NULL,
  "resource_version" integer NOT NULL,
  "selected_quote" text,
  "line" integer,
  "version" integer NOT NULL DEFAULT 1,
  "withdrawn" boolean NOT NULL DEFAULT false,
  "resolved" boolean NOT NULL DEFAULT false,
  "created_by_id" uuid,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "resource_comments_resource_id_team_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "team_resources"("id") ON DELETE CASCADE,
  CONSTRAINT "resource_comments_parent_id_resource_comments_id_fk" FOREIGN KEY ("parent_id") REFERENCES "resource_comments"("id") ON DELETE CASCADE,
  CONSTRAINT "resource_comments_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "resource_comments_version_check" CHECK ("version" > 0 and "resource_version" > 0),
  CONSTRAINT "resource_comments_body_check" CHECK (char_length(btrim("body")) between 1 and 10000),
  CONSTRAINT "resource_comments_anchor_check" CHECK (("line" is null or "line" > 0) and ("selected_quote" is null or char_length("selected_quote") <= 2000))
);
CREATE INDEX IF NOT EXISTS "resource_comments_resource_idx" ON "resource_comments" ("resource_id", "created_at");

CREATE TABLE IF NOT EXISTS "resource_comment_revisions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "comment_id" uuid NOT NULL,
  "version" integer NOT NULL,
  "body" text NOT NULL,
  "kind" text NOT NULL,
  "changed_by_id" uuid,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "resource_comment_revisions_comment_id_resource_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "resource_comments"("id") ON DELETE CASCADE,
  CONSTRAINT "resource_comment_revisions_changed_by_id_users_id_fk" FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "resource_comment_revisions_version_idx" ON "resource_comment_revisions" ("comment_id", "version");

CREATE TABLE IF NOT EXISTS "task_action_item_origins" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "task_id" uuid NOT NULL,
  "resource_id" uuid NOT NULL,
  "resource_title" text NOT NULL,
  "source_version" integer NOT NULL,
  "quote" text,
  "request_key" uuid NOT NULL,
  "created_by_id" uuid,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "task_action_item_origins_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE,
  CONSTRAINT "task_action_item_origins_resource_id_team_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "team_resources"("id") ON DELETE RESTRICT,
  CONSTRAINT "task_action_item_origins_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "task_action_item_origins_version_check" CHECK ("source_version" > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS "task_action_item_origins_task_unique" ON "task_action_item_origins" ("task_id");
CREATE UNIQUE INDEX IF NOT EXISTS "task_action_item_origins_request_unique" ON "task_action_item_origins" ("resource_id", "request_key");

CREATE TABLE IF NOT EXISTS "personal_schedule_reminders" (
  "schedule_id" uuid PRIMARY KEY,
  "enabled" boolean NOT NULL DEFAULT false,
  "minutes" integer NOT NULL DEFAULT 15,
  "version" integer NOT NULL DEFAULT 1,
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "personal_schedule_reminders_schedule_id_personal_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "personal_schedules"("id") ON DELETE CASCADE,
  CONSTRAINT "personal_schedule_reminders_minutes_check" CHECK ("minutes" in (0, 5, 10, 15, 30, 60, 1440)),
  CONSTRAINT "personal_schedule_reminders_version_check" CHECK ("version" > 0)
);

CREATE TABLE IF NOT EXISTS "personal_reminder_deliveries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "schedule_id" uuid NOT NULL,
  "schedule_version" integer NOT NULL,
  "reminder_version" integer NOT NULL,
  "notification_id" uuid,
  "delivered_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "personal_reminder_deliveries_schedule_id_personal_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "personal_schedules"("id") ON DELETE CASCADE,
  CONSTRAINT "personal_reminder_deliveries_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "personal_reminder_deliveries_version_unique" ON "personal_reminder_deliveries" ("schedule_id", "schedule_version", "reminder_version");

CREATE TABLE IF NOT EXISTS "task_discussion_mentions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "post_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "version" integer NOT NULL,
  "name_snapshot" text NOT NULL,
  CONSTRAINT "task_discussion_mentions_post_id_task_discussion_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "task_discussion_posts"("id") ON DELETE CASCADE,
  CONSTRAINT "task_discussion_mentions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "task_discussion_mentions_version_unique" ON "task_discussion_mentions" ("post_id", "version", "user_id");

CREATE TABLE IF NOT EXISTS "project_spaces" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "team_id" uuid NOT NULL,
  "parent_id" uuid,
  "name" text NOT NULL,
  "version" integer NOT NULL DEFAULT 1,
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "project_spaces_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE,
  CONSTRAINT "project_spaces_parent_id_project_spaces_id_fk" FOREIGN KEY ("parent_id") REFERENCES "project_spaces"("id") ON DELETE RESTRICT,
  CONSTRAINT "project_spaces_version_check" CHECK ("version" > 0),
  CONSTRAINT "project_spaces_name_check" CHECK (char_length(btrim("name")) between 1 and 80)
);
CREATE INDEX IF NOT EXISTS "project_spaces_team_idx" ON "project_spaces" ("team_id");

CREATE TABLE IF NOT EXISTS "project_space_assignments" (
  "project_id" uuid PRIMARY KEY,
  "space_id" uuid,
  "version" integer NOT NULL DEFAULT 1,
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "project_space_assignments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE,
  CONSTRAINT "project_space_assignments_space_id_project_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "project_spaces"("id") ON DELETE RESTRICT,
  CONSTRAINT "project_space_assignments_version_check" CHECK ("version" > 0)
);

CREATE TABLE IF NOT EXISTS "resource_comment_mentions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "comment_id" uuid NOT NULL,
  "comment_version" integer NOT NULL,
  "user_id" uuid,
  "name" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "resource_comment_mentions_comment_id_resource_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "resource_comments"("id") ON DELETE CASCADE,
  CONSTRAINT "resource_comment_mentions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "resource_comment_mentions_version_check" CHECK ("comment_version" > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS "resource_comment_mentions_version_idx" ON "resource_comment_mentions" ("comment_id", "comment_version", "user_id");

CREATE TABLE IF NOT EXISTS "personal_task_views" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "project_id" uuid NOT NULL,
  "name" text NOT NULL,
  "layout" text NOT NULL,
  "group_by" text NOT NULL,
  "filters" jsonb NOT NULL,
  "schema_version" integer NOT NULL DEFAULT 1,
  "version" integer NOT NULL DEFAULT 1,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "personal_task_views_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "personal_task_views_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE,
  CONSTRAINT "personal_task_views_name_check" CHECK (char_length(btrim("name")) between 1 and 80),
  CONSTRAINT "personal_task_views_layout_check" CHECK ("layout" in ('tasks', 'board', 'table')),
  CONSTRAINT "personal_task_views_group_check" CHECK ("group_by" in ('status', 'assignee', 'priority', 'milestone')),
  CONSTRAINT "personal_task_views_schema_check" CHECK ("schema_version" = 1),
  CONSTRAINT "personal_task_views_version_check" CHECK ("version" > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS "personal_task_views_name_unique" ON "personal_task_views" ("user_id", "project_id", lower("name"));
CREATE INDEX IF NOT EXISTS "personal_task_views_user_project_idx" ON "personal_task_views" ("user_id", "project_id");
