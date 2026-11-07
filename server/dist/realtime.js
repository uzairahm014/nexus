"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.attachRealtime = attachRealtime;
const ws_1 = require("ws");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const db_1 = require("./db");
const auth_1 = require("./auth");
/**
 * NEXUS realtime arena.
 *
 * Authoritative-lite server: the server owns the match clock, the orb spawns and
 * every score. Clients only report their own intent (position/aim), which is
 * clamped here, so a modified client cannot award itself points.
 */
const ARENA_W = 1000;
const ARENA_H = 600;
const MATCH_MS = 60_000;
const ORB_COUNT = 6;
const MAX_PLAYERS = 8;
const MAX_CHAT = 60;
const TICK_MS = 80;
const rooms = new Map();
const socketRoom = new Map();
const socketPlayer = new Map();
const clamp = (value, min, max) => Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
function roomCode() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    do {
        code = Array.from({ length: 5 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
    } while (rooms.has(code));
    return code;
}
function spawnOrb() {
    return {
        id: (0, db_1.uid)(),
        x: 60 + Math.random() * (ARENA_W - 120),
        y: 60 + Math.random() * (ARENA_H - 120),
    };
}
function snapshot(room) {
    return {
        code: room.code,
        state: room.state,
        hostId: room.hostId,
        endsAt: room.endsAt,
        arena: { w: ARENA_W, h: ARENA_H },
        players: [...room.players.values()].map((p) => ({
            id: p.id,
            handle: p.handle,
            name: p.name,
            color: p.color,
            x: Math.round(p.x),
            y: Math.round(p.y),
            score: p.score,
            ready: p.ready,
            collected: p.collected,
        })),
        orbs: room.orbs,
    };
}
function send(socket, payload) {
    if (socket.readyState === ws_1.WebSocket.OPEN)
        socket.send(JSON.stringify(payload));
}
function broadcast(room, payload) {
    const data = JSON.stringify(payload);
    for (const player of room.players.values()) {
        if (player.socket.readyState === ws_1.WebSocket.OPEN)
            player.socket.send(data);
    }
}
function pushState(room) {
    broadcast(room, { t: 'state', ...snapshot(room) });
}
function startMatch(room) {
    if (room.state === 'playing')
        return;
    room.state = 'playing';
    room.startedAt = Date.now();
    room.endsAt = Date.now() + MATCH_MS;
    room.orbs = Array.from({ length: ORB_COUNT }, spawnOrb);
    for (const player of room.players.values()) {
        player.score = 0;
        player.collected = 0;
        player.ready = false;
        player.x = ARENA_W / 2;
        player.y = ARENA_H / 2;
    }
    broadcast(room, { t: 'match', state: 'playing', endsAt: room.endsAt });
    pushState(room);
    if (room.timer)
        clearInterval(room.timer);
    room.timer = setInterval(() => {
        if (room.state !== 'playing')
            return;
        if (Date.now() >= room.endsAt) {
            finishMatch(room);
            return;
        }
        pushState(room);
    }, TICK_MS);
    // Never hold the process open just for a match tick (also keeps tests exiting cleanly).
    room.timer.unref?.();
}
function finishMatch(room) {
    if (room.timer) {
        clearInterval(room.timer);
        room.timer = null;
    }
    room.state = 'ended';
    const results = [...room.players.values()]
        .sort((a, b) => b.score - a.score)
        .map((p, index) => ({ id: p.id, handle: p.handle, name: p.name, score: p.score, collected: p.collected, place: index + 1 }));
    // Server-validated progression: XP comes from server-owned scores only.
    for (const result of results) {
        const gained = Math.min(120, 10 + result.collected * 4);
        try {
            (0, auth_1.awardXp)(result.id, gained);
        }
        catch {
            /* progression is best-effort; the match result still stands */
        }
    }
    broadcast(room, { t: 'results', results });
    pushState(room);
}
function leaveRoom(socket) {
    const code = socketRoom.get(socket);
    if (!code)
        return;
    const room = rooms.get(code);
    socketRoom.delete(socket);
    socketPlayer.delete(socket);
    if (!room)
        return;
    const playerId = [...room.players.entries()].find(([, p]) => p.socket === socket)?.[0];
    if (!playerId)
        return;
    const player = room.players.get(playerId);
    room.players.delete(playerId);
    broadcast(room, { t: 'system', body: `${player.name} left the arena.` });
    if (room.players.size === 0) {
        if (room.timer)
            clearInterval(room.timer);
        rooms.delete(room.code);
        return;
    }
    if (room.hostId === playerId) {
        room.hostId = [...room.players.keys()][0];
    }
    pushState(room);
}
function handleJoin(socket, userId, requestedCode) {
    if (socketRoom.has(socket))
        return;
    let room;
    const code = (requestedCode ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
    if (code) {
        room = rooms.get(code);
        if (!room) {
            send(socket, { t: 'error', message: 'That room code does not exist any more.' });
            return;
        }
        if (room.players.size >= MAX_PLAYERS) {
            send(socket, { t: 'error', message: 'That arena is full (8 players).' });
            return;
        }
    }
    else {
        room = {
            code: roomCode(),
            hostId: userId,
            state: 'lobby',
            players: new Map(),
            orbs: [],
            endsAt: 0,
            startedAt: 0,
            chat: [],
            timer: null,
        };
        rooms.set(room.code, room);
    }
    const user = (0, auth_1.findUserById)(userId);
    if (!user) {
        send(socket, { t: 'error', message: 'Sign in again to join the arena.' });
        return;
    }
    if (user.role === 'suspended') {
        send(socket, { t: 'error', message: 'This account is suspended from multiplayer.' });
        return;
    }
    const player = {
        id: user.id,
        handle: user.handle,
        name: user.displayName,
        color: user.avatarColor || '#7C3AED',
        x: ARENA_W / 2 + (Math.random() * 160 - 80),
        y: ARENA_H / 2 + (Math.random() * 160 - 80),
        score: 0,
        ready: false,
        socket,
        lastChat: 0,
        collected: 0,
    };
    room.players.set(user.id, player);
    socketRoom.set(socket, room.code);
    socketPlayer.set(socket, user.id);
    send(socket, { t: 'welcome', youId: user.id, ...snapshot(room), chat: room.chat });
    broadcast(room, { t: 'system', body: `${player.name} joined the arena.` });
    pushState(room);
}
function attachRealtime(server) {
    const wss = new ws_1.WebSocketServer({ server, path: '/ws' });
    wss.on('connection', (socket, request) => {
        const url = new URL(request.url ?? '/ws', 'http://localhost');
        const token = url.searchParams.get('token');
        let userId = '';
        try {
            if (!token)
                throw new Error('missing token');
            const payload = jsonwebtoken_1.default.verify(token, (0, db_1.jwtSecret)());
            if (!payload.uid)
                throw new Error('bad token');
            const row = db_1.db.prepare('SELECT token_version FROM users WHERE id = ?').get(payload.uid);
            if (!row || row.token_version !== payload.tv)
                throw new Error('stale token');
            userId = payload.uid;
        }
        catch {
            send(socket, { t: 'error', message: 'Sign in to play multiplayer.' });
            socket.close();
            return;
        }
        socket.on('message', (raw) => {
            let msg;
            try {
                msg = JSON.parse(String(raw).slice(0, 4000));
            }
            catch {
                return;
            }
            if (!msg || typeof msg.t !== 'string')
                return;
            if (msg.t === 'join') {
                handleJoin(socket, userId, typeof msg.code === 'string' ? msg.code : '');
                return;
            }
            const code = socketRoom.get(socket);
            const room = code ? rooms.get(code) : undefined;
            const playerId = socketPlayer.get(socket);
            if (!room || !playerId)
                return;
            const player = room.players.get(playerId);
            if (!player)
                return;
            switch (msg.t) {
                case 'move': {
                    if (room.state !== 'playing')
                        return;
                    player.x = clamp(Number(msg.x), 14, ARENA_W - 14);
                    player.y = clamp(Number(msg.y), 14, ARENA_H - 14);
                    return;
                }
                case 'collect': {
                    if (room.state !== 'playing')
                        return;
                    const index = room.orbs.findIndex((orb) => orb.id === msg.orbId);
                    if (index === -1)
                        return;
                    const orb = room.orbs[index];
                    // Server-side reachability check — prevents teleport-collecting.
                    if (Math.hypot(orb.x - player.x, orb.y - player.y) > 90)
                        return;
                    player.score += 10;
                    player.collected += 1;
                    room.orbs[index] = spawnOrb();
                    send(socket, { t: 'collected', orbId: orb.id, score: player.score });
                    pushState(room);
                    return;
                }
                case 'ready': {
                    if (room.state === 'playing')
                        return;
                    player.ready = !player.ready;
                    pushState(room);
                    return;
                }
                case 'start': {
                    if (room.hostId !== playerId) {
                        send(socket, { t: 'error', message: 'Only the host can start the match.' });
                        return;
                    }
                    startMatch(room);
                    return;
                }
                case 'chat': {
                    const body = String(msg.body ?? '').replace(/\s+/g, ' ').trim().slice(0, 240);
                    if (!body)
                        return;
                    if (Date.now() - player.lastChat < 700) {
                        send(socket, { t: 'error', message: 'Slow down a moment before sending again.' });
                        return;
                    }
                    player.lastChat = Date.now();
                    const entry = { id: (0, db_1.uid)(), handle: player.handle, name: player.name, body, at: new Date().toISOString() };
                    room.chat.push(entry);
                    if (room.chat.length > MAX_CHAT)
                        room.chat.shift();
                    broadcast(room, { t: 'chat', message: entry });
                    return;
                }
                case 'leave': {
                    leaveRoom(socket);
                    return;
                }
                default:
                    return;
            }
        });
        socket.on('close', () => leaveRoom(socket));
        socket.on('error', () => leaveRoom(socket));
    });
    // Drop dead sockets so rooms do not fill with ghosts.
    const heartbeat = setInterval(() => {
        for (const socket of wss.clients) {
            if (socket.readyState !== ws_1.WebSocket.OPEN)
                leaveRoom(socket);
        }
    }, 30_000);
    heartbeat.unref?.();
    wss.on('close', () => clearInterval(heartbeat));
}
