"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const db_1 = require("../db");
const auth_1 = require("../auth");
const helpers_1 = require("./helpers");
const router = (0, express_1.Router)();
/* ------------------------------------ clips ----------------------------------- */
router.get('/clips', (req, res) => {
    const { limit, offset } = (0, helpers_1.paging)(req, 24);
    const viewer = (0, helpers_1.myId)(req) || '';
    const rows = db_1.db
        .prepare(`SELECT c.*, u.handle, u.display_name, u.avatar_color, u.is_demo,
        (SELECT COUNT(*) FROM clip_likes l WHERE l.clip_id = c.id) AS like_count,
        (SELECT COUNT(*) FROM clip_comments cm WHERE cm.clip_id = c.id) AS comment_count,
        EXISTS(SELECT 1 FROM clip_likes l WHERE l.clip_id = c.id AND l.user_id = ?) AS liked
       FROM clips c JOIN users u ON u.id = c.author_id
       ORDER BY c.created_at DESC LIMIT ? OFFSET ?`)
        .all(viewer, limit, offset);
    res.json({ clips: rows.map((r) => ({ ...r, liked: Boolean(r.liked) })), nextOffset: offset + rows.length });
});
router.post('/clips', auth_1.requireAuth, (req, res) => {
    const schema = zod_1.z.object({
        title: zod_1.z.string().min(2).max(120),
        description: zod_1.z.string().max(500).optional(),
        thumbUrl: zod_1.z.string().max(500).optional(),
        mediaUrl: zod_1.z.string().max(500).optional(),
        duration: zod_1.z.number().int().min(0).max(600).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: 'Clips need a title of 2-120 characters.' });
        return;
    }
    const id = (0, db_1.uid)();
    db_1.db.prepare('INSERT INTO clips (id, author_id, title, description, thumb_url, media_url, duration, views, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)').run(id, (0, helpers_1.myId)(req), (0, helpers_1.cleanText)(parsed.data.title, 120), (0, helpers_1.cleanText)(parsed.data.description ?? '', 500), parsed.data.thumbUrl || '/art/clip-1.jpg', parsed.data.mediaUrl || null, parsed.data.duration ?? 0, (0, db_1.nowIso)());
    (0, auth_1.awardXp)((0, helpers_1.myId)(req), 20);
    res.status(201).json({ clip: db_1.db.prepare('SELECT * FROM clips WHERE id = ?').get(id) });
});
router.post('/clips/:id/like', auth_1.requireAuth, (req, res) => {
    const clip = db_1.db.prepare('SELECT author_id FROM clips WHERE id = ?').get(req.params.id);
    if (!clip) {
        res.status(404).json({ error: 'Clip not found' });
        return;
    }
    const existing = db_1.db.prepare('SELECT 1 FROM clip_likes WHERE clip_id = ? AND user_id = ?').get(req.params.id, (0, helpers_1.myId)(req));
    if (existing)
        db_1.db.prepare('DELETE FROM clip_likes WHERE clip_id = ? AND user_id = ?').run(req.params.id, (0, helpers_1.myId)(req));
    else
        db_1.db.prepare('INSERT INTO clip_likes (clip_id, user_id, created_at) VALUES (?, ?, ?)').run(req.params.id, (0, helpers_1.myId)(req), (0, db_1.nowIso)());
    const count = db_1.db.prepare('SELECT COUNT(*) AS c FROM clip_likes WHERE clip_id = ?').get(req.params.id).c;
    res.json({ liked: !existing, likeCount: count });
});
router.post('/clips/:id/view', (req, res) => {
    db_1.db.prepare('UPDATE clips SET views = views + 1 WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
});
router.get('/clips/:id/comments', (req, res) => {
    const rows = db_1.db
        .prepare(`SELECT cm.id, cm.body, cm.created_at, u.handle, u.display_name, u.avatar_color, u.is_demo
       FROM clip_comments cm JOIN users u ON u.id = cm.author_id WHERE cm.clip_id = ? ORDER BY cm.created_at ASC LIMIT 100`)
        .all(req.params.id);
    res.json({ comments: rows });
});
router.post('/clips/:id/comments', auth_1.requireAuth, (req, res) => {
    const body = (0, helpers_1.cleanText)(req.body?.body, 400);
    if (!body) {
        res.status(400).json({ error: 'Comment cannot be empty.' });
        return;
    }
    const clip = db_1.db.prepare('SELECT 1 FROM clips WHERE id = ?').get(req.params.id);
    if (!clip) {
        res.status(404).json({ error: 'Clip not found' });
        return;
    }
    const id = (0, db_1.uid)();
    db_1.db.prepare('INSERT INTO clip_comments (id, clip_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)').run(id, req.params.id, (0, helpers_1.myId)(req), body, (0, db_1.nowIso)());
    res.status(201).json({ comment: { id, body, created_at: (0, db_1.nowIso)(), handle: (0, helpers_1.me)(req).handle, display_name: (0, helpers_1.me)(req).displayName } });
});
/* ------------------------------------ music ----------------------------------- */
router.get('/music', (req, res) => {
    const genre = typeof req.query.genre === 'string' ? req.query.genre : '';
    const tracks = genre && genre !== 'All'
        ? db_1.db.prepare('SELECT * FROM music_tracks WHERE genre = ? ORDER BY title').all(genre)
        : db_1.db.prepare('SELECT * FROM music_tracks ORDER BY genre, title').all();
    const genres = db_1.db.prepare('SELECT DISTINCT genre FROM music_tracks ORDER BY genre').all().map((r) => r.genre);
    const playlists = db_1.db
        .prepare(`SELECT p.*, u.handle, (SELECT COUNT(*) FROM playlist_tracks pt WHERE pt.playlist_id = p.id) AS track_count
       FROM playlists p LEFT JOIN users u ON u.id = p.owner_id ORDER BY p.created_at DESC LIMIT 20`)
        .all();
    res.json({ tracks, genres, playlists });
});
router.post('/playlists', auth_1.requireAuth, (req, res) => {
    const schema = zod_1.z.object({ title: zod_1.z.string().min(2).max(80), description: zod_1.z.string().max(300).optional(), coverUrl: zod_1.z.string().max(400).optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: 'Playlist title must be 2-80 characters.' });
        return;
    }
    const id = (0, db_1.uid)();
    db_1.db.prepare('INSERT INTO playlists (id, owner_id, title, description, cover_url, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, (0, helpers_1.myId)(req), (0, helpers_1.cleanText)(parsed.data.title, 80), (0, helpers_1.cleanText)(parsed.data.description ?? '', 300), parsed.data.coverUrl || '/art/banner-live.jpg', (0, db_1.nowIso)());
    res.status(201).json({ playlist: db_1.db.prepare('SELECT * FROM playlists WHERE id = ?').get(id) });
});
router.post('/playlists/:id/tracks', auth_1.requireAuth, (req, res) => {
    const playlist = db_1.db.prepare('SELECT * FROM playlists WHERE id = ?').get(req.params.id);
    if (!playlist) {
        res.status(404).json({ error: 'Playlist not found' });
        return;
    }
    if (playlist.owner_id !== (0, helpers_1.myId)(req)) {
        res.status(403).json({ error: 'You can only edit your own playlists.' });
        return;
    }
    const trackId = (0, helpers_1.cleanText)(req.body?.trackId ?? '', 60);
    const track = db_1.db.prepare('SELECT 1 FROM music_tracks WHERE id = ?').get(trackId);
    if (!track) {
        res.status(404).json({ error: 'Track not found' });
        return;
    }
    const position = db_1.db.prepare('SELECT COUNT(*) AS c FROM playlist_tracks WHERE playlist_id = ?').get(req.params.id).c;
    db_1.db.prepare('INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)').run(req.params.id, trackId, position);
    res.json({ ok: true });
});
router.get('/playlists/:id', (req, res) => {
    const playlist = db_1.db.prepare('SELECT * FROM playlists WHERE id = ?').get(req.params.id);
    if (!playlist) {
        res.status(404).json({ error: 'Playlist not found' });
        return;
    }
    const tracks = db_1.db
        .prepare(`SELECT t.* FROM playlist_tracks pt JOIN music_tracks t ON t.id = pt.track_id
       WHERE pt.playlist_id = ? ORDER BY pt.position ASC`)
        .all(req.params.id);
    res.json({ playlist, tracks });
});
/* ----------------------------------- events ----------------------------------- */
router.get('/events', (req, res) => {
    const viewer = (0, helpers_1.myId)(req) || '';
    const rows = db_1.db
        .prepare(`SELECT e.*, (SELECT COUNT(*) FROM event_registrations r WHERE r.event_id = e.id) AS registered_count,
        EXISTS(SELECT 1 FROM event_registrations r WHERE r.event_id = e.id AND r.user_id = ?) AS registered
       FROM events e ORDER BY e.starts_at ASC LIMIT 40`)
        .all(viewer);
    res.json({ events: rows.map((r) => ({ ...r, registered: Boolean(r.registered) })) });
});
router.post('/events', auth_1.requireAuth, (req, res) => {
    const schema = zod_1.z.object({
        title: zod_1.z.string().min(3).max(120),
        description: zod_1.z.string().max(800).optional(),
        kind: zod_1.z.enum(['event', 'tournament', 'watch-party', 'challenge']).optional(),
        startsAt: zod_1.z.string().min(10).max(40),
        endsAt: zod_1.z.string().min(10).max(40),
        capacity: zod_1.z.number().int().min(0).max(100000).optional(),
        bannerUrl: zod_1.z.string().max(400).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: 'Events need a title and start/end times.' });
        return;
    }
    const id = (0, db_1.uid)();
    db_1.db.prepare('INSERT INTO events (id, title, description, banner_url, kind, starts_at, ends_at, capacity, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, (0, helpers_1.cleanText)(parsed.data.title, 120), (0, helpers_1.cleanText)(parsed.data.description ?? '', 800), parsed.data.bannerUrl || '/art/banner-live.jpg', parsed.data.kind ?? 'event', parsed.data.startsAt, parsed.data.endsAt, parsed.data.capacity ?? 0, (0, helpers_1.myId)(req), (0, db_1.nowIso)());
    db_1.db.prepare('INSERT OR IGNORE INTO event_registrations (event_id, user_id, created_at) VALUES (?, ?, ?)').run(id, (0, helpers_1.myId)(req), (0, db_1.nowIso)());
    (0, auth_1.awardXp)((0, helpers_1.myId)(req), 25);
    res.status(201).json({ event: db_1.db.prepare('SELECT * FROM events WHERE id = ?').get(id) });
});
router.post('/events/:id/register', auth_1.requireAuth, (req, res) => {
    const event = db_1.db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
    if (!event) {
        res.status(404).json({ error: 'Event not found' });
        return;
    }
    const existing = db_1.db.prepare('SELECT 1 FROM event_registrations WHERE event_id = ? AND user_id = ?').get(req.params.id, (0, helpers_1.myId)(req));
    if (existing) {
        db_1.db.prepare('DELETE FROM event_registrations WHERE event_id = ? AND user_id = ?').run(req.params.id, (0, helpers_1.myId)(req));
        res.json({ registered: false });
        return;
    }
    const count = db_1.db.prepare('SELECT COUNT(*) AS c FROM event_registrations WHERE event_id = ?').get(req.params.id).c;
    if (event.capacity > 0 && count >= event.capacity) {
        res.status(409).json({ error: 'This event is full.' });
        return;
    }
    db_1.db.prepare('INSERT INTO event_registrations (event_id, user_id, created_at) VALUES (?, ?, ?)').run(req.params.id, (0, helpers_1.myId)(req), (0, db_1.nowIso)());
    res.json({ registered: true });
});
/* ---------------------------------- battles ----------------------------------- */
router.get('/battles', (req, res) => {
    const viewer = (0, helpers_1.myId)(req) || '';
    const battles = db_1.db.prepare('SELECT * FROM battles ORDER BY starts_at ASC LIMIT 20').all();
    const entries = db_1.db
        .prepare(`SELECT be.battle_id, be.score, be.created_at, u.handle, u.display_name, u.avatar_color, u.is_demo,
        (SELECT COUNT(*) FROM battle_entries x WHERE x.battle_id = be.battle_id) AS entry_count
       FROM battle_entries be JOIN users u ON u.id = be.user_id ORDER BY be.score DESC`)
        .all();
    const mine = viewer
        ? db_1.db.prepare('SELECT battle_id, score FROM battle_entries WHERE user_id = ?').all(viewer)
        : [];
    res.json({ battles, entries, mine });
});
router.post('/battles/:id/enter', auth_1.requireAuth, (req, res) => {
    const battle = db_1.db.prepare('SELECT * FROM battles WHERE id = ?').get(req.params.id);
    if (!battle) {
        res.status(404).json({ error: 'Battle not found' });
        return;
    }
    const score = Number(req.body?.score);
    if (!Number.isFinite(score) || score < 0 || score > 10_000_000) {
        res.status(400).json({ error: 'Valid score required.' });
        return;
    }
    const game = db_1.db.prepare('SELECT max_score_per_second, min_seconds, id FROM games WHERE slug = ?').get(battle.game_slug);
    if (game && score > game.max_score_per_second * Math.max(game.min_seconds, 120) + 250) {
        res.status(422).json({ error: 'Score failed server-side verification.' });
        return;
    }
    const existing = db_1.db.prepare('SELECT score FROM battle_entries WHERE battle_id = ? AND user_id = ?').get(req.params.id, (0, helpers_1.myId)(req));
    if (existing) {
        if (score <= existing.score) {
            res.json({ ok: true, best: existing.score, improved: false });
            return;
        }
        db_1.db.prepare('UPDATE battle_entries SET score = ? WHERE battle_id = ? AND user_id = ?').run(score, req.params.id, (0, helpers_1.myId)(req));
    }
    else {
        db_1.db.prepare('INSERT INTO battle_entries (battle_id, user_id, score, created_at) VALUES (?, ?, ?, ?)').run(req.params.id, (0, helpers_1.myId)(req), score, (0, db_1.nowIso)());
    }
    (0, auth_1.awardXp)((0, helpers_1.myId)(req), 40);
    res.json({ ok: true, best: score, improved: true });
});
/* --------------------------------- marketplace -------------------------------- */
router.get('/marketplace', (req, res) => {
    const kind = typeof req.query.kind === 'string' ? req.query.kind : '';
    const rows = kind && kind !== 'All'
        ? db_1.db.prepare('SELECT m.*, u.handle, u.display_name, u.is_demo FROM marketplace_items m LEFT JOIN users u ON u.id = m.creator_id WHERE m.kind = ? ORDER BY m.downloads DESC').all(kind)
        : db_1.db.prepare('SELECT m.*, u.handle, u.display_name, u.is_demo FROM marketplace_items m LEFT JOIN users u ON u.id = m.creator_id ORDER BY m.downloads DESC').all();
    const kinds = db_1.db.prepare('SELECT DISTINCT kind FROM marketplace_items ORDER BY kind').all().map((r) => r.kind);
    res.json({ items: rows, kinds });
});
router.post('/marketplace/:id/download', (req, res) => {
    const item = db_1.db.prepare('SELECT * FROM marketplace_items WHERE id = ?').get(req.params.id);
    if (!item) {
        res.status(404).json({ error: 'Item not found' });
        return;
    }
    db_1.db.prepare('UPDATE marketplace_items SET downloads = downloads + 1 WHERE id = ?').run(req.params.id);
    res.json({ ok: true, downloads: item.downloads + 1, note: 'Free community asset — no payment required.' });
});
router.post('/marketplace', auth_1.requireAuth, (req, res) => {
    const schema = zod_1.z.object({
        title: zod_1.z.string().min(3).max(120),
        description: zod_1.z.string().max(600).optional(),
        kind: zod_1.z.enum(['asset', 'template', 'experience', 'game', 'collection']).optional(),
        coverUrl: zod_1.z.string().max(400).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: 'Listing title must be 3-120 characters.' });
        return;
    }
    const id = (0, db_1.uid)();
    db_1.db.prepare('INSERT INTO marketplace_items (id, title, description, creator_id, cover_url, kind, price, rating, downloads, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, ?)').run(id, (0, helpers_1.cleanText)(parsed.data.title, 120), (0, helpers_1.cleanText)(parsed.data.description ?? '', 600), (0, helpers_1.myId)(req), parsed.data.coverUrl || '/art/banner-marketplace.jpg', parsed.data.kind ?? 'asset', (0, db_1.nowIso)());
    (0, auth_1.awardXp)((0, helpers_1.myId)(req), 30);
    res.status(201).json({ item: db_1.db.prepare('SELECT * FROM marketplace_items WHERE id = ?').get(id) });
});
/* -------------------------------- experiences --------------------------------- */
router.get('/experiences', (_req, res) => {
    const rows = db_1.db
        .prepare(`SELECT e.id, e.title, e.description, e.type, e.cover_url, e.published, e.created_at,
        u.handle, u.display_name, u.is_demo,
        (SELECT COUNT(*) FROM experience_responses r WHERE r.experience_id = e.id) AS response_count
       FROM experiences e JOIN users u ON u.id = e.author_id WHERE e.published = 1 ORDER BY e.created_at DESC LIMIT 40`)
        .all();
    res.json({ experiences: rows });
});
router.get('/experiences/:id', (req, res) => {
    const row = db_1.db
        .prepare('SELECT e.*, u.handle, u.display_name FROM experiences e JOIN users u ON u.id = e.author_id WHERE e.id = ?')
        .get(req.params.id);
    if (!row) {
        res.status(404).json({ error: 'Experience not found' });
        return;
    }
    res.json({ experience: { ...row, data: JSON.parse(row.data) } });
});
router.post('/experiences', auth_1.requireAuth, (req, res) => {
    const schema = zod_1.z.object({
        title: zod_1.z.string().min(3).max(120),
        description: zod_1.z.string().max(600).optional(),
        type: zod_1.z.enum(['quiz', 'poll', 'story', 'challenge', 'trivia', 'battle']).optional(),
        coverUrl: zod_1.z.string().max(400).optional(),
        data: zod_1.z.any(),
        published: zod_1.z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: 'Experiences need a title of 3+ characters and content.' });
        return;
    }
    const id = (0, db_1.uid)();
    db_1.db.prepare('INSERT INTO experiences (id, title, description, type, cover_url, author_id, data, published, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, (0, helpers_1.cleanText)(parsed.data.title, 120), (0, helpers_1.cleanText)(parsed.data.description ?? '', 600), parsed.data.type ?? 'quiz', parsed.data.coverUrl || '/art/banner-create.jpg', (0, helpers_1.myId)(req), JSON.stringify(parsed.data.data).slice(0, 60000), parsed.data.published ? 1 : 0, (0, db_1.nowIso)());
    (0, auth_1.awardXp)((0, helpers_1.myId)(req), 35);
    res.status(201).json({ experience: db_1.db.prepare('SELECT * FROM experiences WHERE id = ?').get(id) });
});
router.post('/experiences/:id/responses', auth_1.requireAuth, (req, res) => {
    const experience = db_1.db.prepare('SELECT * FROM experiences WHERE id = ?').get(req.params.id);
    if (!experience) {
        res.status(404).json({ error: 'Experience not found' });
        return;
    }
    const data = JSON.parse(experience.data);
    const answers = req.body?.answers;
    if (!answers || typeof answers !== 'object') {
        res.status(400).json({ error: 'Answers required.' });
        return;
    }
    let score = 0;
    if (Array.isArray(data.questions)) {
        data.questions.forEach((q, index) => {
            if (q.correctIndex !== undefined && Number(answers[index]) === Number(q.correctIndex))
                score += 1;
        });
    }
    const id = (0, db_1.uid)();
    db_1.db.prepare('INSERT INTO experience_responses (id, experience_id, user_id, answers, score, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, req.params.id, (0, helpers_1.myId)(req), JSON.stringify(answers).slice(0, 20000), score, (0, db_1.nowIso)());
    (0, auth_1.awardXp)((0, helpers_1.myId)(req), 10 + score * 5);
    const total = Array.isArray(data.questions) ? data.questions.length : 0;
    res.status(201).json({ ok: true, score, total });
});
/* ----------------------------------- missions --------------------------------- */
router.get('/missions', (req, res) => {
    const missions = db_1.db.prepare('SELECT * FROM missions ORDER BY kind, title').all();
    const viewer = (0, helpers_1.myId)(req);
    let completed = [];
    if (viewer) {
        const posts = db_1.db.prepare('SELECT COUNT(*) AS c FROM posts WHERE author_id = ? AND created_at > ?').get(viewer, new Date(Date.now() - 864e5).toISOString()).c;
        const games = db_1.db.prepare('SELECT COUNT(*) AS c FROM game_scores WHERE user_id = ? AND created_at > ?').get(viewer, new Date(Date.now() - 864e5).toISOString()).c;
        const comments = db_1.db.prepare('SELECT COUNT(*) AS c FROM comments WHERE author_id = ? AND created_at > ?').get(viewer, new Date(Date.now() - 864e5).toISOString()).c;
        if (posts > 0)
            completed.push('daily-post');
        if (games > 0)
            completed.push('daily-play');
        if (comments > 0)
            completed.push('daily-comment');
    }
    res.json({ missions, completed });
});
exports.default = router;
