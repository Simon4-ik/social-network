CREATE TABLE IF NOT EXISTS groups (
    id TEXT PRIMARY KEY,
    creator_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS group_members (
    group_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (group_id, user_id),
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS group_invitations (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL,
    inviter_id TEXT NOT NULL,
    invitee_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending','accepted','declined')) DEFAULT 'pending',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (group_id, invitee_id, status),
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
    FOREIGN KEY (inviter_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (invitee_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS group_join_requests (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending','accepted','declined')) DEFAULT 'pending',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (group_id, user_id, status),
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL,
    creator_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    event_time DATETIME NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
    FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS event_responses (
    event_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    response TEXT NOT NULL CHECK (response IN ('going','not_going')),
    PRIMARY KEY (event_id, user_id),
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
