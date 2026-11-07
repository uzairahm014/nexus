import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/session';
import { Badge, EmptyState, ErrorNote, SectionHeader, Skeleton, Tabs, useAsync, useToast } from '../components/ui';
import { timeAgo } from '../lib/format';

interface AdminUser {
  id: string;
  handle: string;
  email: string;
  display_name: string;
  role: string;
  level: number;
  is_demo: number;
  created_at: string;
  post_count: number;
}

interface AdminReport {
  id: string;
  target_type: string;
  target_id: string;
  reason: string;
  status: string;
  created_at: string;
  reporter: string;
}

interface AdminProject {
  id: string;
  title: string;
  published: number;
  updated_at: string;
  handle: string;
}

export default function Admin() {
  const { user } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState('overview');
  const [query, setQuery] = useState('');

  const stats = useAsync(() => api.get<Record<string, number>>('/admin/stats'), []);
  const users = useAsync(() => api.get<{ users: AdminUser[] }>(`/admin/users?q=${encodeURIComponent(query)}`), [query]);
  const reports = useAsync(() => api.get<{ reports: AdminReport[] }>('/admin/reports'), []);
  const projects = useAsync(() => api.get<{ projects: AdminProject[] }>('/admin/projects'), []);
  const settings = useAsync(() => api.get<{ settings: Record<string, string> }>('/admin/settings'), []);

  if (!user) {
    return <EmptyState title="Administrator access required" body="Sign in with an administrator account." action={<Link to="/login" className="btn-primary text-xs">Sign in</Link>} />;
  }
  if (user.role !== 'admin') {
    return <EmptyState title="Administrator access required" body="Your account does not have the admin role. Ask the platform owner to promote you." />;
  }

  const setRole = async (target: AdminUser, role: string) => {
    try {
      await api.post(`/admin/users/${target.id}/role`, { role });
      toast.push(`@${target.handle} is now ${role}`, 'success');
      users.reload();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Role change failed', 'error');
    }
  };

  const suspend = async (target: AdminUser) => {
    const next = target.role !== 'suspended';
    try {
      await api.post(`/admin/users/${target.id}/suspend`, { suspend: next });
      toast.push(next ? `@${target.handle} suspended` : `@${target.handle} reinstated`, 'success');
      users.reload();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Action failed', 'error');
    }
  };

  const resolve = async (report: AdminReport, status: string) => {
    try {
      await api.post(`/admin/reports/${report.id}`, { status });
      toast.push(`Report ${status}`, 'success');
      reports.reload();
      stats.reload();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Could not update report', 'error');
    }
  };

  const togglePublish = async (project: AdminProject) => {
    try {
      await api.post(`/admin/projects/${project.id}/publish`, { published: !project.published });
      toast.push(project.published ? 'Project unpublished' : 'Project approved', 'success');
      projects.reload();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Could not update project', 'error');
    }
  };

  const saveSetting = async (key: string, value: string) => {
    try {
      await api.put('/admin/settings', { key, value });
      toast.push('Setting saved', 'success');
      settings.reload();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Could not save setting', 'error');
    }
  };

  const cards: Array<{ key: string; label: string }> = [
    { key: 'users', label: 'Accounts' },
    { key: 'posts', label: 'Posts' },
    { key: 'games', label: 'Games' },
    { key: 'scores', label: 'Validated runs' },
    { key: 'communities', label: 'Communities' },
    { key: 'clips', label: 'Clips' },
    { key: 'openReports', label: 'Open reports' },
    { key: 'projects', label: 'Projects' },
    { key: 'publishedProjects', label: 'Published' },
    { key: 'experiences', label: 'Experiences' },
    { key: 'signupsToday', label: 'Signups (24h)' },
  ];

  return (
    <div className="space-y-5">
      <SectionHeader title="Administration" subtitle="Real moderation tools backed by the same database as the rest of NEXUS." />

      <Tabs
        tabs={[
          { id: 'overview', label: 'Overview' },
          { id: 'users', label: 'Users' },
          { id: 'reports', label: 'Reports' },
          { id: 'projects', label: 'Publishing' },
          { id: 'settings', label: 'Settings' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'overview' && (
        <div className="space-y-4">
          {stats.error && <ErrorNote message={stats.error} onRetry={stats.reload} />}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {stats.loading
              ? cards.map((card) => <Skeleton key={card.key} className="h-20 w-full" />)
              : cards.map((card) => (
                  <div key={card.key} className="card p-4">
                    <p className="font-display text-2xl font-bold text-white">{stats.data?.[card.key] ?? 0}</p>
                    <p className="text-[10px] uppercase tracking-wider text-muted">{card.label}</p>
                  </div>
                ))}
          </div>
          <div className="card p-4">
            <h2 className="font-display text-sm font-semibold text-white">Data honesty</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Every number above is counted from live tables. Demonstration accounts are flagged <code className="text-white">is_demo</code> and are never
              presented as real users in feeds or leaderboards.
            </p>
          </div>
        </div>
      )}

      {tab === 'users' && (
        <div className="space-y-3">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search handle, name or email" className="input w-full sm:max-w-sm" />
          {users.error && <ErrorNote message={users.error} onRetry={users.reload} />}
          <div className="overflow-hidden rounded-2xl border border-white/5">
            {(users.data?.users ?? []).map((row) => (
              <div key={row.id} className="flex flex-wrap items-center gap-2 border-b border-white/5 px-3 py-2 last:border-0">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-white">
                    {row.display_name} <span className="text-white/40">@{row.handle}</span>
                    {row.is_demo ? <span className="ml-1 text-[10px] text-cyan-300">demo</span> : null}
                  </p>
                  <p className="truncate text-[10px] text-muted">{row.email} · joined {timeAgo(row.created_at)} · {row.post_count} posts</p>
                </div>
                <Badge tone={row.role === 'admin' ? 'cyan' : row.role === 'suspended' ? 'magenta' : 'violet'}>{row.role}</Badge>
                <select value={row.role === 'suspended' ? 'user' : row.role} onChange={(event) => setRole(row, event.target.value)} className="input py-1 text-[11px]">
                  {['user', 'moderator', 'admin'].map((role) => <option key={role} value={role}>{role}</option>)}
                </select>
                <button type="button" className="btn-ghost text-[11px]" onClick={() => suspend(row)}>{row.role === 'suspended' ? 'Reinstate' : 'Suspend'}</button>
              </div>
            ))}
            {!users.loading && (users.data?.users ?? []).length === 0 && <p className="px-3 py-6 text-center text-xs text-muted">No accounts matched.</p>}
          </div>
        </div>
      )}

      {tab === 'reports' && (
        <div className="space-y-2">
          {reports.error && <ErrorNote message={reports.error} onRetry={reports.reload} />}
          {reports.loading && <Skeleton className="h-32 w-full" />}
          {!reports.loading && (reports.data?.reports ?? []).length === 0 && <EmptyState title="Queue is clear" body="No open reports. User reports from posts, clips and profiles land here." />}
          {(reports.data?.reports ?? []).map((report) => (
            <div key={report.id} className="card flex flex-wrap items-center gap-2 p-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-white">{report.target_type} · {report.reason}</p>
                <p className="text-[10px] text-muted">reported by @{report.reporter} · {timeAgo(report.created_at)}</p>
              </div>
              <Badge tone={report.status === 'open' ? 'magenta' : 'violet'}>{report.status}</Badge>
              <button type="button" className="btn-ghost text-[11px]" onClick={() => resolve(report, 'resolved')}>Resolve</button>
              <button type="button" className="btn-ghost text-[11px]" onClick={() => resolve(report, 'dismissed')}>Dismiss</button>
            </div>
          ))}
        </div>
      )}

      {tab === 'projects' && (
        <div className="space-y-2">
          {projects.error && <ErrorNote message={projects.error} onRetry={projects.reload} />}
          {projects.loading && <Skeleton className="h-32 w-full" />}
          {!projects.loading && (projects.data?.projects ?? []).length === 0 && <EmptyState title="No studio projects" body="Projects saved in the Game Studio appear here for review." />}
          {(projects.data?.projects ?? []).map((project) => (
            <div key={project.id} className="card flex items-center gap-2 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-white">{project.title}</p>
                <p className="text-[10px] text-muted">@{project.handle} · updated {timeAgo(project.updated_at)}</p>
              </div>
              <Badge tone={project.published ? 'cyan' : 'violet'}>{project.published ? 'published' : 'draft'}</Badge>
              <button type="button" className="btn-ghost text-[11px]" onClick={() => togglePublish(project)}>{project.published ? 'Unpublish' : 'Approve'}</button>
            </div>
          ))}
        </div>
      )}

      {tab === 'settings' && (
        <div className="card space-y-3 p-4">
          {settings.error && <ErrorNote message={settings.error} onRetry={settings.reload} />}
          {settings.loading && <Skeleton className="h-24 w-full" />}
          {Object.entries(settings.data?.settings ?? {}).map(([key, value]) => (
            <label key={key} className="block text-[11px] uppercase tracking-wider text-muted">
              {key}
              <input
                defaultValue={value}
                onBlur={(event) => event.target.value !== value && saveSetting(key, event.target.value)}
                className="input mt-1 w-full"
              />
            </label>
          ))}
          <p className="text-[10px] text-muted">Platform configuration is stored server-side and applied without redeploying.</p>
        </div>
      )}
    </div>
  );
}
