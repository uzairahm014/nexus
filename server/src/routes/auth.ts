import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { db, getSetting, nowIso, uid } from '../db';
import {
  findUserById,
  hashPassword,
  levelForXp,
  requireAuth,
  signToken,
  toPublicUser,
  verifyPassword,
} from '../auth';
import { cleanText, me, myId, publicProfileRow } from './helpers';

const router = Router();

const registerSchema = z.object({
  email: z.string().email().max(180),
  handle: z.string().regex(/^[a-zA-Z0-9_]{3,20}$/, 'Handle must be 3-20 letters, numbers or underscores'),
  displayName: z.string().min(2).max(40),
  password: z.string().min(8).max(200),
});

const loginSchema = z.object({
  identifier: z.string().min(3).max(180),
  password: z.string().min(1).max(200),
});

function setSessionCookie(res: Response, token: string): void {
  res.cookie('nexus_token', token, {
    httpOnly: true,
    sameSite: process.env.COOKIE_SAMESITE === 'none' ? 'none' : 'lax',
    secure: process.env.COOKIE_SAMESITE === 'none' || process.env.NODE_ENV === 'production',
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

router.post('/register', (req: Request, res: Response) => {
  if (getSetting('registrations_open', 'true') !== 'true') {
    res.status(403).json({ error: 'Registrations are currently closed by an administrator.' });
    return;
  }
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid registration details' });
    return;
  }
  const email = parsed.data.email.toLowerCase();
  const handle = parsed.data.handle.toLowerCase();
  const taken = db.prepare('SELECT id FROM users WHERE email = ? OR handle = ?').get(email, handle);
  if (taken) {
    res.status(409).json({ error: 'That email or handle is already registered.' });
    return;
  }
  const id = uid();
  db.prepare(
    `INSERT INTO users (id, handle, email, password_hash, display_name, bio, avatar_color, role, xp, level, is_demo, created_at)
     VALUES (?, ?, ?, ?, ?, '', '#7C3AED', 'user', 0, 1, 0, ?)`,
  ).run(id, handle, email, hashPassword(parsed.data.password), cleanText(parsed.data.displayName, 40), nowIso());
  const token = signToken(id, 0);
  setSessionCookie(res, token);
  res.status(201).json({ token, user: findUserById(id) });
});

router.post('/login', (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Enter your email or handle and password.' });
    return;
  }
  const identifier = parsed.data.identifier.toLowerCase();
  const row: any = db
    .prepare('SELECT id, password_hash, token_version FROM users WHERE email = ? OR handle = ?')
    .get(identifier, identifier);
  if (!row || !verifyPassword(parsed.data.password, row.password_hash)) {
    res.status(401).json({ error: 'Incorrect email/handle or password.' });
    return;
  }
  const token = signToken(row.id, row.token_version);
  setSessionCookie(res, token);
  res.json({ token, user: findUserById(row.id) });
});

router.post('/logout', requireAuth, (req: Request, res: Response) => {
  db.prepare('UPDATE users SET token_version = token_version + 1 WHERE id = ?').run(myId(req));
  res.clearCookie('nexus_token', { path: '/' });
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req: Request, res: Response) => {
  const user = me(req)!;
  const stats = {
    posts: (db.prepare('SELECT COUNT(*) AS c FROM posts WHERE author_id = ?').get(user.id) as any).c,
    followers: (db.prepare('SELECT COUNT(*) AS c FROM follows WHERE following_id = ?').get(user.id) as any).c,
    following: (db.prepare('SELECT COUNT(*) AS c FROM follows WHERE follower_id = ?').get(user.id) as any).c,
    achievements: (db.prepare('SELECT COUNT(*) AS c FROM user_achievements WHERE user_id = ?').get(user.id) as any).c,
    projects: (db.prepare('SELECT COUNT(*) AS c FROM projects WHERE owner_id = ?').get(user.id) as any).c,
    unreadNotifications: (
      db.prepare('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND read = 0').get(user.id) as any
    ).c,
  };
  res.json({ user, stats });
});

const updateSchema = z.object({
  displayName: z.string().min(2).max(40).optional(),
  bio: z.string().max(280).optional(),
  avatarColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  avatarUrl: z.string().max(500).nullable().optional(),
  bannerUrl: z.string().max(500).nullable().optional(),
  theme: z.enum(['nexus', 'violet', 'cyan', 'magenta']).optional(),
  privacy: z.enum(['public', 'friends', 'private']).optional(),
});

router.patch('/me', requireAuth, (req: Request, res: Response) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid profile update' });
    return;
  }
  const d = parsed.data;
  const fields: string[] = [];
  const values: unknown[] = [];
  if (d.displayName !== undefined) { fields.push('display_name = ?'); values.push(cleanText(d.displayName, 40)); }
  if (d.bio !== undefined) { fields.push('bio = ?'); values.push(cleanText(d.bio, 280)); }
  if (d.avatarColor !== undefined) { fields.push('avatar_color = ?'); values.push(d.avatarColor); }
  if (d.avatarUrl !== undefined) { fields.push('avatar_url = ?'); values.push(d.avatarUrl); }
  if (d.bannerUrl !== undefined) { fields.push('banner_url = ?'); values.push(d.bannerUrl); }
  if (d.theme !== undefined) { fields.push('theme = ?'); values.push(d.theme); }
  if (d.privacy !== undefined) { fields.push('privacy = ?'); values.push(d.privacy); }
  if (!fields.length) {
    res.status(400).json({ error: 'Nothing to update' });
    return;
  }
  values.push(myId(req));
  db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  res.json({ user: findUserById(myId(req)) });
});

