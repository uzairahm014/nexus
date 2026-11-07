import { db, nowIso, uid, setSetting } from './db';
import { hashPassword, levelForXp } from './auth';

/**
 * Demo content is explicitly labelled in the UI (users have is_demo = 1 and the
 * client renders a "demo" badge). Nothing here fabricates live presence or
 * fake online counters — every row is a real database record you can edit,
 * delete, follow, like or message.
 */
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'NEXUSdemo123';

type SeedUser = {
  handle: string;
  name: string;
  email: string;
  bio: string;
  color: string;
  role?: string;
  xp?: number;
};

const USERS: SeedUser[] = [
  { handle: 'nexus', name: 'NEXUS Command', email: 'admin@nexus.gg', bio: 'Platform operations, moderation and release notes.', color: '#7C3AED', role: 'admin', xp: 9800 },
  { handle: 'novastrike', name: 'Nova Strike', email: 'nova@nexus.gg', bio: 'Neon Racer addict. Chasing sub-60 lap times on the Grid District circuit.', color: '#22D3EE', xp: 6400 },
  { handle: 'echo', name: 'Echo Vayne', email: 'echo@nexus.gg', bio: 'Sound designer turning synth waves into worlds. NEXUS Originals artist.', color: '#E879F9', xp: 4200 },
  { handle: 'kite', name: 'Kite', email: 'kite@nexus.gg', bio: 'Level designer. Tower defence perfectionist. Currently building "Violet Spire".', color: '#818CF8', xp: 3300 },
  { handle: 'riven', name: 'Riven Ash', email: 'riven@nexus.gg', bio: 'Speedrunner and clip editor. If it can be broken, I will find it.', color: '#F472B6', xp: 2900 },
  { handle: 'orion', name: 'Orion Vale', email: 'orion@nexus.gg', bio: 'Community host for the Neon Grid. Tournaments every Friday.', color: '#34D399', xp: 2100 },
  { handle: 'lyra', name: 'Lyra Quinn', email: 'lyra@nexus.gg', bio: 'Puzzle designer. I make things that make you think twice.', color: '#FBBF24', xp: 1500 },
  { handle: 'hex', name: 'Hex', email: 'hex@nexus.gg', bio: 'Arena main. Wave 30 or nothing.', color: '#F87171', xp: 900 },
];

