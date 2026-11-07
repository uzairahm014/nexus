import React from 'react';
import { Link } from 'react-router-dom';
import type { Community, Game, Clip, EventRow, Track, MarketItem } from '../lib/api';
import { Avatar, Badge } from './ui';
import { count, countdown, duration, scoreLabel, timeAgo } from '../lib/format';

export function GameCard({ game, wide = false }: { game: Game; wide?: boolean }) {
  return (
    <Link
      to={`/games/${game.slug}`}
      className={`group relative block overflow-hidden rounded-2xl border border-white/10 bg-indigo/40 shadow-card transition duration-300 hover:-translate-y-1 hover:border-violet/50 hover:shadow-glow ${
        wide ? 'aspect-[16/10]' : 'aspect-[4/5]'
      }`}
    >
      <img
        src={game.cover_url}
        alt={`${game.title} key art`}
        loading="lazy"
        className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-[1.06]"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-midnight via-midnight/35 to-transparent" />
      <div className="absolute inset-x-0 top-0 flex items-start justify-between p-3">
        <div className="flex gap-1.5">
          <Badge tone={game.is_3d ? 'cyan' : 'violet'}>{game.is_3d ? '3D' : '2D'}</Badge>
          {game.featured ? <Badge tone="magenta">featured</Badge> : null}
        </div>
        <span className="rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-white/80 backdrop-blur">
          {game.genre}
        </span>
      </div>
      <div className="absolute inset-x-0 bottom-0 p-3.5">
        <h3 className="font-display text-base font-semibold leading-tight text-white drop-shadow sm:text-lg">
          {game.title}
        </h3>
        <p className="mt-0.5 line-clamp-2 text-xs text-white/70">{game.tagline}</p>
        <div className="mt-2 flex items-center gap-3 text-[11px] text-white/60">
          <span>{count(game.play_count)} plays</span>
          {game.top_score ? <span>best {scoreLabel(game.top_score)}</span> : null}
        </div>
      </div>
      <span className="absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-full bg-white text-midnight opacity-0 shadow-glow transition group-hover:opacity-100">
        ▶
      </span>
    </Link>
  );
}

export function CommunityCard({ community, compact = false }: { community: Community; compact?: boolean }) {
  return (
    <Link
      to={`/c/${community.slug}`}
      className="group card relative overflow-hidden p-0 transition hover:border-violet/40 hover:shadow-glow"
    >
      <div className="relative h-24 overflow-hidden">
        <img
          src={community.cover_url}
          alt={`${community.name} cover`}
          loading="lazy"
          className="h-full w-full object-cover transition duration-700 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-midnight to-transparent" />
      </div>
      <div className="p-3.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="truncate font-display text-sm font-semibold text-white">{community.name}</h3>
          {community.joined ? <Badge tone="green">joined</Badge> : null}
        </div>
        <p className="mt-1 line-clamp-2 text-xs text-muted">{community.description}</p>
        <p className="mt-2 text-[11px] text-white/50">{count(community.member_count)} members</p>
      </div>
    </Link>
  );
}

export function ClipCard({ clip }: { clip: Clip }) {
  return (
    <Link
      to="/clips"
      className="group relative block overflow-hidden rounded-2xl border border-white/10 bg-indigo/40"
    >
      <div className="aspect-[9/13] w-full overflow-hidden">
        <img
          src={clip.thumb_url}
          alt={clip.title}
          loading="lazy"
          className="h-full w-full object-cover transition duration-700 group-hover:scale-105"
        />
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-midnight via-transparent to-transparent" />
      <span className="absolute right-2 top-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur">
        {duration(clip.duration)}
      </span>
      <div className="absolute inset-x-0 bottom-0 p-3">
        <p className="line-clamp-2 text-sm font-semibold text-white">{clip.title}</p>
        <div className="mt-1.5 flex items-center gap-2 text-[11px] text-white/60">
          <Avatar name={clip.display_name} color={clip.avatar_color} size={18} />
          <span className="truncate">{clip.display_name}</span>
          <span className="ml-auto">{count(clip.views)} views</span>
        </div>
      </div>
    </Link>
  );
}

