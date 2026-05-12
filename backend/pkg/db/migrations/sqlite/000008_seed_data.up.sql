-- Seed users. Password for both is "password" (bcrypt cost 10).
INSERT OR IGNORE INTO users (id, email, password_hash, first_name, last_name, date_of_birth, nickname, about_me, is_public)
VALUES
    ('11111111-1111-1111-1111-111111111111',
     'alice@example.com',
     '$2a$10$Yx1PdCHlxKtjBeilidRxsOfpu5R.z7R/jN4Q4ia/uR/OfUO99YAZ6',
     'Alice', 'Anderson', '1990-04-12',
     'alice', 'Hi, I''m Alice. I built this account from a seed migration.',
     1),
    ('22222222-2222-2222-2222-222222222222',
     'bob@example.com',
     '$2a$10$Yx1PdCHlxKtjBeilidRxsOfpu5R.z7R/jN4Q4ia/uR/OfUO99YAZ6',
     'Bob', 'Brown', '1988-09-23',
     'bob', 'I keep my profile private.',
     0);

-- Sample public post by Alice
INSERT OR IGNORE INTO posts (id, user_id, content, privacy)
VALUES
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
     '11111111-1111-1111-1111-111111111111',
     'Welcome to SocialNet! This is a sample public post.',
     'public');