const GAMES = [
  {
    slug: 'neon-racer',
    title: 'NEXUS Neon Racer',
    tagline: 'Arcade racing through the Grid District at 300 km/h.',
    description:
      'A real-time 3D arcade racer rendered with WebGL. Weave through the neon grid, hit boost pads, keep your line and beat three AI rivals across three laps. Built with a custom arcade physics model on top of a real 3D engine: PBR materials, dynamic shadows, emissive city lighting and atmospheric fog.',
    genre: 'Racing',
    engine: 'Three.js WebGL',
    cover: '/art/game-neon-racer.jpg',
    banner: '/art/hero-home.jpg',
    is3d: 1,
    controls: 'WASD / Arrow keys · Space brake · Shift boost · Touch: on-screen pedals',
    instructions:
      'Hold accelerate to build speed. Steer with A/D. Braking tightens your line through corners. Drive over cyan boost pads for a speed surge. Complete 3 laps as fast as you can — the timer starts when you cross the line.',
    accent: '#22D3EE',
    featured: 1,
    maxSps: 30,
    minSeconds: 20,
  },
  {
    slug: 'arena',
    title: 'NEXUS Arena',
    tagline: 'Survive endless waves in a collapsing neon arena.',
    description:
      'Top-down arena combat with escalating enemy waves, dash mechanics, pickups and a boss every fifth wave. Health, combo multipliers and a real game-over loop.',
    genre: 'Action',
    engine: 'Phaser 3',
    cover: '/art/game-arena.jpg',
    banner: '/art/banner-live.jpg',
    is3d: 0,
    controls: 'WASD / Arrows move · Mouse or J to shoot · Space dash · Touch: virtual sticks',
    instructions:
      'Move to dodge, aim with the mouse (or the right stick on touch) and fire. Every fifth wave spawns a heavy. Collect cyan cores to restore health. Dash through enemies to break their shields.',
    accent: '#E879F9',
    featured: 1,
    maxSps: 25,
    minSeconds: 10,
  },
  {
    slug: 'parkour',
    title: 'NEXUS Parkour',
    tagline: 'Vertical movement, checkpoints and one very long fall.',
    description:
      'A precision platformer with double jumping, coyote time, moving platforms, hazards and collectible data shards. Checkpoints track your best run.',
    genre: 'Platformer',
    engine: 'Phaser 3',
    cover: '/art/game-parkour.jpg',
    banner: '/art/hero-games.jpg',
    is3d: 0,
    controls: 'A/D or Arrows move · Space / W jump (double jump) · Touch: left / right / jump',
    instructions:
      'Reach the violet beacon at the end of the course. You get two jumps — the second refreshes when you touch a wall. Checkpoints save your progress in the level. Collect shards for score.',
    accent: '#818CF8',
    featured: 1,
    maxSps: 20,
    minSeconds: 15,
  },
  {
    slug: 'tower-defence',
    title: 'NEXUS Tower Defence',
    tagline: 'Build, upgrade, survive. The grid does not forgive.',
    description:
      'Grid-based tower defence with three tower classes, upgrade paths, wave scaling, currency and a real win condition. Your core has 20 integrity.',
    genre: 'Strategy',
    engine: 'Phaser 3',
    cover: '/art/game-tower.jpg',
    banner: '/art/banner-create.jpg',
    is3d: 0,
    controls: 'Click / tap to place and upgrade · 1-3 select tower type · Space start wave',
    instructions:
      'Place Pulse turrets on empty grid cells. Each kill pays credits. Upgrade towers to raise damage and range. Waves scale every round — survive 10 waves to win.',
    accent: '#A855F7',
    featured: 0,
    maxSps: 30,
    minSeconds: 30,
  },
  {
    slug: 'party',
    title: 'NEXUS Party',
    tagline: 'Three rapid-fire reflex games in one run.',
    description:
      'A party pack of original mini-games: Reflex Gate, Sequence Lock and Target Storm. Playable solo for a combined score, with local hot-seat rounds.',
    genre: 'Arcade',
    engine: 'Phaser 3',
    cover: '/art/game-party.jpg',
    banner: '/art/hero-social.jpg',
    is3d: 0,
    controls: 'Click / tap · Arrow keys · Space to confirm',
    instructions:
      'Three rounds, escalating speed. Hit the gate the instant it turns cyan, repeat the sequence exactly, then smash as many targets as you can before the timer expires.',
    accent: '#FBBF24',
    featured: 1,
    maxSps: 40,
    minSeconds: 10,
  },
];

const COMMUNITIES = [
  { slug: 'neon-grid', name: 'Neon Grid', description: 'Racing, time trials and the Friday night circuit league.', cover: '/art/comm-1.jpg' },
  { slug: 'studio-lab', name: 'Studio Lab', description: 'Share scenes, scripts and feedback on NEXUS Game Studio projects.', cover: '/art/comm-2.jpg' },
  { slug: 'soundwave', name: 'Soundwave', description: 'Synthwave, darksynth and original NEXUS Originals tracks.', cover: '/art/comm-3.jpg' },
  { slug: 'arena-crew', name: 'Arena Crew', description: 'Wave strategies, boss routes and co-op nights.', cover: '/art/comm-4.jpg' },
];

