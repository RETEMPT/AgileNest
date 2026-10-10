CREATE TABLE IF NOT EXISTS task_discussion_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES task_discussion_posts(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(body) <= 10000),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  withdrawn boolean NOT NULL DEFAULT false,
  resolved boolean NOT NULL DEFAULT false,
  resources jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS task_discussion_posts_task_idx ON task_discussion_posts(task_id, created_at);
CREATE TABLE IF NOT EXISTS task_discussion_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES task_discussion_posts(id) ON DELETE CASCADE,
  version integer NOT NULL, body text NOT NULL, kind text NOT NULL,
  changed_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS task_discussion_revisions_version_idx ON task_discussion_revisions(post_id, version);
CREATE TABLE IF NOT EXISTS discussion_resource_references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id uuid NOT NULL REFERENCES team_resources(id) ON DELETE RESTRICT,
  post_id uuid NOT NULL REFERENCES task_discussion_posts(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS discussion_resource_references_pair_idx ON discussion_resource_references(resource_id, post_id);
