CREATE TABLE IF NOT EXISTS team_profiles (
  team_id uuid PRIMARY KEY REFERENCES teams(id) ON DELETE CASCADE,
  description text NOT NULL DEFAULT '', website text, contact_email text,
  version integer NOT NULL DEFAULT 1, invite_expires_on date, updated_at timestamp NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS team_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  title text NOT NULL, body text NOT NULL, pinned boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1,
  author_id uuid REFERENCES users(id) ON DELETE SET NULL, updated_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS team_announcements_team_idx ON team_announcements(team_id);
CREATE TABLE IF NOT EXISTS task_requirements (
  task_id uuid PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE, version integer NOT NULL DEFAULT 1,
  criteria jsonb NOT NULL, updated_at timestamp NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS task_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  version integer NOT NULL, submitted_by_id uuid REFERENCES users(id) ON DELETE SET NULL, submitted_by_name text,
  submitted_at timestamp NOT NULL DEFAULT now(), summary text NOT NULL, verification text NOT NULL,
  links jsonb NOT NULL, resources jsonb NOT NULL, criteria jsonb NOT NULL, source text NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS task_submissions_task_version_unique ON task_submissions(task_id, version);
CREATE TABLE IF NOT EXISTS task_submission_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), submission_id uuid NOT NULL REFERENCES task_submissions(id) ON DELETE CASCADE,
  reviewer_id uuid REFERENCES users(id) ON DELETE SET NULL, reviewer_name text, action text NOT NULL,
  summary text NOT NULL, checks jsonb NOT NULL, reviewed_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS task_submission_reviews_submission_unique ON task_submission_reviews(submission_id);
CREATE TABLE IF NOT EXISTS team_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE, kind text NOT NULL, title text NOT NULL, body text, url text,
  file_name text, mime_type text, size integer NOT NULL DEFAULT 0, content_base64 text, tags jsonb NOT NULL DEFAULT '[]',
  category text NOT NULL DEFAULT 'general', version integer NOT NULL DEFAULT 1,
  created_by_id uuid REFERENCES users(id) ON DELETE SET NULL, updated_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS team_resources_scope_idx ON team_resources(team_id, project_id);
CREATE TABLE IF NOT EXISTS resource_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), resource_id uuid NOT NULL REFERENCES team_resources(id) ON DELETE CASCADE,
  version integer NOT NULL, title text NOT NULL, body text NOT NULL,
  created_by_id uuid REFERENCES users(id) ON DELETE SET NULL, created_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS resource_revisions_version_idx ON resource_revisions(resource_id, version);
CREATE TABLE IF NOT EXISTS resource_references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), resource_id uuid NOT NULL REFERENCES team_resources(id) ON DELETE RESTRICT,
  submission_id uuid NOT NULL REFERENCES task_submissions(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS resource_references_pair_idx ON resource_references(resource_id, submission_id);