const POSTS: Array<{ author: string; body: string; media?: string; community?: string }> = [
  { author: 'novastrike', body: 'Finally broke 62 seconds on the Grid District circuit in Neon Racer. The trick is staying off the brake through turn four — the boost pad carries you.', media: '/art/clip-1.jpg', community: 'neon-grid' },
  { author: 'kite', body: 'New Studio scene: "Violet Spire". Three tower lanes, a chokepoint in the middle and a lighting rig that actually runs at 60fps on an iPhone 12.', media: '/art/game-tower.jpg', community: 'studio-lab' },
  { author: 'echo', body: 'Dropped a new NEXUS Original — "Midnight Circuit". Built entirely with hardware synths, free to stream on the Music page.', media: '/art/comm-3.jpg', community: 'soundwave' },
  { author: 'hex', body: 'Wave 30 in Arena without taking damage. The dash cancel on heavy shields is genuinely broken and I love it.', community: 'arena-crew' },
  { author: 'riven', body: 'Clip of the week: a full parkour run with zero checkpoint resets. 48 seconds, all shards.', media: '/art/clip-2.jpg' },
  { author: 'lyra', body: 'Published my first quiz experience — "Which neon archetype are you?". Five questions, takes about a minute.', media: '/art/comm-4.jpg' },
  { author: 'orion', body: 'Friday tournament bracket is open. 16 slots, best of three on Neon Racer. Registration is on the Events page.', media: '/art/banner-live.jpg' },
  { author: 'nexus', body: 'Platform update: the Game Studio now supports visual scripting, physics settings and one-click publishing to the Marketplace.', media: '/art/banner-create.jpg' },
];

