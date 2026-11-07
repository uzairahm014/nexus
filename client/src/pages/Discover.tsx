import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Clip, type Community, type Game, type Post, type User } from '../lib/api';
import { Badge, EmptyState, ErrorNote, SectionHeader, Skeleton, Tabs, UserLink, useAsync } from '../components/ui';
import { ClipCard, CommunityCard, GameCard } from '../components/cards';
import { PostCard } from '../components/PostCard';
import { FeedHeader } from '../components/cards';

const FILTERS = ['All', '3D', '2D', 'Action', 'Racing', 'Strategy', 'Puzzle'] as const;

interface DiscoverData {
  games: Game[];
  communities: Community[];
  clips: Clip[];
  posts: Post[];
  creators: User[];
}

export default function Discover() {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('All');
  const [results, setResults] = useState<{ games: Game[]; users: User[]; communities: Community[]; posts: Post[]; clips: Clip[] } | null>(null);
  const [searching, setSearching] = useState(false);

  const state = useAsync<DiscoverData>(async () => {
    const data = await api.get<DiscoverData>('/social/discover');
    return {
      games: data.games ?? [],
      communities: data.communities ?? [],
      clips: data.clips ?? [],
      posts: data.posts ?? [],
      creators: data.creators ?? [],
    };
  });

  const games = state.data?.games ?? [];
  const filtered = useMemo(() => {
    if (filter === 'All') return games;
    if (filter === '3D') return games.filter((g) => g.is_3d);
    if (filter === '2D') return games.filter((g) => !g.is_3d);
    return games.filter((g) => g.genre.toLowerCase() === filter.toLowerCase());
  }, [games, filter]);

  async function search(term: string) {
    setQuery(term);
    if (term.trim().length < 2) {
      setResults(null);
      return;
    }
    setSearching(true);
    try {
      const data = await api.get<{ games: Game[]; users: User[]; communities: Community[]; posts: Post[]; clips: Clip[] }>(
        `/social/search?q=${encodeURIComponent(term.trim())}`,
      );
      setResults(data);
    } catch {
      setResults(null);
    } finally {
      setSearching(false);
    }
  }

  const hasResults =
    results && (results.games.length || results.users.length || results.communities.length || results.posts.length || results.clips.length);

  return (
    <div className="space-y-9">
      <FeedHeader
        title="Discover"
        subtitle="Search the whole platform — games, creators, communities, clips and posts — or browse curated collections."
      />

      <div className="relative">
        <input
          value={query}
          onChange={(e) => search(e.target.value)}
          placeholder="Search NEXUS…"
          className="input h-12 pl-10 text-sm"
          aria-label="Search NEXUS"
        />
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40">⌕</span>
        {searching && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-white/40">searching…</span>}
      </div>

      {results && (
        <section className="card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold text-white">Results for “{query}”</h2>
            <button type="button" className="text-xs text-white/40 hover:text-white" onClick={() => { setQuery(''); setResults(null); }}>
              Clear
            </button>
          </div>
          {!hasResults && <p className="py-6 text-center text-xs text-muted">Nothing matched that search.</p>}
          {hasResults && (
            <div className="space-y-4">
              {results!.games.length > 0 && (
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-white/40">Games</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {results!.games.map((game) => (
                      <Link key={game.id} to={`/games/${game.slug}`} className="flex items-center gap-2 rounded-xl border border-white/8 p-2 hover:border-violet/40">
                        <img src={game.cover_url} alt="" className="h-10 w-10 rounded-lg object-cover" />
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-semibold text-white">{game.title}</span>
                          <span className="block text-[10px] text-muted">{game.genre}</span>
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
              {results!.users.length > 0 && (
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-white/40">People</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {results!.users.map((u) => (
                      <UserLink key={u.id} handle={u.handle} displayName={u.displayName} color={u.avatarColor} isDemo={u.isDemo} />
                    ))}
                  </div>
                </div>
              )}
              {results!.communities.length > 0 && (
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-white/40">Communities</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {results!.communities.map((c) => (
                      <Link key={c.id} to={`/c/${c.slug}`} className="rounded-xl border border-white/8 p-2 text-xs text-white hover:border-violet/40">
                        {c.name}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {state.error && <ErrorNote message={state.error} onRetry={state.reload} />}

      <section>
        <SectionHeader title="Trending in the library" subtitle="Filter by engine or genre." action={<Tabs tabs={FILTERS} value={filter} onChange={setFilter} />} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {state.loading && Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="aspect-[4/5]" />)}
          {filtered.slice(0, 10).map((game) => (
            <GameCard key={game.id} game={game} />
          ))}
        </div>
        {!state.loading && filtered.length === 0 && (
          <EmptyState title="No games in this filter" body="Try another genre — the library grows as creators publish." icon="⌕" />
        )}
      </section>

      <div className="grid gap-8 xl:grid-cols-2">
        <section>
          <SectionHeader title="Creators to watch" subtitle="Ranked by real follower and level data." />
          <div className="card divide-y divide-white/5 p-2">
            {state.data?.creators.slice(0, 6).map((creator) => (
              <div key={creator.id} className="py-2.5">
                <UserLink
                  handle={creator.handle}
                  displayName={creator.displayName}
                  color={creator.avatarColor}
                  isDemo={creator.isDemo}
                  subtitle={`Lv ${creator.level} · ${creator.postCount ?? 0} posts`}
                />
              </div>
            ))}
            {!state.loading && !state.data?.creators.length && <p className="p-4 text-center text-xs text-muted">No creators yet.</p>}
          </div>
        </section>

        <section>
          <SectionHeader title="Communities" subtitle="Join a scene and post into it." action={<Link to="/communities" className="text-xs font-semibold text-white/50 hover:text-white">All →</Link>} />
          <div className="grid gap-3 sm:grid-cols-2">
            {state.data?.communities.slice(0, 4).map((community) => (
              <CommunityCard key={community.id} community={community} />
            ))}
          </div>
        </section>
      </div>

      <section>
        <SectionHeader title="Clips & moments" subtitle="Short-form uploads from the community." action={<Link to="/clips" className="text-xs font-semibold text-white/50 hover:text-white">Open clips →</Link>} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-6">
          {state.data?.clips.slice(0, 6).map((clip) => (
            <ClipCard key={clip.id} clip={clip} />
          ))}
        </div>
      </section>

      <section>
        <SectionHeader title="From the feed" subtitle="Real posts, newest first." />
        <div className="grid gap-3 lg:grid-cols-2">
          {state.data?.posts.slice(0, 2).map((post) => (
            <PostCard key={post.id} post={post} onChanged={state.reload} />
          ))}
        </div>
        {!state.loading && !state.data?.posts.length && <EmptyState title="No posts yet" body="Be the first to publish something." icon="✎" />}
      </section>

      <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="font-display text-sm font-semibold text-white">Nothing here fits? Build it.</p>
          <p className="text-xs text-muted">The studio ships with a real 3D viewport, hierarchy, inspector and publish flow.</p>
        </div>
        <div className="flex gap-2">
          <Link to="/studio/new" className="btn-primary text-xs">Open Studio</Link>
          <Link to="/create" className="btn-ghost text-xs">Other creators</Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {['#3D', '#Racing', '#Social', '#Studio', '#Tournaments', '#Clips'].map((tag) => (
          <Badge key={tag} tone="neutral">{tag}</Badge>
        ))}
      </div>
    </div>
  );
}
