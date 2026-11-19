CREATE TABLE IF NOT EXISTS resource_folder_categories (
  folder_id uuid PRIMARY KEY REFERENCES resource_folders(id) ON DELETE CASCADE,
  category text NOT NULL DEFAULT 'general',
  CONSTRAINT resource_folder_categories_category_check CHECK (category IN ('general', 'specification', 'research', 'delivery', 'meeting'))
);
CREATE TABLE IF NOT EXISTS resource_trash (
  resource_id uuid PRIMARY KEY REFERENCES team_resources(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1,
  trashed_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  trashed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT resource_trash_version_check CHECK (version > 0)
);
CREATE TABLE IF NOT EXISTS delivery_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  owner_id uuid REFERENCES users(id) ON DELETE SET NULL,
  due_date date,
  checklist jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'draft',
  archived boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  completed_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  completed_at timestamp,
  created_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT delivery_batches_name_check CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  CONSTRAINT delivery_batches_status_check CHECK (status IN ('draft', 'completed')),
  CONSTRAINT delivery_batches_version_check CHECK (version > 0)
);
CREATE INDEX IF NOT EXISTS delivery_batches_project_idx ON delivery_batches(project_id);
CREATE TABLE IF NOT EXISTS delivery_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES delivery_batches(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE RESTRICT,
  submission_id uuid NOT NULL REFERENCES task_submissions(id) ON DELETE RESTRICT,
  snapshot jsonb NOT NULL,
  created_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS delivery_entries_batch_task_unique ON delivery_entries(batch_id, task_id);
CREATE INDEX IF NOT EXISTS delivery_entries_submission_idx ON delivery_entries(submission_id);
CREATE TABLE IF NOT EXISTS delivery_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES delivery_batches(id) ON DELETE CASCADE,
  task_id uuid REFERENCES tasks(id) ON DELETE RESTRICT,
  title text NOT NULL,
  detail text NOT NULL DEFAULT '',
  owner_id uuid REFERENCES users(id) ON DELETE SET NULL,
  resolution text,
  resolved boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  created_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT delivery_issues_title_check CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  CONSTRAINT delivery_issues_version_check CHECK (version > 0)
);
CREATE INDEX IF NOT EXISTS delivery_issues_batch_idx ON delivery_issues(batch_id);
CREATE TABLE IF NOT EXISTS delivery_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES delivery_batches(id) ON DELETE RESTRICT,
  action text NOT NULL,
  version integer NOT NULL,
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  name_snapshot text,
  snapshot jsonb NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT delivery_records_version_check CHECK (version > 0),
  CONSTRAINT delivery_records_action_check CHECK (action IN ('create','edit','bind','unbind','issue','resolve','reopenIssue','complete','reopen','archive','restore'))
);
CREATE UNIQUE INDEX IF NOT EXISTS delivery_records_batch_version_unique ON delivery_records(batch_id, version);
