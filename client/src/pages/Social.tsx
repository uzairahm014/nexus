import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Post, type User } from '../lib/api';
import { useAuth } from '../lib/session';
import { Avatar, Badge, EmptyState, ErrorNote, Modal, SectionHeader, Skeleton, Tabs, UserLink, useAsync, useToast } from '../components/ui';
import { PostCard } from '../components/PostCard';
import { CommunityCard } from '../components/cards';
import type { Community } from '../lib/api';

type FeedTab = 'for-you' | 'following' | 'bookmarks';

export default function Social() {
  const { user } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState<FeedTab>('for-you');
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [reportTarget, setReportTarget] = useState<User | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [reloadToken, setReloadToken] = useState(0);

  const feed = useAsync(async () => {
    if (tab === 'bookmarks') return api.get<{ posts: Post[] }>('/social/bookmarks');
    return api.get<{ posts: Post[]; nextOffset: number | null }>(`/social/feed?tab=${tab}`);
  }, [tab, reloadToken]);

  const people = useAsync(() => api.get<{ players: Array<{ handle: string; display_name: string; avatar_color: string; level: number; score: number }> }>('/leaderboards'), []);
  const communities = useAsync(() => api.get<{ communities: Community[] }>('/social/communities'), []);

  const suggested = useMemo(() => (people.data?.players ?? []).filter((player) => player.handle !== user?.handle).slice(0, 6), [people.data, user?.handle]);

  const submit = async () => {
    const body = draft.trim();
    if (body.length < 2) {
      toast.push('Write at least a couple of characters', 'error');
      return;
    }
    setPosting(true);
    try {
      await api.post('/social/posts', { body });
      setDraft('');
      toast.push('Posted to your feed', 'success');
      setReloadToken((value) => value + 1);
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Could not publish post', 'error');
    } finally {
      setPosting(false);
    }
  };

  const sendReport = async () => {
    if (!reportTarget) return;
    try {
      await api.post('/social/reports', { handle: reportTarget.handle, reason: reportReason || 'Reported from social feed', kind: 'user' });
      toast.push('Report sent to moderators', 'success');
      setReportTarget(null);
      setReportReason('');
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Report failed', 'error');
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-4">
        <SectionHeader title="Social" subtitle="Real posts, real people. Nothing here is fabricated activity." />

        <div className="card p-4">
          {user ? (
            <>
              <div className="flex gap-3">
                <Avatar name={user.displayName} color={user.avatarColor} url={user.avatarUrl} size={40} />
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value.slice(0, 600))}
                  placeholder="Share a run, a build, or a clip…"
                  className="input min-h-[74px] flex-1 resize-none"
                />
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-[11px] text-muted">{draft.length}/600 · posts are public by default</span>
                <button type="button" className="btn-primary text-xs" onClick={submit} disabled={posting || !draft.trim()}>
                  {posting ? 'Publishing…' : 'Post'}
                </button>
              </div>
            </>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted">Sign in to post, comment and follow creators.</p>
              <div className="flex gap-2">
                <Link to="/login" className="btn-primary text-xs">Sign in</Link>
                <Link to="/register" className="btn-ghost text-xs">Create account</Link>
              </div>
            </div>
          )}
        </div>

        <Tabs
          tabs={[
            { id: 'for-you', label: 'For you' },
            { id: 'following', label: 'Following' },
            ...(user ? [{ id: 'bookmarks', label: 'Saved' }] : []),
          ]}
          value={tab}
          onChange={(value) => setTab(value as FeedTab)}
        />

        {feed.loading && <div className="space-y-3">{[0, 1, 2].map((key) => <Skeleton key={key} className="h-32 w-full" />)}</div>}
        {feed.error && <ErrorNote message={feed.error} onRetry={feed.reload} />}
        {!feed.loading && !feed.error && (feed.data?.posts.length ?? 0) === 0 && (
          <EmptyState
            title={tab === 'bookmarks' ? 'No saved posts yet' : tab === 'following' ? 'Your following feed is quiet' : 'The feed is empty'}
            body={tab === 'following' ? 'Follow creators from the leaderboard to fill this feed with their posts.' : 'Be the first to post something.'}
            action={<Link to="/discover" className="btn-ghost text-xs">Find creators</Link>}
          />
        )}
        <div className="space-y-3">
          {(feed.data?.posts ?? []).map((post) => (
            <PostCard key={post.id} post={post} onChanged={feed.reload} />
          ))}
        </div>
      </div>

      <aside className="space-y-4">
        <div className="card p-4">
          <h2 className="font-display text-sm font-semibold text-white">Top players</h2>
          <div className="mt-3 space-y-2">
            {people.loading && <Skeleton className="h-16 w-full" />}
            {suggested.map((player) => (
              <div key={player.handle} className="flex items-center justify-between gap-2">
                <UserLink handle={player.handle} displayName={player.display_name} color={player.avatar_color} size={30} subtitle={`Level ${player.level}`} />
                <button type="button" onClick={() => setReportTarget({ handle: player.handle } as User)} className="text-[10px] text-muted hover:text-white">
                  report
                </button>
              </div>
            ))}
            {!people.loading && suggested.length === 0 && <p className="text-xs text-muted">No players recorded yet.</p>}
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold text-white">Communities</h2>
            <Link to="/communities" className="text-[11px] text-cyan-300">All</Link>
          </div>
          <div className="mt-3 space-y-3">
            {(communities.data?.communities ?? []).slice(0, 3).map((community) => (
              <CommunityCard key={community.id} community={community} compact />
            ))}
            {!communities.loading && (communities.data?.communities.length ?? 0) === 0 && <p className="text-xs text-muted">No communities yet.</p>}
          </div>
        </div>

        <div className="card p-4">
          <h2 className="font-display text-sm font-semibold text-white">Safety</h2>
          <p className="mt-1.5 text-xs leading-relaxed text-muted">
            Report content from any post menu. Blocking a user removes their posts and messages from your feeds. Moderators review every report in the admin console.
          </p>
        </div>
      </aside>

      <Modal open={!!reportTarget} onClose={() => setReportTarget(null)} title={`Report @${reportTarget?.handle ?? ''}`}>
        <textarea
          value={reportReason}
          onChange={(event) => setReportReason(event.target.value.slice(0, 400))}
          placeholder="What is wrong with this account?"
          className="input min-h-[100px] w-full resize-none"
        />
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" className="btn-ghost text-xs" onClick={() => setReportTarget(null)}>Cancel</button>
          <button type="button" className="btn-primary text-xs" onClick={sendReport}>Send report</button>
        </div>
      </Modal>
    </div>
  );
}
