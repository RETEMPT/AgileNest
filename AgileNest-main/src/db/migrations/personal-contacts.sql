CREATE TABLE IF NOT EXISTS personal_contacts (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  phone text NOT NULL DEFAULT '',
  contact_email text NOT NULL DEFAULT '',
  office_address text NOT NULL DEFAULT '',
  qq text NOT NULL DEFAULT '',
  wechat text NOT NULL DEFAULT '',
  x text NOT NULL DEFAULT '',
  github text NOT NULL DEFAULT '',
  updated_at timestamp NOT NULL DEFAULT now()
);