export function EventCard({
  event,
  onRegister,
  busy,
}: {
  event: EventRow;
  onRegister?: (event: EventRow) => void;
  busy?: boolean;
}) {
  const fill = Math.min(100, Math.round((event.registered_count / Math.max(1, event.capacity)) * 100));
  return (
    <article className="card overflow-hidden p-0">
      <div className="relative h-32">
        <img src={event.banner_url} alt="" loading="lazy" className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-midnight via-midnight/40 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-3">
          <div>
            <Badge tone={event.kind === 'tournament' ? 'magenta' : 'cyan'}>{event.kind}</Badge>
            <h3 className="mt-1 font-display text-base font-semibold text-white">{event.title}</h3>
          </div>
          <span className="rounded-full bg-black/60 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-cyan-200 backdrop-blur">
            {countdown(event.starts_at)}
          </span>
        </div>
      </div>
      <div className="space-y-3 p-4">
        <p className="line-clamp-2 text-xs text-muted">{event.description}</p>
        <div>
          <div className="mb-1 flex justify-between text-[11px] text-white/50">
            <span>
              {event.registered_count}/{event.capacity} registered
            </span>
            <span>{fill}%</span>
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-gradient-to-r from-violet to-cyan" style={{ width: `${Math.max(3, fill)}%` }} />
          </div>
        </div>
        <button
          type="button"
          disabled={busy || event.registered}
          onClick={() => onRegister?.(event)}
          className={event.registered ? 'btn-ghost w-full text-xs' : 'btn-primary w-full text-xs'}
        >
          {event.registered ? 'Registered ✓' : busy ? 'Saving…' : 'Register'}
        </button>
      </div>
    </article>
  );
}

export function TrackCard({
  track,
  active = false,
  onPlay,
}: {
  track: Track;
  active?: boolean;
  onPlay?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPlay}
      className={`group flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition ${
        active ? 'border-violet/60 bg-violet/10' : 'border-white/8 bg-white/[0.03] hover:border-white/20'
      }`}
    >
      <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg">
        <img src={track.cover_url} alt="" loading="lazy" className="h-full w-full object-cover" />
        <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-xs text-white opacity-0 transition group-hover:opacity-100">
          ▶
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-white">{track.title}</span>
        <span className="block truncate text-xs text-muted">
          {track.artist} · {track.genre}
        </span>
      </span>
      <span className="text-[11px] text-white/40">{duration(track.duration)}</span>
    </button>
  );
}

export function MarketCard({ item, onGet, busy }: { item: MarketItem; onGet: () => void; busy?: boolean }) {
  return (
    <article className="card overflow-hidden p-0">
      <img src={item.cover_url} alt="" loading="lazy" className="h-36 w-full object-cover" />
      <div className="space-y-2 p-3.5">
        <div className="flex items-center justify-between gap-2">
          <Badge tone="cyan">{item.kind}</Badge>
          <span className="text-[11px] text-amber-200">★ {item.rating.toFixed(1)}</span>
        </div>
        <h3 className="font-display text-sm font-semibold text-white">{item.title}</h3>
        <p className="line-clamp-2 text-xs text-muted">{item.description}</p>
        <div className="flex items-center justify-between pt-1">
          <span className="text-[11px] text-white/50">
            {item.display_name} · {count(item.downloads)} uses
          </span>
          <button type="button" onClick={onGet} disabled={busy} className="btn-ghost px-2.5 py-1 text-[11px]">
            {item.price === 0 ? 'Get free' : `Unlock ${item.price} XP`}
          </button>
        </div>
      </div>
    </article>
  );
}

export function FeedHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-5">
      <h1 className="font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">{title}</h1>
      {subtitle && <p className="mt-1 max-w-2xl text-sm text-muted">{subtitle}</p>}
    </div>
  );
}

export function Updated({ at }: { at: string }) {
  return <span className="text-[11px] text-white/40">updated {timeAgo(at)} ago</span>;
}
