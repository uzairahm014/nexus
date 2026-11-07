import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type MarketItem } from '../lib/api';
import { useAuth } from '../lib/session';
import { Avatar, Badge, EmptyState, ErrorNote, Modal, SectionHeader, Skeleton, useAsync, useToast } from '../components/ui';
import { count } from '../lib/format';

export default function Marketplace() {
  const { user } = useAuth();
  const toast = useToast();
  const [kind, setKind] = useState('all');
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', kind: 'asset', cover: '/art/game-arena.jpg', price: 0 });
  const data = useAsync(() => api.get<{ items: MarketItem[]; kinds: string[] }>('/content/marketplace'), []);

  const kinds = useMemo(() => ['all', ...(data.data?.kinds ?? [])], [data.data]);
  const items = useMemo(() => {
    const all = data.data?.items ?? [];
    return kind === 'all' ? all : all.filter((item) => item.kind === kind);
  }, [data.data, kind]);

  const download = async (item: MarketItem) => {
    if (!user) {
      toast.push('Sign in to add items to your library', 'error');
      return;
    }
    try {
      await api.post(`/content/marketplace/${item.id}/download`);
      toast.push(`${item.title} added to your library`, 'success');
      data.reload();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Could not add item', 'error');
    }
  };

  const publish = async () => {
    if (form.title.trim().length < 3) {
      toast.push('Give the item a title', 'error');
      return;
    }
    setSaving(true);
    try {
      await api.post('/content/marketplace', {
        title: form.title,
        description: form.description,
        kind: form.kind,
        coverUrl: form.cover,
        price: Number(form.price) || 0,
      });
      toast.push('Published to the marketplace', 'success');
      setOpen(false);
      setForm({ title: '', description: '', kind: 'asset', cover: '/art/game-arena.jpg', price: 0 });
      data.reload();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Publish failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Marketplace"
        subtitle="Community games, templates and assets. Credits only — no real-money purchases anywhere on NEXUS."
        action={user ? <button type="button" className="btn-primary text-xs" onClick={() => setOpen(true)}>Publish item</button> : <Link to="/login" className="btn-ghost text-xs">Sign in</Link>}
      />

      <div className="flex flex-wrap gap-2">
        {kinds.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setKind(item)}
            className={`rounded-full border px-3 py-1.5 text-xs capitalize transition ${
              kind === item ? 'border-cyan-300/60 bg-cyan-400/15 text-cyan-100' : 'border-white/10 text-white/60 hover:text-white'
            }`}
          >
            {item}
          </button>
        ))}
      </div>

      {data.loading && <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2, 3].map((key) => <Skeleton key={key} className="h-64 w-full" />)}</div>}
      {data.error && <ErrorNote message={data.error} onRetry={data.reload} />}
      {!data.loading && items.length === 0 && <EmptyState title="Nothing here yet" body="Publish a template, asset pack or your own game build." />}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <article key={item.id} className="card overflow-hidden">
            <img src={item.cover_url} alt="" className="h-36 w-full object-cover" loading="lazy" />
            <div className="p-4">
              <div className="flex items-center justify-between">
                <Badge tone="violet">{item.kind}</Badge>
                <span className="text-[11px] text-muted">★ {item.rating.toFixed(1)}</span>
              </div>
              <h3 className="mt-2 font-display text-base font-bold text-white">{item.title}</h3>
              <p className="mt-1 line-clamp-2 text-xs text-muted">{item.description}</p>
              <div className="mt-2 flex items-center gap-1.5">
                <Avatar name={item.display_name} color="#7c3aed" size={20} />
                <Link to={`/u/${item.handle}`} className="text-[11px] text-white/60">@{item.handle}</Link>
                <span className="ml-auto text-[10px] text-muted">{count(item.downloads)} installs</span>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className="font-display text-sm font-bold text-cyan-200">{item.price === 0 ? 'Free' : `${item.price} credits`}</span>
                <button type="button" className="btn-primary text-xs" onClick={() => download(item)}>Get</button>
              </div>
            </div>
          </article>
        ))}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Publish to marketplace">
        <div className="space-y-3">
          <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value.slice(0, 80) })} placeholder="Item title" className="input w-full" />
          <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value.slice(0, 400) })} placeholder="What is included?" className="input min-h-[80px] w-full resize-none" />
          <div className="grid grid-cols-2 gap-2">
            <select value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value })} className="input w-full">
              {['asset', 'template', 'game', 'experience'].map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
            <input type="number" min={0} max={9999} value={form.price} onChange={(event) => setForm({ ...form, price: Number(event.target.value) })} className="input w-full" placeholder="Credits" />
          </div>
          <div className="flex flex-wrap gap-2">
            {['/art/game-arena.jpg', '/art/game-parkour.jpg', '/art/game-tower.jpg', '/art/game-party.jpg'].map((cover) => (
              <button key={cover} type="button" onClick={() => setForm({ ...form, cover })} className={`h-14 w-20 overflow-hidden rounded-lg border ${form.cover === cover ? 'border-cyan-300' : 'border-white/10'}`}>
                <img src={cover} alt="" className="h-full w-full object-cover" loading="lazy" />
              </button>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost text-xs" onClick={() => setOpen(false)}>Cancel</button>
            <button type="button" className="btn-primary text-xs" onClick={publish} disabled={saving}>{saving ? 'Publishing…' : 'Publish'}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
