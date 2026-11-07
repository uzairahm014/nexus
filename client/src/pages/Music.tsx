import { useMemo, useState } from 'react';
import { api, type Track } from '../lib/api';
import { useAuth } from '../lib/session';
import { Badge, EmptyState, ErrorNote, SectionHeader, Skeleton, Tabs, useAsync, useToast } from '../components/ui';
import { TrackCard } from '../components/cards';
import { duration } from '../lib/format';

interface Playlist {
  id: string;
  title: string;
  description: string;
  cover_url: string;
  track_count: number;
  handle?: string;
}

export default function Music() {
  const { user } = useAuth();
  const toast = useToast();
  const [genre, setGenre] = useState('all');
  const [playlistId, setPlaylistId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const library = useAsync(() => api.get<{ tracks: Track[]; genres: string[]; playlists: Playlist[] }>('/content/music'), []);
  const playlist = useAsync(async () => {
    if (!playlistId) return null;
    return api.get<{ playlist: Playlist; tracks: Track[] }>(`/content/playlists/${playlistId}`);
  }, [playlistId]);

  const genres = useMemo(() => ['all', ...(library.data?.genres ?? [])], [library.data]);
  const tracks = useMemo(() => {
    const all = library.data?.tracks ?? [];
    return genre === 'all' ? all : all.filter((track) => track.genre === genre);
  }, [library.data, genre]);

  const createPlaylist = async () => {
    if (title.trim().length < 2) return;
    setSaving(true);
    try {
      const response = await api.post<{ playlist: Playlist }>('/content/playlists', { title });
      setTitle('');
      toast.push('Playlist created', 'success');
      library.reload();
      setPlaylistId(response.playlist.id);
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Could not create playlist', 'error');
    } finally {
      setSaving(false);
    }
  };

  const addToPlaylist = async (track: Track) => {
    if (!playlistId) {
      toast.push('Select or create a playlist first', 'error');
      return;
    }
    try {
      await api.post(`/content/playlists/${playlistId}/tracks`, { trackId: track.id });
      toast.push('Added to playlist', 'success');
      playlist.reload();
      library.reload();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Could not add track', 'error');
    }
  };

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Music"
        subtitle="Discovery and playlists with official embeds. NEXUS never hosts unlicensed audio."
        action={<Badge tone="cyan">Official embeds</Badge>}
      />

      <div className="flex flex-wrap gap-2">
        {genres.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setGenre(item)}
            className={`rounded-full border px-3 py-1.5 text-xs capitalize transition ${
              genre === item ? 'border-cyan-300/60 bg-cyan-400/15 text-cyan-100' : 'border-white/10 text-white/60 hover:text-white'
            }`}
          >
            {item}
          </button>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          {library.loading && <div className="grid gap-3 sm:grid-cols-2">{[0, 1, 2, 3].map((key) => <Skeleton key={key} className="h-28 w-full" />)}</div>}
          {library.error && <ErrorNote message={library.error} onRetry={library.reload} />}
          {!library.loading && tracks.length === 0 && <EmptyState title="Nothing in this genre yet" body="Try another genre or add your own discovery entry." />}
          <div className="grid gap-3 sm:grid-cols-2">
            {tracks.map((track) => (
              <div key={track.id} className="relative">
                <TrackCard track={track} />
                <button
                  type="button"
                  onClick={() => addToPlaylist(track)}
                  className="absolute right-3 top-3 rounded-full bg-black/60 px-2 py-1 text-[10px] text-white/80 backdrop-blur hover:bg-black/80"
                  aria-label={`Add ${track.title} to playlist`}
                >
                  + playlist
                </button>
              </div>
            ))}
          </div>
        </div>

        <aside className="space-y-4">
          <div className="card p-4">
            <h2 className="font-display text-sm font-semibold text-white">Your playlists</h2>
            {user ? (
              <div className="mt-2 flex gap-2">
                <input value={title} onChange={(event) => setTitle(event.target.value.slice(0, 60))} placeholder="New playlist" className="input flex-1 text-xs" />
                <button type="button" className="btn-ghost text-xs" onClick={createPlaylist} disabled={saving || !title.trim()}>Add</button>
              </div>
            ) : (
              <p className="mt-1 text-xs text-muted">Sign in to build playlists.</p>
            )}
            <div className="mt-3 space-y-2">
              {(library.data?.playlists ?? []).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setPlaylistId(item.id)}
                  className={`flex w-full items-center gap-2 rounded-xl border px-2 py-2 text-left transition ${
                    playlistId === item.id ? 'border-cyan-300/50 bg-cyan-400/10' : 'border-white/10 hover:border-white/20'
                  }`}
                >
                  <img src={item.cover_url} alt="" className="h-9 w-9 rounded-md object-cover" loading="lazy" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-white">{item.title}</p>
                    <p className="text-[10px] text-muted">{item.track_count ?? 0} tracks</p>
                  </div>
                </button>
              ))}
              {(library.data?.playlists.length ?? 0) === 0 && <p className="text-xs text-muted">No playlists yet.</p>}
            </div>
          </div>

          {playlistId && (
            <div className="card p-4">
              <h2 className="font-display text-sm font-semibold text-white">{playlist.data?.playlist.title ?? 'Playlist'}</h2>
              <p className="mt-0.5 text-[11px] text-muted">{playlist.data?.playlist.description || 'Your saved tracks'}</p>
              <div className="mt-2 divide-y divide-white/5">
                {(playlist.data?.tracks ?? []).map((track) => (
                  <div key={track.id} className="flex items-center justify-between gap-2 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs text-white">{track.title}</p>
                      <p className="truncate text-[10px] text-muted">{track.artist}</p>
                    </div>
                    <span className="text-[10px] text-muted">{duration(track.duration)}</span>
                  </div>
                ))}
                {(playlist.data?.tracks.length ?? 0) === 0 && <p className="py-2 text-xs text-muted">Empty — add tracks with the + button.</p>}
              </div>
            </div>
          )}

          <div className="card p-4">
            <h2 className="font-display text-sm font-semibold text-white">Licensing</h2>
            <p className="mt-1.5 text-xs leading-relaxed text-muted">
              Tracks link to official platform embeds. NEXUS stores metadata only — no audio files are re-hosted, so creators keep their rights.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
