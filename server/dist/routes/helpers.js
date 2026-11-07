"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EMBED_HOSTS = exports.httpUrl = exports.paging = exports.myId = exports.me = void 0;
exports.cleanText = cleanText;
exports.isAllowedEmbed = isAllowedEmbed;
exports.publicProfileRow = publicProfileRow;
const zod_1 = require("zod");
const me = (req) => req.user;
exports.me = me;
const myId = (req) => req.user?.id ?? '';
exports.myId = myId;
/** Trims, strips control characters and bounds user supplied text. */
function cleanText(value, max = 2000) {
    if (typeof value !== 'string')
        return '';
    return value
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
        .trim()
        .slice(0, max);
}
const paging = (req, defaultLimit = 20) => {
    const limit = Math.min(60, Math.max(1, Number(req.query.limit) || defaultLimit));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    return { limit, offset };
};
exports.paging = paging;
exports.httpUrl = zod_1.z
    .string()
    .max(500)
    .refine((value) => value === '' || /^https:\/\/[\w.-]+\.[a-z]{2,}(\/\S*)?$/i.test(value), 'Must be an https URL');
/** Only these hosts may be framed by the music/watch pages. */
exports.EMBED_HOSTS = [
    'www.youtube.com',
    'youtube.com',
    'www.youtube-nocookie.com',
    'open.spotify.com',
    'w.soundcloud.com',
    'player.vimeo.com',
];
function isAllowedEmbed(url) {
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'https:' && exports.EMBED_HOSTS.includes(parsed.hostname);
    }
    catch {
        return false;
    }
}
function publicProfileRow(row, viewerId) {
    const followers = row.followers ?? 0;
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
        isDemo: Boolean(row.is_demo),
        createdAt: row.created_at,
        followers,
        following: row.following ?? 0,
        postCount: row.post_count ?? 0,
        isFollowing: Boolean(row.is_following),
        isSelf: viewerId ? row.id === viewerId : false,
    };
}
