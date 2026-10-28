DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'academic_identity') THEN
    CREATE TYPE academic_identity AS ENUM ('undergraduate', 'master', 'doctoral', 'teacher');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'team_position') THEN
    CREATE TYPE team_position AS ENUM ('admin', 'advisor', 'leader', 'member');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS academic_profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  identity academic_identity NOT NULL,
  institution text NOT NULL DEFAULT '',
  department text NOT NULL DEFAULT '',
  research_focus text NOT NULL DEFAULT '',
  version integer NOT NULL DEFAULT 1,
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS member_positions (
  membership_id uuid PRIMARY KEY REFERENCES team_members(id) ON DELETE CASCADE,
  positions team_position[] NOT NULL,
  updated_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS academic_confirmations (
  membership_id uuid PRIMARY KEY REFERENCES team_members(id) ON DELETE CASCADE,
  profile_version integer NOT NULL,
  confirmed_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  confirmed_at timestamp NOT NULL DEFAULT now()
);
