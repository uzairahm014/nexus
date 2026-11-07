import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, uploadFile, type Clip, type Comment } from '../lib/api';
import { useAuth } from '../lib/session';
import { Avatar, Badge, EmptyState, ErrorNote, Modal, SectionHeader, Skeleton, useAsync, useToast } from '../components/ui';
import { duration, timeAgo } from '../lib/format';

export default function Clips() {
  const { user } = useAuth();
  const toast = useToast();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', thumb: '/art/clip-1.jpg', mediaUrl: '', duration: 30 });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadName, setUploadName] = useState<string | null>(null);
  const [openClip, setOpenClip] = useState<Clip | null>(null);
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [commentDraft, setCommentDraft] = useState('');
  const [token, setToken] = useState(0);
  const clips = useAsync(() => api.get<{ clips: Clip[]; nextOffset: number | null }>('/content/clips'), [token]);

  const like = async (clip: Clip) => {
    if (!user) {
      toast.push('Sign in to react to clips', 'error');
      return;
    }
    try {
      await api.post(`/content/clips/${clip.id}/like`);
      setToken((value) => value + 1);
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Could not react', 'error');
    }
  };

  const openComments = async (clip: Clip) => {
    setOpenClip(clip);
    setComments(null);
    api.post(`/content/clips/${clip.id}/view`).catch(() => undefined);
    try {
      const response = await api.get<{ comments: Comment[] }>(`/content/clips/${clip.id}/comments`);
      setComments(response.comments);
    } catch {
      setComments([]);
    }
  };

  const addComment = async () => {
    if (!openClip || commentDraft.trim().length < 2) return;
    try {
      const response = await api.post<{ comment: Comment }>(`/content/clips/${openClip.id}/comments`, { body: commentDraft });
      setComments((current) => [...(current ?? []), response.comment]);
      setCommentDraft('');
      setToken((value) => value + 1);
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Comment failed', 'error');
    }
  };

  const ingestVideo = async (file: File) => {
    setUploading(true);
    setUploadName(file.name);
    try {
      const result = await uploadFile(file);
      const duration = await new Promise<number>((resolve) => {
        const probe = document.createElement('video');
        probe.preload = 'metadata';
        probe.onloadedmetadata = () => resolve(Number.isFinite(probe.duration) ? Math.round(probe.duration) : 30);
        probe.onerror = () => resolve(30);
        probe.src = result.url;
      });
      setForm((current) => ({ ...current, mediaUrl: result.url, duration: Math.max(1, Math.min(180, duration)) }));
      toast.push(`Uploaded ${file.name}`, 'success');
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Upload failed', 'error');
      setUploadName(null);
    } finally {
      setUploading(false);
    }
  };

  const upload = async () => {
    if (form.title.trim().length < 3) {
      toast.push('Give your clip a title', 'error');
      return;
    }
    setSaving(true);
    try {
      await api.post('/content/clips', {
        title: form.title,
        description: form.description,
        thumbUrl: form.thumb,
        mediaUrl: form.mediaUrl || null,
        duration: form.duration,
      });
      toast.push('Clip published', 'success');
      setUploadOpen(false);
      setForm({ title: '', description: '', thumb: '/art/clip-1.jpg', mediaUrl: '', duration: 30 });
      setUploadName(null);
      setToken((value) => value + 1);
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Upload failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Clips"
        subtitle="Short-form highlights from the community. Media stays lazy-loaded and size-limited."
        action={user ? <button type="button" className="btn-primary text-xs" onClick={() => setUploadOpen(true)}>Upload clip</button> : <Link to="/login" className="btn-ghost text-xs">Sign in</Link>}
      />

      {clips.loading && <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2, 3, 4, 5].map((key) => <Skeleton key={key} className="h-56 w-full" />)}</div>}
      {clips.error && <ErrorNote message={clips.error} onRetry={clips.reload} />}
      {!clips.loading && (clips.data?.clips.length ?? 0) === 0 && <EmptyState title="No clips yet" body="Publish the first highlight and it appears in the discover feed." />}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {(clips.data?.clips ?? []).map((clip) => (
          <article key={clip.id} className="card overflow-hidden">
            <button type="button" className="group relative block w-full" onClick={() => openComments(clip)}>
              <img src={clip.thumb_url} alt="" className="h-40 w-full object-cover transition duration-500 group-hover:scale-[1.03]" loading="lazy" />
              <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">{duration(clip.duration)}</span>
              <span className="absolute inset-0 flex items-center justify-center opacity-0 transition group-hover:opacity-100">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20 backdrop-blur">▶</span>
              </span>
            </button>
            <div className="p-3">
              <h3 className="line-clamp-2 text-sm font-semibold text-white">{clip.title}</h3>
              <p className="mt-0.5 line-clamp-2 text-[11px] text-muted">{clip.description}</p>
              <div className="mt-2 flex items-center justify-between">
                <Link to={`/u/${clip.handle}`} className="flex items-center gap-1.5">
                  <Avatar name={clip.display_name} color={clip.avatar_color} size={22} />
                  <span className="text-[11px] text-white/70">@{clip.handle}</span>
                </Link>
                <div className="flex items-center gap-2 text-[11px]">
                  <button type="button" onClick={() => like(clip)} className={clip.liked ? 'text-magenta-300 text-pink-300' : 'text-muted hover:text-white'}>
                    ♥ {clip.like_count}
                  </button>
                  <button type="button" onClick={() => openComments(clip)} className="text-muted hover:text-white">💬 {clip.comment_count}</button>
                  <span className="text-muted">{clip.views} views</span>
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>

      <Modal open={!!openClip} onClose={() => setOpenClip(null)} title={openClip?.title ?? 'Clip'} wide>
        {openClip && (
          <div className="space-y-3">
            {openClip.media_url ? (
              <video src={openClip.media_url} poster={openClip.thumb_url} controls playsInline className="max-h-72 w-full rounded-xl bg-black object-contain" />
            ) : (
              <img src={openClip.thumb_url} alt="" className="max-h-72 w-full rounded-xl object-cover" />
            )}
            <p className="text-xs text-muted">{openClip.description}</p>
            <div className="flex items-center gap-2 text-[11px] text-muted">
              <Badge tone="violet">@{openClip.handle}</Badge>
              <span>{timeAgo(openClip.created_at)}</span>
              <span>{openClip.views} views</span>
            </div>
            <div className="max-h-44 space-y-2 overflow-y-auto">
              {comments === null && <p className="text-xs text-muted">Loading comments…</p>}
              {comments?.length === 0 && <p className="text-xs text-muted">No comments yet.</p>}
              {(comments ?? []).map((comment) => (
                <div key={comment.id} className="flex gap-2">
                  <Avatar name={comment.display_name} color={comment.avatar_color} size={24} />
                  <div>
                    <p className="text-[11px] font-semibold text-white">{comment.display_name}</p>
                    <p className="text-xs text-white/75">{comment.body}</p>
                  </div>
                </div>
              ))}
            </div>
            {user ? (
              <div className="flex gap-2">
                <input value={commentDraft} onChange={(event) => setCommentDraft(event.target.value.slice(0, 300))} placeholder="Add a comment…" className="input flex-1 text-xs" />
                <button type="button" className="btn-primary text-xs" onClick={addComment} disabled={!commentDraft.trim()}>Send</button>
              </div>
            ) : (
              <Link to="/login" className="btn-ghost inline-block text-xs">Sign in to comment</Link>
            )}
          </div>
        )}
      </Modal>

      <Modal open={uploadOpen} onClose={() => setUploadOpen(false)} title="Upload a clip">
        <div className="space-y-3">
          <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value.slice(0, 90) })} placeholder="Clip title" className="input w-full" />
          <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value.slice(0, 300) })} placeholder="Describe the highlight" className="input min-h-[80px] w-full resize-none" />
          <input value={form.mediaUrl} onChange={(event) => setForm({ ...form, mediaUrl: event.target.value })} placeholder="Optional MP4/WebM URL (https://)" className="input w-full" />
          <div>
            <p className="mb-1.5 text-[11px] uppercase tracking-wider text-muted">Thumbnail</p>
            <div className="flex flex-wrap gap-2">
              {['/art/clip-1.jpg', '/art/clip-2.jpg', '/art/clip-3.jpg', '/art/clip-4.jpg'].map((thumb) => (
                <button key={thumb} type="button" onClick={() => setForm({ ...form, thumb })} className={`h-14 w-20 overflow-hidden rounded-lg border ${form.thumb === thumb ? 'border-cyan-300' : 'border-white/10'}`}>
                  <img src={thumb} alt="" className="h-full w-full object-cover" loading="lazy" />
                </button>
              ))}
            </div>
          </div>
          <p className="text-[10px] text-muted">Only upload media you own. Links must be direct video files; NEXUS does not re-host large video.</p>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost text-xs" onClick={() => setUploadOpen(false)}>Cancel</button>
            <button type="button" className="btn-primary text-xs" onClick={upload} disabled={saving}>{saving ? 'Publishing…' : 'Publish'}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
