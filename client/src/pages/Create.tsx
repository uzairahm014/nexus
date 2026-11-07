import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, type Project } from '../lib/api';
import { useAuth } from '../lib/session';
import { Badge, EmptyState, ErrorNote, Modal, SectionHeader, Skeleton, Tabs, useAsync, useToast } from '../components/ui';
import { timeAgo } from '../lib/format';

interface GalleryProject extends Project {
  cover?: string;
}

const TEMPLATES = [
  { id: 'blank', title: 'Blank Scene', body: 'Empty 3D world with sun, ground and camera.', cover: '/art/game-neon-racer.jpg', data: {} },
  {
    id: 'racer',
    title: 'Neon Circuit',
    body: 'Ring road, neon pylons and a chase camera.',
    cover: '/art/game-neon-racer.jpg',
    data: {
      env: { sky: '#05030f', fog: 0.02, ambient: 0.5, sun: 1.1 },
      objects: [
        { id: 'road', name: 'Circuit Ring', type: 'torus', color: '#2a1d6b', metalness: 0.8, roughness: 0.3, position: [0, 0, 0], rotation: [1.5707, 0, 0], scale: [60, 60, 4] },
        { id: 'pylon', name: 'Neon Pylon', type: 'box', color: '#22d3ee', metalness: 0.9, roughness: 0.15, position: [12, 4, 0], rotation: [0, 0, 0], scale: [1, 8, 1] },
        { id: 'marker', name: 'Gate', type: 'box', color: '#a855f7', metalness: 0.4, roughness: 0.5, position: [-12, 3, 0], rotation: [0, 0, 0], scale: [6, 6, 0.4] },
      ],
    },
  },
  {
    id: 'arena',
    title: 'Arena Blockout',
    body: 'Cover geometry and spawn ring for a combat level.',
    cover: '/art/game-arena.jpg',
    data: {
      env: { sky: '#0a0620', fog: 0.03, ambient: 0.4, sun: 0.9 },
      objects: [
        { id: 'floor', name: 'Arena Floor', type: 'cylinder', color: '#1a1258', metalness: 0.5, roughness: 0.4, position: [0, 0, 0], rotation: [0, 0, 0], scale: [16, 0.4, 16] },
        { id: 'cover', name: 'Cover Crate', type: 'box', color: '#4c1d95', metalness: 0.6, roughness: 0.35, position: [4, 1, 2], rotation: [0, 0.4, 0], scale: [3, 2, 3] },
        { id: 'core', name: 'Objective Core', type: 'sphere', color: '#22d3ee', metalness: 1, roughness: 0.1, position: [-4, 2, -2], rotation: [0, 0, 0], scale: [2, 2, 2] },
      ],
    },
  },
  {
    id: 'showcase',
    title: 'Product Showcase',
    body: 'Turntable pedestal with polished material studies.',
    cover: '/art/game-party.jpg',
    data: {
      env: { sky: '#08061f', fog: 0.01, ambient: 0.8, sun: 1.4 },
      objects: [
        { id: 'pedestal', name: 'Pedestal', type: 'cylinder', color: '#312e81', metalness: 0.9, roughness: 0.2, position: [0, 0.5, 0], rotation: [0, 0, 0], scale: [5, 1, 5] },
        { id: 'hero', name: 'Hero Object', type: 'torus', color: '#e879f9', metalness: 1, roughness: 0.05, position: [0, 3, 0], rotation: [1.2, 0.4, 0], scale: [3, 3, 3] },
      ],
    },
  },
];

