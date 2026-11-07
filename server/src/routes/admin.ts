import { Router } from 'express';
import type { Request, Response } from 'express';
import { db, getSetting, nowIso, setSetting } from '../db';
import { requireAuth, requireRole } from '../auth';
import { cleanText, myId } from './helpers';

const router = Router();
router.use(requireAuth, requireRole('admin'));

router.get('/stats', (_req: Request, res: Response) => {
  const one = (sql: string, ...params: unknown[]) => (db.prepare(sql).get(...params) as any).c as number;
  res.json({
    users: one('SELECT COUNT(*) AS c FROM users'),
    posts: one('SELECT COUNT(*) AS c FROM posts'),
    games: one('SELECT COUNT(*) AS c FROM games'),
    scores: one('SELECT COUNT(*) AS c FROM game_scores'),
    communities: one('SELECT COUNT(*) AS c FROM communities'),
    clips: one('SELECT COUNT(*) AS c FROM clips'),
    openReports: one("SELECT COUNT(*) AS c FROM reports WHERE status = 'open'"),
    projects: one('SELECT COUNT(*) AS c FROM projects'),
    publishedProjects: one('SELECT COUNT(*) AS c FROM projects WHERE published = 1'),
    experiences: one('SELECT COUNT(*) AS c FROM experiences'),
    signupsToday: one('SELECT COUNT(*) AS c FROM users WHERE created_at > ?', new Date(Date.now() - 864e5).toISOString()),
  });
});

router.get('/users', (req: Request, res: Response) => {
  const q = cleanText(req.query.q ?? '', 60);
  const rows = db
    .prepare(
      `SELECT id, handle, email, display_name, role, xp, level, is_demo, created_at,
        (SELECT COUNT(*) FROM posts p WHERE p.author_id = users.id) AS post_count
       FROM users WHERE handle LIKE ? OR display_name LIKE ? OR email LIKE ?
       ORDER BY created_at DESC LIMIT 100`,
    )
    .all(`%${q}%`, `%${q}%`, `%${q}%`);
  res.json({ users: rows });
});

router.post('/users/:id/role', (req: Request, res: Response) => {
  const role = req.body?.role;
  if (!['user', 'moderator', 'admin'].includes(role)) { res.status(400).json({ error: 'Invalid role.' }); return; }
  if (req.params.id === myId(req)) { res.status(400).json({ error: 'You cannot change your own role.' }); return; }
  db.prepare('UPDATE users SET role = ?, token_version = token_version + 1 WHERE id = ?').run(role, req.params.id);
  res.json({ ok: true, role });
});

router.post('/users/:id/suspend', (req: Request, res: Response) => {
  const user: any = db.prepare('SELECT role FROM users WHERE id = ?').get(req.params.id);
  if (!user) { res.status(404).json({ error: 'User not found.' }); return; }
  if (user.role === 'admin') { res.status(400).json({ error: 'Admins cannot be suspended here.' }); return; }
  const suspend = req.body?.suspend !== false;
  db.prepare('UPDATE users SET role = ?, token_version = token_version + 1 WHERE id = ?').run(suspend ? 'suspended' : 'user', req.params.id);
  res.json({ ok: true, suspended: suspend });
});

router.get('/reports', (req: Request, res: Response) => {
  const status = typeof req.query.status === 'string' && req.query.status ? req.query.status : 'open';
  const rows = db
    .prepare(
      `SELECT r.*, u.handle AS reporter_handle FROM reports r
       LEFT JOIN users u ON u.id = r.reporter_id WHERE r.status = ? ORDER BY r.created_at DESC LIMIT 100`,
    )
    .all(status);
  res.json({ reports: rows });
});

router.post('/reports/:id/resolve', (req: Request, res: Response) => {
  const status = req.body?.status === 'dismissed' ? 'dismissed' : 'resolved';
  const result = db
    .prepare('UPDATE reports SET status = ?, resolved_by = ?, resolved_at = ? WHERE id = ?')
    .run(status, myId(req), nowIso(), req.params.id);
  if (result.changes === 0) { res.status(404).json({ error: 'Report not found.' }); return; }
  res.json({ ok: true, status });
});

router.get('/projects', (_req: Request, res: Response) => {
  const rows = db
    .prepare(
      `SELECT p.id, p.title, p.slug, p.published, p.updated_at, u.handle
       FROM projects p JOIN users u ON u.id = p.owner_id ORDER BY p.updated_at DESC LIMIT 100`,
    )
    .all();
  res.json({ projects: rows });
});

router.post('/projects/:id/approve', (req: Request, res: Response) => {
  const published = req.body?.published !== false;
  const result = db.prepare('UPDATE projects SET published = ? WHERE id = ?').run(published ? 1 : 0, req.params.id);
  if (result.changes === 0) { res.status(404).json({ error: 'Project not found.' }); return; }
  res.json({ ok: true, published });
});

router.get('/settings', (_req: Request, res: Response) => {
  res.json({
    settings: {
      registrationOpen: getSetting('registration_open', '1') === '1',
      uploadsEnabled: getSetting('uploads_enabled', '1') === '1',
      platformNotice: getSetting('platform_notice', ''),
    },
  });
});

router.put('/settings', (req: Request, res: Response) => {
  if (typeof req.body?.registrationOpen === 'boolean') setSetting('registration_open', req.body.registrationOpen ? '1' : '0');
  if (typeof req.body?.uploadsEnabled === 'boolean') setSetting('uploads_enabled', req.body.uploadsEnabled ? '1' : '0');
  if (typeof req.body?.platformNotice === 'string') setSetting('platform_notice', cleanText(req.body.platformNotice, 240));
  res.json({ ok: true });
});

export default router;
