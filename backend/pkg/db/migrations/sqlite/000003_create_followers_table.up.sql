CREATE TABLE IF NOT EXISTS followers (
    follower_id TEXT NOT NULL,
    following_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending','accepted')),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (follower_id, following_id),
    FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (following_id) REFERENCES users(id) ON DELETE CASCADE,
    CHECK (follower_id <> following_id)
);

CREATE INDEX IF NOT EXISTS idx_followers_following ON followers(following_id, status);
CREATE INDEX IF NOT EXISTS idx_followers_follower ON followers(follower_id, status);
