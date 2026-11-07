import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Community, type EventRow, type Game, type Post, type User } from '../lib/api';
import { useAuth } from '../lib/session';
import { Badge, EmptyState, ErrorNote, ProgressBar, SectionHeader, Skeleton, UserLink, useAsync, useToast } from '../components/ui';
import { CommunityCard, GameCard, EventCard } from '../components/cards';
import { PostCard } from '../components/PostCard';
import { count, countdown, levelProgress } from '../lib/format';

interface HomeData {
  games: Game[];
  feed: Post[];
  communities: Community[];
  events: EventRow[];
  missions: any[];
  completed: string[];
  creators: User[];
}

export default function Home() {
  const { user } = useAuth();
  const toast = useToast();
  const [busyEvent, setBusyEvent] = useState<string | null>(null);
  const [recent, setRecent] = useState<Game[]>([]);

  const state = useAsync<HomeData>(async () => {
    const [gamesRes, feedRes, communitiesRes, eventsRes, missionsRes, creatorsRes] = await Promise.all([
      api.get<{ games: Game[] }>('/games'),
      api.get<{ posts: Post[] }>('/social/feed?limit=6'),
      api.get<{ communities: Community[] }>('/social/communities'),
      api.get<{ events: EventRow[] }>('/events'),
      api.get<{ missions: any[]; completed: string[] }>('/missions'),
      api.get<{ users?: User[]; suggested?: User[] }>('/social/suggested').catch(() => ({ users: [] as User[] })),
    ]);
    return {
      games: gamesRes.games ?? [],
      feed: feedRes.posts ?? [],
      communities: communitiesRes.communities ?? [],
      events: eventsRes.events ?? [],
      missions: missionsRes.missions ?? [],
      completed: missionsRes.completed ?? [],
      creators: creatorsRes.users ?? creatorsRes.suggested ?? [],
    };
  });

  const games = state.data?.games ?? [];
  const featured = games.find((g) => g.featured) ?? games[0];
  const newReleases = useMemo(() => games.filter((g) => g.slug !== featured?.slug).slice(0, 5), [games, featured]);

  useEffect(() => {
    const slugs: string[] = JSON.parse(localStorage.getItem('nexus_recent') || '[]');
    if (!slugs.length || !games.length) return;
    setRecent(slugs.map((slug) => games.find((g) => g.slug === slug)).filter(Boolean).slice(0, 4) as Game[]);
  }, [games]);

  async function registerEvent(event: EventRow) {
    if (!user) {
      toast('Sign in to register for events', 'error');
      return;
    }
    setBusyEvent(event.id);
    try {
      await api.post(`/events/${event.id}/register`);
      toast(`Registered for ${event.title}`, 'success');
      state.reload();
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setBusyEvent(null);
    }
  }

  const xp = levelProgress(user?.xp ?? 0);

  return (
    <div className="space-y-10">
      {/* ------------------------------- hero ------------------------------- */}
      <section className="relative overflow-hidden rounded-3xl border border-white/10">
        <img
          src="/art/hero-home.jpg"
          alt="NEXUS neon city skyline"
          className="absolute inset-0 h-full w-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-midnight via-midnight/75 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-midnight via-transparent to-midnight/40" />
        <div className="relative flex min-h-[420px] flex-col justify-end gap-5 p-5 sm:min-h-[480px] sm:p-10">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="cyan">nexus ecosystem</Badge>
            <Badge tone="magenta">season 01</Badge>
          </div>
          <h1 className="max-w-2xl font-display text-4xl font-extrabold leading-[1.02] tracking-tight text-white sm:text-6xl">
            PLAY. CREATE.<br />
            <span className="bg-gradient-to-r from-violet-300 via-fuchsia-300 to-cyan-200 bg-clip-text text-transparent">
              CONNECT. EXPLORE.
            </span>
          </h1>
          <p className="max-w-xl text-sm leading-relaxed text-white/70 sm:text-base">
            A living entertainment universe: play original games, build your own in the 3D studio, and
            compete with a real community on a real backend.
          </p>
          <div className="flex flex-wrap items-center gap-2.5">
            <Link to={featured ? `/play/${featured.slug}` : '/games'} className="btn-primary px-5 text-sm">
              ▶ Play {featured?.title ?? 'now'}
            </Link>
            <Link to="/studio/new" className="btn-ghost px-4 text-sm">
              Open Game Studio
            </Link>
            <Link to="/discover" className="hidden text-sm font-semibold text-white/60 hover:text-white sm:block">
              Explore everything →
            </Link>
          </div>
          {user ? (
            <div className="mt-1 max-w-sm rounded-2xl border border-white/10 bg-black/40 p-3 backdrop-blur-xl">
              <div className="flex items-center justify-between text-xs text-white/70">
                <span className="font-semibold text-white">Level {xp.level}</span>
                <span>
                  {xp.into}/{xp.needed} XP
                </span>
              </div>
              <div className="mt-2">
                <ProgressBar pct={xp.pct} />
              </div>
            </div>
          ) : (
            <p className="text-xs text-white/50">
              <Link to="/register" className="font-semibold text-violet-200 hover:text-white">Create a free account</Link>{' '}
              to save progress, publish creations and join tournaments.
            </p>
          )}
        </div>
      </section>

      {state.error && <ErrorNote message={state.error} onRetry={state.reload} />}

      {/* ------------------------------ missions ---------------------------- */}
      <section>
        <SectionHeader
          title="Daily missions"
          subtitle="Resets every 24 hours. Progress is counted from your real activity."
          action={<Link to="/discover" className="text-xs font-semibold text-white/50 hover:text-white">All challenges →</Link>}
        />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {state.loading &&
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
          {!state.loading &&
            (state.data?.missions.length ? (
              state.data.missions.slice(0, 4).map((mission) => {
                const done = state.data!.completed.includes(mission.id);
                return (
                  <div
                    key={mission.id}
                    className={`card flex items-start gap-3 p-4 ${done ? 'border-emerald-400/30' : ''}`}
                  >
                    <span className={`mt-0.5 flex h-8 w-8 items-center justify-center rounded-xl text-sm ${done ? 'bg-emerald-500/15 text-emerald-200' : 'bg-violet/15 text-violet-200'}`}>
                      {done ? '✓' : '◆'}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">{mission.title}</p>
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted">{mission.description}</p>
                      <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-widest text-cyan-200/80">
                        +{mission.xp ?? 20} XP · {mission.kind ?? 'daily'}
                      </p>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="sm:col-span-2 xl:col-span-4">
                <EmptyState title="No missions configured" body="Missions are seeded by the platform administrator." icon="◆" />
              </div>
            ))}
        </div>
      </section>

      {/* --------------------------- featured games ------------------------- */}
      <section>
        <SectionHeader
          title="Featured games"
          subtitle="Original NEXUS titles running on real engines in your browser."
          action={<Link to="/games" className="text-xs font-semibold text-white/50 hover:text-white">Game library →</Link>}
        />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {state.loading && Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="aspect-[16/10]" />)}
          {featured && (
            <div className="sm:col-span-2">
              <GameCard game={featured} wide />
            </div>
          )}
          {newReleases.slice(0, 1).map((game) => (
            <GameCard key={game.id} game={game} wide />
          ))}
        </div>
      </section>

      {/* ------------------------- recently played -------------------------- */}
      {recent.length > 0 && (
        <section>
          <SectionHeader title="Jump back in" subtitle="Saved on this device from your last sessions." />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {recent.map((game) => (
              <Link key={game.id} to={`/play/${game.slug}`} className="card flex items-center gap-3 p-3 hover:border-violet/40">
                <img src={game.cover_url} alt="" className="h-14 w-14 rounded-xl object-cover" loading="lazy" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">{game.title}</p>
                  <p className="text-[11px] text-muted">{game.genre} · {game.is_3d ? '3D' : '2D'}</p>
                  <span className="mt-1 inline-block text-[11px] font-semibold text-cyan-200">Resume →</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-8 xl:grid-cols-[1.6fr_1fr]">
        {/* ------------------------------ feed ------------------------------ */}
        <section>
          <SectionHeader
            title="Your feed"
            subtitle={user ? 'Posts from people and communities you follow.' : 'Public activity across NEXUS.'}
            action={<Link to="/social" className="text-xs font-semibold text-white/50 hover:text-white">Open social →</Link>}
          />
          <div className="space-y-3">
            {state.loading && Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-40" />)}
            {!state.loading && state.data?.feed.length === 0 && (
              <EmptyState
                title="The feed is quiet"
                body="Follow creators or post something to start the conversation."
                action={<Link to="/social" className="btn-primary text-xs">Write a post</Link>}
                icon="✎"
              />
            )}
            {state.data?.feed.slice(0, 4).map((post) => (
              <PostCard key={post.id} post={post} onChanged={state.reload} />
            ))}
          </div>
        </section>

        <div className="space-y-8">
          {/* --------------------------- events ---------------------------- */}
          <section>
            <SectionHeader title="Live & upcoming" action={<Link to="/live" className="text-xs font-semibold text-white/50 hover:text-white">All →</Link>} />
            <div className="space-y-3">
              {state.loading && <Skeleton className="h-40" />}
              {state.data?.events.slice(0, 2).map((event) => (
                <EventCard key={event.id} event={event} onRegister={registerEvent} busy={busyEvent === event.id} />
              ))}
              {!state.loading && !state.data?.events.length && (
                <EmptyState title="Nothing scheduled" body="Events appear here as soon as a host publishes one." icon="◷" />
              )}
            </div>
          </section>

          {/* -------------------------- creators --------------------------- */}
          <section>
            <SectionHeader title="Recommended creators" />
            <div className="card divide-y divide-white/5 p-2">
              {state.loading && <Skeleton className="h-24" />}
              {state.data?.creators.slice(0, 5).map((creator) => (
                <div key={creator.id} className="py-2.5">
                  <UserLink
                    handle={creator.handle}
                    displayName={creator.displayName}
                    color={creator.avatarColor}
                    url={creator.avatarUrl}
                    isDemo={creator.isDemo}
                    subtitle={`Lv ${creator.level} · ${count(creator.followers)} followers`}
                  />
                </div>
              ))}
              {!state.loading && !state.data?.creators.length && (
                <p className="px-3 py-6 text-center text-xs text-muted">No creators to suggest yet.</p>
              )}
            </div>
          </section>

          {/* ------------------------- communities ------------------------- */}
          <section>
            <SectionHeader title="Featured communities" action={<Link to="/communities" className="text-xs font-semibold text-white/50 hover:text-white">Browse →</Link>} />
            <div className="grid gap-3 sm:grid-cols-2">
              {state.data?.communities.slice(0, 2).map((community) => (
                <CommunityCard key={community.id} community={community} />
              ))}
            </div>
          </section>
        </div>
      </div>

      {/* ----------------------------- releases ----------------------------- */}
      <section>
        <SectionHeader title="New in the library" subtitle="Every card opens a fully playable build." />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {state.loading && Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="aspect-[4/5]" />)}
          {newReleases.slice(0, 5).map((game) => (
            <GameCard key={game.id} game={game} />
          ))}
        </div>
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-white/8 pt-6 text-[11px] text-white/40">
        <span>NEXUS · PLAY. CREATE. CONNECT. EXPLORE.</span>
        <span className="flex items-center gap-3">
          <Link to="/marketplace" className="hover:text-white">Marketplace</Link>
          <Link to="/clips" className="hover:text-white">Clips</Link>
          <Link to="/music" className="hover:text-white">Music</Link>
          <span>{count(games.length)} games live</span>
        </span>
      </footer>
    </div>
  );
}