export default function Create() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [tab, setTab] = useState('studio');
  const [creating, setCreating] = useState<string | null>(null);
  const [experienceOpen, setExperienceOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', type: 'quiz', cover: '/art/game-party.jpg', question: '', answer: '' });

  const projects = useAsync(() => (user ? api.get<{ projects: Project[] }>('/studio/projects') : Promise.resolve({ projects: [] })), [user?.id]);
  const gallery = useAsync(() => api.get<{ projects: GalleryProject[] }>('/studio/gallery'), []);

  const startProject = async (templateId: string) => {
    if (!user) {
      toast.push('Sign in to open the studio', 'error');
      return;
    }
    setCreating(templateId);
    try {
      const template = TEMPLATES.find((item) => item.id === templateId) ?? TEMPLATES[0];
      const created = await api.post<{ project: Project }>('/studio/projects', { title: `${template.title} ${new Date().toLocaleDateString()}`, data: template.data });
      toast.push('Project created', 'success');
      navigate(`/studio/${created.project.id}`);
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Could not create project', 'error');
    } finally {
      setCreating(null);
    }
  };

  const createExperience = async () => {
    if (form.title.trim().length < 3) {
      toast.push('Add a title for your creation', 'error');
      return;
    }
    setSaving(true);
    try {
      const questions = form.type === 'quiz' && form.question.trim()
        ? [{ prompt: form.question.trim(), options: form.answer.split(',').map((option) => option.trim()).filter(Boolean) }]
        : [];
      await api.post('/content/experiences', {
        title: form.title,
        description: form.description,
        type: form.type,
        coverUrl: form.cover,
        data: { questions },
        published: true,
      });
      toast.push('Creation published', 'success');
      setExperienceOpen(false);
      setForm({ title: '', description: '', type: 'quiz', cover: '/art/game-party.jpg', question: '', answer: '' });
      gallery.reload();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Could not publish creation', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Create"
        subtitle="NEXUS Game Studio (real Three.js scene editor), interactive experiences and your creator dashboard."
        action={<Link to="/create" className="btn-ghost text-xs" onClick={() => setTab('studio')}>Studio docs</Link>}
      />

      <Tabs
        tabs={[
          { id: 'studio', label: 'Game Studio' },
          { id: 'experiences', label: 'Experiences' },
          { id: 'projects', label: 'My projects' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'studio' && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {TEMPLATES.map((template) => (
              <article key={template.id} className="card group overflow-hidden">
                <div className="relative h-32 overflow-hidden">
                  <img src={template.cover} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" loading="lazy" />
                  <div className="absolute inset-0 bg-gradient-to-t from-midnight to-transparent" />
                </div>
                <div className="p-3">
                  <h3 className="font-display text-sm font-bold text-white">{template.title}</h3>
                  <p className="mt-1 line-clamp-2 text-[11px] text-muted">{template.body}</p>
                  <button type="button" className="btn-primary mt-2 w-full text-xs" onClick={() => startProject(template.id)} disabled={creating !== null}>
                    {creating === template.id ? 'Building…' : 'Use template'}
                  </button>
                </div>
              </article>
            ))}
          </div>
          <div className="card p-4">
            <h2 className="font-display text-sm font-semibold text-white">What the studio actually does</h2>
            <ul className="mt-2 grid gap-1.5 text-xs text-muted sm:grid-cols-2">
              <li>• Real Three.js WebGL viewport with orbit + fly camera.</li>
              <li>• Object hierarchy, add/duplicate/delete and transform gizmo values.</li>
              <li>• Material editor: base colour, metalness, roughness, emissive.</li>
              <li>• Environment: sky colour, fog density, ambient light, sun intensity.</li>
              <li>• Physics settings saved per project (gravity, restitution, body type).</li>
              <li>• Visual logic blocks (on start / on click / on collide → action).</li>
              <li>• Live preview mode, save, publish and shareable gallery link.</li>
              <li>• Every save is validated and scoped to your account server-side.</li>
            </ul>
          </div>
        </div>
      )}

      {tab === 'experiences' && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { type: 'quiz', title: 'Quiz', body: 'Scored multiple-choice rounds.' },
              { type: 'poll', title: 'Poll', body: 'Live community voting.' },
              { type: 'story', title: 'Interactive story', body: 'Branching scenes and endings.' },
              { type: 'challenge', title: 'Challenge', body: 'Timed creator challenges.' },
            ].map((option) => (
              <button
                key={option.type}
                type="button"
                onClick={() => {
                  setForm({ ...form, type: option.type });
                  setExperienceOpen(true);
                }}
                className="card p-4 text-left transition hover:border-violet-400/40"
              >
                <Badge tone="violet">{option.title}</Badge>
                <p className="mt-2 text-xs text-muted">{option.body}</p>
                <p className="mt-2 text-[11px] text-cyan-200">Start creating →</p>
              </button>
            ))}
          </div>
          {gallery.error && <ErrorNote message={gallery.error} onRetry={gallery.reload} />}
          {gallery.loading && <div className="grid gap-3 sm:grid-cols-3">{[0, 1, 2].map((key) => <Skeleton key={key} className="h-40 w-full" />)}</div>}
          {!gallery.loading && (gallery.data?.projects ?? []).length === 0 && <EmptyState title="No published projects yet" body="Save and publish a studio scene to appear in the gallery." />}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {(gallery.data?.projects ?? []).map((project) => (
              <article key={project.id} className="card overflow-hidden">
                <img src={project.cover || '/art/banner-2.jpg'} alt="" className="h-32 w-full object-cover" loading="lazy" />
                <div className="p-3">
                  <h3 className="truncate font-display text-sm font-bold text-white">{project.title}</h3>
                  <p className="text-[10px] text-muted">@{project.handle} · {timeAgo(project.updated_at)}</p>
                  <Link to={`/studio/${project.id}`} className="btn-ghost mt-2 w-full text-xs">Open scene</Link>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}

      {tab === 'projects' && (
        <div className="space-y-2">
          {!user && <EmptyState title="Sign in to save projects" body="Studio projects are tied to your account." action={<Link to="/login" className="btn-primary text-xs">Sign in</Link>} />}
          {user && projects.loading && <Skeleton className="h-32 w-full" />}
          {user && projects.error && <ErrorNote message={projects.error} onRetry={projects.reload} />}
          {user && !projects.loading && (projects.data?.projects ?? []).length === 0 && <EmptyState title="No projects yet" body="Pick a template to open the editor." />}
          {(projects.data?.projects ?? []).map((project) => (
            <div key={project.id} className="card flex items-center gap-2 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-white">{project.title}</p>
                <p className="text-[10px] text-muted">updated {timeAgo(project.updated_at)}</p>
              </div>
              <Badge tone={project.published ? 'cyan' : 'violet'}>{project.published ? 'published' : 'draft'}</Badge>
              <Link to={`/studio/${project.id}`} className="btn-ghost text-xs">Edit</Link>
            </div>
          ))}
        </div>
      )}

      <Modal open={experienceOpen} onClose={() => setExperienceOpen(false)} title="New interactive experience">
        <div className="space-y-3">
          <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value.slice(0, 80) })} placeholder="Title" className="input w-full" />
          <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value.slice(0, 400) })} placeholder="Description" className="input min-h-[70px] w-full resize-none" />
          <select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })} className="input w-full">
            {['quiz', 'poll', 'story', 'challenge'].map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
          {form.type === 'quiz' && (
            <>
              <input value={form.question} onChange={(event) => setForm({ ...form, question: event.target.value.slice(0, 200) })} placeholder="First question" className="input w-full" />
              <input value={form.answer} onChange={(event) => setForm({ ...form, answer: event.target.value })} placeholder="Options separated by commas" className="input w-full" />
            </>
          )}
          <div className="flex flex-wrap gap-2">
            {['/art/game-party.jpg', '/art/game-arena.jpg', '/art/game-parkour.jpg'].map((cover) => (
              <button key={cover} type="button" onClick={() => setForm({ ...form, cover })} className={`h-12 w-20 overflow-hidden rounded-lg border ${form.cover === cover ? 'border-cyan-300' : 'border-white/10'}`}>
                <img src={cover} alt="" className="h-full w-full object-cover" loading="lazy" />
              </button>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost text-xs" onClick={() => setExperienceOpen(false)}>Cancel</button>
            <button type="button" className="btn-primary text-xs" onClick={createExperience} disabled={saving}>{saving ? 'Publishing…' : 'Publish'}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
