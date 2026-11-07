"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uid = exports.nowIso = exports.db = void 0;
exports.jwtSecret = jwtSecret;
exports.getSetting = getSetting;
exports.setSetting = setSetting;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const node_crypto_1 = __importDefault(require("node:crypto"));
const DATA_DIR = process.env.DATA_DIR || node_path_1.default.join(__dirname, '..', 'data');
if (!node_fs_1.default.existsSync(DATA_DIR))
    node_fs_1.default.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = process.env.DB_PATH || node_path_1.default.join(DATA_DIR, 'nexus.db');
exports.db = new better_sqlite3_1.default(DB_PATH);
exports.db.pragma('journal_mode = WAL');
exports.db.pragma('foreign_keys = ON');
const nowIso = () => new Date().toISOString();
exports.nowIso = nowIso;
const uid = () => node_crypto_1.default.randomUUID();
exports.uid = uid;
exports.db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  handle TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  bio TEXT DEFAULT '',
  avatar_color TEXT DEFAULT '#7C3AED',
  avatar_url TEXT,
  banner_url TEXT,
  theme TEXT DEFAULT 'nexus',
  role TEXT NOT NULL DEFAULT 'user',
  xp INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  privacy TEXT NOT NULL DEFAULT 'public',
  token_version INTEGER NOT NULL DEFAULT 0,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS follows (
  follower_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (follower_id, following_id)
);

CREATE TABLE IF NOT EXISTS blocks (
  blocker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (blocker_id, blocked_id)
);

CREATE TABLE IF NOT EXISTS communities (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  cover_url TEXT,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS community_members (
  community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  joined_at TEXT NOT NULL,
  PRIMARY KEY (community_id, user_id)
);

CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  media_url TEXT,
  media_type TEXT,
  community_id TEXT REFERENCES communities(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS post_likes (
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reaction TEXT NOT NULL DEFAULT 'like',
  created_at TEXT NOT NULL,
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bookmarks (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, post_id)
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  title TEXT,
  is_group INTEGER NOT NULL DEFAULT 0,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS conversation_members (
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TEXT NOT NULL,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  tagline TEXT DEFAULT '',
  description TEXT DEFAULT '',
  genre TEXT NOT NULL,
  engine TEXT NOT NULL,
  cover_url TEXT,
  banner_url TEXT,
  is_3d INTEGER NOT NULL DEFAULT 0,
  playable INTEGER NOT NULL DEFAULT 1,
  controls TEXT DEFAULT '',
  instructions TEXT DEFAULT '',
  accent TEXT DEFAULT '#7C3AED',
  featured INTEGER NOT NULL DEFAULT 0,
  max_score_per_second REAL NOT NULL DEFAULT 40,
  min_seconds INTEGER NOT NULL DEFAULT 5,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS game_scores (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score INTEGER NOT NULL,
  meta TEXT,
  validated INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS game_progress (
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (game_id, user_id)
);

CREATE TABLE IF NOT EXISTS achievements (
  id TEXT PRIMARY KEY,
  game_id TEXT REFERENCES games(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  icon TEXT DEFAULT 'trophy',
  xp INTEGER NOT NULL DEFAULT 50
);

CREATE TABLE IF NOT EXISTS user_achievements (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_id TEXT NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
  unlocked_at TEXT NOT NULL,
  PRIMARY KEY (user_id, achievement_id)
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  banner_url TEXT,
  kind TEXT NOT NULL DEFAULT 'event',
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  capacity INTEGER NOT NULL DEFAULT 0,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS event_registrations (
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (event_id, user_id)
);

CREATE TABLE IF NOT EXISTS clips (
  id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  thumb_url TEXT,
  media_url TEXT,
  duration INTEGER NOT NULL DEFAULT 0,
  views INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS clip_likes (
  clip_id TEXT NOT NULL REFERENCES clips(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (clip_id, user_id)
);

CREATE TABLE IF NOT EXISTS clip_comments (
  id TEXT PRIMARY KEY,
  clip_id TEXT NOT NULL REFERENCES clips(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS music_tracks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  genre TEXT NOT NULL,
  cover_url TEXT,
  embed_url TEXT NOT NULL,
  duration INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS playlists (
  id TEXT PRIMARY KEY,
  owner_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  cover_url TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS playlist_tracks (
  playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  track_id TEXT NOT NULL REFERENCES music_tracks(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (playlist_id, track_id)
);

CREATE TABLE IF NOT EXISTS marketplace_items (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  creator_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  cover_url TEXT,
  kind TEXT NOT NULL DEFAULT 'asset',
  price INTEGER NOT NULL DEFAULT 0,
  rating REAL NOT NULL DEFAULT 0,
  downloads INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS battles (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  game_slug TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  banner_url TEXT,
  starts_at TEXT NOT NULL,
  prize TEXT DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS battle_entries (
  battle_id TEXT NOT NULL REFERENCES battles(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  PRIMARY KEY (battle_id, user_id)
);

CREATE TABLE IF NOT EXISTS experiences (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  type TEXT NOT NULL DEFAULT 'quiz',
  cover_url TEXT,
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  published INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS experience_responses (
  id TEXT PRIMARY KEY,
  experience_id TEXT NOT NULL REFERENCES experiences(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  answers TEXT NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  slug TEXT,
  data TEXT NOT NULL,
  published INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  entity_id TEXT,
  body TEXT NOT NULL,
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  reporter_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  details TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL,
  resolved_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS missions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'daily',
  xp INTEGER NOT NULL DEFAULT 25
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_author ON posts(author_id);
CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_convo ON messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_scores_game ON game_scores(game_id, score DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clips_created ON clips(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id);
`);
/** Persisted JWT signing secret (env wins) so sessions survive restarts. */
function jwtSecret() {
    if (process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 16)
        return process.env.JWT_SECRET;
    const secretFile = node_path_1.default.join(DATA_DIR, '.jwt-secret');
    try {
        if (node_fs_1.default.existsSync(secretFile))
            return node_fs_1.default.readFileSync(secretFile, 'utf8').trim();
        const generated = node_crypto_1.default.randomBytes(48).toString('hex');
        node_fs_1.default.writeFileSync(secretFile, generated, { mode: 0o600 });
        return generated;
    }
    catch {
        return 'nexus-development-secret-change-me';
    }
}
function getSetting(key, fallback = '') {
    const row = exports.db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? row.value : fallback;
}
function setSetting(key, value) {
    exports.db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}
