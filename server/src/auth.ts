import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { db, jwtSecret, nowIso, uid } from './db';

export interface PublicUser {
  id: string;
  handle: string;
  displayName: string;
  bio: string;
  avatarColor: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  theme: string;
  role: string;
  xp: number;
  level: number;
  privacy: string;
  createdAt: string;
}

export interface AuthedRequest extends Request {
  user?: PublicUser;
}

const SELECT_USER = `SELECT id, handle, display_name, bio, avatar_color, avatar_url, banner_url,
  theme, role, xp, level, privacy, created_at FROM users`;

export function toPublicUser(row: any): PublicUser {
  return {
    id: row.id,
    handle: row.handle,
    displayName: row.display_name,
    bio: row.bio ?? '',
    avatarColor: row.avatar_color ?? '#7C3AED',
    avatarUrl: row.avatar_url ?? null,
    bannerUrl: row.banner_url ?? null,
    theme: row.theme ?? 'nexus',
    role: row.role ?? 'user',
    xp: row.xp ?? 0,
    level: row.level ?? 1,
    privacy: row.privacy ?? 'public',
    createdAt: row.created_at,
  };
}

export function findUserById(id: string): PublicUser | null {
  const row = db.prepare(`${SELECT_USER} FROM users WHERE id = ?`).get(id);
  return row ? toPublicUser(row) : null;
}

export function signToken(userId: string, tokenVersion: number): string {
  return jwt.sign({ uid: userId, tv: tokenVersion }, jwtSecret(), { expiresIn: '30d' });
}

export function tokenFromRequest(req: Request): string | null {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) return header.slice(7).trim();
  const cookie = (req as any).cookies?.nexus_token;
  return typeof cookie === 'string' && cookie.length > 10 ? cookie : null;
}

/** Resolves the bearer token / cookie into req.user when valid. Never throws. */
export function optionalAuth(req: AuthedRequest, _res: Response, next: NextFunction): void {
  const token = tokenFromRequest(req);
  if (!token) return next();
  try {
    const payload = jwt.verify(token, jwtSecret()) as { uid?: string; tv?: number };
    if (!payload.uid) return next();
    const row: any = db
      .prepare(`SELECT token_version FROM users WHERE id = ?`)
      .get(payload.uid);
    if (!row || row.token_version !== payload.tv) return next();
    const user = findUserById(payload.uid);
    if (user) req.user = user;
  } catch {
    /* invalid or expired token — treated as anonymous */
  }
  next();
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  next();
}

export function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  if (req.user.role !== 'admin') {
    res.status(403).json({ error: 'Administrator access required' });
    return;
  }
  next();
}

/** Role gate factory — used for admin/moderator-only route groups. */
export function requireRole(...roles: string[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'You do not have permission to do that' });
      return;
    }
    next();
  };
}

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 10);
}

export function verifyPassword(password: string, hash: string): boolean {
  try {
    return bcrypt.compareSync(password, hash);
  } catch {
    return false;
  }
}

export function createNotification(
  userId: string,
  type: string,
  body: string,
  actorId?: string | null,
  entityId?: string | null,
): void {
  if (!userId) return;
  db.prepare(
    `INSERT INTO notifications (id, user_id, type, actor_id, entity_id, body, read, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
  ).run(uid(), userId, type, actorId ?? null, entityId ?? null, body, nowIso());
}

export function isBlockedEitherWay(a: string, b: string): boolean {
  const row = db
    .prepare(`SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)`)
    .get(a, b, b, a);
  return Boolean(row);
}

/** Level curve used across profiles, leaderboards and the studio. */
export function levelForXp(xp: number): number {
  return Math.max(1, Math.floor(Math.sqrt(Math.max(0, xp)) / 4) + 1);
}

export function awardXp(userId: string, amount: number): { xp: number; level: number } {
  const row: any = db.prepare('SELECT xp FROM users WHERE id = ?').get(userId);
  const xp = (row?.xp ?? 0) + Math.max(0, Math.round(amount));
  const level = levelForXp(xp);
  db.prepare('UPDATE users SET xp = ?, level = ? WHERE id = ?').run(xp, level, userId);
  return { xp, level };
}
