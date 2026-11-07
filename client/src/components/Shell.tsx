import React, { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/session';
import { api, type NotificationRow } from '../lib/api';
import { Avatar, Badge, Spinner } from './ui';
import { count, timeAgo } from '../lib/format';

const PRIMARY = [
  { to: '/', label: 'Home', icon: 'M3 10.5 12 3l9 7.5V21H3z', end: true },
  { to: '/discover', label: 'Discover', icon: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm3.5 5.5-2 5-5 2 2-5z' },
  { to: '/games', label: 'Games', icon: 'M7 8h10a5 5 0 0 1 0 10h-1l-2-2H10l-2 2H7a5 5 0 0 1 0-10Z' },
  { to: '/create', label: 'Create', icon: 'M12 4v16M4 12h16' },
  { to: '/social', label: 'Social', icon: 'M7 8a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm10 1a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5ZM3 19c0-2.5 1.8-4 4-4s4 1.5 4 4m2-1c0-2 1.4-3.5 3.5-3.5S20 16 20 18' },
  { to: '/live', label: 'Live', icon: 'M4 6h16v12H4zM9 10l5 2.5L9 15z' },
  { to: '/music', label: 'Music', icon: 'M9 18V6l10-2v12M9 18a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Zm10-2a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Z' },
  { to: '/clips', label: 'Clips', icon: 'M4 5h16v14H4zM10 9l6 3-6 3z' },
  { to: '/battles', label: 'Battles', icon: 'M5 5l6 6m-6 0 6-6m2 12 6 6m0-6-6 6M4 4l4 4M16 20l4-4' },
  { to: '/multiplayer', label: 'Multiplayer', icon: 'M4 12h4l2-5 3 10 2-5h5' },
  { to: '/events', label: 'Events', icon: 'M5 5h14v15H5zM5 9h14M9 3v4m6-4v4' },
  { to: '/marketplace', label: 'Marketplace', icon: 'M4 8h16l-1.5 12h-13zM8 8V6a4 4 0 0 1 8 0v2' },
];

const MOBILE_TABS = [
  { to: '/', label: 'Home', icon: PRIMARY[0].icon, end: true },
  { to: '/games', label: 'Games', icon: PRIMARY[2].icon },
  { to: '/create', label: 'Create', icon: PRIMARY[3].icon },
  { to: '/social', label: 'Social', icon: PRIMARY[4].icon },
];

function Icon({ path, className = 'h-5 w-5' }: { path: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={path} />
    </svg>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const { user, logout, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [query, setQuery] = useState('');
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [unread, setUnread] = useState(0);
  const [panel, setPanel] = useState<'none' | 'notifications' | 'more'>('none');

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setUnread(0);
      return;
    }
    api
      .get<{ notifications: NotificationRow[]; unread: number }>('/social/notifications')
      .then((data) => {
        setNotifications(data.notifications);
        setUnread(data.unread);
      })
      .catch(() => undefined);
  }, [user, location.pathname]);

  useEffect(() => {
    setPanel('none');
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [location.pathname]);

  const onSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const term = query.trim();
    if (term) navigate(`/discover?q=${encodeURIComponent(term)}`);
  };

  const markRead = async () => {
    await api.post('/social/notifications/read').catch(() => undefined);
    setUnread(0);
  };

  const extraNav = useMemo(() => PRIMARY.slice(4), []);

  return (
    <div className="app-shell flex bg-void text-ink">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] flex-col border-r border-white/[0.06] bg-midnight/80 px-3 pb-4 pt-5 backdrop-blur-2xl lg:flex">
        <Link to="/" className="mb-6 flex items-center gap-2.5 px-2">
          <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet via-magenta to-cyan text-sm font-black text-white shadow-glow">
            N
          </span>
          <span>
            <span className="block font-display text-[15px] font-bold tracking-[0.22em] text-white">NEXUS</span>
            <span className="block text-[9px] uppercase tracking-[0.3em] text-muted">play · create</span>
          </span>
        </Link>

        <nav className="flex-1 space-y-0.5 overflow-y-auto no-scrollbar">
          {PRIMARY.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `nav-item ${isActive ? 'nav-item-active' : ''}`}
            >
              <Icon path={item.icon} />
              <span>{item.label}</span>
            </NavLink>
          ))}
          <div className="my-3 h-px bg-white/[0.06]" />
          {user && (
            <NavLink to="/profile" className={({ isActive }) => `nav-item ${isActive ? 'nav-item-active' : ''}`}>
              <Icon path="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-8 9c0-3.3 3.6-5.5 8-5.5s8 2.2 8 5.5" />
              <span>Profile</span>
            </NavLink>
          )}
          {user?.role === 'admin' && (
            <NavLink to="/admin" className={({ isActive }) => `nav-item ${isActive ? 'nav-item-active' : ''}`}>
              <Icon path="M12 3l8 4v6c0 4.5-3.4 7.3-8 8-4.6-.7-8-3.5-8-8V7z" />
              <span>Admin</span>
            </NavLink>
          )}
        </nav>

        <div className="mt-4 rounded-2xl border border-white/[0.08] bg-gradient-to-br from-violet/20 to-transparent p-3">
          {loading ? (
            <div className="flex justify-center py-3"><Spinner /></div>
          ) : user ? (
            <div className="flex items-center gap-2.5">
              <Link to="/profile" className="flex min-w-0 flex-1 items-center gap-2.5">
                <Avatar name={user.displayName} color={user.avatarColor} url={user.avatarUrl} size={34} />
                <span className="min-w-0">
                  <span className="block truncate text-xs font-semibold text-white">{user.displayName}</span>
                  <span className="block text-[10px] text-muted">Level {user.level} · {count(user.xp)} XP</span>
                </span>
              </Link>
              <button type="button" onClick={logout} className="text-[10px] font-semibold uppercase tracking-wider text-muted hover:text-rose-300">
                Exit
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-[11px] leading-relaxed text-muted">Join NEXUS to play, post and publish.</p>
              <Link to="/login" className="btn-primary w-full !py-2 text-xs">Sign in</Link>
            </div>
          )}
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-h-screen w-full flex-col lg:pl-[248px]">
        <header className="safe-top sticky top-0 z-30 border-b border-white/[0.06] bg-void/85 backdrop-blur-2xl">
          <div className="mx-auto flex w-full max-w-[1400px] items-center gap-3 px-3 py-2.5 sm:px-5">
            <Link to="/" className="flex items-center gap-2 lg:hidden">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet via-magenta to-cyan text-xs font-black text-white">
                N
              </span>
              <span className="font-display text-sm font-bold tracking-[0.2em]">NEXUS</span>
            </Link>

            <form onSubmit={onSearch} className="ml-auto hidden flex-1 max-w-md sm:block lg:ml-0">
              <div className="relative">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.5-3.5" />
                </svg>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search games, creators, communities…"
                  className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] py-2 pl-9 pr-3 text-sm text-ink outline-none placeholder:text-muted/70 focus:border-violet/60"
                  aria-label="Search NEXUS"
                />
              </div>
            </form>

            <div className="ml-auto flex items-center gap-2">
              {user ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setPanel(panel === 'notifications' ? 'none' : 'notifications');
                      if (unread) markRead();
                    }}
                    className="relative rounded-xl border border-white/[0.08] bg-white/[0.04] p-2 text-muted hover:text-white"
                    aria-label="Notifications"
                  >
                    <Icon path="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6Zm4 10a2.5 2.5 0 0 0 4 0" />
                    {unread > 0 && (
                      <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">
                        {unread > 9 ? '9+' : unread}
                      </span>
                    )}
                  </button>
                  <Link to="/profile" className="lg:hidden">
                    <Avatar name={user.displayName} color={user.avatarColor} url={user.avatarUrl} size={32} />
                  </Link>
                  <Link to="/create" className="btn-primary hidden !px-3.5 !py-2 text-xs sm:inline-flex">
                    <Icon path="M12 5v14M5 12h14" className="h-4 w-4" />
                    Create
                  </Link>
                </>
              ) : (
                <>
                  <Link to="/login" className="btn-ghost !px-3 !py-2 text-xs">Sign in</Link>
                  <Link to="/register" className="btn-primary !px-3 !py-2 text-xs">Join</Link>
                </>
              )}
            </div>
          </div>

          {panel === 'notifications' && (
            <div className="absolute right-2 top-full z-40 mt-1 w-[min(92vw,360px)] overflow-hidden rounded-2xl border border-white/10 bg-navy/95 shadow-card backdrop-blur-2xl sm:right-5">
              <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2.5">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Notifications</span>
                <Badge tone="violet">{notifications.length}</Badge>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {notifications.length === 0 ? (
                  <p className="px-4 py-6 text-center text-xs text-muted">Nothing yet. Follow creators to get updates.</p>
                ) : (
                  notifications.map((n) => (
                    <div key={n.id} className={`flex gap-2.5 border-b border-white/[0.04] px-4 py-2.5 ${n.read ? '' : 'bg-violet/10'}`}>
                      <Avatar name={n.actor_handle ?? 'N'} color={n.avatar_color ?? '#7C3AED'} size={26} />
                      <div className="min-w-0">
                        <p className="text-xs leading-snug text-ink">{n.body}</p>
                        <p className="mt-0.5 text-[10px] text-muted">{timeAgo(n.created_at)}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </header>

        <main className="mx-auto w-full max-w-[1400px] flex-1 px-3 pb-24 pt-4 sm:px-5 lg:pb-10">{children}</main>

        {/* Mobile bottom navigation */}
        <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.08] bg-midnight/95 backdrop-blur-2xl lg:hidden">
          <div className="flex items-stretch justify-around px-1 pt-1.5">
            {MOBILE_TABS.map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.end}
                className={({ isActive }) =>
                  `flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-lg py-1.5 text-[10px] font-medium transition ${
                    isActive ? 'text-white' : 'text-muted'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <span className={isActive ? 'text-violet-300 drop-shadow-[0_0_10px_rgba(168,85,247,0.9)]' : ''}>
                      <Icon path={tab.icon} className="h-[22px] w-[22px]" />
                    </span>
                    <span>{tab.label}</span>
                  </>
                )}
              </NavLink>
            ))}
            <button
              type="button"
              onClick={() => setPanel(panel === 'more' ? 'none' : 'more')}
              className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-lg py-1.5 text-[10px] font-medium ${panel === 'more' ? 'text-white' : 'text-muted'}`}
              aria-label="More sections"
            >
              <Icon path="M5 12h.01M12 12h.01M19 12h.01" className="h-[22px] w-[22px]" />
              <span>More</span>
            </button>
          </div>

          {panel === 'more' && (
            <div className="absolute bottom-full left-0 right-0 mb-1 max-h-[60dvh] overflow-y-auto rounded-t-3xl border-t border-white/10 bg-navy/98 p-4 pb-5 backdrop-blur-2xl">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">All sections</span>
                <button type="button" onClick={() => setPanel('none')} className="text-xs text-muted">Close</button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[...extraNav, { to: '/profile', label: 'Profile', icon: PRIMARY[0].icon }, ...(user?.role === 'admin' ? [{ to: '/admin', label: 'Admin', icon: PRIMARY[0].icon }] : [])].map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className="flex flex-col items-center gap-1.5 rounded-xl border border-white/[0.07] bg-white/[0.04] px-2 py-3 text-[11px] text-ink"
                  >
                    <Icon path={item.icon} className="h-5 w-5 text-violet-300" />
                    {item.label}
                  </NavLink>
                ))}
                {user ? (
                  <button
                    type="button"
                    onClick={logout}
                    className="flex flex-col items-center gap-1.5 rounded-xl border border-rose-500/20 bg-rose-500/10 px-2 py-3 text-[11px] text-rose-200"
                  >
                    <Icon path="M15 12H3m4-4-4 4 4 4m6-9h5a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-5" className="h-5 w-5" />
                    Sign out
                  </button>
                ) : (
                  <Link to="/login" className="flex flex-col items-center gap-1.5 rounded-xl border border-violet/30 bg-violet/15 px-2 py-3 text-[11px] text-white">
                    <Icon path="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-8 9c0-3.3 3.6-5.5 8-5.5s8 2.2 8 5.5" className="h-5 w-5" />
                    Sign in
                  </Link>
                )}
              </div>
            </div>
          )}
        </nav>
      </div>
    </div>
  );
}
