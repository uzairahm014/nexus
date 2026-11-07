import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/session';
import { useToast } from '../components/ui';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [handle, setHandle] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(handle.trim().toLowerCase(), password);
      toast('Welcome back to NEXUS', 'success');
      navigate('/');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[80vh] w-full max-w-5xl items-center px-1">
      <div className="grid w-full gap-8 lg:grid-cols-2 lg:items-center">
        <div className="relative hidden overflow-hidden rounded-3xl border border-white/10 lg:block">
          <img src="/art/hero-home.jpg" alt="NEXUS city" className="h-[460px] w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-midnight via-midnight/40 to-transparent" />
          <div className="absolute bottom-6 left-6 right-6">
            <p className="font-display text-2xl font-bold leading-tight text-white">
              PLAY. CREATE.<br />CONNECT. EXPLORE.
            </p>
            <p className="mt-2 text-sm text-white/70">
              Your account carries progress, achievements, posts and studios across every device.
            </p>
          </div>
        </div>

        <div className="card mx-auto w-full max-w-md p-6 sm:p-8">
          <h1 className="font-display text-2xl font-bold text-white">Sign in</h1>
          <p className="mt-1 text-sm text-muted">Persistent session — you stay signed in on this device.</p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-white/50">Handle or email</span>
              <input
                className="input"
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                required
                placeholder="novastrike"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-white/50">Password</span>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                placeholder="••••••••"
              />
            </label>

            {error && <p className="rounded-lg border border-rose-500/30 bg-rose-950/40 px-3 py-2 text-xs text-rose-100">{error}</p>}

            <button type="submit" className="btn-primary w-full" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-muted">
            New here?{' '}
            <Link to="/register" className="font-semibold text-violet-200 hover:text-white">
              Create an account
            </Link>
          </p>

          <div className="mt-5 rounded-xl border border-white/8 bg-white/[0.03] p-3 text-[11px] leading-relaxed text-white/50">
            Demo accounts from the seed data: <span className="text-white/80">novastrike</span>,{' '}
            <span className="text-white/80">lyra</span>, <span className="text-white/80">hex</span> — password{' '}
            <span className="text-white/80">nexus1234</span>. Admin: <span className="text-white/80">nexus</span>.
          </div>
        </div>
      </div>
    </div>
  );
}
