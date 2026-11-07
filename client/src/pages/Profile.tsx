import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, type Achievement, type Post, type Project, type User } from '../lib/api';
import { useAuth } from '../lib/session';
import { Avatar, Badge, EmptyState, ErrorNote, Modal, ProgressBar, SectionHeader, Skeleton, Tabs, useAsync, useToast } from '../components/ui';
import { PostCard } from '../components/PostCard';
import { count, levelProgress, scoreLabel, timeAgo } from '../lib/format';

interface ProfilePayload {
  profile: User;
  posts: Post[];
  achievements: Achievement[];
  projects: Project[];
}

export default function Profile() {
  const { handle } = useParams();
  const { user, refresh } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState('posts');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ displayName: '', bio: '', avatarUrl: '', bannerUrl: '', theme: 'violet', privacy: 'public' });

  const isSelf = !handle || handle === user?.handle;
  const data = useAsync<ProfilePayload | null>(async () => {
    if (isSelf) {
      if (!user) return null;
      return api.get<ProfilePayload>(`/auth/users/${user.handle}`);
    }
    return api.get<ProfilePayload>(`/auth/users/${handle}`);
  }, [handle, isSelf, user?.handle]);

  const profile = data.data?.profile ?? (isSelf ? user : null);
  const achievements = data.data?.achievements ?? [];
  const projects = data.data?.projects ?? [];
  const posts = data.data?.posts ?? [];
  const unlocked = useMemo(() => achievements.filter((achievement) => achievement.unlocked), [achievements]);

  const follow = async () => {
    if (!profile) return;
    if (!user) {
      toast.push('Sign in to follow creators', 'error');
      return;
    }
    try {
      if (profile.isDemo !== undefined && profile.followers !== undefined) {
        // optimistic; server returns canonical counts on reload
      }
      const response = await api.post<{ following: boolean }>(`/auth/users/${profile.handle}/follow`);
      toast.push(response.following ? `Following @${profile.handle}` : `Unfollowed @${profile.handle}`, 'success');
      data.reload();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Follow failed', 'error');
    }
  };

  const openEditor = () => {
    if (!user) return;
    setForm({
      displayName: user.displayName,
      bio: user.bio ?? '',
      avatarUrl: user.avatarUrl ?? '',
      bannerUrl: user.bannerUrl ?? '',
      theme: user.theme ?? 'violet',
      privacy: user.privacy ?? 'public',
    });
    setEditing(true);
  };

  const saveProfile = async () => {
    setSaving(true);
    try {
      await api.put('/auth/me', form);
      await refresh();
      toast.push('Profile updated', 'success');
      setEditing(false);
      data.reload();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Could not save profile', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (data.loading && !profile) return <Skeleton className="h-[60vh] w-full" />;
  if (data.error) return <ErrorNote message={data.error} onRetry={data.reload} />;
  if (!profile) {
    return (
      <EmptyState
        title="Sign in to view your profile"
        body="Your profile stores your runs, achievements and published projects."
        action={<Link to="/login" className="btn-primary text-xs">Sign in</Link>}
      />
    );
  }

  const level = levelProgress(profile.xp ?? 0);

  return (
    <div className="space-y-5">
      <div className="relative overflow-hidden rounded-3xl border border-white/10">
        <img src={profile.bannerUrl || '/art/banner-1.jpg'} alt="" className="h-40 w-full object-cover sm:h-56" />
        <div className="absolute inset-0 bg-gradient-to-t from-midnight via-midnight/40 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-end gap-3 p-4 sm:p-6">
          <Avatar name={profile.displayName} color={profile.avatarColor} url={profile.avatarUrl} size={64} ring />
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-xl font-extrabold text-white sm:text-2xl">{profile.displayName}</h1>
            <p className="text-xs text-white/60">@{profile.handle} · Level {profile.level ?? level.level} · {profile.role}</p>
          </div>
          <div className="flex gap-2">
            {isSelf ? (
              <button type="button" className="btn-ghost text-xs" onClick={openEditor}>Edit profile</button>
            ) : (
              <button type="button" className="btn-primary text-xs" onClick={follow}>{user ? 'Follow / unfollow' : 'Sign in to follow'}</button>
            )}
            {!isSelf && <Link to="/messages" className="btn-ghost text-xs">Message</Link>}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-4">
          <div className="card p-4">
            <p className="text-sm leading-relaxed text-white/80">{profile.bio || 'No bio yet.'}</p>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { label: 'Followers', value: profile.followers ?? 0 },
                { label: 'Following', value: profile.following ?? 0 },
                { label: 'Posts', value: profile.postCount ?? posts.length },
                { label: 'Runs', value: profile.gamesPlayed ?? 0 },
              ].map((stat) => (
                <div key={stat.label} className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2">
                  <p className="font-display text-base font-bold text-white">{count(stat.value)}</p>
                  <p className="text-[10px] uppercase tracking-wider text-muted">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>

          <Tabs
            tabs={[
              { id: 'posts', label: 'Posts' },
              { id: 'achievements', label: 'Achievements' },
              { id: 'projects', label: 'Studio' },
            ]}
            value={tab}
            onChange={setTab}
          />

          {tab === 'posts' && (
            <div className="space-y-3">
              {posts.length === 0 && <EmptyState title="No posts yet" body={isSelf ? 'Share your first update from the social feed.' : 'This player has not posted yet.'} />}
              {posts.map((post) => <PostCard key={post.id} post={post} onChanged={data.reload} />)}
            </div>
          )}

          {tab === 'achievements' && (
            <div className="grid gap-3 sm:grid-cols-2">
              {achievements.length === 0 && <EmptyState title="No achievements recorded" body="Play an original NEXUS game to unlock the first badge." />}
              {achievements.map((achievement) => (
                <div key={achievement.code} className={`card p-3 ${achievement.unlocked ? '' : 'opacity-55'}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xl">{achievement.icon}</span>
                    <Badge tone={achievement.unlocked ? 'cyan' : 'violet'}>{achievement.unlocked ? 'Unlocked' : 'Locked'}</Badge>
                  </div>
                  <p className="mt-2 text-xs font-semibold text-white">{achievement.title}</p>
                  <p className="text-[11px] text-muted">{achievement.description}</p>
                  <p className="mt-1 text-[10px] text-cyan-200">+{achievement.xp} XP</p>
                </div>
              ))}
            </div>
          )}

          {tab === 'projects' && (
            <div className="space-y-2">
              {projects.length === 0 && (
                <EmptyState title="No studio projects" body={isSelf ? 'Open the Game Studio and save a scene to see it here.' : 'No published projects yet.'} action={isSelf ? <Link to="/create" className="btn-primary text-xs">Open Create</Link> : undefined} />
              )}
              {projects.map((project) => (
                <div key={project.id} className="card flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-white">{project.title}</p>
                    <p className="text-[10px] text-muted">updated {timeAgo(project.updated_at)} · {project.published ? 'published' : 'draft'}</p>
                  </div>
                  <Link to={`/studio/${project.id}`} className="btn-ghost text-xs">Open</Link>
                </div>
              ))}
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <div className="card p-4">
            <h2 className="font-display text-sm font-semibold text-white">Progress</h2>
            <p className="mt-1 text-[11px] text-muted">{profile.xp ?? 0} XP · level {profile.level ?? 1}</p>
            <div className="mt-2"><ProgressBar pct={level.pct} /></div>
            <p className="mt-2 text-[10px] text-muted">Achievements unlocked: {unlocked.length}/{achievements.length || 0}</p>
          </div>
          <div className="card p-4">
            <h2 className="font-display text-sm font-semibold text-white">Privacy</h2>
            <p className="mt-1.5 text-xs leading-relaxed text-muted">
              Profile visibility is <span className="text-white">{profile.privacy}</span>. Private profiles hide posts from people who are not followers; messages always stay private.
            </p>
            {isSelf && <button type="button" className="btn-ghost mt-2 text-xs" onClick={openEditor}>Change settings</button>}
          </div>
          <div className="card p-4">
            <h2 className="font-display text-sm font-semibold text-white">Top score</h2>
            <p className="mt-1 font-display text-xl font-bold text-cyan-200">{scoreLabel(profile.gamesPlayed ? undefined : undefined)}</p>
            <p className="text-[10px] text-muted">Open a game page for per-title leaderboards.</p>
          </div>
        </aside>
      </div>

      <Modal open={editing} onClose={() => setEditing(false)} title="Edit profile" wide>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-[11px] uppercase tracking-wider text-muted">
            Display name
            <input value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value.slice(0, 40) })} className="input mt-1 w-full" />
          </label>
          <label className="text-[11px] uppercase tracking-wider text-muted">
            Theme
            <select value={form.theme} onChange={(event) => setForm({ ...form, theme: event.target.value })} className="input mt-1 w-full">
              {['violet', 'cyan', 'magenta', 'midnight'].map((theme) => <option key={theme} value={theme}>{theme}</option>)}
            </select>
          </label>
          <label className="text-[11px] uppercase tracking-wider text-muted sm:col-span-2">
            Bio
            <textarea value={form.bio} onChange={(event) => setForm({ ...form, bio: event.target.value.slice(0, 300) })} className="input mt-1 min-h-[80px] w-full resize-none" />
          </label>
          <label className="text-[11px] uppercase tracking-wider text-muted">
            Avatar URL
            <input value={form.avatarUrl} onChange={(event) => setForm({ ...form, avatarUrl: event.target.value })} placeholder="https://" className="input mt-1 w-full" />
          </label>
          <label className="text-[11px] uppercase tracking-wider text-muted">
            Banner URL
            <input value={form.bannerUrl} onChange={(event) => setForm({ ...form, bannerUrl: event.target.value })} placeholder="https://" className="input mt-1 w-full" />
          </label>
          <label className="text-[11px] uppercase tracking-wider text-muted">
            Privacy
            <select value={form.privacy} onChange={(event) => setForm({ ...form, privacy: event.target.value })} className="input mt-1 w-full">
              {['public', 'followers', 'private'].map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          <button type="button" className="btn-ghost text-xs" onClick={() => setEditing(false)}>Cancel</button>
          <button type="button" className="btn-primary text-xs" onClick={saveProfile} disabled={saving}>{saving ? 'Saving…' : 'Save profile'}</button>
        </div>
      </Modal>
    </div>
  );
}