router.post('/me/password', requireAuth, (req: Request, res: Response) => {
  const schema = z.object({ current: z.string().min(1), next: z.string().min(8).max(200) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'New password must be at least 8 characters.' });
    return;
  }
  const row: any = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(myId(req));
  if (!row || !verifyPassword(parsed.data.current, row.password_hash)) {
    res.status(401).json({ error: 'Current password is incorrect.' });
    return;
  }
  db.prepare('UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?').run(
    hashPassword(parsed.data.next), myId(req),
  );
  res.json({ ok: true, message: 'Password updated. Sign in again on other devices.' });
});

router.get('/users/:handle', (req: Request, res: Response) => {
  const viewer = myId(req) || null;
  const row: any = db
    .prepare(
      `SELECT u.*,
        (SELECT COUNT(*) FROM follows f WHERE f.following_id = u.id) AS followers,
        (SELECT COUNT(*) FROM follows f WHERE f.follower_id = u.id) AS following,
        (SELECT COUNT(*) FROM posts p WHERE p.author_id = u.id) AS post_count,
        (SELECT COUNT(*) FROM follows f WHERE f.follower_id = ? AND f.following_id = u.id) AS is_following
       FROM users u WHERE u.handle = ?`,
    )
    .get(viewer, req.params.handle.toLowerCase());
  if (!row) {
    res.status(404).json({ error: 'Profile not found' });
    return;
  }
  if (row.privacy === 'private' && viewer !== row.id) {
    res.json({ profile: { ...publicProfileRow(row, viewer ?? undefined), bio: '', posts: [], private: true } });
    return;
  }
  const posts = db
    .prepare(
      `SELECT p.*, u.handle, u.display_name, u.avatar_color, u.avatar_url,
        (SELECT COUNT(*) FROM post_likes l WHERE l.post_id = p.id) AS like_count,
        (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comment_count
       FROM posts p JOIN users u ON u.id = p.author_id
       WHERE p.author_id = ? ORDER BY p.created_at DESC LIMIT 30`,
    )
    .all(row.id);
  const achievements = db
    .prepare(
      `SELECT a.code, a.title, a.description, a.icon, a.xp, ua.unlocked_at, g.slug AS game_slug
       FROM user_achievements ua JOIN achievements a ON a.id = ua.achievement_id
       LEFT JOIN games g ON g.id = a.game_id WHERE ua.user_id = ? ORDER BY ua.unlocked_at DESC`,
    )
    .all(row.id);
  const projects = db
    .prepare('SELECT id, title, published, updated_at FROM projects WHERE owner_id = ? ORDER BY updated_at DESC LIMIT 20')
    .all(row.id);
  res.json({ profile: publicProfileRow(row, viewer ?? undefined), posts, achievements, projects });
});

