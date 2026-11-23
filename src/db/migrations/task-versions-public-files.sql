CREATE TABLE IF NOT EXISTS task_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  content text NOT NULL CHECK (char_length(btrim(content)) BETWEEN 1 AND 20000),
  version integer NOT NULL CHECK (version > 0),
  remark text NOT NULL DEFAULT '' CHECK (char_length(remark) <= 500),
  created_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS task_versions_task_version_unique ON task_versions(task_id, version);
CREATE INDEX IF NOT EXISTS task_versions_task_idx ON task_versions(task_id, created_at);

CREATE TABLE IF NOT EXISTS public_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name text NOT NULL CHECK (char_length(btrim(file_name)) BETWEEN 1 AND 200),
  mime_type text NOT NULL,
  size integer NOT NULL DEFAULT 0 CHECK (size >= 0),
  content_base64 text NOT NULL,
  uploaded_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS public_files_created_idx ON public_files(created_at);
