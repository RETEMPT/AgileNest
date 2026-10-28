CREATE TABLE IF NOT EXISTS project_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES project_comments(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 10000),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  withdrawn boolean NOT NULL DEFAULT false,
  created_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS project_comments_project_idx ON project_comments(project_id, created_at);

CREATE TABLE IF NOT EXISTS assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  total_quantity integer NOT NULL CHECK (total_quantity > 0),
  note text NOT NULL DEFAULT '',
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS assets_team_idx ON assets(team_id);

CREATE TABLE IF NOT EXISTS asset_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  applicant_id uuid REFERENCES users(id) ON DELETE SET NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  purpose text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'returned', 'withdrawn')),
  decided_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamp,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS asset_requests_asset_idx ON asset_requests(asset_id);
CREATE INDEX IF NOT EXISTS asset_requests_applicant_idx ON asset_requests(applicant_id);
