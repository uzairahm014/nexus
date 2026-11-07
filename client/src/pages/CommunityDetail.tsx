import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, type Community, type Post } from '../lib/api';
import { useAuth } from '../lib/session';
import { Avatar, Badge, EmptyState, ErrorNote, SectionHeader, Skeleton, UserLink, useAsync, useToast } from '../components/ui';
import { PostCard } from '../components/PostCard';
import { count, timeAgo } from '../lib/format';

interface Member {
  handle: string;
  display_name: string;
  avatar_color: string;
  role: string;
  joined_at: string;
}

interface Detail {
  community: Community;
  members: Member[];
  posts: Post[];
}

export default function CommunityDetail() {
  const { slug = '' } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState('');
  const detail = useAsync(() => api.get<Detail>(`/social/communities/${slug}`), [slug]);

  const toggleJoin = async () => {
    if (!user) {
      toast.push('Sign in to join communities', 'error');
      return;
    }
    setBusy(true);
    try {
      const response = await api.post<{ joined: boolean }>(`/social/communities/${slug}/join`);
      toast.push(response.joined ? 'Joined community' : 'Left community', 'success');
      detail.reload();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Could not update membership', 'error');
    } finally {
      setBusy(false);
    }
  };

  const post = async () => {
    if (draft.trim().length < 2) return;
    setBusy(true);
    try {
      await api.post('/social/posts', { body: draft, communitySlug: slug });
      setDraft('');
      detail.reload();
      toast.push('Posted to community', 'success');
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Post failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (detail.loading) return <Skeleton className="h-[60vh] w-full" />;
  if (detail.error) return <ErrorNote message={detail.error} onRetry={detail.reload} />;
  if (!detail.data) return null;

  const { community, members, posts } = detail.data;

  return (
    <div className="space-y-5">
      <div className="relative overflow-hidden rounded-3xl border border-white/10">
        <img src={community.cover_url} alt="" className="h-44 w-full object-cover sm:h-60" />
        <div className="absolute inset-0 bg-gradient-to-t from-midnight via-midnight/50 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-3 p-4 sm:p-6">
          <div>
            <Badge tone="violet">{count(community.member_count)} members</Badge>
            <h1 className="mt-2 font-display text-2xl font-extrabold text-white sm:text-3xl">{community.name}</h1>
            <p className="mt-1 max-w-xl text-xs text-white/70 sm:text-sm">{community.description}</p>
          </div>
          <button type="button" className={community.joined ? 'btn-ghost text-xs' : 'btn-primary text-xs'} onClick={toggleJoin} disabled={busy}>
            {community.joined ? 'Leave' : 'Join community'}
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-3">
          {community.joined || !user ? null : (
            <p className="rounded-xl border border-violet-400/25 bg-violet-500/10 px-3 py-2 text-[11px] text-violet-100">
              Join to post here. You can still read everything.
            </p>
          )}
          {community.joined && (
            <div className="card p-3">
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value.slice(0, 600))}
                placeholder={`Post to ${community.name}…`}
                className="input min-h-[70px] w-full resize-none text-sm"
              />
              <div className="mt-2 flex justify-end">
                <button type="button" className="btn-primary text-xs" onClick={post} disabled={busy || !draft.trim()}>Post</button>
              </div>
            </div>
          )}
          {posts.length === 0 && <EmptyState title="No posts yet" body="Community members can start the first thread." />}
          {posts.map((item) => <PostCard key={item.id} post={item} onChanged={detail.reload} />)}
        </div>

        <aside className="space-y-4">
          <div className="card p-4">
            <SectionHeader title="Members" subtitle={`${count(members.length)} shown`} />
            <div className="mt-2 space-y-2">
              {members.map((member) => (
                <div key={member.handle} className="flex items-center justify-between gap-2">
                  <UserLink handle={member.handle} displayName={member.display_name} color={member.avatar_color} size={28} subtitle={`joined ${timeAgo(member.joined_at)}`} />
                  <Badge tone={member.role === 'owner' ? 'cyan' : 'violet'}>{member.role}</Badge>
                </div>
              ))}
              {members.length === 0 && <p className="text-xs text-muted">No members yet.</p>}
            </div>
          </div>
          <div className="card p-4">
            <h2 className="font-display text-sm font-semibold text-white">Community rules</h2>
            <p className="mt-1.5 text-xs leading-relaxed text-muted">
              Posts are public within NEXUS. Reports go straight to moderators, and owners can remove members. No fabricated member counts — the number above is real.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
