CREATE TABLE users (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Locked owner preserves existing IDs without giving old data to the first signup.
INSERT INTO users(id,email) VALUES ('00000000-0000-0000-0000-000000000001','legacy-owner@invalid.local');
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE INDEX sessions_expiry ON sessions(expires_at);
ALTER TABLE documents ADD COLUMN user_id UUID REFERENCES users(id);
ALTER TABLE demo_vectors ADD COLUMN user_id UUID REFERENCES users(id);
UPDATE documents SET user_id='00000000-0000-0000-0000-000000000001';
UPDATE demo_vectors SET user_id='00000000-0000-0000-0000-000000000001';
ALTER TABLE documents ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE demo_vectors ALTER COLUMN user_id SET NOT NULL;
CREATE INDEX documents_owner ON documents(user_id);
CREATE INDEX vectors_owner ON demo_vectors(user_id);
ALTER TABLE documents ADD UNIQUE(id,user_id);
ALTER TABLE demo_vectors ADD FOREIGN KEY(document_id,user_id) REFERENCES documents(id,user_id) ON DELETE CASCADE DEFERRABLE INITIALLY IMMEDIATE;
CREATE TABLE conversations (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX conversations_owner ON conversations(user_id,updated_at DESC);
CREATE TABLE messages (
  id UUID PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('user','assistant')),
  content TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','complete','failed')),
  request_id UUID NOT NULL,
  settings JSONB NOT NULL DEFAULT '{}',
  error TEXT,
  generated BOOLEAN,
  model TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(conversation_id,request_id,role)
);
CREATE INDEX messages_conversation ON messages(conversation_id,created_at);
CREATE TABLE message_sources (
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  source_number INTEGER NOT NULL,
  snapshot JSONB NOT NULL,
  PRIMARY KEY(message_id,source_number)
);
CREATE TABLE auth_attempts (
  key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);
