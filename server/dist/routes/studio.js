"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const db_1 = require("../db");
const auth_1 = require("../auth");
const helpers_1 = require("./helpers");
const router = (0, express_1.Router)();
const MAX_SCENE_BYTES = 240_000;
router.get('/projects', auth_1.requireAuth, (req, res) => {
    const rows = db_1.db
        .prepare('SELECT id, title, slug, published, updated_at, created_at FROM projects WHERE owner_id = ? ORDER BY updated_at DESC LIMIT 50')
        .all((0, helpers_1.myId)(req));
    res.json({ projects: rows });
});
router.get('/projects/:id', auth_1.requireAuth, (req, res) => {
    const row = db_1.db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
    if (!row) {
        res.status(404).json({ error: 'Project not found' });
        return;
    }
    if (row.owner_id !== (0, helpers_1.myId)(req) && (0, helpers_1.me)(req).role !== 'admin' && !row.published) {
        res.status(403).json({ error: 'This project is private.' });
        return;
    }
    res.json({ project: { ...row, data: JSON.parse(row.data) } });
});
/** Publicly playable/published studio scenes. */
router.get('/gallery', (_req, res) => {
    const rows = db_1.db
        .prepare(`SELECT p.id, p.title, p.slug, p.updated_at, u.handle, u.display_name, u.avatar_color
       FROM projects p JOIN users u ON u.id = p.owner_id WHERE p.published = 1 ORDER BY p.updated_at DESC LIMIT 30`)
        .all();
    res.json({ projects: rows });
});
router.get('/gallery/:slug', (req, res) => {
    const row = db_1.db
        .prepare(`SELECT p.*, u.handle, u.display_name FROM projects p JOIN users u ON u.id = p.owner_id
       WHERE p.slug = ? AND p.published = 1`)
        .get(req.params.slug);
    if (!row) {
        res.status(404).json({ error: 'Published project not found' });
        return;
    }
    res.json({ project: { ...row, data: JSON.parse(row.data) } });
});
router.post('/projects', auth_1.requireAuth, (req, res) => {
    const schema = zod_1.z.object({ title: zod_1.z.string().min(2).max(80), data: zod_1.z.any().optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: 'Projects need a title of 2+ characters.' });
        return;
    }
    const serialised = JSON.stringify(parsed.data.data ?? {});
    if (serialised.length > MAX_SCENE_BYTES) {
        res.status(413).json({ error: 'Scene exceeds the 240 KB project limit.' });
        return;
    }
    const id = (0, db_1.uid)();
    db_1.db.prepare('INSERT INTO projects (id, owner_id, title, slug, data, published, updated_at, created_at) VALUES (?, ?, ?, NULL, ?, 0, ?, ?)').run(id, (0, helpers_1.myId)(req), (0, helpers_1.cleanText)(parsed.data.title, 80), serialised, (0, db_1.nowIso)(), (0, db_1.nowIso)());
    (0, auth_1.awardXp)((0, helpers_1.myId)(req), 20);
    res.status(201).json({ project: { id, title: parsed.data.title, published: 0 } });
});
router.put('/projects/:id', auth_1.requireAuth, (req, res) => {
    const row = db_1.db.prepare('SELECT owner_id FROM projects WHERE id = ?').get(req.params.id);
    if (!row) {
        res.status(404).json({ error: 'Project not found' });
        return;
    }
    if (row.owner_id !== (0, helpers_1.myId)(req)) {
        res.status(403).json({ error: 'You can only edit your own projects.' });
        return;
    }
    const title = (0, helpers_1.cleanText)(req.body?.title ?? '', 80);
    const serialised = JSON.stringify(req.body?.data ?? {});
    if (serialised.length > MAX_SCENE_BYTES) {
        res.status(413).json({ error: 'Scene exceeds the 240 KB project limit.' });
        return;
    }
    db_1.db.prepare('UPDATE projects SET title = COALESCE(NULLIF(?, \'\'), title), data = ?, updated_at = ? WHERE id = ?').run(title, serialised, (0, db_1.nowIso)(), req.params.id);
    res.json({ ok: true, savedAt: (0, db_1.nowIso)() });
});
router.post('/projects/:id/publish', auth_1.requireAuth, (req, res) => {
    const row = db_1.db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
    if (!row) {
        res.status(404).json({ error: 'Project not found' });
        return;
    }
    if (row.owner_id !== (0, helpers_1.myId)(req)) {
        res.status(403).json({ error: 'You can only publish your own projects.' });
        return;
    }
    const publish = req.body?.published !== false;
    let slug = row.slug;
    if (publish && !slug) {
        const base = row.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'scene';
        slug = `${base}-${row.id.slice(0, 6)}`;
    }
    db_1.db.prepare('UPDATE projects SET published = ?, slug = ? WHERE id = ?').run(publish ? 1 : 0, slug, req.params.id);
    (0, auth_1.awardXp)((0, helpers_1.myId)(req), publish ? 50 : 0);
    res.json({ ok: true, published: publish, slug, url: publish ? `/play/${slug}` : null });
});
router.delete('/projects/:id', auth_1.requireAuth, (req, res) => {
    const row = db_1.db.prepare('SELECT owner_id FROM projects WHERE id = ?').get(req.params.id);
    if (!row) {
        res.status(404).json({ error: 'Project not found' });
        return;
    }
    if (row.owner_id !== (0, helpers_1.myId)(req) && (0, helpers_1.me)(req).role !== 'admin') {
        res.status(403).json({ error: 'You can only delete your own projects.' });
        return;
    }
    db_1.db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
});
/** Studio asset library — real files served from the client public directory. */
router.get('/assets', (_req, res) => {
    res.json({
        textures: [
            { id: 'grid', label: 'Neon Grid', url: '/art/game-neon-racer.jpg' },
            { id: 'arena', label: 'Arena Floor', url: '/art/game-arena.jpg' },
            { id: 'city', label: 'City Skyline', url: '/art/hero-home.jpg' },
            { id: 'void', label: 'Deep Void', url: '/art/hero-discover.jpg' },
        ],
        models: [
            { id: 'cube', label: 'Cube' },
            { id: 'sphere', label: 'Sphere' },
            { id: 'cylinder', label: 'Cylinder' },
            { id: 'torus', label: 'Torus' },
            { id: 'plane', label: 'Plane' },
        ],
        materials: [
            { id: 'violet', label: 'Electric Violet', color: '#7C3AED' },
            { id: 'cyan', label: 'Cyan Pulse', color: '#22D3EE' },
            { id: 'magenta', label: 'Magenta Glow', color: '#E946C7' },
            { id: 'chrome', label: 'Chrome', color: '#B6BCD6' },
            { id: 'obsidian', label: 'Obsidian', color: '#141225' },
        ],
    });
});
exports.default = router;
