import type { Request } from 'express';
import { z } from 'zod';
import type { AuthedRequest, PublicUser } from '../auth';

export const me = (req: Request): PublicUser | undefined => (req as AuthedRequest).user;
export const myId = (req: Request): string => (req as AuthedRequest).user?.id ?? '';

/** Trims, strips control characters and bounds user supplied text. */
export function cleanText(value: unknown, max = 2000): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .trim()
    .slice(0, max);
}

export const paging = (req: Request): { limit: number; offset: number } => {
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
  const offset = Math.max(0, Number(req.query.offset) || 0);
  return { limit, offset };
};

export const httpUrl = z
  .string()
  .max(500)
  .refine((value) => value === '' || /^https:\/\/[\w.-]+\.[a-z]{2,}(\/\S*)?$/i.test(value), 'Must be an https URL');

/** Only these hosts may be framed by the music/watch pages. */
export const EMBED_HOSTS = [
  'www.youtube.com',
  'youtube.com',
  'www.youtube-nocookie.com',
  'open.spotify.com',
  'w.soundcloud.com',
  'player.vimeo.com',
];

export function isAllowedEmbed(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && EMBED_HOSTS.includes(parsed.hostname);
  } catch {
    return false;
  }
}

export function publicProfileRow(row: any, viewerId?: string) {
  const followers = (row.followers as number) ?? 0;
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
    following: (row.following as number) ?? 0,
    postCount: (row.post_count as number) ?? 0,
    isFollowing: Boolean(row.is_following),
    isSelf: viewerId ? row.id === viewerId : false,
  };
}