router.post('/users/:handle/follow', requireAuth, (req: Request, res: Response) => {
  const target: any = db.prepare('SELECT id, handle FROM users WHERE handle = ?').get(req.params.handle.toLowerCase());
  if (!target) { res.status(404).json({ error: 'Profile not found' }); return; }
  if (target.id === myId(req)) { res.status(400).json({ error: 'You cannot follow yourself.' }); return; }
  const blocked = db.prepare('SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)')
    .get(myId(req), target.id, target.id, myId(req));
  if (blocked) { res.status(403).json({ error: 'This profile is not available.' }); return; }
  db.prepare('INSERT OR IGNORE INTO follows (follower_id, following_id, created_at) VALUES (?, ?, ?)').run(myId(req), target.id, nowIso());
  const follower = findUserById(myId(req));
  db.prepare('INSERT INTO notifications (id, user_id, type, actor_id, entity_id, body, read, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)')
    .run(uid(), target.id, 'follow', myId(req), null, `${follower?.displayName ?? 'Someone'} started following you.`, nowIso());
  res.json({ ok: true, following: true });
});

router.delete('/users/:handle/follow', requireAuth, (req: Request, res: Response) => {
  const target: any = db.prepare('SELECT id FROM users WHERE handle = ?').get(req.params.handle.toLowerCase());
  if (!target) { res.status(404).json({ error: 'Profile not found' }); return; }
  db.prepare('DELETE FROM follows WHERE follower_id = ? AND following_id = ?').run(myId(req), target.id);
  res.json({ ok: true, following: false });
});

router.get('/users/:handle/followers', (req: Request, res: Response) => {
  const target: any = db.prepare('SELECT id FROM users WHERE handle = ?').get(req.params.handle.toLowerCase());
  if (!target) { res.status(404).json({ error: 'Profile not found' }); return; }
  const rows = db
    .prepare(
      `SELECT u.handle, u.display_name, u.avatar_color, u.avatar_url, u.is_demo
       FROM follows f JOIN users u ON u.id = f.follower_id WHERE f.following_id = ? LIMIT 100`,
    )
    .all(target.id);
  res.json({ users: rows });
});

router.get('/users/:handle/friends', (req: Request, res: Response) => {
  const target: any = db.prepare('SELECT id FROM users WHERE handle = ?').get(req.params.handle.toLowerCase());
  if (!target) { res.status(404).json({ error: 'Profile not found' }); return; }
  const rows = db
    .prepare(
      `SELECT u.handle, u.display_name, u.avatar_color, u.is_demo
       FROM follows a JOIN follows b ON b.follower_id = a.following_id AND b.following_id = a.follower_id
       JOIN users u ON u.id = a.following_id WHERE a.follower_id = ? LIMIT 100`,
    )
    .all(target.id);
  res.json({ friends: rows });
});

router.get('/suggested', (req: Request, res: Response) => {
  const viewer = myId(req) || null;
  const rows = db
    .prepare(
      `SELECT u.handle, u.display_name, u.avatar_color, u.bio, u.level, u.is_demo,
        (SELECT COUNT(*) FROM follows f WHERE f.following_id = u.id) AS followers
       FROM users u WHERE u.id != COALESCE(?, '') AND u.privacy = 'public'
       ORDER BY followers DESC, u.xp DESC LIMIT 8`,
    )
    .all(viewer);
  res.json({ users: rows });
});

export default router;
