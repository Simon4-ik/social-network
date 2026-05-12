CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    group_id TEXT,
    content TEXT NOT NULL,
    image_path TEXT,
    privacy TEXT NOT NULL CHECK (privacy IN ('public','almost_private','private','group')),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_posts_user_created ON posts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_group_created ON posts(group_id, created_at DESC);

CREATE TABLE IF NOT EXISTS post_visibilities (
    post_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    PRIMARY KEY (post_id, user_id),
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    content TEXT NOT NULL,
    image_path TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_comments_post_created ON comments(post_id, created_at);
