import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { db, nowIso, uid } from '../db';
import { awardXp, requireAuth } from '../auth';
import { myId } from './helpers';

const router = Router();

/** Server-side achievement rules — the client can never unlock these by itself. */
const ACHIEVEMENT_RULES: Record<string, (score: number, durationSeconds: number) => boolean> = {
  'first-lap': (score) => score > 0,
  'sub-70': (score) => score >= 8000,
  podium: (score) => score >= 8500,
  'wave-5': (score) => score >= 2000,
  'wave-15': (score) => score >= 9000,
  'all-shards': (score) => score >= 5000,
  finish: (score) => score > 0,
  fortified: (score) => score >= 4000,
  victory: (score) => score >= 7000,
  reflex: (_score, duration) => duration >= 5,
  'score-1500': (score) => score >= 1500,
};

router.get('/games', (req: Request, res: Response) => {
  const genre = typeof req.query.genre === 'string' ? req.query.genre : '';
  const params: unknown[] = [];
  let where = '';
  if (genre && genre !== 'All') {
    where = 'WHERE g.genre = ?';
    params.push(genre);
  }
  const rows = db
    .prepare(
      `SELECT g.*, (SELECT COUNT(*) FROM game_scores s WHERE s.game_id = g.id) AS play_count,
        (SELECT MAX(score) FROM game_scores s WHERE s.game_id = g.id) AS top_score
       FROM games g ${where} ORDER BY g.featured DESC, g.title ASC`,
    )
    .all(...params);
  const genres = db.prepare('SELECT DISTINCT genre FROM games ORDER BY genre').all().map((r: any) => r.genre);
  res.json({ games: rows, genres });
});

router.get('/games/:slug', (req: Request, res: Response) => {
  const viewer = myId(req) || '';
  const game: any = db
    .prepare(
      `SELECT g.*, (SELECT COUNT(*) FROM game_scores s WHERE s.game_id = g.id) AS play_count,
        (SELECT MAX(score) FROM game_scores s WHERE s.game_id = g.id) AS top_score
       FROM games g WHERE g.slug = ?`,
    )
    .get(req.params.slug);
  if (!game) { res.status(404).json({ error: 'Game not found' }); return; }
  const leaderboard = db
    .prepare(
      `SELECT s.score, s.created_at, s.meta, u.handle, u.display_name, u.avatar_color, u.is_demo
       FROM game_scores s JOIN users u ON u.id = s.user_id
       WHERE s.game_id = ? ORDER BY s.score DESC, s.created_at ASC LIMIT 10`,
    )
    .all(game.id);
  const achievements = db
    .prepare(
      `SELECT a.code, a.title, a.description, a.icon, a.xp,
        EXISTS(SELECT 1 FROM user_achievements ua WHERE ua.achievement_id = a.id AND ua.user_id = ?) AS unlocked
       FROM achievements a WHERE a.game_id = ?`,
    )
    .all(viewer, game.id);
  const myScores = viewer
    ? db.prepare('SELECT score, created_at, meta FROM game_scores WHERE game_id = ? AND user_id = ? ORDER BY score DESC LIMIT 5').all(game.id, viewer)
    : [];
  const progress = viewer
    ? db.prepare('SELECT data, updated_at FROM game_progress WHERE game_id = ? AND user_id = ?').get(game.id, viewer)
    : null;
  res.json({ game, leaderboard, achievements, myScores, progress });
});

