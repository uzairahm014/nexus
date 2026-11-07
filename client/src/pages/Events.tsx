import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type EventRow } from '../lib/api';
import { useAuth } from '../lib/session';
import { Badge, EmptyState, ErrorNote, Modal, SectionHeader, Skeleton, useAsync, useToast } from '../components/ui';
import { EventCard } from '../components/cards';
import { countdown, dateLabel } from '../lib/format';

export default function Events() {
  const { user } = useAuth();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: '',
    description: '',
    kind: 'tournament',
    banner: '/art/banner-1.jpg',
    startsAt: '',
    capacity: 64,
  });
  const data = useAsync(() => api.get<{ events: EventRow[] }>('/content/events'), []);

  const register = async (event: EventRow) => {
    if (!user) {
      toast.push('Sign in to register', 'error');
      return;
    }
    setBusy(event.id);
    try {
      const response = await api.post<{ registered: boolean }>(`/content/events/${event.id}/register`);
      toast.push(response.registered ? 'You are registered' : 'Registration cancelled', 'success');
      data.reload();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Registration failed', 'error');
    } finally {
      setBusy(null);
    }
  };

  const create = async () => {
    if (form.title.trim().length < 3) {
      toast.push('Event title is required', 'error');
      return;
    }
    if (!form.startsAt) {
      toast.push('Pick a start time', 'error');
      return;
    }
    setSaving(true);
    try {
      await api.post('/content/events', {
        title: form.title,
        description: form.description,
        kind: form.kind,
        bannerUrl: form.banner,
        startsAt: new Date(form.startsAt).toISOString(),
        capacity: Number(form.capacity) || 64,
      });
      toast.push('Event scheduled', 'success');
      setOpen(false);
      setForm({ title: '', description: '', kind: 'tournament', banner: '/art/banner-1.jpg', startsAt: '', capacity: 64 });
      data.reload();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Could not schedule event', 'error');
    } finally {
      setSaving(false);
    }
  };

  const events = data.data?.events ?? [];
  const upcoming = events.filter((event) => new Date(event.ends_at || event.starts_at).getTime() > Date.now() - 3600_000);
  const past = events.filter((event) => !upcoming.includes(event));

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Events"
        subtitle="Real scheduled sessions with capacity and attendance — no invented participants."
        action={user ? <button type="button" className="btn-primary text-xs" onClick={() => setOpen(true)}>Schedule event</button> : <Link to="/login" className="btn-ghost text-xs">Sign in</Link>}
      />

      {data.loading && <div className="grid gap-4 md:grid-cols-2">{[0, 1].map((key) => <Skeleton key={key} className="h-56 w-full" />)}</div>}
      {data.error && <ErrorNote message={data.error} onRetry={data.reload} />}
      {!data.loading && events.length === 0 && <EmptyState title="Nothing scheduled" body="Schedule a tournament or watch party and it shows up for everyone." />}

      <div className="grid gap-4 md:grid-cols-2">
        {upcoming.map((event) => (
          <div key={event.id} className="space-y-1">
            <EventCard event={event} onRegister={() => register(event)} busy={busy === event.id} />
            <p className="px-1 text-[10px] text-muted">{countdown(event.starts_at)} · {event.registered_count}/{event.capacity} seats</p>
          </div>
        ))}
      </div>

      {past.length > 0 && (
        <div>
          <h2 className="mb-2 font-display text-sm font-semibold text-white/70">Past events</h2>
          <div className="divide-y divide-white/5 rounded-2xl border border-white/5">
            {past.map((event) => (
              <div key={event.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-white/80">{event.title}</p>
                  <p className="text-[10px] text-muted">{dateLabel(event.starts_at)} · {event.kind}</p>
                </div>
                <Badge tone="violet">{event.registered_count} attended</Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Schedule an event">
        <div className="space-y-3">
          <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value.slice(0, 80) })} placeholder="Event title" className="input w-full" />
          <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value.slice(0, 500) })} placeholder="What happens at this event?" className="input min-h-[80px] w-full resize-none" />
          <div className="grid grid-cols-2 gap-2">
            <select value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value })} className="input w-full">
              <option value="tournament">Tournament</option>
              <option value="watch-party">Watch party</option>
              <option value="community">Community meetup</option>
              <option value="challenge">Challenge</option>
            </select>
            <input type="number" min={2} max={5000} value={form.capacity} onChange={(event) => setForm({ ...form, capacity: Number(event.target.value) })} className="input w-full" />
          </div>
          <input type="datetime-local" value={form.startsAt} onChange={(event) => setForm({ ...form, startsAt: event.target.value })} className="input w-full" />
          <div className="flex flex-wrap gap-2">
            {['/art/banner-1.jpg', '/art/banner-2.jpg', '/art/banner-3.jpg'].map((banner) => (
              <button key={banner} type="button" onClick={() => setForm({ ...form, banner })} className={`h-12 w-20 overflow-hidden rounded-lg border ${form.banner === banner ? 'border-cyan-300' : 'border-white/10'}`}>
                <img src={banner} alt="" className="h-full w-full object-cover" loading="lazy" />
              </button>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost text-xs" onClick={() => setOpen(false)}>Cancel</button>
            <button type="button" className="btn-primary text-xs" onClick={create} disabled={saving}>{saving ? 'Scheduling…' : 'Schedule'}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
