CREATE TABLE IF NOT EXISTS personal_profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  bio text NOT NULL DEFAULT '',
  avatar_data text,
  avatar_hash text,
  updated_at timestamp NOT NULL DEFAULT now()
);