export function seedDatabase(force = false): { seeded: boolean; users: number; games: number } {
  const existing = db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number };
  if (existing.c > 0 && !force) {
    return { seeded: false, users: existing.c, games: (db.prepare('SELECT COUNT(*) AS c FROM games').get() as any).c };
  }
  if (force) {
    db.exec(`DELETE FROM experience_responses; DELETE FROM experiences; DELETE FROM battle_entries; DELETE FROM battles;
      DELETE FROM playlist_tracks; DELETE FROM playlists; DELETE FROM music_tracks; DELETE FROM marketplace_items;
      DELETE FROM clip_comments; DELETE FROM clip_likes; DELETE FROM clips; DELETE FROM event_registrations; DELETE FROM events;
      DELETE FROM user_achievements; DELETE FROM achievements; DELETE FROM game_progress; DELETE FROM game_scores; DELETE FROM games;
      DELETE FROM projects; DELETE FROM notifications; DELETE FROM reports; DELETE FROM missions; DELETE FROM settings;
      DELETE FROM messages; DELETE FROM conversation_members; DELETE FROM conversations; DELETE FROM bookmarks; DELETE FROM comments;
      DELETE FROM post_likes; DELETE FROM posts; DELETE FROM community_members; DELETE FROM communities; DELETE FROM blocks;
      DELETE FROM follows; DELETE FROM users;`);
  }

  const passwordHash = hashPassword(DEMO_PASSWORD);
  const userIds: Record<string, string> = {};

  const insertUser = db.prepare(
    `INSERT INTO users (id, handle, email, password_hash, display_name, bio, avatar_color, banner_url, role, xp, level, is_demo, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
  );
  for (const u of USERS) {
    const id = uid();
    userIds[u.handle] = id;
    const xp = u.xp ?? 0;
    insertUser.run(
      id,
      u.handle,
      u.email,
      passwordHash,
      u.name,
      u.bio,
      u.color,
      '/art/banner-profile.jpg',
      u.role ?? 'user',
      xp,
      levelForXp(xp),
      nowIso(),
    );
  }

  // Follow graph (mutual pairs become friends in the API).
  const follow = db.prepare('INSERT OR IGNORE INTO follows (follower_id, following_id, created_at) VALUES (?, ?, ?)');
  const pairs: Array<[string, string]> = [
    ['novastrike', 'echo'], ['echo', 'novastrike'],
    ['kite', 'lyra'], ['lyra', 'kite'],
    ['hex', 'riven'], ['riven', 'hex'],
    ['orion', 'novastrike'], ['novastrike', 'orion'],
    ['nexus', 'novastrike'], ['novastrike', 'nexus'],
    ['echo', 'kite'], ['kite', 'echo'],
    ['riven', 'novastrike'], ['lyra', 'echo'],
  ];
  for (const [a, b] of pairs) follow.run(userIds[a], userIds[b], nowIso());

  const communityIds: Record<string, string> = {};
  const insertCommunity = db.prepare(
    'INSERT INTO communities (id, slug, name, description, cover_url, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );
  for (const c of COMMUNITIES) {
    const id = uid();
    communityIds[c.slug] = id;
    insertCommunity.run(id, c.slug, c.name, c.description, c.cover, userIds['nexus'], nowIso());
  }
  const join = db.prepare(
    'INSERT OR IGNORE INTO community_members (community_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)',
  );
  const membership: Array<[string, string, string]> = [
    ['neon-grid', 'novastrike', 'owner'], ['neon-grid', 'orion', 'moderator'], ['neon-grid', 'riven', 'member'], ['neon-grid', 'hex', 'member'],
    ['studio-lab', 'kite', 'owner'], ['studio-lab', 'lyra', 'member'], ['studio-lab', 'nexus', 'moderator'],
    ['soundwave', 'echo', 'owner'], ['soundwave', 'lyra', 'member'],
    ['arena-crew', 'hex', 'owner'], ['arena-crew', 'riven', 'member'], ['arena-crew', 'orion', 'member'],
  ];
  for (const [slug, handle, role] of membership) join.run(communityIds[slug], userIds[handle], role, nowIso());

  const insertPost = db.prepare(
    'INSERT INTO posts (id, author_id, body, media_url, media_type, community_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );
  const insertLike = db.prepare('INSERT OR IGNORE INTO post_likes (post_id, user_id, reaction, created_at) VALUES (?, ?, ?, ?)');
  const insertComment = db.prepare('INSERT INTO comments (id, post_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)');
  const likePool = ['novastrike', 'echo', 'kite', 'riven', 'orion', 'lyra', 'hex', 'nexus'];
  POSTS.forEach((p, index) => {
    const id = uid();
    insertPost.run(
      id,
      userIds[p.author],
      p.body,
      p.media ?? null,
      p.media ? 'image' : null,
      p.community ? communityIds[p.community] : null,
      new Date(Date.now() - (index + 1) * 1000 * 60 * 47).toISOString(),
    );
    const likers = likePool.filter((h) => h !== p.author).slice(0, 3 + (index % 4));
    for (const h of likers) insertLike.run(id, userIds[h], index % 5 === 0 ? 'fire' : 'like', nowIso());
    if (index < 4) {
      insertComment.run(uid(), id, userIds[likePool[(index + 2) % likePool.length]], 'This is exactly the kind of thing the grid needed.', nowIso());
    }
  });

  const insertGame = db.prepare(
    `INSERT INTO games (id, slug, title, tagline, description, genre, engine, cover_url, banner_url, is_3d, playable, controls, instructions, accent, featured, max_score_per_second, min_seconds, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const gameIds: Record<string, string> = {};
  for (const g of GAMES) {
    const id = uid();
    gameIds[g.slug] = id;
    insertGame.run(
      id, g.slug, g.title, g.tagline, g.description, g.genre, g.engine, g.cover, g.banner,
      g.is3d, g.controls, g.instructions, g.accent, g.featured, g.maxSps, g.minSeconds, nowIso(),
    );
  }

  const insertAchievement = db.prepare(
    'INSERT INTO achievements (id, game_id, code, title, description, icon, xp) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );
  const ACHIEVEMENTS: Array<[string, string, string, string, string, number]> = [
    ['neon-racer', 'first-lap', 'Grid Runner', 'Complete a lap on the Grid District circuit.', 'flag', 60],
    ['neon-racer', 'sub-70', 'Sub-70', 'Finish three laps in under 70 seconds.', 'timer', 120],
    ['neon-racer', 'podium', 'Podium Finish', 'Finish a race in first place.', 'trophy', 150],
    ['arena', 'wave-5', 'Hold the Line', 'Reach wave 5 in NEXUS Arena.', 'shield', 80],
    ['arena', 'wave-15', 'Arena Veteran', 'Reach wave 15.', 'swords', 200],
    ['parkour', 'all-shards', 'Shard Collector', 'Collect every data shard in one run.', 'sparkles', 120],
    ['parkour', 'finish', 'Skyline', 'Complete the parkour course.', 'flag', 90],
    ['tower-defence', 'wave-5', 'Fortified', 'Survive five waves.', 'tower', 90],
    ['tower-defence', 'victory', 'Core Defender', 'Win all ten waves.', 'trophy', 220],
    ['party', 'reflex', 'Lightning', 'Clear a reflex gate in under 250ms.', 'zap', 70],
    ['party', 'score-1500', 'Party Legend', 'Score 1500 or more in a single run.', 'star', 160],
  ];
  const achievementIds: Record<string, string> = {};
  for (const [slug, code, title, desc, icon, xp] of ACHIEVEMENTS) {
    const id = uid();
    achievementIds[`${slug}:${code}`] = id;
    insertAchievement.run(id, gameIds[slug], code, title, desc, icon, xp);
  }

  const insertScore = db.prepare(
    'INSERT INTO game_scores (id, game_id, user_id, score, meta, validated, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)',
  );
  const SCORES: Array<[string, string, number, string]> = [
    ['neon-racer', 'novastrike', 9420, '3 laps · 58.4s'],
    ['neon-racer', 'riven', 9110, '3 laps · 60.1s'],
    ['neon-racer', 'hex', 8760, '3 laps · 61.9s'],
    ['neon-racer', 'orion', 8240, '3 laps · 63.5s'],
    ['arena', 'hex', 18450, 'wave 27'],
    ['arena', 'riven', 15230, 'wave 21'],
    ['arena', 'novastrike', 12010, 'wave 17'],
    ['parkour', 'riven', 6400, 'all shards'],
    ['parkour', 'lyra', 5820, '4 shards'],
    ['tower-defence', 'kite', 8900, '10 waves cleared'],
    ['tower-defence', 'lyra', 7120, '9 waves'],
    ['party', 'lyra', 2410, '3 rounds'],
    ['party', 'orion', 2180, '3 rounds'],
    ['party', 'echo', 1960, '3 rounds'],
  ];
  for (const [slug, handle, score, meta] of SCORES) {
    insertScore.run(uid(), gameIds[slug], userIds[handle], score, meta, new Date(Date.now() - Math.random() * 6 * 86400000).toISOString());
  }

  const unlock = db.prepare('INSERT OR IGNORE INTO user_achievements (user_id, achievement_id, unlocked_at) VALUES (?, ?, ?)');
  unlock.run(userIds['novastrike'], achievementIds['neon-racer:first-lap'], nowIso());
  unlock.run(userIds['novastrike'], achievementIds['neon-racer:sub-70'], nowIso());
  unlock.run(userIds['hex'], achievementIds['arena:wave-5'], nowIso());
  unlock.run(userIds['kite'], achievementIds['tower-defence:wave-5'], nowIso());

  const insertEvent = db.prepare(
    'INSERT INTO events (id, title, description, banner_url, kind, starts_at, ends_at, capacity, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  );
  const EVENTS: Array<[string, string, string, string, number, number, number]> = [
    ['Friday Night Circuit', 'Three-lap time trial league on the Grid District circuit. Best of three runs counts.', '/art/banner-live.jpg', 'tournament', 2, 3, 16],
    ['Studio Jam: Violet Spire', 'Build a tower defence scene in one hour. Voting opens when the timer ends.', '/art/banner-create.jpg', 'event', 4, 5, 40],
    ['Soundwave Session 07', 'Live listening room for new NEXUS Originals tracks with the artists in chat.', '/art/comm-3.jpg', 'watchparty', 1, 2, 120],
    ['Arena Endurance', 'Survive as many waves as possible. One life, one attempt, leaderboard verified.', '/art/banner-community.jpg', 'tournament', 6, 7, 64],
    ['Parkour Shard Rush', 'Fastest full-shard run wins. Checkpoints allowed.', '/art/hero-games.jpg', 'challenge', 9, 10, 32],
  ];
  const eventIds: string[] = [];
  for (const [title, desc, banner, kind, startDays, endDays, cap] of EVENTS) {
    const id = uid();
    eventIds.push(id);
    insertEvent.run(
      id, title, desc, banner, kind,
      new Date(Date.now() + startDays * 86400000).toISOString(),
      new Date(Date.now() + endDays * 86400000).toISOString(),
      cap, userIds['nexus'], nowIso(),
    );
  }
  const register = db.prepare('INSERT OR IGNORE INTO event_registrations (event_id, user_id, created_at) VALUES (?, ?, ?)');
  register.run(eventIds[0], userIds['novastrike'], nowIso());
  register.run(eventIds[0], userIds['riven'], nowIso());
  register.run(eventIds[1], userIds['kite'], nowIso());
  register.run(eventIds[3], userIds['hex'], nowIso());

  const insertClip = db.prepare(
    'INSERT INTO clips (id, author_id, title, description, thumb_url, media_url, duration, views, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  );
  const CLIPS: Array<[string, string, string, string, number, number]> = [
    ['novastrike', 'Grid District · 58.4s clean lap', 'No braking through turn four. The boost pad does the work.', '/art/clip-1.jpg', 42, 18420],
    ['riven', 'Parkour · zero-reset full shard run', 'Every shard, no checkpoint resets.', '/art/clip-2.jpg', 51, 12110],
    ['hex', 'Arena wave 27 boss dodge', 'Dash cancel into heavy shield break.', '/art/clip-3.jpg', 28, 9310],
    ['lyra', 'Tower defence · perfect economy', 'Three towers, zero leaks, wave 10.', '/art/clip-4.jpg', 96, 6720],
  ];
  for (const [handle, title, desc, thumb, dur, views] of CLIPS) {
    insertClip.run(uid(), userIds[handle], title, desc, thumb, null, dur, views, new Date(Date.now() - Math.random() * 5 * 86400000).toISOString());
  }

  const insertTrack = db.prepare(
    'INSERT INTO music_tracks (id, title, artist, genre, cover_url, embed_url, duration) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );
  const TRACKS: Array<[string, string, string, string, number]> = [
    ['Midnight Circuit', 'Echo Vayne', 'Synthwave', '/art/comm-3.jpg', 48],
    ['Violet Spire', 'Echo Vayne', 'Darksynth', '/art/comm-2.jpg', 42],
    ['Grid Runner', 'NEXUS Originals', 'Outrun', '/art/comm-1.jpg', 45],
    ['Core Breach', 'NEXUS Originals', 'Industrial', '/art/game-tower.jpg', 40],
    ['Shard Drift', 'Lyra Quinn', 'Ambient', '/art/comm-4.jpg', 50],
  ];
  const trackIds: string[] = [];
  TRACKS.forEach(([title, artist, genre, cover, duration], i) => {
    const id = uid();
    trackIds.push(id);
    insertTrack.run(id, title, artist, genre, cover, `/audio/track-${i + 1}.mp3`, duration);
  });

  const insertPlaylist = db.prepare('INSERT INTO playlists (id, owner_id, title, description, cover_url, created_at) VALUES (?, ?, ?, ?, ?, ?)');
  const insertPlaylistTrack = db.prepare('INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)');
  const playlists: Array<[string, string, string, string[]]> = [
    ['Late Night Grid', 'Deep synth for long sessions.', '/art/hero-home.jpg', [trackIds[0], trackIds[2], trackIds[4]]],
    ['Studio Focus', 'Ambient loops for building scenes.', '/art/hero-games.jpg', [trackIds[4], trackIds[1]]],
    ['Full Throttle', 'Outrun and industrial for racing.', '/art/banner-live.jpg', [trackIds[2], trackIds[3], trackIds[0]]],
  ];
  for (const [title, desc, cover, tracks] of playlists) {
    const id = uid();
    insertPlaylist.run(id, userIds['echo'], title, desc, cover, nowIso());
    tracks.forEach((t, i) => insertPlaylistTrack.run(id, t, i));
  }

  const insertItem = db.prepare(
    'INSERT INTO marketplace_items (id, title, description, creator_id, cover_url, kind, price, rating, downloads, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  );
  const ITEMS: Array<[string, string, string, string, number, number, number]> = [
    ['Neon Grid Race Template', 'A ready-to-edit 3D race scene with checkpoints, boost pads and a full HUD.', 'novastrike', '/art/game-neon-racer.jpg', 0, 4.8, 1240],
    ['Violet Spire Tower Kit', 'Tower defence scene with three lanes, upgrade tables and wave config.', 'kite', '/art/game-tower.jpg', 0, 4.7, 890],
    ['Synthwave Audio Pack', 'Five loopable original tracks cleared for use in your NEXUS projects.', 'echo', '/art/comm-3.jpg', 0, 4.9, 2100],
    ['Platformer Movement Script', 'Coyote time, double jump and wall-slide behaviours as a visual script module.', 'lyra', '/art/game-parkour.jpg', 0, 4.6, 640],
    ['Arena Wave Director', 'Drop-in wave scaling and boss scheduling for arena games.', 'hex', '/art/game-arena.jpg', 0, 4.5, 410],
    ['NEXUS UI Frame Kit', 'Glass panels, HUD frames and neon buttons matching the platform design system.', 'nexus', '/art/banner-marketplace.jpg', 0, 4.9, 3120],
  ];
  for (const [title, desc, handle, cover, price, rating, downloads] of ITEMS) {
    insertItem.run(uid(), title, desc, userIds[handle], cover, 'template', price, rating, downloads, nowIso());
  }

  const insertBattle = db.prepare(
    'INSERT INTO battles (id, title, description, game_slug, status, banner_url, starts_at, prize, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  );
  const BATTLES: Array<[string, string, string, string, string, number]> = [
    ['Circuit Showdown', 'Head-to-head Neon Racer time trial. Lower lap time wins.', 'neon-racer', 'open', '/art/banner-live.jpg', 2],
    ['Wave War', 'Highest Arena wave within one attempt.', 'arena', 'open', '/art/banner-community.jpg', 3],
    ['Spire Sprint', 'Fastest 10-wave tower defence clear.', 'tower-defence', 'live', '/art/banner-create.jpg', 1],
  ];
  const battleIds: string[] = [];
  for (const [title, desc, gameSlug, status, banner, days] of BATTLES) {
    const id = uid();
    battleIds.push(id);
    insertBattle.run(id, title, desc, gameSlug, status, banner, new Date(Date.now() + days * 86400000).toISOString(), '500 XP + featured slot', nowIso());
  }
  const enterBattle = db.prepare('INSERT OR IGNORE INTO battle_entries (battle_id, user_id, score, created_at) VALUES (?, ?, ?, ?)');
  enterBattle.run(battleIds[0], userIds['novastrike'], 9420, nowIso());
  enterBattle.run(battleIds[0], userIds['riven'], 9110, nowIso());
  enterBattle.run(battleIds[1], userIds['hex'], 18450, nowIso());

  const insertExperience = db.prepare(
    'INSERT INTO experiences (id, title, description, type, cover_url, author_id, data, published, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)',
  );
  insertExperience.run(
    uid(),
    'Which neon archetype are you?',
    'Five questions. One of four archetypes. Built with the NEXUS quiz creator.',
    'quiz',
    '/art/comm-4.jpg',
    userIds['lyra'],
    JSON.stringify({
      questions: [
        { q: 'A new game drops. First move?', options: ['Straight into ranked', 'Read every patch note', 'Build something in the Studio', 'Find the soundtrack'] },
        { q: 'Pick a colour.', options: ['Cyan', 'Violet', 'Magenta', 'Amber'] },
        { q: 'Your best run is beaten. You...', options: ['Run it again immediately', 'Study the replay', 'Redesign the level', 'Take a break and vibe'] },
        { q: 'Favourite role in a squad?', options: ['Front line', 'Strategist', 'Creator', 'Host'] },
        { q: 'Which NEXUS section first?', options: ['Games', 'Battles', 'Create', 'Music'] },
      ],
      results: ['The Striker', 'The Architect', 'The Builder', 'The Curator'],
    }),
    nowIso(),
  );

  const convo = uid();
  db.prepare('INSERT INTO conversations (id, title, is_group, created_by, created_at) VALUES (?, ?, 1, ?, ?)').run(
    convo, 'Neon Grid — Friday prep', userIds['orion'], nowIso(),
  );
  const addMember = db.prepare('INSERT OR IGNORE INTO conversation_members (conversation_id, user_id, joined_at) VALUES (?, ?, ?)');
  for (const h of ['orion', 'novastrike', 'riven', 'hex']) addMember.run(convo, userIds[h], nowIso());
  const addMessage = db.prepare('INSERT INTO messages (id, conversation_id, sender_id, body, created_at) VALUES (?, ?, ?, ?, ?)');
  addMessage.run(uid(), convo, userIds['orion'], 'Bracket is set for Friday. Sixteen slots, best of three on Neon Racer.', new Date(Date.now() - 7200000).toISOString());
  addMessage.run(uid(), convo, userIds['novastrike'], 'I will host the warm-up lobby at 18:00. Bring your best lap.', new Date(Date.now() - 5400000).toISOString());
  addMessage.run(uid(), convo, userIds['riven'], 'Recording every run for the clip feed.', new Date(Date.now() - 3600000).toISOString());

  const addNotification = db.prepare(
    'INSERT INTO notifications (id, user_id, type, actor_id, entity_id, body, read, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  );
  addNotification.run(uid(), userIds['novastrike'], 'follow', userIds['echo'], null, 'Echo Vayne started following you.', 0, nowIso());
  addNotification.run(uid(), userIds['novastrike'], 'achievement', null, null, 'Achievement unlocked: Sub-70.', 1, nowIso());
  addNotification.run(uid(), userIds['novastrike'], 'event', userIds['orion'], eventIds[0], 'Friday Night Circuit starts in 2 days.', 0, nowIso());

  const addMission = db.prepare('INSERT INTO missions (id, title, description, kind, xp) VALUES (?, ?, ?, ?, ?)');
  addMission.run(uid(), 'Complete one race', 'Finish a full three-lap race in Neon Racer.', 'daily', 40);
  addMission.run(uid(), 'Reach wave 5', 'Survive five waves in NEXUS Arena.', 'daily', 50);
  addMission.run(uid(), 'Publish a post', 'Share something with the grid.', 'daily', 25);
  addMission.run(uid(), 'Build a scene', 'Save a project in NEXUS Game Studio.', 'weekly', 100);

  setSetting('platform_name', 'NEXUS');
  setSetting('tagline', 'PLAY. CREATE. CONNECT. EXPLORE.');
  setSetting('registrations_open', 'true');
  setSetting('moderation_mode', 'review_reports');

  return { seeded: true, users: USERS.length, games: GAMES.length };
}

export function seedIfEmpty(): void {
  seedDatabase(false);
}
