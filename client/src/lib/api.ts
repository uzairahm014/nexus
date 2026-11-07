const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || '/api';

export class ApiError extends Error {
  status: number;
  payload: any;
  constructor(message: string, status: number, payload?: any) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

let authToken: string | null = localStorage.getItem('nexus_token');

export function setAuthToken(token: string | null) {
  authToken = token;
  if (token) localStorage.setItem('nexus_token', token);
  else localStorage.removeItem('nexus_token');
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    ...((options.headers as Record<string, string>) ?? {}),
  };

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
      credentials: 'include',
      mode: 'cors',
    });
  } catch {
    throw new ApiError('Network unreachable. Check your connection and try again.', 0);
  }

  const text = await response.text();
  let payload: any = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { error: text.slice(0, 200) };
    }
  }

  if (!response.ok) {
    throw new ApiError(payload?.error || `Request failed (${response.status})`, response.status, payload);
  }
  return payload as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body: JSON.stringify(body ?? {}) }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

export interface UploadResult {
  url: string;
  kind: 'video' | 'image';
  mimeType: string;
  size: number;
}

/** Multipart upload for clips, avatars and banners (12 MB cap, server-validated). */
export async function uploadFile(file: File): Promise<UploadResult> {
  const form = new FormData();
  form.append('file', file);
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/uploads`, {
      method: 'POST',
      body: form,
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
      credentials: 'include',
    });
  } catch {
    throw new ApiError('Network unreachable while uploading. Try again.', 0);
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(payload?.error || 'Upload failed', response.status, payload);
  return payload as UploadResult;
}

/* ---------------------------------- types ---------------------------------- */

export interface User {
  id: string;
  handle: string;
  displayName: string;
  bio: string;
  avatarColor: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  theme: string;
  role: 'user' | 'moderator' | 'admin' | 'suspended';
  xp: number;
  level: number;
  privacy: string;
  isDemo?: boolean;
  followers?: number;
  following?: number;
  postCount?: number;
  achievements?: number;
  gamesPlayed?: number;
  createdAt?: string;
}

export interface Post {
  id: string;
  body: string;
  mediaUrl: string | null;
  mediaType: string | null;
  community: { slug: string; name: string } | null;
  createdAt: string;
  likeCount: number;
  commentCount: number;
  liked: boolean;
  bookmarked: boolean;
  author: {
    handle: string;
    displayName: string;
    avatarColor: string;
    avatarUrl: string | null;
    level: number;
    isDemo: boolean;
  };
}

export interface Comment {
  id: string;
  body: string;
  created_at: string;
  handle: string;
  display_name: string;
  avatar_color: string;
  is_demo?: number;
}

export interface Game {
  id: string;
  slug: string;
  title: string;
  tagline: string;
  description: string;
  genre: string;
  engine: string;
  cover_url: string;
  banner_url: string;
  is_3d: number;
  playable: number;
  controls: string;
  instructions: string;
  accent: string;
  featured: number;
  play_count: number;
  top_score: number | null;
}

export interface ScoreRow {
  score: number;
  created_at: string;
  meta?: string | null;
  handle: string;
  display_name: string;
  avatar_color: string;
  is_demo: number;
}

export interface Achievement {
  code: string;
  title: string;
  description: string;
  icon: string;
  xp: number;
  unlocked?: number;
  game_slug?: string;
  unlocked_at?: string | null;
}

export interface Community {
  id: string;
  slug: string;
  name: string;
  description: string;
  cover_url: string;
  member_count: number;
  joined?: boolean;
  created_at: string;
}

export interface Clip {
  id: string;
  title: string;
  description: string;
  thumb_url: string;
  media_url: string | null;
  duration: number;
  views: number;
  created_at: string;
  handle: string;
  display_name: string;
  avatar_color: string;
  like_count: number;
  comment_count: number;
  liked: boolean;
}

export interface Track {
  id: string;
  title: string;
  artist: string;
  genre: string;
  cover_url: string;
  embed_url: string;
  duration: number;
}

export interface EventRow {
  id: string;
  title: string;
  description: string;
  banner_url: string;
  kind: string;
  starts_at: string;
  ends_at: string;
  capacity: number;
  registered_count: number;
  registered: boolean;
}

export interface Battle {
  id: string;
  title: string;
  description: string;
  game_slug: string;
  status: string;
  banner_url: string;
  starts_at: string;
  prize: string;
}

export interface BattleEntry {
  battle_id: string;
  score: number;
  created_at: string;
  handle: string;
  display_name: string;
  avatar_color: string;
  is_demo: number;
  entry_count: number;
}

export interface MarketItem {
  id: string;
  title: string;
  description: string;
  cover_url: string;
  kind: string;
  price: number;
  rating: number;
  downloads: number;
  handle: string;
  display_name: string;
  is_demo: number;
}

export interface Project {
  id: string;
  title: string;
  slug: string | null;
  published: number;
  updated_at: string;
  created_at: string;
  data?: any;
  handle?: string;
  display_name?: string;
  avatar_color?: string;
}

export interface Experience {
  id: string;
  title: string;
  description: string;
  type: string;
  cover_url: string;
  published: number;
  created_at: string;
  handle: string;
  display_name: string;
  is_demo: number;
  response_count: number;
  data?: any;
}

export interface NotificationRow {
  id: string;
  type: string;
  body: string;
  read: number;
  created_at: string;
  entity_id: string | null;
  actor_handle: string | null;
  avatar_color: string | null;
}
