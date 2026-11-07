export function timeAgo(input: string | number | Date): string {
  const date = new Date(input);
  const diff = Math.max(0, Date.now() - date.getTime());
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function dateLabel(input: string): string {
  return new Date(input).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export function timeLabel(input: string): string {
  return new Date(input).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function count(n: number | null | undefined): string {
  const value = Number(n ?? 0);
  if (value < 1000) return String(value);
  if (value < 1_000_000) return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)}k`;
  return `${(value / 1_000_000).toFixed(1)}m`;
}

export function duration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

export function scoreLabel(n: number | null | undefined): string {
  return Number(n ?? 0).toLocaleString();
}

export function levelProgress(xp: number): { level: number; into: number; needed: number; pct: number } {
  const level = Math.max(1, Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1);
  const base = (level - 1) ** 2 * 100;
  const next = level ** 2 * 100;
  const into = xp - base;
  const needed = Math.max(1, next - base);
  return { level, into, needed, pct: Math.min(100, Math.round((into / needed) * 100)) };
}

export function countdown(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return 'live now';
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `in ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `in ${hours}h ${mins % 60}m`;
  return `in ${Math.floor(hours / 24)}d`;
}

export function isMobile(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches;
}
