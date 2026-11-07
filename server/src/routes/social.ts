import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { db, nowIso, uid } from '../db';
import { awardXp, isBlockedEitherWay, requireAuth } from '../auth';
import { cleanText, me, myId, paging } from './helpers';

const router = Router();

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

function shapePost(row: any) {
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

router.get('/feed', (req: Request, res: Response) => {
  const { limit, offset } = paging(req);
  const viewer = myId(req) || null;
  const scope = String(req.query.scope ?? 'all');
  let rows: any[];
  if (scope === 'following' && viewer) {
    rows = db
      .prepare(
        `${POST_SELECT}
         WHERE p.author_id IN (SELECT following_id FROM follows WHERE follower_id = ?)
            OR p.author_id = ?
         ORDER BY p.created_at DESC LIMIT ? OFFSET ?`,
      )
      .all(viewer, viewer, viewer, viewer, limit, offset);
  } else {
    rows = db
      .prepare(`${POST_SELECT} ORDER BY p.created_at DESC LIMIT ? OFFSET ?`)
      .all(viewer, viewer, limit, offset);
  }
  res.json({ posts: rows.map(shapePost), nextOffset: offset + rows.length });
});

router.post('/posts', requireAuth, (req: Request, res: Response) => {
  const schema = z.object({
    body: z.string().min(1).max(1000),
    mediaUrl: z.string().max(500).optional().nullable(),
    communitySlug: z.string().max(60).optional().nullable(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Write something between 1 and 1000 characters.' });
    return;
  }
  let communityId: string | null = null;
  if (parsed.data.communitySlug) {
    const community: any = db.prepare('SELECT id FROM communities WHERE slug = ?').get(parsed.data.communitySlug);
    if (!community) { res.status(404).json({ error: 'Community not found' }); return; }
    const member = db.prepare('SELECT 1 FROM community_members WHERE community_id = ? AND user_id = ?').get(community.id, myId(req));
    if (!member) { res.status(403).json({ error: 'Join the community before posting in it.' }); return; }
    communityId = community.id;
  }
  const mediaUrl = parsed.data.mediaUrl ? cleanText(parsed.data.mediaUrl, 500) : null;
  if (mediaUrl && !/^(\/art\/|https:\/\/)/.test(mediaUrl)) {
    res.status(400).json({ error: 'Media must be an https URL or a NEXUS asset path.' });
    return;
  }
  const id = uid();
  db.prepare(
    'INSERT INTO posts (id, author_id, body, media_url, media_type, community_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(id, myId(req), cleanText(parsed.data.body, 1000), mediaUrl, mediaUrl ? 'image' : null, communityId, nowIso());
  awardXp(myId(req), 15);
  const row = db.prepare(`${POST_SELECT} WHERE p.id = ?`).get(myId(req), myId(req), id);
  res.status(201).json({ post: shapePost(row) });
});

router.get('/posts/:id', (req: Request, res: Response) => {
  const viewer = myId(req) || '';
  const row: any = db.prepare(`${POST_SELECT} WHERE p.id = ?`).get(viewer, viewer, req.params.id);
  if (!row) { res.status(404).json({ error: 'Post not found' }); return; }
  const comments = db
    .prepare(
      `SELECT c.id, c.body, c.created_at, u.handle, u.display_name, u.avatar_color, u.is_demo
       FROM comments c JOIN users u ON u.id = c.author_id WHERE c.post_id = ? ORDER BY c.created_at ASC LIMIT 100`,
    )
    .all(req.params.id);
  res.json({ post: shapePost(row), comments });
});

router.delete('/posts/:id', requireAuth, (req: Request, res: Response) => {
  const row: any = db.prepare('SELECT author_id FROM posts WHERE id = ?').get(req.params.id);
  if (!row) { res.status(404).json({ error: 'Post not found' }); return; }
  const user = me(req)!;
  if (row.author_id !== user.id && user.role !== 'admin') {
    res.status(403).json({ error: 'You can only delete your own posts.' });
    return;
  }
  db.prepare('DELETE FROM posts WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.post('/posts/:id/like', requireAuth, (req: Request, res: Response) => {
  const row: any = db.prepare('SELECT author_id FROM posts WHERE id = ?').get(req.params.id);
  if (!row) { res.status(404).json({ error: 'Post not found' }); return; }
  const existing = db.prepare('SELECT 1 FROM post_likes WHERE post_id = ? AND user_id = ?').get(req.params.id, myId(req));
  if (existing) {
    db.prepare('DELETE FROM post_likes WHERE post_id = ? AND user_id = ?').run(req.params.id, myId(req));
  } else {
    db.prepare('INSERT INTO post_likes (post_id, user_id, reaction, created_at) VALUES (?, ?, ?, ?)').run(
      req.params.id, myId(req), cleanText(req.body?.reaction ?? 'like', 20) || 'like', nowIso(),
    );
    if (row.author_id !== myId(req)) {
      db.prepare('INSERT INTO notifications (id, user_id, type, actor_id, entity_id, body, read, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)')
        .run(uid(), row.author_id, 'like', myId(req), req.params.id, `${me(req)!.displayName} liked your post.`, nowIso());
    }
  }
  const count = (db.prepare('SELECT COUNT(*) AS c FROM post_likes WHERE post_id = ?').get(req.params.id) as any).c;
  res.json({ liked: !existing, likeCount: count });
});

router.post('/posts/:id/bookmark', requireAuth, (req: Request, res: Response) => {
  const existing = db.prepare('SELECT 1 FROM bookmarks WHERE post_id = ? AND user_id = ?').get(req.params.id, myId(req));
  if (existing) {
    db.prepare('DELETE FROM bookmarks WHERE post_id = ? AND user_id = ?').run(req.params.id, myId(req));
  } else {
    db.prepare('INSERT INTO bookmarks (user_id, post_id, created_at) VALUES (?, ?, ?)').run(myId(req), req.params.id, nowIso());
  }
  res.json({ bookmarked: !existing });
});

router.get('/bookmarks', requireAuth, (req: Request, res: Response) => {
  const rows = db
    .prepare(`${POST_SELECT} JOIN bookmarks bm ON bm.post_id = p.id AND bm.user_id = ? ORDER BY bm.created_at DESC LIMIT 50`)
    .all(myId(req), myId(req), myId(req));
  res.json({ posts: rows.map(shapePost) });
});

router.post('/posts/:id/comments', requireAuth, (req: Request, res: Response) => {
  const body = cleanText(req.body?.body, 500);
  if (!body) { res.status(400).json({ error: 'Comment cannot be empty.' }); return; }
  const post: any = db.prepare('SELECT author_id FROM posts WHERE id = ?').get(req.params.id);
  if (!post) { res.status(404).json({ error: 'Post not found' }); return; }
  const id = uid();
  db.prepare('INSERT INTO comments (id, post_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)').run(
    id, req.params.id, myId(req), body, nowIso(),
  );
  if (post.author_id !== myId(req)) {
    db.prepare('INSERT INTO notifications (id, user_id, type, actor_id, entity_id, body, read, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)')
      .run(uid(), post.author_id, 'comment', myId(req), req.params.id, `${me(req)!.displayName} commented on your post.`, nowIso());
  }
  awardXp(myId(req), 5);
  const row: any = db
    .prepare('SELECT c.id, c.body, c.created_at, u.handle, u.display_name, u.avatar_color, u.is_demo FROM comments c JOIN users u ON u.id = c.author_id WHERE c.id = ?')
    .get(id);
  res.status(201).json({ comment: row });
});

router.delete('/comments/:id', requireAuth, (req: Request, res: Response) => {
  const row: any = db.prepare('SELECT author_id FROM comments WHERE id = ?').get(req.params.id);
  if (!row) { res.status(404).json({ error: 'Comment not found' }); return; }
  if (row.author_id !== myId(req) && me(req)!.role !== 'admin') {
    res.status(403).json({ error: 'You can only delete your own comments.' });
    return;
  }
  db.prepare('DELETE FROM comments WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

/* ---------------------------------- communities --------------------------------- */

router.get('/communities', (_req: Request, res: Response) => {
  const rows = db
    .prepare(
      `SELECT c.id, c.slug, c.name, c.description, c.cover_url, c.created_at,
        (SELECT COUNT(*) FROM community_members m WHERE m.community_id = c.id) AS member_count
       FROM communities c ORDER BY member_count DESC LIMIT 50`,
    )
    .all();
  res.json({ communities: rows });
});

router.get('/communities/:slug', (req: Request, res: Response) => {
  const viewer = myId(req) || '';
  const row: any = db
    .prepare(
      `SELECT c.*, (SELECT COUNT(*) FROM community_members m WHERE m.community_id = c.id) AS member_count,
        EXISTS(SELECT 1 FROM community_members m WHERE m.community_id = c.id AND m.user_id = ?) AS joined
       FROM communities c WHERE c.slug = ?`,
    )
    .get(viewer, req.params.slug);
  if (!row) { res.status(404).json({ error: 'Community not found' }); return; }
  const members = db
    .prepare(
      `SELECT u.handle, u.display_name, u.avatar_color, m.role, u.is_demo FROM community_members m
       JOIN users u ON u.id = m.user_id WHERE m.community_id = ? ORDER BY m.joined_at ASC LIMIT 50`,
    )
    .all(row.id);
  const posts = db
    .prepare(`${POST_SELECT} WHERE p.community_id = ? ORDER BY p.created_at DESC LIMIT 30`)
    .all(viewer, viewer, row.id);
  res.json({ community: { ...row, joined: Boolean(row.joined) }, members, posts: posts.map(shapePost) });
});

router.post('/communities', requireAuth, (req: Request, res: Response) => {
  const schema = z.object({
    name: z.string().min(3).max(40),
    description: z.string().max(280).optional(),
    coverUrl: z.string().max(500).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Community name must be 3-40 characters.' }); return; }
  const slug = parsed.data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
  if (!slug) { res.status(400).json({ error: 'Pick a name with letters or numbers.' }); return; }
  if (db.prepare('SELECT 1 FROM communities WHERE slug = ?').get(slug)) {
    res.status(409).json({ error: 'That community name is taken.' });
    return;
  }
  const id = uid();
  db.prepare('INSERT INTO communities (id, slug, name, description, cover_url, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    id, slug, cleanText(parsed.data.name, 40), cleanText(parsed.data.description ?? '', 280),
    parsed.data.coverUrl || '/art/comm-1.jpg', myId(req), nowIso(),
  );
  db.prepare('INSERT INTO community_members (community_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)').run(id, myId(req), 'owner', nowIso());
  awardXp(myId(req), 25);
  res.status(201).json({ community: db.prepare('SELECT * FROM communities WHERE id = ?').get(id) });
});

router.post('/communities/:slug/join', requireAuth, (req: Request, res: Response) => {
  const community: any = db.prepare('SELECT id FROM communities WHERE slug = ?').get(req.params.slug);
  if (!community) { res.status(404).json({ error: 'Community not found' }); return; }
  const existing = db.prepare('SELECT 1 FROM community_members WHERE community_id = ? AND user_id = ?').get(community.id, myId(req));
  if (existing) {
    db.prepare('DELETE FROM community_members WHERE community_id = ? AND user_id = ?').run(community.id, myId(req));
    res.json({ joined: false });
    return;
  }
  db.prepare('INSERT INTO community_members (community_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)').run(community.id, myId(req), 'member', nowIso());
  awardXp(myId(req), 10);
  res.json({ joined: true });
});

/* ---------------------------------- messaging ---------------------------------- */

router.get('/conversations', requireAuth, (req: Request, res: Response) => {
  const rows = db
    .prepare(
      `SELECT c.id, c.title, c.is_group, c.created_at,
        (SELECT body FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_body,
        (SELECT created_at FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_at,
        (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS message_count
       FROM conversations c
       JOIN conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = ?
       ORDER BY COALESCE(last_at, c.created_at) DESC LIMIT 50`,
    )
    .all(myId(req));
  res.json({ conversations: rows });
});

router.post('/conversations', requireAuth, (req: Request, res: Response) => {
  const schema = z.object({ handle: z.string().min(1), title: z.string().max(80).optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Choose someone to message.' }); return; }
  const target: any = db.prepare('SELECT id, display_name FROM users WHERE handle = ?').get(parsed.data.handle.toLowerCase());
  if (!target) { res.status(404).json({ error: 'Profile not found' }); return; }
  if (target.id === myId(req)) { res.status(400).json({ error: 'You cannot message yourself.' }); return; }
  if (isBlockedEitherWay(myId(req), target.id)) { res.status(403).json({ error: 'This conversation is not available.' }); return; }
  const existing: any = db
    .prepare(
      `SELECT c.id FROM conversations c
       JOIN conversation_members a ON a.conversation_id = c.id AND a.user_id = ?
       JOIN conversation_members b ON b.conversation_id = c.id AND b.user_id = ?
       WHERE c.is_group = 0 LIMIT 1`,
    )
    .get(myId(req), target.id);
  if (existing) { res.json({ conversationId: existing.id, existing: true }); return; }
  const id = uid();
  db.prepare('INSERT INTO conversations (id, title, is_group, created_by, created_at) VALUES (?, ?, 0, ?, ?)').run(
    id, cleanText(parsed.data.title ?? '', 80) || null, myId(req), nowIso(),
  );
  const member = db.prepare('INSERT OR IGNORE INTO conversation_members (conversation_id, user_id, joined_at) VALUES (?, ?, ?)');
  member.run(id, myId(req), nowIso());
  member.run(id, target.id, nowIso());
  res.status(201).json({ conversationId: id });
});

router.get('/conversations/:id/messages', requireAuth, (req: Request, res: Response) => {
  const member = db.prepare('SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?').get(req.params.id, myId(req));
  if (!member) { res.status(403).json({ error: 'You are not a member of this conversation.' }); return; }
  const messages = db
    .prepare(
      `SELECT m.id, m.body, m.created_at, u.handle, u.display_name, u.avatar_color, u.is_demo
       FROM messages m JOIN users u ON u.id = m.sender_id
       WHERE m.conversation_id = ? ORDER BY m.created_at ASC LIMIT 200`,
    )
    .all(req.params.id);
  const participants = db
    .prepare('SELECT u.handle, u.display_name, u.avatar_color FROM conversation_members cm JOIN users u ON u.id = cm.user_id WHERE cm.conversation_id = ?')
    .all(req.params.id);
  res.json({ messages, participants });
});

router.post('/conversations/:id/messages', requireAuth, (req: Request, res: Response) => {
  const body = cleanText(req.body?.body, 1000);
  if (!body) { res.status(400).json({ error: 'Message cannot be empty.' }); return; }
  const member = db.prepare('SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?').get(req.params.id, myId(req));
  if (!member) { res.status(403).json({ error: 'You are not a member of this conversation.' }); return; }
  const id = uid();
  db.prepare('INSERT INTO messages (id, conversation_id, sender_id, body, created_at) VALUES (?, ?, ?, ?, ?)').run(
    id, req.params.id, myId(req), body, nowIso(),
  );
  const others = db.prepare('SELECT user_id FROM conversation_members WHERE conversation_id = ? AND user_id != ?').all(req.params.id, myId(req)) as any[];
  for (const other of others) {
    db.prepare('INSERT INTO notifications (id, user_id, type, actor_id, entity_id, body, read, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)')
      .run(uid(), other.user_id, 'message', myId(req), req.params.id, `${me(req)!.displayName} sent you a message.`, nowIso());
  }
  res.status(201).json({
    message: { id, body, created_at: nowIso(), handle: me(req)!.handle, display_name: me(req)!.displayName, avatar_color: me(req)!.avatarColor },
  });
});

/* -------------------------------- notifications -------------------------------- */

router.get('/notifications', requireAuth, (req: Request, res: Response) => {
  const rows = db
    .prepare(
      `SELECT n.id, n.type, n.body, n.read, n.created_at, n.entity_id, u.handle AS actor_handle, u.avatar_color
       FROM notifications n LEFT JOIN users u ON u.id = n.actor_id
       WHERE n.user_id = ? ORDER BY n.created_at DESC LIMIT 50`,
    )
    .all(myId(req));
  res.json({ notifications: rows, unread: rows.filter((r: any) => !r.read).length });
});

router.post('/notifications/read', requireAuth, (req: Request, res: Response) => {
  const id = cleanText(req.body?.id ?? '', 60);
  if (id) db.prepare('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?').run(id, myId(req));
  else db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ?').run(myId(req));
  res.json({ ok: true });
});

/* ------------------------------ reports and blocks ----------------------------- */

router.post('/reports', requireAuth, (req: Request, res: Response) => {
  const schema = z.object({
    targetType: z.enum(['post', 'comment', 'user', 'clip', 'project', 'experience', 'message']),
    targetId: z.string().min(1).max(80),
    reason: z.string().min(3).max(80),
    details: z.string().max(1000).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Describe the problem (at least 3 characters).' }); return; }
  const id = uid();
  db.prepare('INSERT INTO reports (id, reporter_id, target_type, target_id, reason, details, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
    id, myId(req), parsed.data.targetType, parsed.data.targetId, cleanText(parsed.data.reason, 80),
    cleanText(parsed.data.details ?? '', 1000), 'open', nowIso(),
  );
  res.status(201).json({ ok: true, id, message: 'Report received. A moderator will review it.' });
});

router.post('/blocks/:handle', requireAuth, (req: Request, res: Response) => {
  const target: any = db.prepare('SELECT id FROM users WHERE handle = ?').get(req.params.handle.toLowerCase());
  if (!target) { res.status(404).json({ error: 'Profile not found' }); return; }
  if (target.id === myId(req)) { res.status(400).json({ error: 'You cannot block yourself.' }); return; }
  const existing = db.prepare('SELECT 1 FROM blocks WHERE blocker_id = ? AND blocked_id = ?').get(myId(req), target.id);
  if (existing) {
    db.prepare('DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?').run(myId(req), target.id);
    res.json({ blocked: false });
    return;
  }
  db.prepare('INSERT INTO blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)').run(myId(req), target.id, nowIso());
  db.prepare('DELETE FROM follows WHERE (follower_id = ? AND following_id = ?) OR (follower_id = ? AND following_id = ?)')
    .run(myId(req), target.id, target.id, myId(req));
  res.json({ blocked: true });
});

router.get('/search', (req: Request, res: Response) => {
  const q = cleanText(req.query.q ?? '', 80);
  if (q.length < 2) { res.json({ users: [], posts: [], games: [], communities: [], clips: [] }); return; }
  const like = `%${q}%`;
  res.json({
    users: db.prepare('SELECT handle, display_name, avatar_color, bio, is_demo FROM users WHERE handle LIKE ? OR display_name LIKE ? LIMIT 8').all(like, like),
    posts: db.prepare('SELECT p.id, p.body, u.handle FROM posts p JOIN users u ON u.id = p.author_id WHERE p.body LIKE ? LIMIT 8').all(like),
    games: db.prepare('SELECT slug, title, tagline, cover_url, genre FROM games WHERE title LIKE ? OR genre LIKE ? OR tagline LIKE ? LIMIT 8').all(like, like, like),
    communities: db.prepare('SELECT slug, name, description, cover_url FROM communities WHERE name LIKE ? OR description LIKE ? LIMIT 8').all(like, like),
    clips: db.prepare('SELECT id, title, thumb_url, duration FROM clips WHERE title LIKE ? OR description LIKE ? LIMIT 8').all(like, like),
  });
});

export default router;
