CREATE TABLE IF NOT EXISTS personal_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  schedule_date date NOT NULL,
  start_time text,
  end_time text,
  priority integer NOT NULL DEFAULT 0,
  version integer NOT NULL DEFAULT 1,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT personal_schedules_title_check CHECK (char_length(btrim(title)) BETWEEN 1 AND 100),
  CONSTRAINT personal_schedules_description_check CHECK (char_length(description) <= 500),
  CONSTRAINT personal_schedules_date_check CHECK (schedule_date BETWEEN DATE '1900-01-01' AND DATE '2100-12-31'),
  CONSTRAINT personal_schedules_priority_check CHECK (priority BETWEEN 0 AND 2),
  CONSTRAINT personal_schedules_version_check CHECK (version > 0),
  CONSTRAINT personal_schedules_time_check CHECK (
    (start_time IS NULL AND end_time IS NULL) OR
    (start_time IS NOT NULL AND end_time IS NOT NULL
      AND start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      AND end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND start_time < end_time)
  )
);
CREATE INDEX IF NOT EXISTS personal_schedules_user_date_idx ON personal_schedules(user_id, schedule_date);
