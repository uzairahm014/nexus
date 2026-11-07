/**
 * NEXUS API integration tests (node --test).
 *
 * Runs the compiled server against a throwaway SQLite database so the dev data
 * is never touched. Covers auth, studio publish flow, group conversations,
 * score validation and upload rejection.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-test-'));
process.env.DATA_DIR = tmp;
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.UPLOAD_DIR = path.join(tmp, 'uploads');
process.env.JWT_SECRET = 'test-secret-value-that-is-long-enough';
process.env.SEED_ON_START = '0';

const { createApp } = await import('../dist/app.js');
const { seedDatabase } = await import('../dist/seed.js');
const { attachRealtime } = await import('../dist/realtime.js');

seedDatabase(true);

const app = createApp();
const server = app.listen(0, '127.0.0.1');
attachRealtime(server);
await new Promise((resolve) => server.once('listening', resolve));
const { port } = server.address();
const base = `http://127.0.0.1:${port}/api`;

test.after(() => {
  if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

const call = async (route, { method = 'GET', body, token, raw } = {}) => {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(base + route, {
    method,
    headers,
    body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, body: json };
};

const stamp = Date.now().toString(36);
let token = '';

test('health endpoint responds', async () => {
  const res = await call('/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
});

test('registration issues a session token', async () => {
  const res = await call('/auth/register', {
    method: 'POST',
    body: {
      handle: `qa${stamp}`,
      email: `qa${stamp}@nexus.gg`,
      password: 'NexusPass123!',
      displayName: 'QA Pilot',
    },
  });
  assert.equal(res.status, 201);
  assert.ok(res.body.token);
  assert.equal(res.body.user.handle, `qa${stamp}`);
  token = res.body.token;
});

test('duplicate registration is rejected', async () => {
  const res = await call('/auth/register', {
    method: 'POST',
    body: {
      handle: `qa${stamp}`,
      email: `other${stamp}@nexus.gg`,
      password: 'NexusPass123!',
      displayName: 'Duplicate',
    },
  });
  assert.equal(res.status, 409);
});

test('bad password is rejected', async () => {
  const res = await call('/auth/login', {
    method: 'POST',
    body: { identifier: `qa${stamp}@nexus.gg`, password: 'wrong-password' },
  });
  assert.equal(res.status, 401);
});

test('session token resolves the current user', async () => {
  const res = await call('/auth/me', { token });
  assert.equal(res.status, 200);
  assert.equal(res.body.user.handle, `qa${stamp}`);
});

test('protected studio routes require auth', async () => {
  const res = await call('/studio/projects', { method: 'POST', body: { title: 'Nope' } });
  assert.equal(res.status, 401);
});

test('studio project save → publish → public scene', async () => {
  const created = await call('/studio/projects', {
    method: 'POST',
    token,
    body: { title: `QA Scene ${stamp}` },
  });
  assert.equal(created.status, 201);
  const id = created.body.project.id;

  const scene = {
    objects: [
      {
        id: 'obj-1',
        name: 'Plinth',
        type: 'box',
        pos: [0, 0.5, 0],
        rot: [0, 0, 0],
        scale: [2, 1, 2],
        color: '#7C3AED',
        emissive: 0.3,
        metalness: 0.4,
        roughness: 0.3,
        physics: true,
        behavior: 'spin',
        speed: 1,
      },
    ],
    env: { background: '#06060F', fog: 0.03, ambient: 0.6, sun: 1.2, sunColor: '#9F7BFF', grid: true },
    camera: { fov: 55, pos: [7, 6, 10] },
    script: 'NEXUS.log("hello")',
  };

  const saved = await call(`/studio/projects/${id}`, { method: 'PUT', token, body: { title: `QA Scene ${stamp}`, data: scene } });
  assert.equal(saved.status, 200);

  const published = await call(`/studio/projects/${id}/publish`, { method: 'POST', token, body: { published: true } });
  assert.equal(published.status, 200);
  assert.ok(published.body.slug);

  const publicScene = await call(`/studio/gallery/${published.body.slug}`);
  assert.equal(publicScene.status, 200);
  assert.equal(publicScene.body.project.data.objects.length, 1);
  assert.equal(publicScene.body.project.data.objects[0].color, '#7C3AED');
});

test('group conversation requires real member handles', async () => {
  const bad = await call('/conversations/group', {
    method: 'POST',
    token,
    body: { title: 'Ghost Squad', handles: ['definitely-not-a-user'] },
  });
  assert.equal(bad.status, 400);

  const ok = await call('/conversations/group', {
    method: 'POST',
    token,
    body: { title: 'QA Squad', handles: ['novastrike'] },
  });
  assert.equal(ok.status, 201);
  const conversation = ok.body.conversation;
  assert.ok(conversation);
});

test('score submission validates auth and bounds', async () => {
  const games = await call('/games');
  assert.equal(games.status, 200);
  const slug = games.body.games[0].slug;

  const anonymous = await call(`/games/${slug}/scores`, { method: 'POST', body: { score: 10, durationSeconds: 5 } });
  assert.equal(anonymous.status, 401);

  const absurd = await call(`/games/${slug}/scores`, {
    method: 'POST',
    token,
    body: { score: 99_000_000, durationSeconds: 5 },
  });
  assert.equal(absurd.status, 400);

  const valid = await call(`/games/${slug}/scores`, {
    method: 'POST',
    token,
    body: { score: 1200, durationSeconds: 42 },
  });
  assert.ok([200, 201].includes(valid.status), `unexpected status ${valid.status}`);

  const leaderboard = await call(`/games/${slug}/leaderboard`);
  assert.equal(leaderboard.status, 200);
  assert.ok(leaderboard.body.leaderboard.some((entry) => entry.score === 1200));
});

test('non-media uploads are rejected', async () => {
  const form = new FormData();
  form.append('file', new Blob(['not a video'], { type: 'text/plain' }), 'evil.txt');
  const res = await fetch(`${base}/uploads`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  assert.equal(res.status, 400);
});

test('realtime endpoint rejects anonymous sockets', async () => {
  const { WebSocket } = await import('ws');
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const outcome = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('no response from /ws')), 4000);
    socket.on('message', (raw) => {
      clearTimeout(timer);
      resolve(JSON.parse(String(raw)));
    });
    // The server sends the rejection then closes; either signal proves the guard.
    socket.on('close', () => {
      clearTimeout(timer);
      resolve({ t: 'closed' });
    });
  });
  socket.terminate();
  assert.notEqual(outcome.t, 'welcome');
  assert.ok(outcome.t === 'error' || outcome.t === 'closed');
});
