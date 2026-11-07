"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const db_1 = require("../db");
const auth_1 = require("../auth");
const helpers_1 = require("./helpers");
const router = (0, express_1.Router)();
const POST_SELECT = `
  SELECT p.id, p.body, p.media_url, p.media_type, p.community_id, p.created_at,
    u.handle, u.display_name, u.avatar_color, u.avatar_url, u.is_demo, u.level,
    (SELECT COUNT(*) FROM post_likes l WHERE l.post_id = p.id) AS like_count,
    (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comment_count,
    EXISTS(SELECT 1 FROM post_likes l WHERE l.post_id = p.id AND l.user_id = ?) AS liked,
    EXISTS(SELECT 1 FROM bookmarks b WHERE b.post_id = p.id AND b.user_id = ?) AS bookmarked,
    c.slug AS community_slug, c.name AS community_name
  FROM posts p
  JOIN users u ON u.id = p.author_id
  LEFT JOIN communities c ON c.id = p.community_id
`;
function shapePost(row) {
    return {
        id: row.id,
        body: row.body,
        mediaUrl: row.media_url,
        mediaType: row.media_type,
        community: row.community_slug ? { slug: row.community_slug, name: row.community_name } : null,
        createdAt: row.created_at,
        likeCount: row.like_count ?? 0,
        commentCount: row.comment_count ?? 0,
        liked: Boolean(row.liked),
        bookmarked: Boolean(row.bookmarked),
        author: {
            handle: row.handle,
            displayName: row.display_name,
            avatarColor: row.avatar_color,
            avatarUrl: row.avatar_url,
            level: row.level,
            isDemo: Boolean(row.is_demo),
        },
    };
}
router.get('/feed', (req, res) => {
    const { limit, offset } = (0, helpers_1.paging)(req);
    const viewer = (0, helpers_1.myId)(req) || null;
    const scope = String(req.query.scope ?? 'all');
    let rows;
    if (scope === 'following' && viewer) {
        rows = db_1.db
            .prepare(`${POST_SELECT}
         WHERE p.author_id IN (SELECT following_id FROM follows WHERE follower_id = ?)
            OR p.author_id = ?
         ORDER BY p.created_at DESC LIMIT ? OFFSET ?`)
            .all(viewer, viewer, viewer, viewer, limit, offset);
    }
    else {
        rows = db_1.db
            .prepare(`${POST_SELECT} ORDER BY p.created_at DESC LIMIT ? OFFSET ?`)
            .all(viewer, viewer, limit, offset);
    }
    res.json({ posts: rows.map(shapePost), nextOffset: offset + rows.length });
});
router.post('/posts', auth_1.requireAuth, (req, res) => {
    const schema = zod_1.z.object({
        body: zod_1.z.string().min(1).max(1000),
        mediaUrl: zod_1.z.string().max(500).optional().nullable(),
        communitySlug: zod_1.z.string().max(60).optional().nullable(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: 'Write something between 1 and 1000 characters.' });
        return;
    }
    let communityId = null;
    if (parsed.data.communitySlug) {
        const community = db_1.db.prepare('SELECT id FROM communities WHERE slug = ?').get(parsed.data.communitySlug);
        if (!community) {
            res.status(404).json({ error: 'Community not found' });
            return;
        }
        const member = db_1.db.prepare('SELECT 1 FROM community_members WHERE community_id = ? AND user_id = ?').get(community.id, (0, helpers_1.myId)(req));
        if (!member) {
            res.status(403).json({ error: 'Join the community before posting in it.' });
            return;
        }
        communityId = community.id;
    }
    const mediaUrl = parsed.data.mediaUrl ? (0, helpers_1.cleanText)(parsed.data.mediaUrl, 500) : null;
    if (mediaUrl && !/^(\/art\/|https:\/\/)/.test(mediaUrl)) {
        res.status(400).json({ error: 'Media must be an https URL or a NEXUS asset path.' });
        return;
    }
    const id = (0, db_1.uid)();
    db_1.db.prepare('INSERT INTO posts (id, author_id, body, media_url, media_type, community_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, (0, helpers_1.myId)(req), (0, helpers_1.cleanText)(parsed.data.body, 1000), mediaUrl, mediaUrl ? 'image' : null, communityId, (0, db_1.nowIso)());
    (0, auth_1.awardXp)((0, helpers_1.myId)(req), 15);
    const row = db_1.db.prepare(`${POST_SELECT} WHERE p.id = ?`).get((0, helpers_1.myId)(req), (0, helpers_1.myId)(req), id);
    res.status(201).json({ post: shapePost(row) });
});
router.get('/posts/:id', (req, res) => {
    const viewer = (0, helpers_1.myId)(req) || '';
    const row = db_1.db.prepare(`${POST_SELECT} WHERE p.id = ?`).get(viewer, viewer, req.params.id);
    if (!row) {
        res.status(404).json({ error: 'Post not found' });
        return;
    }
    const comments = db_1.db
        .prepare(`SELECT c.id, c.body, c.created_at, u.handle, u.display_name, u.avatar_color, u.is_demo
       FROM comments c JOIN users u ON u.id = c.author_id WHERE c.post_id = ? ORDER BY c.created_at ASC LIMIT 100`)
        .all(req.params.id);
    res.json({ post: shapePost(row), comments });
});
router.delete('/posts/:id', auth_1.requireAuth, (req, res) => {
    const row = db_1.db.prepare('SELECT author_id FROM posts WHERE id = ?').get(req.params.id);
    if (!row) {
        res.status(404).json({ error: 'Post not found' });
        return;
    }
    const user = (0, helpers_1.me)(req);
    if (row.author_id !== user.id && user.role !== 'admin') {
        res.status(403).json({ error: 'You can only delete your own posts.' });
        return;
    }
    db_1.db.prepare('DELETE FROM posts WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
});
router.post('/posts/:id/like', auth_1.requireAuth, (req, res) => {
    const row = db_1.db.prepare('SELECT author_id FROM posts WHERE id = ?').get(req.params.id);
    if (!row) {
        res.status(404).json({ error: 'Post not found' });
        return;
    }
    const existing = db_1.db.prepare('SELECT 1 FROM post_likes WHERE post_id = ? AND user_id = ?').get(req.params.id, (0, helpers_1.myId)(req));
    if (existing) {
        db_1.db.prepare('DELETE FROM post_likes WHERE post_id = ? AND user_id = ?').run(req.params.id, (0, helpers_1.myId)(req));
    }
    else {
        db_1.db.prepare('INSERT INTO post_likes (post_id, user_id, reaction, created_at) VALUES (?, ?, ?, ?)').run(req.params.id, (0, helpers_1.myId)(req), (0, helpers_1.cleanText)(req.body?.reaction ?? 'like', 20) || 'like', (0, db_1.nowIso)());
        if (row.author_id !== (0, helpers_1.myId)(req)) {
            db_1.db.prepare('INSERT INTO notifications (id, user_id, type, actor_id, entity_id, body, read, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)')
                .run((0, db_1.uid)(), row.author_id, 'like', (0, helpers_1.myId)(req), req.params.id, `${(0, helpers_1.me)(req).displayName} liked your post.`, (0, db_1.nowIso)());
        }
    }
    const count = db_1.db.prepare('SELECT COUNT(*) AS c FROM post_likes WHERE post_id = ?').get(req.params.id).c;
    res.json({ liked: !existing, likeCount: count });
});
router.post('/posts/:id/bookmark', auth_1.requireAuth, (req, res) => {
    const existing = db_1.db.prepare('SELECT 1 FROM bookmarks WHERE post_id = ? AND user_id = ?').get(req.params.id, (0, helpers_1.myId)(req));
    if (existing) {
        db_1.db.prepare('DELETE FROM bookmarks WHERE post_id = ? AND user_id = ?').run(req.params.id, (0, helpers_1.myId)(req));
    }
    else {
        db_1.db.prepare('INSERT INTO bookmarks (user_id, post_id, created_at) VALUES (?, ?, ?)').run((0, helpers_1.myId)(req), req.params.id, (0, db_1.nowIso)());
    }
    res.json({ bookmarked: !existing });
});
router.get('/bookmarks', auth_1.requireAuth, (req, res) => {
    const rows = db_1.db
        .prepare(`${POST_SELECT} JOIN bookmarks bm ON bm.post_id = p.id AND bm.user_id = ? ORDER BY bm.created_at DESC LIMIT 50`)
        .all((0, helpers_1.myId)(req), (0, helpers_1.myId)(req), (0, helpers_1.myId)(req));
    res.json({ posts: rows.map(shapePost) });
});
router.post('/posts/:id/comments', auth_1.requireAuth, (req, res) => {
    const body = (0, helpers_1.cleanText)(req.body?.body, 500);
    if (!body) {
        res.status(400).json({ error: 'Comment cannot be empty.' });
        return;
    }
    const post = db_1.db.prepare('SELECT author_id FROM posts WHERE id = ?').get(req.params.id);
    if (!post) {
        res.status(404).json({ error: 'Post not found' });
        return;
    }
    const id = (0, db_1.uid)();
    db_1.db.prepare('INSERT INTO comments (id, post_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)').run(id, req.params.id, (0, helpers_1.myId)(req), body, (0, db_1.nowIso)());
    if (post.author_id !== (0, helpers_1.myId)(req)) {
        db_1.db.prepare('INSERT INTO notifications (id, user_id, type, actor_id, entity_id, body, read, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)')
            .run((0, db_1.uid)(), post.author_id, 'comment', (0, helpers_1.myId)(req), req.params.id, `${(0, helpers_1.me)(req).displayName} commented on your post.`, (0, db_1.nowIso)());
    }
    (0, auth_1.awardXp)((0, helpers_1.myId)(req), 5);
    const row = db_1.db
        .prepare('SELECT c.id, c.body, c.created_at, u.handle, u.display_name, u.avatar_color, u.is_demo FROM comments c JOIN users u ON u.id = c.author_id WHERE c.id = ?')
        .get(id);
    res.status(201).json({ comment: row });
});
router.delete('/comments/:id', auth_1.requireAuth, (req, res) => {
    const row = db_1.db.prepare('SELECT author_id FROM comments WHERE id = ?').get(req.params.id);
    if (!row) {
        res.status(404).json({ error: 'Comment not found' });
        return;
    }
    if (row.author_id !== (0, helpers_1.myId)(req) && (0, helpers_1.me)(req).role !== 'admin') {
        res.status(403).json({ error: 'You can only delete your own comments.' });
        return;
    }
    db_1.db.prepare('DELETE FROM comments WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
});
/* ---------------------------------- communities --------------------------------- */
router.get('/communities', (_req, res) => {
    const rows = db_1.db
        .prepare(`SELECT c.id, c.slug, c.name, c.description, c.cover_url, c.created_at,
        (SELECT COUNT(*) FROM community_members m WHERE m.community_id = c.id) AS member_count
       FROM communities c ORDER BY member_count DESC LIMIT 50`)
        .all();
    res.json({ communities: rows });
});
router.get('/communities/:slug', (req, res) => {
    const viewer = (0, helpers_1.myId)(req) || '';
    const row = db_1.db
        .prepare(`SELECT c.*, (SELECT COUNT(*) FROM community_members m WHERE m.community_id = c.id) AS member_count,
        EXISTS(SELECT 1 FROM community_members m WHERE m.community_id = c.id AND m.user_id = ?) AS joined
       FROM communities c WHERE c.slug = ?`)
        .get(viewer, req.params.slug);
    if (!row) {
        res.status(404).json({ error: 'Community not found' });
        return;
    }
    const members = db_1.db
        .prepare(`SELECT u.handle, u.display_name, u.avatar_color, m.role, u.is_demo FROM community_members m
       JOIN users u ON u.id = m.user_id WHERE m.community_id = ? ORDER BY m.joined_at ASC LIMIT 50`)
        .all(row.id);
    const posts = db_1.db
        .prepare(`${POST_SELECT} WHERE p.community_id = ? ORDER BY p.created_at DESC LIMIT 30`)
        .all(viewer, viewer, row.id);
    res.json({ community: { ...row, joined: Boolean(row.joined) }, members, posts: posts.map(shapePost) });
});
router.post('/communities', auth_1.requireAuth, (req, res) => {
    const schema = zod_1.z.object({
        name: zod_1.z.string().min(3).max(40),
        description: zod_1.z.string().max(280).optional(),
        coverUrl: zod_1.z.string().max(500).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: 'Community name must be 3-40 characters.' });
        return;
    }
    const slug = parsed.data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
    if (!slug) {
        res.status(400).json({ error: 'Pick a name with letters or numbers.' });
        return;
    }
    if (db_1.db.prepare('SELECT 1 FROM communities WHERE slug = ?').get(slug)) {
        res.status(409).json({ error: 'That community name is taken.' });
        return;
    }
    const id = (0, db_1.uid)();
    db_1.db.prepare('INSERT INTO communities (id, slug, name, description, cover_url, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, slug, (0, helpers_1.cleanText)(parsed.data.name, 40), (0, helpers_1.cleanText)(parsed.data.description ?? '', 280), parsed.data.coverUrl || '/art/comm-1.jpg', (0, helpers_1.myId)(req), (0, db_1.nowIso)());
    db_1.db.prepare('INSERT INTO community_members (community_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)').run(id, (0, helpers_1.myId)(req), 'owner', (0, db_1.nowIso)());
    (0, auth_1.awardXp)((0, helpers_1.myId)(req), 25);
    res.status(201).json({ community: db_1.db.prepare('SELECT * FROM communities WHERE id = ?').get(id) });
});
router.post('/communities/:slug/join', auth_1.requireAuth, (req, res) => {
    const community = db_1.db.prepare('SELECT id FROM communities WHERE slug = ?').get(req.params.slug);
    if (!community) {
        res.status(404).json({ error: 'Community not found' });
        return;
    }
    const existing = db_1.db.prepare('SELECT 1 FROM community_members WHERE community_id = ? AND user_id = ?').get(community.id, (0, helpers_1.myId)(req));
    if (existing) {
        db_1.db.prepare('DELETE FROM community_members WHERE community_id = ? AND user_id = ?').run(community.id, (0, helpers_1.myId)(req));
        res.json({ joined: false });
        return;
    }
    db_1.db.prepare('INSERT INTO community_members (community_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)').run(community.id, (0, helpers_1.myId)(req), 'member', (0, db_1.nowIso)());
    (0, auth_1.awardXp)((0, helpers_1.myId)(req), 10);
    res.json({ joined: true });
});
/* ---------------------------------- messaging ---------------------------------- */
router.get('/conversations', auth_1.requireAuth, (req, res) => {
    const rows = db_1.db
        .prepare(`SELECT c.id, c.title, c.is_group, c.created_at,
        (SELECT body FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_body,
        (SELECT created_at FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_at,
        (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS message_count
       FROM conversations c
       JOIN conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = ?
       ORDER BY COALESCE(last_at, c.created_at) DESC LIMIT 50`)
        .all((0, helpers_1.myId)(req));
    res.json({ conversations: rows });
});
router.post('/conversations', auth_1.requireAuth, (req, res) => {
    const schema = zod_1.z.object({ handle: zod_1.z.string().min(1), title: zod_1.z.string().max(80).optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: 'Choose someone to message.' });
        return;
    }
    const target = db_1.db.prepare('SELECT id, display_name FROM users WHERE handle = ?').get(parsed.data.handle.toLowerCase());
    if (!target) {
        res.status(404).json({ error: 'Profile not found' });
        return;
    }
    if (target.id === (0, helpers_1.myId)(req)) {
        res.status(400).json({ error: 'You cannot message yourself.' });
        return;
    }
    if ((0, auth_1.isBlockedEitherWay)((0, helpers_1.myId)(req), target.id)) {
        res.status(403).json({ error: 'This conversation is not available.' });
        return;
    }
    const existing = db_1.db
        .prepare(`SELECT c.id FROM conversations c
       JOIN conversation_members a ON a.conversation_id = c.id AND a.user_id = ?
       JOIN conversation_members b ON b.conversation_id = c.id AND b.user_id = ?
       WHERE c.is_group = 0 LIMIT 1`)
        .get((0, helpers_1.myId)(req), target.id);
    if (existing) {
        res.json({ conversationId: existing.id, existing: true });
        return;
    }
    const id = (0, db_1.uid)();
    db_1.db.prepare('INSERT INTO conversations (id, title, is_group, created_by, created_at) VALUES (?, ?, 0, ?, ?)').run(id, (0, helpers_1.cleanText)(parsed.data.title ?? '', 80) || null, (0, helpers_1.myId)(req), (0, db_1.nowIso)());
    const member = db_1.db.prepare('INSERT OR IGNORE INTO conversation_members (conversation_id, user_id, joined_at) VALUES (?, ?, ?)');
    member.run(id, (0, helpers_1.myId)(req), (0, db_1.nowIso)());
    member.run(id, target.id, (0, db_1.nowIso)());
    res.status(201).json({ conversationId: id });
});
router.post('/conversations/group', auth_1.requireAuth, (req, res) => {
    const schema = zod_1.z.object({
        title: zod_1.z.string().min(2).max(80),
        handles: zod_1.z.array(zod_1.z.string().min(1).max(40)).min(1).max(20),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: 'Group chats need a title (2-80 characters) and at least one member.' });
        return;
    }
    const wanted = [...new Set(parsed.data.handles.map((h) => h.toLowerCase().replace(/^@/, '').trim()))].filter(Boolean).slice(0, 20);
    const find = db_1.db.prepare('SELECT id, display_name FROM users WHERE handle = ?');
    const memberIds = [];
    const missing = [];
    for (const handle of wanted) {
        const row = find.get(handle);
        if (!row) {
            missing.push(`@${handle}`);
            continue;
        }
        if (row.id === (0, helpers_1.myId)(req))
            continue;
        if ((0, auth_1.isBlockedEitherWay)((0, helpers_1.myId)(req), row.id))
            continue;
        memberIds.push(row.id);
    }
    if (memberIds.length === 0) {
        res.status(400).json({
            error: missing.length
                ? `No NEXUS profile found for ${missing.slice(0, 3).join(', ')}.`
                : 'None of those people can join this conversation.',
        });
        return;
    }
    const id = (0, db_1.uid)();
    db_1.db.prepare('INSERT INTO conversations (id, title, is_group, created_by, created_at) VALUES (?, ?, 1, ?, ?)').run(id, (0, helpers_1.cleanText)(parsed.data.title, 80), (0, helpers_1.myId)(req), (0, db_1.nowIso)());
    const member = db_1.db.prepare('INSERT OR IGNORE INTO conversation_members (conversation_id, user_id, joined_at) VALUES (?, ?, ?)');
    member.run(id, (0, helpers_1.myId)(req), (0, db_1.nowIso)());
    const notify = db_1.db.prepare('INSERT INTO notifications (id, user_id, type, actor_id, entity_id, body, read, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)');
    for (const memberId of memberIds) {
        member.run(id, memberId, (0, db_1.nowIso)());
        notify.run((0, db_1.uid)(), memberId, 'message', (0, helpers_1.myId)(req), id, `${(0, helpers_1.me)(req).displayName} added you to "${(0, helpers_1.cleanText)(parsed.data.title, 80)}".`, (0, db_1.nowIso)());
    }
    (0, auth_1.awardXp)((0, helpers_1.myId)(req), 10);
    res.status(201).json({
        conversationId: id,
        conversation: { id, title: (0, helpers_1.cleanText)(parsed.data.title, 80), is_group: 1 },
        added: memberIds.length,
        missing,
    });
});
router.post('/conversations/:id/members', auth_1.requireAuth, (req, res) => {
    const conversation = db_1.db.prepare('SELECT id, is_group FROM conversations WHERE id = ?').get(req.params.id);
    if (!conversation) {
        res.status(404).json({ error: 'Conversation not found' });
        return;
    }
    if (!conversation.is_group) {
        res.status(400).json({ error: 'Only group conversations can take new members.' });
        return;
    }
    const member = db_1.db.prepare('SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?').get(req.params.id, (0, helpers_1.myId)(req));
    if (!member) {
        res.status(403).json({ error: 'You are not a member of this conversation.' });
        return;
    }
    const handle = (0, helpers_1.cleanText)(req.body?.handle ?? '', 40).toLowerCase().replace(/^@/, '');
    const target = db_1.db.prepare('SELECT id, display_name FROM users WHERE handle = ?').get(handle);
    if (!target) {
        res.status(404).json({ error: 'Profile not found.' });
        return;
    }
    if ((0, auth_1.isBlockedEitherWay)((0, helpers_1.myId)(req), target.id)) {
        res.status(403).json({ error: 'That person cannot be added.' });
        return;
    }
    const existing = db_1.db.prepare('SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?').get(req.params.id, target.id);
    if (existing) {
        res.status(409).json({ error: 'They are already in this conversation.' });
        return;
    }
    db_1.db.prepare('INSERT INTO conversation_members (conversation_id, user_id, joined_at) VALUES (?, ?, ?)').run(req.params.id, target.id, (0, db_1.nowIso)());
    db_1.db.prepare('INSERT INTO notifications (id, user_id, type, actor_id, entity_id, body, read, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)')
        .run((0, db_1.uid)(), target.id, 'message', (0, helpers_1.myId)(req), req.params.id, `${(0, helpers_1.me)(req).displayName} added you to a group chat.`, (0, db_1.nowIso)());
    res.json({ ok: true, added: target.display_name });
});
router.get('/conversations/:id/messages', auth_1.requireAuth, (req, res) => {
    const member = db_1.db.prepare('SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?').get(req.params.id, (0, helpers_1.myId)(req));
    if (!member) {
        res.status(403).json({ error: 'You are not a member of this conversation.' });
        return;
    }
    const messages = db_1.db
        .prepare(`SELECT m.id, m.body, m.created_at, u.handle, u.display_name, u.avatar_color, u.is_demo
       FROM messages m JOIN users u ON u.id = m.sender_id
       WHERE m.conversation_id = ? ORDER BY m.created_at ASC LIMIT 200`)
        .all(req.params.id);
    const participants = db_1.db
        .prepare('SELECT u.handle, u.display_name, u.avatar_color FROM conversation_members cm JOIN users u ON u.id = cm.user_id WHERE cm.conversation_id = ?')
        .all(req.params.id);
    res.json({ messages, participants });
});
router.post('/conversations/:id/messages', auth_1.requireAuth, (req, res) => {
    const body = (0, helpers_1.cleanText)(req.body?.body, 1000);
    if (!body) {
        res.status(400).json({ error: 'Message cannot be empty.' });
        return;
    }
    const member = db_1.db.prepare('SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?').get(req.params.id, (0, helpers_1.myId)(req));
    if (!member) {
        res.status(403).json({ error: 'You are not a member of this conversation.' });
        return;
    }
    const id = (0, db_1.uid)();
    db_1.db.prepare('INSERT INTO messages (id, conversation_id, sender_id, body, created_at) VALUES (?, ?, ?, ?, ?)').run(id, req.params.id, (0, helpers_1.myId)(req), body, (0, db_1.nowIso)());
    const others = db_1.db.prepare('SELECT user_id FROM conversation_members WHERE conversation_id = ? AND user_id != ?').all(req.params.id, (0, helpers_1.myId)(req));
    for (const other of others) {
        db_1.db.prepare('INSERT INTO notifications (id, user_id, type, actor_id, entity_id, body, read, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)')
            .run((0, db_1.uid)(), other.user_id, 'message', (0, helpers_1.myId)(req), req.params.id, `${(0, helpers_1.me)(req).displayName} sent you a message.`, (0, db_1.nowIso)());
    }
    res.status(201).json({
        message: { id, body, created_at: (0, db_1.nowIso)(), handle: (0, helpers_1.me)(req).handle, display_name: (0, helpers_1.me)(req).displayName, avatar_color: (0, helpers_1.me)(req).avatarColor },
    });
});
/* -------------------------------- notifications -------------------------------- */
router.get('/notifications', auth_1.requireAuth, (req, res) => {
    const rows = db_1.db
        .prepare(`SELECT n.id, n.type, n.body, n.read, n.created_at, n.entity_id, u.handle AS actor_handle, u.avatar_color
       FROM notifications n LEFT JOIN users u ON u.id = n.actor_id
       WHERE n.user_id = ? ORDER BY n.created_at DESC LIMIT 50`)
        .all((0, helpers_1.myId)(req));
    res.json({ notifications: rows, unread: rows.filter((r) => !r.read).length });
});
router.post('/notifications/read', auth_1.requireAuth, (req, res) => {
    const id = (0, helpers_1.cleanText)(req.body?.id ?? '', 60);
    if (id)
        db_1.db.prepare('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?').run(id, (0, helpers_1.myId)(req));
    else
        db_1.db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ?').run((0, helpers_1.myId)(req));
    res.json({ ok: true });
});
/* ------------------------------ reports and blocks ----------------------------- */
router.post('/reports', auth_1.requireAuth, (req, res) => {
    const schema = zod_1.z.object({
        targetType: zod_1.z.enum(['post', 'comment', 'user', 'clip', 'project', 'experience', 'message']),
        targetId: zod_1.z.string().min(1).max(80),
        reason: zod_1.z.string().min(3).max(80),
        details: zod_1.z.string().max(1000).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: 'Describe the problem (at least 3 characters).' });
        return;
    }
    const id = (0, db_1.uid)();
    db_1.db.prepare('INSERT INTO reports (id, reporter_id, target_type, target_id, reason, details, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(id, (0, helpers_1.myId)(req), parsed.data.targetType, parsed.data.targetId, (0, helpers_1.cleanText)(parsed.data.reason, 80), (0, helpers_1.cleanText)(parsed.data.details ?? '', 1000), 'open', (0, db_1.nowIso)());
    res.status(201).json({ ok: true, id, message: 'Report received. A moderator will review it.' });
});
router.post('/blocks/:handle', auth_1.requireAuth, (req, res) => {
    const target = db_1.db.prepare('SELECT id FROM users WHERE handle = ?').get(req.params.handle.toLowerCase());
    if (!target) {
        res.status(404).json({ error: 'Profile not found' });
        return;
    }
    if (target.id === (0, helpers_1.myId)(req)) {
        res.status(400).json({ error: 'You cannot block yourself.' });
        return;
    }
    const existing = db_1.db.prepare('SELECT 1 FROM blocks WHERE blocker_id = ? AND blocked_id = ?').get((0, helpers_1.myId)(req), target.id);
    if (existing) {
        db_1.db.prepare('DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?').run((0, helpers_1.myId)(req), target.id);
        res.json({ blocked: false });
        return;
    }
    db_1.db.prepare('INSERT INTO blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)').run((0, helpers_1.myId)(req), target.id, (0, db_1.nowIso)());
    db_1.db.prepare('DELETE FROM follows WHERE (follower_id = ? AND following_id = ?) OR (follower_id = ? AND following_id = ?)')
        .run((0, helpers_1.myId)(req), target.id, target.id, (0, helpers_1.myId)(req));
    res.json({ blocked: true });
});
router.get('/search', (req, res) => {
    const q = (0, helpers_1.cleanText)(req.query.q ?? '', 80);
    if (q.length < 2) {
        res.json({ users: [], posts: [], games: [], communities: [], clips: [] });
        return;
    }
    const like = `%${q}%`;
    res.json({
        users: db_1.db.prepare('SELECT handle, display_name, avatar_color, bio, is_demo FROM users WHERE handle LIKE ? OR display_name LIKE ? LIMIT 8').all(like, like),
        posts: db_1.db.prepare('SELECT p.id, p.body, u.handle FROM posts p JOIN users u ON u.id = p.author_id WHERE p.body LIKE ? LIMIT 8').all(like),
        games: db_1.db.prepare('SELECT slug, title, tagline, cover_url, genre FROM games WHERE title LIKE ? OR genre LIKE ? OR tagline LIKE ? LIMIT 8').all(like, like, like),
        communities: db_1.db.prepare('SELECT slug, name, description, cover_url FROM communities WHERE name LIKE ? OR description LIKE ? LIMIT 8').all(like, like),
        clips: db_1.db.prepare('SELECT id, title, thumb_url, duration FROM clips WHERE title LIKE ? OR description LIKE ? LIMIT 8').all(like, like),
    });
});
exports.default = router;
