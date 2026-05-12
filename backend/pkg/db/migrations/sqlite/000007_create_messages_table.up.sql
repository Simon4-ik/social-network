CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    sender_id TEXT NOT NULL,
    recipient_id TEXT,
    group_id TEXT,
    content TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK ((recipient_id IS NOT NULL) <> (group_id IS NOT NULL)),
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_dm ON messages(sender_id, recipient_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_group ON messages(group_id, created_at);
