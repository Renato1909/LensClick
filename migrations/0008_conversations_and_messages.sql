CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_user_id INTEGER NOT NULL,
  photographer_user_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  last_message_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (client_user_id <> photographer_user_id),
  UNIQUE (client_user_id, photographer_user_id),
  FOREIGN KEY (client_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (photographer_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_conversations_client_last_message
  ON conversations(client_user_id, last_message_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_conversations_photographer_last_message
  ON conversations(photographer_user_id, last_message_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL,
  sender_user_id INTEGER NOT NULL,
  body TEXT NOT NULL CHECK (length(trim(body)) BETWEEN 1 AND 2000),
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
  ON messages(conversation_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_messages_unread
  ON messages(conversation_id, sender_user_id, id)
  WHERE read_at IS NULL;
