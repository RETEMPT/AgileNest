CREATE TABLE IF NOT EXISTS "api_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "token_hash" text NOT NULL UNIQUE,
  "prefix" text NOT NULL,
  "last_used_at" timestamp,
  "expires_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "api_tokens_name_check" CHECK (char_length(btrim("name")) between 1 and 100)
);

CREATE INDEX IF NOT EXISTS "api_tokens_user_idx" ON "api_tokens" ("user_id");
CREATE INDEX IF NOT EXISTS "api_tokens_hash_idx" ON "api_tokens" ("token_hash");
