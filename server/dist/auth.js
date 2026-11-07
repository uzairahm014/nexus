"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.toPublicUser = toPublicUser;
exports.findUserById = findUserById;
exports.signToken = signToken;
exports.tokenFromRequest = tokenFromRequest;
exports.optionalAuth = optionalAuth;
exports.requireAuth = requireAuth;
exports.requireAdmin = requireAdmin;
exports.requireRole = requireRole;
exports.hashPassword = hashPassword;
exports.verifyPassword = verifyPassword;
exports.createNotification = createNotification;
exports.isBlockedEitherWay = isBlockedEitherWay;
exports.levelForXp = levelForXp;
exports.awardXp = awardXp;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const db_1 = require("./db");
const SELECT_USER = `SELECT id, handle, display_name, bio, avatar_color, avatar_url, banner_url,
  theme, role, xp, level, privacy, created_at FROM users`;
function toPublicUser(row) {
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
function findUserById(id) {
    const row = db_1.db.prepare(`${SELECT_USER} WHERE id = ?`).get(id);
    return row ? toPublicUser(row) : null;
}
function signToken(userId, tokenVersion) {
    return jsonwebtoken_1.default.sign({ uid: userId, tv: tokenVersion }, (0, db_1.jwtSecret)(), { expiresIn: '30d' });
}
function tokenFromRequest(req) {
    const header = req.headers.authorization;
    if (header && header.startsWith('Bearer '))
        return header.slice(7).trim();
    const cookie = req.cookies?.nexus_token;
    return typeof cookie === 'string' && cookie.length > 10 ? cookie : null;
}
/** Resolves the bearer token / cookie into req.user when valid. Never throws. */
function optionalAuth(req, _res, next) {
    const token = tokenFromRequest(req);
    if (!token)
        return next();
    try {
        const payload = jsonwebtoken_1.default.verify(token, (0, db_1.jwtSecret)());
        if (!payload.uid)
            return next();
        const row = db_1.db
            .prepare(`SELECT token_version FROM users WHERE id = ?`)
            .get(payload.uid);
        if (!row || row.token_version !== payload.tv)
            return next();
        const user = findUserById(payload.uid);
        if (user)
            req.user = user;
    }
    catch {
        /* invalid or expired token — treated as anonymous */
    }
    next();
}
function requireAuth(req, res, next) {
    if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
    }
    next();
}
function requireAdmin(req, res, next) {
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
function requireRole(...roles) {
    return (req, res, next) => {
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
function hashPassword(password) {
    return bcryptjs_1.default.hashSync(password, 10);
}
function verifyPassword(password, hash) {
    try {
        return bcryptjs_1.default.compareSync(password, hash);
    }
    catch {
        return false;
    }
}
function createNotification(userId, type, body, actorId, entityId) {
    if (!userId)
        return;
    db_1.db.prepare(`INSERT INTO notifications (id, user_id, type, actor_id, entity_id, body, read, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?)`).run((0, db_1.uid)(), userId, type, actorId ?? null, entityId ?? null, body, (0, db_1.nowIso)());
}
function isBlockedEitherWay(a, b) {
    const row = db_1.db
        .prepare(`SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)`)
        .get(a, b, b, a);
    return Boolean(row);
}
/** Level curve used across profiles, leaderboards and the studio. */
function levelForXp(xp) {
    return Math.max(1, Math.floor(Math.sqrt(Math.max(0, xp)) / 4) + 1);
}
function awardXp(userId, amount) {
    const row = db_1.db.prepare('SELECT xp FROM users WHERE id = ?').get(userId);
    const xp = (row?.xp ?? 0) + Math.max(0, Math.round(amount));
    const level = levelForXp(xp);
    db_1.db.prepare('UPDATE users SET xp = ?, level = ? WHERE id = ?').run(xp, level, userId);
    return { xp, level };
}
