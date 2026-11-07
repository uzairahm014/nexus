import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { initials } from '../lib/format';

/* ---------------------------------- toasts --------------------------------- */

type ToastKind = 'success' | 'error' | 'info';
interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}
const ToastContext = createContext<{ push: (message: string, kind?: ToastKind) => void } | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((message: string, kind: ToastKind = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev.slice(-2), { id, kind, message }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4200);
  }, []);

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] z-[120] flex flex-col items-center gap-2 px-3">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className={`pointer-events-auto w-full max-w-sm animate-fade-up rounded-xl border px-4 py-3 text-sm shadow-card backdrop-blur-xl ${
              toast.kind === 'error'
                ? 'border-rose-500/40 bg-rose-950/85 text-rose-100'
                : toast.kind === 'success'
                  ? 'border-emerald-500/40 bg-emerald-950/85 text-emerald-100'
                  : 'border-violet/40 bg-indigo/80 text-ink'
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside ToastProvider');
  // Callable both as toast('message', 'success') and toast.push('message', 'success').
  return useMemo(() => {
    const callable = ((message: string, kind?: ToastKind) => context.push(message, kind)) as ((
      message: string,
      kind?: ToastKind,
    ) => void) & { push: (message: string, kind?: ToastKind) => void };
    callable.push = context.push;
    return callable;
  }, [context]);
}

/* ---------------------------------- atoms ---------------------------------- */

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/25 border-t-white ${className}`}
      aria-hidden
    />
  );
}

export function Avatar({
  name,
  color = '#7C3AED',
  url,
  size = 40,
  ring = false,
}: {
  name: string;
  color?: string;
  url?: string | null;
  size?: number;
  ring?: boolean;
}) {
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-display font-semibold text-white ${
        ring ? 'ring-2 ring-violet/60 ring-offset-2 ring-offset-midnight' : ''
      }`}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        background: url ? '#0C0A2A' : `linear-gradient(140deg, ${color}, #1A1258)`,
        boxShadow: `0 0 24px -10px ${color}`,
      }}
      title={name}
    >
      {url ? <img src={url} alt={name} className="h-full w-full object-cover" loading="lazy" /> : initials(name)}
    </span>
  );
}

export function Badge({
  children,
  tone = 'violet',
  className = '',
}: {
  children: React.ReactNode;
  tone?: 'violet' | 'cyan' | 'magenta' | 'green' | 'neutral';
  className?: string;
}) {
  const tones: Record<string, string> = {
    violet: 'border-violet/40 bg-violet/15 text-violet-200',
    cyan: 'border-cyan/40 bg-cyan/10 text-cyan-200',
    magenta: 'border-magenta/40 bg-magenta/15 text-fuchsia-200',
    green: 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200',
    neutral: 'border-white/12 bg-white/[0.06] text-muted',
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function SectionHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <h2 className="font-display text-lg font-semibold tracking-tight text-white sm:text-xl">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
  icon = '✦',
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
  icon?: string;
}) {
  return (
    <div className="card flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet/15 text-xl text-violet-200">
        {icon}
      </div>
      <h3 className="font-display text-base font-semibold text-white">{title}</h3>
      <p className="max-w-sm text-sm text-muted">{body}</p>
      {action}
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-shimmer rounded-xl bg-[linear-gradient(90deg,rgba(255,255,255,0.04),rgba(255,255,255,0.10),rgba(255,255,255,0.04))] bg-[length:200%_100%] ${className}`}
    />
  );
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="card flex flex-col gap-3 border-rose-500/30 px-4 py-3 text-sm text-rose-100 sm:flex-row sm:items-center sm:justify-between">
      <span>{message}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} className="btn-ghost shrink-0 text-xs">
          Retry
        </button>
      )}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-6">
      <button type="button" aria-label="Close" className="absolute inset-0 cursor-default" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`glass-strong relative z-10 max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl border-white/12 p-5 shadow-card sm:rounded-2xl ${
          wide ? 'sm:max-w-3xl' : 'sm:max-w-md'
        } safe-bottom`}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h3 className="font-display text-lg font-semibold text-white">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/10 px-2 py-1 text-xs text-muted hover:text-white"
          >
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className = '',
}: {
  tabs: readonly T[];
  value: T;
  onChange: (next: T) => void;
  className?: string;
}) {
  return (
    <div className={`no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1 ${className}`}>
      {tabs.map((tab) => (
        <button
          key={tab}
          type="button"
          onClick={() => onChange(tab)}
          className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
            value === tab
              ? 'bg-white text-midnight shadow-glow'
              : 'border border-white/10 bg-white/[0.04] text-muted hover:text-white'
          }`}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}

export function UserLink({
  handle,
  displayName,
  color,
  url,
  size = 32,
  subtitle,
  isDemo,
}: {
  handle: string;
  displayName: string;
  color?: string;
  url?: string | null;
  size?: number;
  subtitle?: string;
  isDemo?: boolean;
}) {
  return (
    <Link to={`/u/${handle}`} className="flex min-w-0 items-center gap-2.5 group">
      <Avatar name={displayName} color={color} url={url} size={size} />
      <span className="min-w-0">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold text-white group-hover:text-violet-200">
            {displayName}
          </span>
          {isDemo && <Badge tone="neutral">demo</Badge>}
        </span>
        <span className="block truncate text-xs text-muted">{subtitle ?? `@${handle}`}</span>
      </span>
    </Link>
  );
}

export function ProgressBar({ pct, tone = 'violet' }: { pct: number; tone?: 'violet' | 'cyan' }) {
  const gradient = tone === 'cyan' ? 'from-cyan to-emerald-300' : 'from-violet via-magenta to-cyan';
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
      <div
        className={`h-full rounded-full bg-gradient-to-r ${gradient} transition-all duration-500`}
        style={{ width: `${Math.max(2, Math.min(100, pct))}%` }}
      />
    </div>
  );
}

export function useAsync<T>(loader: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    loader()
      .then((result) => {
        if (alive) setData(result);
      })
      .catch((err: Error) => {
        if (alive) setError(err.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return useMemo(() => ({ data, loading, error, reload }), [data, loading, error, reload]);
}
