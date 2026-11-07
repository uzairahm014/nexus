import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/session';
import { useToast } from '../components/ui';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState({ displayName: '', handle: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(key: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await register({
        displayName: form.displayName.trim(),
        handle: form.handle.trim().toLowerCase(),
        email: form.email.trim(),
        password: form.password,
      });
      toast('Account created — welcome to NEXUS', 'success');
      navigate('/');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-lg py-6">
      <div className="card p-6 sm:p-8">
        <h1 className="font-display text-2xl font-bold text-white">Create your NEXUS identity</h1>
        <p className="mt-1 text-sm text-muted">
          One account for games, studios, communities, clips and tournaments.
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-white/50">Display name</span>
            <input className="input" value={form.displayName} onChange={(e) => update('displayName', e.target.value)} required maxLength={40} placeholder="Nova Strike" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-white/50">Handle</span>
            <input
              className="input"
              value={form.handle}
              onChange={(e) => update('handle', e.target.value.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase())}
              required
              minLength={3}
              maxLength={20}
              autoCapitalize="none"
              placeholder="novastrike"
            />
            <span className="mt-1 block text-[11px] text-white/40">3–20 characters, letters, numbers and underscore.</span>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-white/50">Email</span>
            <input className="input" type="email" value={form.email} onChange={(e) => update('email', e.target.value)} required autoComplete="email" placeholder="you@example.com" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-white/50">Password</span>
            <input className="input" type="password" value={form.password} onChange={(e) => update('password', e.target.value)} required minLength={8} autoComplete="new-password" placeholder="At least 8 characters" />
          </label>

          {error && <p className="rounded-lg border border-rose-500/30 bg-rose-950/40 px-3 py-2 text-xs text-rose-100">{error}</p>}

          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? 'Creating…' : 'Create account'}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-muted">
          Already have one?{' '}
          <Link to="/login" className="font-semibold text-violet-200 hover:text-white">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
