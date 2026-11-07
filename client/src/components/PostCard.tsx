import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/session';
import { api, type Post } from '../lib/api';
import { Avatar, Badge, useToast } from './ui';
import { count, timeAgo } from '../lib/format';

export function PostCard({ post, onChanged }: { post: Post; onChanged?: () => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [liked, setLiked] = useState(post.liked);
  const [likes, setLikes] = useState(post.likeCount);
  const [bookmarked, setBookmarked] = useState(post.bookmarked);
  const [comments, setComments] = useState<{ id: string; body: string; handle: string; display_name: string; avatar_color: string; created_at: string }[]>([]);
  const [commentCount, setCommentCount] = useState(post.commentCount);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);

  const requireAuth = () => {
    if (!user) {
      toast('Sign in to interact with the community.', 'info');
      navigate('/login');
      return false;
    }
    return true;
  };

  const toggleLike = async () => {
    if (!requireAuth()) return;
    const next = !liked;
    setLiked(next);
    setLikes((n) => n + (next ? 1 : -1));
    try {
      const res = await api.post<{ liked: boolean; likeCount: number }>(`/social/posts/${post.id}/like`);
      setLiked(res.liked);
      setLikes(res.likeCount);
    } catch (error) {
      setLiked(!next);
      setLikes((n) => n + (next ? -1 : 1));
      toast((error as Error).message, 'error');
    }
  };

  const toggleBookmark = async () => {
    if (!requireAuth()) return;
    try {
      const res = await api.post<{ bookmarked: boolean }>(`/social/posts/${post.id}/bookmark`);
      setBookmarked(res.bookmarked);
      toast(res.bookmarked ? 'Saved to your collection.' : 'Removed from saved.', 'success');
    } catch (error) {
      toast((error as Error).message, 'error');
    }
  };

  const loadComments = async () => {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (comments.length) return;
    setLoadingComments(true);
    try {
      const res = await api.get<{ comments: typeof comments }>(`/social/posts/${post.id}/comments`);
      setComments(res.comments);
    } catch (error) {
      toast((error as Error).message, 'error');
    } finally {
      setLoadingComments(false);
    }
  };

  const submitComment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!requireAuth()) return;
    const body = draft.trim();
    if (!body) return;
    setDraft('');
    try {
      const res = await api.post<{ comment: (typeof comments)[number]; commentCount: number }>(
        `/social/posts/${post.id}/comments`,
        { body },
      );
      setComments((prev) => [...prev, res.comment]);
      setCommentCount(res.commentCount);
      onChanged?.();
    } catch (error) {
      setDraft(body);
      toast((error as Error).message, 'error');
    }
  };

  const report = async () => {
    if (!requireAuth()) return;
    try {
      await api.post('/social/reports', { targetType: 'post', targetId: post.id, reason: 'Reported from feed' });
      toast('Report sent to moderation.', 'success');
    } catch (error) {
      toast((error as Error).message, 'error');
    }
  };

  const media = useMemo(() => post.mediaUrl, [post.mediaUrl]);

  return (
    <article className="card overflow-hidden p-0">
      <div className="flex items-center gap-2.5 px-4 pt-3.5">
        <Link to={`/u/${post.author.handle}`}>
          <Avatar name={post.author.displayName} color={post.author.avatarColor} url={post.author.avatarUrl} size={38} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Link to={`/u/${post.author.handle}`} className="truncate text-sm font-semibold text-white hover:text-violet-200">
              {post.author.displayName}
            </Link>
            {post.author.isDemo && <Badge tone="neutral">demo</Badge>}
            <span className="text-[11px] text-muted">· Lv {post.author.level}</span>
          </div>
          <p className="text-[11px] text-muted">
            @{post.author.handle} · {timeAgo(post.createdAt)}
            {post.community ? ` · in ${post.community.name}` : ''}
          </p>
        </div>
        <button type="button" onClick={report} className="text-muted/60 hover:text-rose-300" aria-label="Report post">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4">
            <path d="M4 3v18M4 4h11l-1.5 4L15 12H4" />
          </svg>
        </button>
      </div>

      <p className="whitespace-pre-wrap px-4 py-3 text-[14px] leading-relaxed text-ink/95">{post.body}</p>

      {media && (
        <div className="mx-4 mb-3 overflow-hidden rounded-xl border border-white/[0.07]">
          <img src={media} alt="" loading="lazy" className="max-h-[440px] w-full object-cover" />
        </div>
      )}

      <div className="flex items-center gap-1 border-t border-white/[0.05] px-3 py-2 text-xs text-muted">
        <button
          type="button"
          onClick={toggleLike}
          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 transition hover:bg-white/[0.06] ${liked ? 'text-rose-300' : ''}`}
          aria-pressed={liked}
        >
          <svg viewBox="0 0 24 24" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.7" className="h-4 w-4">
            <path d="M12 20s-7-4.3-7-9a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 4.7-7 9-7 9Z" />
          </svg>
          {count(likes)}
        </button>
        <button type="button" onClick={loadComments} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 hover:bg-white/[0.06]">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4">
            <path d="M20 15a3 3 0 0 1-3 3H8l-4 3V6a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3z" />
          </svg>
          {count(commentCount)}
        </button>
        <button type="button" onClick={toggleBookmark} className={`ml-auto rounded-lg px-2.5 py-1.5 hover:bg-white/[0.06] ${bookmarked ? 'text-cyan-300' : ''}`}>
          {bookmarked ? 'Saved' : 'Save'}
        </button>
      </div>

      {open && (
        <div className="border-t border-white/[0.05] bg-black/25 px-4 py-3">
          {loadingComments && <p className="text-xs text-muted">Loading comments…</p>}
          <div className="space-y-2.5">
            {comments.map((c) => (
              <div key={c.id} className="flex gap-2">
                <Avatar name={c.display_name} color={c.avatar_color} size={26} />
                <div className="min-w-0 rounded-xl bg-white/[0.05] px-3 py-2">
                  <p className="text-[11px] font-semibold text-white">
                    {c.display_name} <span className="font-normal text-muted">@{c.handle} · {timeAgo(c.created_at)}</span>
                  </p>
                  <p className="text-[13px] text-ink/90">{c.body}</p>
                </div>
              </div>
            ))}
            {!loadingComments && comments.length === 0 && <p className="text-xs text-muted">No comments yet. Start the conversation.</p>}
          </div>
          <form onSubmit={submitComment} className="mt-3 flex gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={500}
              placeholder="Write a comment…"
              className="field !py-2"
            />
            <button type="submit" className="btn-primary shrink-0 !px-3 !py-2 text-xs">Send</button>
          </form>
        </div>
      )}
    </article>
  );
}
