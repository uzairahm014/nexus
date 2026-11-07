import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { db, nowIso, uid } from '../db';
import { awardXp, requireAuth } from '../auth';
import { cleanText, me, myId, paging } from './helpers';

const router = Router();

/* ------------------------------------ clips ----------------------------------- */

router.get('/clips', (req: Request, res: Response) => {
  const { limit, offset } = paging(req, 24);
  const viewer = myId(req) || '';
  const rows = db
    .prepare(
      `SELECT c.*, u.handle, u.display_name, u.avatar_color, u.is_demo,
        (SELECT COUNT(*) FROM clip_likes l WHERE l.clip_id = c.id) AS like_count,
        (SELECT COUNT(*) FROM clip_comments cm WHERE cm.clip_id = c.id) AS comment_count,
        EXISTS(SELECT 1 FROM clip_likes l WHERE l.clip_id = c.id AND l.user_id = ?) AS liked
       FROM clips c JOIN users u ON u.id = c.author_id
       ORDER BY c.created_at DESC LIMIT ? OFFSET ?`,
    )
    .all(viewer, limit, offset);
  res.json({ clips: rows.map((r: any) => ({ ...r, liked: Boolean(r.liked) })), nextOffset: offset + rows.length });
});

router.post('/clips', requireAuth, (req: Request, res: Response) => {
  const schema = z.object({
    title: z.string().min(2).max(120),
    description: z.string().max(500).optional(),
    thumbUrl: z.string().max(500).optional(),
    mediaUrl: z.string().max(500).optional(),
    duration: z.number().int().min(0).max(600).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Clips need a title of 2-120 characters.' }); return; }
  const id = uid();
  db.prepare(
    'INSERT INTO clips (id, author_id, title, description, thumb_url, media_url, duration, views, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)',
  ).run(
    id, myId(req), cleanText(parsed.data.title, 120), cleanText(parsed.data.description ?? '', 500),
    parsed.data.thumbUrl || '/art/clip-1.jpg', parsed.data.mediaUrl || null, parsed.data.duration ?? 0, nowIso(),
  );
  awardXp(myId(req), 20);
  res.status(201).json({ clip: db.prepare('SELECT * FROM clips WHERE id = ?').get(id) });
});

router.post('/clips/:id/like', requireAuth, (req: Request, res: Response) => {
  const clip: any = db.prepare('SELECT author_id FROM clips WHERE id = ?').get(req.params.id);
  if (!clip) { res.status(404).json({ error: 'Clip not found' }); return; }
  const existing = db.prepare('SELECT 1 FROM clip_likes WHERE clip_id = ? AND user_id = ?').get(req.params.id, myId(req));
  if (existing) db.prepare('DELETE FROM clip_likes WHERE clip_id = ? AND user_id = ?').run(req.params.id, myId(req));
  else db.prepare('INSERT INTO clip_likes (clip_id, user_id, created_at) VALUES (?, ?, ?)').run(req.params.id, myId(req), nowIso());
  const count = (db.prepare('SELECT COUNT(*) AS c FROM clip_likes WHERE clip_id = ?').get(req.params.id) as any).c;
  res.json({ liked: !existing, likeCount: count });
});

router.post('/clips/:id/view', (req: Request, res: Response) => {
  db.prepare('UPDATE clips SET views = views + 1 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.get('/clips/:id/comments', (req: Request, res: Response) => {
  const rows = db
    .prepare(
      `SELECT cm.id, cm.body, cm.created_at, u.handle, u.display_name, u.avatar_color, u.is_demo
       FROM clip_comments cm JOIN users u ON u.id = cm.author_id WHERE cm.clip_id = ? ORDER BY cm.created_at ASC LIMIT 100`,
    )
    .all(req.params.id);
  res.json({ comments: rows });
});

router.post('/clips/:id/comments', requireAuth, (req: Request, res: Response) => {
  const body = cleanText(req.body?.body, 400);
  if (!body) { res.status(400).json({ error: 'Comment cannot be empty.' }); return; }
  const clip = db.prepare('SELECT 1 FROM clips WHERE id = ?').get(req.params.id);
  if (!clip) { res.status(404).json({ error: 'Clip not found' }); return; }
  const id = uid();
  db.prepare('INSERT INTO clip_comments (id, clip_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)').run(
    id, req.params.id, myId(req), body, nowIso(),
  );
  res.status(201).json({ comment: { id, body, created_at: nowIso(), handle: me(req)!.handle, display_name: me(req)!.displayName } });
});

/* ------------------------------------ music ----------------------------------- */

router.get('/music', (req: Request, res: Response) => {
  const genre = typeof req.query.genre === 'string' ? req.query.genre : '';
  const tracks = genre && genre !== 'All'
    ? db.prepare('SELECT * FROM music_tracks WHERE genre = ? ORDER BY title').all(genre)
    : db.prepare('SELECT * FROM music_tracks ORDER BY genre, title').all();
  const genres = db.prepare('SELECT DISTINCT genre FROM music_tracks ORDER BY genre').all().map((r: any) => r.genre);
  const playlists = db
    .prepare(
      `SELECT p.*, u.handle, (SELECT COUNT(*) FROM playlist_tracks pt WHERE pt.playlist_id = p.id) AS track_count
       FROM playlists p LEFT JOIN users u ON u.id = p.owner_id ORDER BY p.created_at DESC LIMIT 20`,
    )
    .all();
  res.json({ tracks, genres, playlists });
});

router.post('/playlists', requireAuth, (req: Request, res: Response) => {
  const schema = z.object({ title: z.string().min(2).max(80), description: z.string().max(300).optional(), coverUrl: z.string().max(400).optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Playlist title must be 2-80 characters.' }); return; }
  const id = uid();
  db.prepare('INSERT INTO playlists (id, owner_id, title, description, cover_url, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
    id, myId(req), cleanText(parsed.data.title, 80), cleanText(parsed.data.description ?? '', 300),
    parsed.data.coverUrl || '/art/banner-live.jpg', nowIso(),
  );
  res.status(201).json({ playlist: db.prepare('SELECT * FROM playlists WHERE id = ?').get(id) });
});

router.post('/playlists/:id/tracks', requireAuth, (req: Request, res: Response) => {
  const playlist: any = db.prepare('SELECT * FROM playlists WHERE id = ?').get(req.params.id);
  if (!playlist) { res.status(404).json({ error: 'Playlist not found' }); return; }
  if (playlist.owner_id !== myId(req)) { res.status(403).json({ error: 'You can only edit your own playlists.' }); return; }
  const trackId = cleanText(req.body?.trackId ?? '', 60);
  const track = db.prepare('SELECT 1 FROM music_tracks WHERE id = ?').get(trackId);
  if (!track) { res.status(404).json({ error: 'Track not found' }); return; }
  const position = (db.prepare('SELECT COUNT(*) AS c FROM playlist_tracks WHERE playlist_id = ?').get(req.params.id) as any).c;
  db.prepare('INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)').run(req.params.id, trackId, position);
  res.json({ ok: true });
});

router.get('/playlists/:id', (req: Request, res: Response) => {
  const playlist: any = db.prepare('SELECT * FROM playlists WHERE id = ?').get(req.params.id);
  if (!playlist) { res.status(404).json({ error: 'Playlist not found' }); return; }
  const tracks = db
    .prepare(
      `SELECT t.* FROM playlist_tracks pt JOIN music_tracks t ON t.id = pt.track_id
       WHERE pt.playlist_id = ? ORDER BY pt.position ASC`,
    )
    .all(req.params.id);
  res.json({ playlist, tracks });
});

/* ----------------------------------- events ----------------------------------- */

router.get('/events', (req: Request, res: Response) => {
  const viewer = myId(req) || '';
  const rows = db
    .prepare(
      `SELECT e.*, (SELECT COUNT(*) FROM event_registrations r WHERE r.event_id = e.id) AS registered_count,
        EXISTS(SELECT 1 FROM event_registrations r WHERE r.event_id = e.id AND r.user_id = ?) AS registered
       FROM events e ORDER BY e.starts_at ASC LIMIT 40`,
    )
    .all(viewer);
  res.json({ events: rows.map((r: any) => ({ ...r, registered: Boolean(r.registered) })) });
});

router.post('/events', requireAuth, (req: Request, res: Response) => {
  const schema = z.object({
    title: z.string().min(3).max(120),
    description: z.string().max(800).optional(),
    kind: z.enum(['event', 'tournament', 'watch-party', 'challenge']).optional(),
    startsAt: z.string().min(10).max(40),
    endsAt: z.string().min(10).max(40),
    capacity: z.number().int().min(0).max(100000).optional(),
    bannerUrl: z.string().max(400).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Events need a title and start/end times.' }); return; }
  const id = uid();
  db.prepare(
    'INSERT INTO events (id, title, description, banner_url, kind, starts_at, ends_at, capacity, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(
    id, cleanText(parsed.data.title, 120), cleanText(parsed.data.description ?? '', 800),
    parsed.data.bannerUrl || '/art/banner-live.jpg', parsed.data.kind ?? 'event',
    parsed.data.startsAt, parsed.data.endsAt, parsed.data.capacity ?? 0, myId(req), nowIso(),
  );
  db.prepare('INSERT OR IGNORE INTO event_registrations (event_id, user_id, created_at) VALUES (?, ?, ?)').run(id, myId(req), nowIso());
  awardXp(myId(req), 25);
  res.status(201).json({ event: db.prepare('SELECT * FROM events WHERE id = ?').get(id) });
});

router.post('/events/:id/register', requireAuth, (req: Request, res: Response) => {
  const event: any = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
  if (!event) { res.status(404).json({ error: 'Event not found' }); return; }
  const existing = db.prepare('SELECT 1 FROM event_registrations WHERE event_id = ? AND user_id = ?').get(req.params.id, myId(req));
  if (existing) {
    db.prepare('DELETE FROM event_registrations WHERE event_id = ? AND user_id = ?').run(req.params.id, myId(req));
    res.json({ registered: false });
    return;
  }
  const count = (db.prepare('SELECT COUNT(*) AS c FROM event_registrations WHERE event_id = ?').get(req.params.id) as any).c;
  if (event.capacity > 0 && count >= event.capacity) {
    res.status(409).json({ error: 'This event is full.' });
    return;
  }
  db.prepare('INSERT INTO event_registrations (event_id, user_id, created_at) VALUES (?, ?, ?)').run(req.params.id, myId(req), nowIso());
  res.json({ registered: true });
});

/* ---------------------------------- battles ----------------------------------- */

router.get('/battles', (req: Request, res: Response) => {
  const viewer = myId(req) || '';
  const battles = db.prepare('SELECT * FROM battles ORDER BY starts_at ASC LIMIT 20').all();
  const entries = db
    .prepare(
      `SELECT be.battle_id, be.score, be.created_at, u.handle, u.display_name, u.avatar_color, u.is_demo,
        (SELECT COUNT(*) FROM battle_entries x WHERE x.battle_id = be.battle_id) AS entry_count
       FROM battle_entries be JOIN users u ON u.id = be.user_id ORDER BY be.score DESC`,
    )
    .all();
  const mine = viewer
    ? db.prepare('SELECT battle_id, score FROM battle_entries WHERE user_id = ?').all(viewer)
    : [];
  res.json({ battles, entries, mine });
});

router.post('/battles/:id/enter', requireAuth, (req: Request, res: Response) => {
  const battle: any = db.prepare('SELECT * FROM battles WHERE id = ?').get(req.params.id);
  if (!battle) { res.status(404).json({ error: 'Battle not found' }); return; }
  const score = Number(req.body?.score);
  if (!Number.isFinite(score) || score < 0 || score > 10_000_000) { res.status(400).json({ error: 'Valid score required.' }); return; }
  const game: any = db.prepare('SELECT max_score_per_second, min_seconds, id FROM games WHERE slug = ?').get(battle.game_slug);
  if (game && score > game.max_score_per_second * Math.max(game.min_seconds, 120) + 250) {
    res.status(422).json({ error: 'Score failed server-side verification.' });
    return;
  }
  const existing: any = db.prepare('SELECT score FROM battle_entries WHERE battle_id = ? AND user_id = ?').get(req.params.id, myId(req));
  if (existing) {
    if (score <= existing.score) { res.json({ ok: true, best: existing.score, improved: false }); return; }
    db.prepare('UPDATE battle_entries SET score = ? WHERE battle_id = ? AND user_id = ?').run(score, req.params.id, myId(req));
  } else {
    db.prepare('INSERT INTO battle_entries (battle_id, user_id, score, created_at) VALUES (?, ?, ?, ?)').run(req.params.id, myId(req), score, nowIso());
  }
  awardXp(myId(req), 40);
  res.json({ ok: true, best: score, improved: true });
});

/* --------------------------------- marketplace -------------------------------- */

router.get('/marketplace', (req: Request, res: Response) => {
  const kind = typeof req.query.kind === 'string' ? req.query.kind : '';
  const rows = kind && kind !== 'All'
    ? db.prepare('SELECT m.*, u.handle, u.display_name, u.is_demo FROM marketplace_items m LEFT JOIN users u ON u.id = m.creator_id WHERE m.kind = ? ORDER BY m.downloads DESC').all(kind)
    : db.prepare('SELECT m.*, u.handle, u.display_name, u.is_demo FROM marketplace_items m LEFT JOIN users u ON u.id = m.creator_id ORDER BY m.downloads DESC').all();
  const kinds = db.prepare('SELECT DISTINCT kind FROM marketplace_items ORDER BY kind').all().map((r: any) => r.kind);
  res.json({ items: rows, kinds });
});

router.post('/marketplace/:id/download', (req: Request, res: Response) => {
  const item: any = db.prepare('SELECT * FROM marketplace_items WHERE id = ?').get(req.params.id);
  if (!item) { res.status(404).json({ error: 'Item not found' }); return; }
  db.prepare('UPDATE marketplace_items SET downloads = downloads + 1 WHERE id = ?').run(req.params.id);
  res.json({ ok: true, downloads: item.downloads + 1, note: 'Free community asset — no payment required.' });
});

router.post('/marketplace', requireAuth, (req: Request, res: Response) => {
  const schema = z.object({
    title: z.string().min(3).max(120),
    description: z.string().max(600).optional(),
    kind: z.enum(['asset', 'template', 'experience', 'game', 'collection']).optional(),
    coverUrl: z.string().max(400).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Listing title must be 3-120 characters.' }); return; }
  const id = uid();
  db.prepare(
    'INSERT INTO marketplace_items (id, title, description, creator_id, cover_url, kind, price, rating, downloads, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, ?)',
  ).run(id, cleanText(parsed.data.title, 120), cleanText(parsed.data.description ?? '', 600), myId(req),
    parsed.data.coverUrl || '/art/banner-marketplace.jpg', parsed.data.kind ?? 'asset', nowIso());
  awardXp(myId(req), 30);
  res.status(201).json({ item: db.prepare('SELECT * FROM marketplace_items WHERE id = ?').get(id) });
});

/* -------------------------------- experiences --------------------------------- */

router.get('/experiences', (_req: Request, res: Response) => {
  const rows = db
    .prepare(
      `SELECT e.id, e.title, e.description, e.type, e.cover_url, e.published, e.created_at,
        u.handle, u.display_name, u.is_demo,
        (SELECT COUNT(*) FROM experience_responses r WHERE r.experience_id = e.id) AS response_count
       FROM experiences e JOIN users u ON u.id = e.author_id WHERE e.published = 1 ORDER BY e.created_at DESC LIMIT 40`,
    )
    .all();
  res.json({ experiences: rows });
});

router.get('/experiences/:id', (req: Request, res: Response) => {
  const row: any = db
    .prepare('SELECT e.*, u.handle, u.display_name FROM experiences e JOIN users u ON u.id = e.author_id WHERE e.id = ?')
    .get(req.params.id);
  if (!row) { res.status(404).json({ error: 'Experience not found' }); return; }
  res.json({ experience: { ...row, data: JSON.parse(row.data) } });
});

router.post('/experiences', requireAuth, (req: Request, res: Response) => {
  const schema = z.object({
    title: z.string().min(3).max(120),
    description: z.string().max(600).optional(),
    type: z.enum(['quiz', 'poll', 'story', 'challenge', 'trivia', 'battle']).optional(),
    coverUrl: z.string().max(400).optional(),
    data: z.any().optional(),
    published: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Experiences need a title of 3+ characters and content.' }); return; }
  const id = uid();
  db.prepare(
    'INSERT INTO experiences (id, title, description, type, cover_url, author_id, data, published, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(id, cleanText(parsed.data.title, 120), cleanText(parsed.data.description ?? '', 600), parsed.data.type ?? 'quiz',
    parsed.data.coverUrl || '/art/banner-create.jpg', myId(req), JSON.stringify(parsed.data.data).slice(0, 60000),
    parsed.data.published ? 1 : 0, nowIso());
  awardXp(myId(req), 35);
  res.status(201).json({ experience: db.prepare('SELECT * FROM experiences WHERE id = ?').get(id) });
});

router.post('/experiences/:id/responses', requireAuth, (req: Request, res: Response) => {
  const experience: any = db.prepare('SELECT * FROM experiences WHERE id = ?').get(req.params.id);
  if (!experience) { res.status(404).json({ error: 'Experience not found' }); return; }
  const data = JSON.parse(experience.data);
  const answers = req.body?.answers;
  if (!answers || typeof answers !== 'object') { res.status(400).json({ error: 'Answers required.' }); return; }
  let score = 0;
  if (Array.isArray(data.questions)) {
    data.questions.forEach((q: any, index: number) => {
      if (q.correctIndex !== undefined && Number(answers[index]) === Number(q.correctIndex)) score += 1;
    });
  }
  const id = uid();
  db.prepare('INSERT INTO experience_responses (id, experience_id, user_id, answers, score, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
    id, req.params.id, myId(req), JSON.stringify(answers).slice(0, 20000), score, nowIso(),
  );
  awardXp(myId(req), 10 + score * 5);
  const total = Array.isArray(data.questions) ? data.questions.length : 0;
  res.status(201).json({ ok: true, score, total });
});

/* ----------------------------------- missions --------------------------------- */

router.get('/missions', (req: Request, res: Response) => {
  const missions = db.prepare('SELECT * FROM missions ORDER BY kind, title').all();
  const viewer = myId(req);
  let completed: string[] = [];
  if (viewer) {
    const posts = (db.prepare('SELECT COUNT(*) AS c FROM posts WHERE author_id = ? AND created_at > ?').get(viewer, new Date(Date.now() - 864e5).toISOString()) as any).c;
    const games = (db.prepare('SELECT COUNT(*) AS c FROM game_scores WHERE user_id = ? AND created_at > ?').get(viewer, new Date(Date.now() - 864e5).toISOString()) as any).c;
    const comments = (db.prepare('SELECT COUNT(*) AS c FROM comments WHERE author_id = ? AND created_at > ?').get(viewer, new Date(Date.now() - 864e5).toISOString()) as any).c;
    if (posts > 0) completed.push('daily-post');
    if (games > 0) completed.push('daily-play');
    if (comments > 0) completed.push('daily-comment');
  }
  res.json({ missions, completed });
});

export default router;
