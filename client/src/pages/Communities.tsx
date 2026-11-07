import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Community } from '../lib/api';
import { useAuth } from '../lib/session';
import { EmptyState, ErrorNote, Modal, SectionHeader, Skeleton, useAsync, useToast } from '../components/ui';
import { CommunityCard } from '../components/cards';

export default function Communities() {
  const { user } = useAuth();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', cover: '/art/comm-1.jpg' });
  const [saving, setSaving] = useState(false);
  const list = useAsync(() => api.get<{ communities: Community[] }>('/social/communities'), []);

  const create = async () => {
    if (form.name.trim().length < 3) {
      toast.push('Community names need at least 3 characters', 'error');
      return;
    }
    setSaving(true);
    try {
      await api.post('/social/communities', { name: form.name, description: form.description, coverUrl: form.cover });
      toast.push('Community created', 'success');
      setOpen(false);
      setForm({ name: '', description: '', cover: '/art/comm-1.jpg' });
      list.reload();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Could not create community', 'error');
    } finally {
      setSaving(false);
    }
  };

  const communities = list.data?.communities ?? [];

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Communities"
        subtitle="Persistent groups with membership, roles and their own post streams."
        action={user ? <button type="button" className="btn-primary text-xs" onClick={() => setOpen(true)}>Create community</button> : <Link to="/login" className="btn-ghost text-xs">Sign in to join</Link>}
      />
      {list.loading && <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2, 3].map((key) => <Skeleton key={key} className="h-44 w-full" />)}</div>}
      {list.error && <ErrorNote message={list.error} onRetry={list.reload} />}
      {!list.loading && !list.error && communities.length === 0 && (
        <EmptyState title="No communities yet" body="Create the first one and invite players from the social feed." />
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {communities.map((community) => <CommunityCard key={community.id} community={community} />)}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Create a community">
        <div className="space-y-3">
          <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value.slice(0, 60) })} placeholder="Community name" className="input w-full" />
          <textarea
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value.slice(0, 400) })}
            placeholder="What is this community about?"
            className="input min-h-[90px] w-full resize-none"
          />
          <div>
            <p className="mb-1.5 text-[11px] uppercase tracking-wider text-muted">Cover</p>
            <div className="flex flex-wrap gap-2">
              {['/art/comm-1.jpg', '/art/comm-2.jpg', '/art/comm-3.jpg', '/art/comm-4.jpg'].map((cover) => (
                <button
                  key={cover}
                  type="button"
                  onClick={() => setForm({ ...form, cover })}
                  className={`h-14 w-20 overflow-hidden rounded-lg border ${form.cover === cover ? 'border-cyan-300' : 'border-white/10'}`}
                >
                  <img src={cover} alt="" className="h-full w-full object-cover" loading="lazy" />
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn-ghost text-xs" onClick={() => setOpen(false)}>Cancel</button>
            <button type="button" className="btn-primary text-xs" onClick={create} disabled={saving}>{saving ? 'Creating…' : 'Create'}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