router.post('/games/:slug/scores', requireAuth, (req: Request, res: Response) => {
  const schema = z.object({
    score: z.number().int().min(0).max(10_000_000),
    durationSeconds: z.number().min(0).max(86_400),
    meta: z.string().max(120).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid score payload.' }); return; }
  const game: any = db.prepare('SELECT * FROM games WHERE slug = ?').get(req.params.slug);
  if (!game) { res.status(404).json({ error: 'Game not found' }); return; }
  if (!game.playable) { res.status(400).json({ error: 'This game is not accepting scores yet.' }); return; }

  const { score, durationSeconds } = parsed.data;
  if (durationSeconds < game.min_seconds) {
    res.status(422).json({ error: 'Run too short to be verified.', reason: 'duration' });
    return;
  }
  const maxPlausible = game.max_score_per_second * durationSeconds + 250;
  if (score > maxPlausible) {
    res.status(422).json({ error: 'Score failed server-side verification.', reason: 'implausible' });
    return;
  }

  const id = uid();
  db.prepare('INSERT INTO game_scores (id, game_id, user_id, score, meta, validated, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)').run(
    id, game.id, myId(req), score, parsed.data.meta ?? null, nowIso(),
  );
  awardXp(myId(req), Math.min(200, 10 + Math.round(score / 100)));

  const unlocked: string[] = [];
  const gameAchievements = db.prepare('SELECT id, code, title, xp FROM achievements WHERE game_id = ?').all(game.id) as any[];
  for (const achievement of gameAchievements) {
    const rule = ACHIEVEMENT_RULES[achievement.code];
    if (!rule || !rule(score, durationSeconds)) continue;
    const already = db.prepare('SELECT 1 FROM user_achievements WHERE user_id = ? AND achievement_id = ?').get(myId(req), achievement.id);
    if (already) continue;
    db.prepare('INSERT INTO user_achievements (user_id, achievement_id, unlocked_at) VALUES (?, ?, ?)').run(myId(req), achievement.id, nowIso());
    awardXp(myId(req), achievement.xp);
    db.prepare('INSERT INTO notifications (id, user_id, type, actor_id, entity_id, body, read, created_at) VALUES (?, ?, ?, NULL, ?, ?, 0, ?)').run(
      uid(), myId(req), 'achievement', achievement.id, `Achievement unlocked: ${achievement.title}`, nowIso(),
    );
    unlocked.push(achievement.title);
  }

  const rank = (db.prepare('SELECT COUNT(*) AS c FROM game_scores WHERE game_id = ? AND score > ?').get(game.id, score) as any).c + 1;
  const best = (db.prepare('SELECT MAX(score) AS s FROM game_scores WHERE game_id = ? AND user_id = ?').get(game.id, myId(req)) as any).s;
  res.status(201).json({ ok: true, scoreId: id, rank, personalBest: best, unlocked });
});

router.get('/games/:slug/leaderboard', (req: Request, res: Response) => {
  const game: any = db.prepare('SELECT id FROM games WHERE slug = ?').get(req.params.slug);
  if (!game) { res.status(404).json({ error: 'Game not found' }); return; }
  const rows = db
    .prepare(
      `SELECT s.score, s.created_at, s.meta, u.handle, u.display_name, u.avatar_color, u.is_demo
       FROM game_scores s JOIN users u ON u.id = s.user_id
       WHERE s.game_id = ? ORDER BY s.score DESC, s.created_at ASC LIMIT ?`,
    )
    .all(game.id, Math.min(100, Number(req.query.limit) || 25));
  res.json({ leaderboard: rows });
});

router.put('/games/:slug/progress', requireAuth, (req: Request, res: Response) => {
  const game: any = db.prepare('SELECT id FROM games WHERE slug = ?').get(req.params.slug);
  if (!game) { res.status(404).json({ error: 'Game not found' }); return; }
  const data = req.body?.data;
  if (data === undefined) { res.status(400).json({ error: 'Progress payload required.' }); return; }
  const serialised = JSON.stringify(data).slice(0, 20000);
  db.prepare(
    `INSERT INTO game_progress (game_id, user_id, data, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(game_id, user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
  ).run(game.id, myId(req), serialised, nowIso());
  res.json({ ok: true, savedAt: nowIso() });
});

router.get('/leaderboards', (_req: Request, res: Response) => {
  const rows = db
    .prepare(
      `SELECT u.handle, u.display_name, u.avatar_color, u.level, u.xp, u.is_demo,
        (SELECT COUNT(*) FROM follows f WHERE f.following_id = u.id) AS followers
       FROM users u ORDER BY u.xp DESC LIMIT 25`,
    )
    .all();
  const perGame = db
    .prepare(
      `SELECT g.slug, g.title, g.accent,
        (SELECT u.handle FROM game_scores s JOIN users u ON u.id = s.user_id WHERE s.game_id = g.id ORDER BY s.score DESC LIMIT 1) AS top_handle,
        (SELECT MAX(score) FROM game_scores s WHERE s.game_id = g.id) AS top_score
       FROM games g ORDER BY g.featured DESC`,
    )
    .all();
  res.json({ players: rows, perGame });
});

router.get('/achievements', requireAuth, (req: Request, res: Response) => {
  const rows = db
    .prepare(
      `SELECT a.code, a.title, a.description, a.icon, a.xp, g.slug AS game_slug,
        ua.unlocked_at FROM achievements a
       LEFT JOIN games g ON g.id = a.game_id
       LEFT JOIN user_achievements ua ON ua.achievement_id = a.id AND ua.user_id = ?
       ORDER BY (ua.unlocked_at IS NULL), a.title`,
    )
    .all(myId(req));
  res.json({ achievements: rows });
});

export default router;
