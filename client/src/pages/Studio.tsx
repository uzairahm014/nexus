import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { api, type Project } from '../lib/api';
import { ErrorNote, Spinner, useToast } from '../components/ui';
import {
  type Behavior,
  type PrimitiveType,
  type SceneData,
  type SceneObject,
  type Vec3,
  defaultScene,
  makeObject,
  normaliseScene,
} from '../studio/types';
import { applyEnv, buildWorld, makeMesh, tickBehaviours, type WorldHandles } from '../studio/runtime';
import { ScriptSandbox, type SandboxOp } from '../studio/ScriptSandbox';

type Panel = 'objects' | 'scene' | 'inspect' | 'logic';

const PRIMITIVES: { type: PrimitiveType; label: string; glyph: string }[] = [
  { type: 'box', label: 'Cube', glyph: '▣' },
  { type: 'sphere', label: 'Sphere', glyph: '●' },
  { type: 'cylinder', label: 'Cylinder', glyph: '▮' },
  { type: 'torus', label: 'Torus', glyph: '◎' },
  { type: 'plane', label: 'Platform', glyph: '▬' },
  { type: 'player', label: 'Player', glyph: '☗' },
];

function VecField({
  label,
  value,
  step = 0.1,
  onChange,
}: {
  label: string;
  value: Vec3;
  step?: number;
  onChange: (next: Vec3) => void;
}) {
  return (
    <div>
      <p className="label">{label}</p>
      <div className="grid grid-cols-3 gap-1">
        {(['X', 'Y', 'Z'] as const).map((axis, index) => (
          <label key={axis} className="flex items-center gap-1 rounded-lg bg-white/[0.04] px-1.5 py-1">
            <span className="text-[10px] font-semibold text-white/35">{axis}</span>
            <input
              type="number"
              step={step}
              value={Number(value[index].toFixed(3))}
              onChange={(event) => {
                const next = [...value] as Vec3;
                next[index] = Number(event.target.value) || 0;
                onChange(next);
              }}
              className="w-full bg-transparent text-[11px] text-white outline-none"
            />
          </label>
        ))}
      </div>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (next: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="label mb-0">{label}</p>
        <span className="text-[10px] text-white/40">{value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-1 h-1 w-full appearance-none rounded-full bg-white/10 accent-violet-500"
      />
    </div>
  );
}

export default function Studio() {
  const { id = '' } = useParams();
  const toast = useToast();
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const worldRef = useRef<WorldHandles | null>(null);
  const selectionRef = useRef<THREE.BoxHelper | null>(null);
  const sceneDataRef = useRef<SceneData>(defaultScene());
  const playingRef = useRef(false);
  const keysRef = useRef<Set<string>>(new Set());
  const elapsedRef = useRef(0);
  const velocityRef = useRef(0);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('Untitled Scene');
  const [data, setData] = useState<SceneData>(defaultScene());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);
  const [slug, setSlug] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [runId, setRunId] = useState(0);
  const [logs, setLogs] = useState<{ text: string; level: 'info' | 'error' }[]>([]);
  const [panel, setPanel] = useState<Panel>('objects');

  const selected = useMemo(() => data.objects.find((object) => object.id === selectedId) ?? null, [data.objects, selectedId]);

  sceneDataRef.current = data;
  playingRef.current = preview;

  const updateScene = useCallback((updater: (current: SceneData) => SceneData) => {
    setData((current) => updater(current));
    setDirty(true);
  }, []);

  const patchObject = useCallback(
    (objectId: string, patch: Partial<SceneObject>) => {
      updateScene((current) => ({
        ...current,
        objects: current.objects.map((object) => (object.id === objectId ? { ...object, ...patch } : object)),
      }));
    },
    [updateScene],
  );

  /* ------------------------------ load project ------------------------------ */
  useEffect(() => {
    let active = true;
    setLoading(true);
    api
      .get<{ project: Project & { data: any } }>(`/studio/projects/${id}`)
      .then((response) => {
        if (!active) return;
        setTitle(response.project.title);
        setPublished(Boolean(response.project.published));
        setSlug(response.project.slug ?? null);
        setData(normaliseScene(response.project.data));
        setLoading(false);
      })
      .catch((err: Error) => {
        if (!active) return;
        setError(err.message);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);

  /* ------------------------------ three.js setup ----------------------------- */
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, mount.clientWidth / Math.max(1, mount.clientHeight), 0.1, 500);
    camera.position.set(7, 6, 10);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 1, 0);
    controls.minDistance = 3;
    controls.maxDistance = 60;
    controls.maxPolarAngle = Math.PI / 2.05;

    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;
    controlsRef.current = controls;

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    const onPointerDown = (event: PointerEvent) => {
      if (playingRef.current) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const world = worldRef.current;
      if (!world) return;
      const hits = raycaster.intersectObjects([...world.meshes.values()], false);
      const hit = hits[0]?.object as THREE.Mesh | undefined;
      setSelectedId(hit?.userData?.id ?? null);
    };
    renderer.domElement.addEventListener('pointerdown', onPointerDown);

    const onResize = () => {
      if (!mount) return;
      const width = mount.clientWidth;
      const height = mount.clientHeight;
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    const observer = new ResizeObserver(onResize);
    observer.observe(mount);

    const keyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /INPUT|TEXTAREA|SELECT/.test(target.tagName)) return;
      keysRef.current.add(event.key.toLowerCase());
      if (event.key === ' ') event.preventDefault();
    };
    const keyUp = (event: KeyboardEvent) => keysRef.current.delete(event.key.toLowerCase());
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);

    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const delta = Math.min(0.05, (now - last) / 1000);
      last = now;

      if (playingRef.current) {
        elapsedRef.current += delta;
        const world = worldRef.current;
        const current = sceneDataRef.current;
        if (world) {
          tickBehaviours(current, world, elapsedRef.current, delta);
          const playerObject = current.objects.find((object) => object.type === 'player');
          const playerMesh = playerObject ? world.meshes.get(playerObject.id) : null;
          if (playerMesh) {
            const keys = keysRef.current;
            let dx = 0;
            let dz = 0;
            if (keys.has('w') || keys.has('arrowup')) dz -= 1;
            if (keys.has('s') || keys.has('arrowdown')) dz += 1;
            if (keys.has('a') || keys.has('arrowleft')) dx -= 1;
            if (keys.has('d') || keys.has('arrowright')) dx += 1;
            const length = Math.hypot(dx, dz) || 1;
            playerMesh.position.x = THREE.MathUtils.clamp(playerMesh.position.x + (dx / length) * 6 * delta, -18, 18);
            playerMesh.position.z = THREE.MathUtils.clamp(playerMesh.position.z + (dz / length) * 6 * delta, -18, 18);

            const jumping = keys.has(' ') || keys.has('space');
            velocityRef.current += (jumping ? 16 : -32) * delta;
            playerMesh.position.y = Math.max(1, playerMesh.position.y + velocityRef.current * delta);
            if (playerMesh.position.y <= 1) velocityRef.current = 0;

            camera.position.lerp(
              new THREE.Vector3(playerMesh.position.x, playerMesh.position.y + 5, playerMesh.position.z + 9),
              0.09,
            );
            camera.lookAt(playerMesh.position.x, playerMesh.position.y + 1, playerMesh.position.z);
          }
        }
      } else {
        controls.update();
      }
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      controls.dispose();
      selectionRef.current?.dispose();
      worldRef.current?.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
      sceneRef.current = null;
      rendererRef.current = null;
    };
  }, []);

  /* ------------------------------- world rebuild ----------------------------- */
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    worldRef.current?.dispose();
    const world = buildWorld(scene, data);
    applyEnv(scene, data, world);
    worldRef.current = world;

    const camera = cameraRef.current;
    if (camera && !preview) {
      camera.fov = data.camera.fov;
      camera.updateProjectionMatrix();
    }
  }, [data.objects, data.env, data.camera.fov, preview]);

  /* ------------------------------ selection halo ----------------------------- */
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (selectionRef.current) {
      scene.remove(selectionRef.current);
      selectionRef.current.dispose();
      selectionRef.current = null;
    }
    const mesh = selectedId ? worldRef.current?.meshes.get(selectedId) : null;
    if (mesh) {
      const helper = new THREE.BoxHelper(mesh, new THREE.Color('#22D3EE'));
      scene.add(helper);
      selectionRef.current = helper;
    }
  }, [selectedId, data.objects]);

  const startPreview = () => {
    setLogs([]);
    setRunId((current) => current + 1);
    setPreview(true);
    if (controlsRef.current) controlsRef.current.enabled = false;
    const scene = sceneRef.current;
    if (scene) {
      worldRef.current?.dispose();
      const world = buildWorld(scene, data);
      applyEnv(scene, data, world);
      worldRef.current = world;
    }
    elapsedRef.current = 0;
    velocityRef.current = 0;
    setPanel('logic');
  };

  const stopPreview = () => {
    setPreview(false);
    keysRef.current.clear();
    if (controlsRef.current) {
      controlsRef.current.enabled = true;
      controlsRef.current.target.set(0, 1, 0);
    }
    const camera = cameraRef.current;
    if (camera) {
      camera.position.set(7, 6, 10);
      camera.fov = data.camera.fov;
      camera.updateProjectionMatrix();
    }
    const scene = sceneRef.current;
    if (scene) {
      worldRef.current?.dispose();
      const world = buildWorld(scene, data);
      applyEnv(scene, data, world);
      worldRef.current = world;
    }
  };

  const handleOp = useCallback((op: SandboxOp) => {
    const world = worldRef.current;
    const scene = sceneRef.current;
    if (!world || !scene) return;
    const mesh = op.name ? world.byName.get(op.name) : undefined;
    switch (op.op) {
      case 'move':
        if (mesh) mesh.position.set(op.x ?? mesh.position.x, op.y ?? mesh.position.y, op.z ?? mesh.position.z);
        break;
      case 'rotate':
        if (mesh) mesh.rotation.x += op.x ?? 0, (mesh.rotation.y += op.y ?? 0), (mesh.rotation.z += op.z ?? 0);
        break;
      case 'scale':
        if (mesh) mesh.scale.set(op.x ?? mesh.scale.x, op.y ?? mesh.scale.y, op.z ?? mesh.scale.z);
        break;
      case 'color': {
        if (!mesh || typeof op.color !== 'string') break;
        const material = mesh.material as THREE.MeshStandardMaterial;
        const color = new THREE.Color(op.color);
        material.color.copy(color);
        material.emissive.copy(color).multiplyScalar(0.25);
        break;
      }
      case 'spawn': {
        if (!op.name) break;
        const type = (op.type ?? 'box') as PrimitiveType;
        if (!['box', 'sphere', 'cylinder', 'torus', 'plane', 'player'].includes(type)) break;
        const template = makeObject(type, 0);
        const spawned = makeMesh({
          ...template,
          name: op.name,
          pos: [op.x ?? 0, op.y ?? 1, op.z ?? 0],
          color: op.color ?? '#22D3EE',
        });
        world.group.add(spawned);
        world.byName.set(op.name, spawned);
        break;
      }
      case 'destroy': {
        if (!op.name) break;
        const target = world.byName.get(op.name);
        if (target) {
          world.group.remove(target);
          world.byName.delete(op.name);
        }
        break;
      }
      default:
        break;
    }
  }, []);

  const handleLog = useCallback((text: string, level: 'info' | 'error') => {
    setLogs((current) => [...current.slice(-40), { text, level }]);
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const response = await api.put<{ savedAt: string }>(`/studio/projects/${id}`, { title, data });
      setSavedAt(response.savedAt);
      setDirty(false);
      toast.push('Scene saved to your library.', 'success');
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Could not save scene', 'error');
    } finally {
      setSaving(false);
    }
  };

  const publish = async () => {
    setPublishing(true);
    try {
      await api.put(`/studio/projects/${id}`, { title, data });
      const response = await api.post<{ published: boolean; slug: string | null }>(`/studio/projects/${id}/publish`, {
        published: !published,
      });
      setPublished(response.published);
      setSlug(response.slug);
      setDirty(false);
      toast.push(response.published ? 'Published — your scene has a public link.' : 'Scene unpublished.', 'success');
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Could not publish', 'error');
    } finally {
      setPublishing(false);
    }
  };

  const addObject = (type: PrimitiveType) => {
    const object = makeObject(type, data.objects.length);
    updateScene((current) => ({ ...current, objects: [...current.objects, object] }));
    setSelectedId(object.id);
    setPanel('inspect');
  };

  const duplicateSelected = () => {
    if (!selected) return;
    const copy: SceneObject = {
      ...selected,
      id: `obj_${Math.random().toString(36).slice(2, 9)}`,
      name: `${selected.name} copy`,
      pos: [selected.pos[0] + 1, selected.pos[1], selected.pos[2] + 1],
    };
    updateScene((current) => ({ ...current, objects: [...current.objects, copy] }));
    setSelectedId(copy.id);
  };

  const deleteSelected = () => {
    if (!selected) return;
    updateScene((current) => ({ ...current, objects: current.objects.filter((object) => object.id !== selected.id) }));
    setSelectedId(null);
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }
  if (error) return <ErrorNote message={error} />;

  const tab = (key: Panel, label: string) => (
    <button
      key={key}
      type="button"
      onClick={() => setPanel(key)}
      className={`rounded-full px-3 py-1.5 text-[11px] font-medium transition lg:hidden ${
        panel === key ? 'bg-violet-500/25 text-white' : 'text-white/50'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-3">
      <ScriptSandbox runId={runId} running={preview} script={data.script} onOp={handleOp} onLog={handleLog} />

      <div className="flex flex-wrap items-center gap-2">
        <Link to="/create" className="btn-ghost text-xs">
          ← Creator hub
        </Link>
        <input
          value={title}
          onChange={(event) => {
            setTitle(event.target.value.slice(0, 80));
            setDirty(true);
          }}
          className="input max-w-[240px] flex-1 text-sm font-semibold"
          aria-label="Project title"
        />
        <span className={`text-[11px] ${dirty ? 'text-amber-300' : 'text-white/40'}`}>
          {dirty ? 'Unsaved changes' : savedAt ? `Saved ${new Date(savedAt).toLocaleTimeString()}` : 'Saved'}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button type="button" className="btn-ghost text-xs" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            className={preview ? 'btn-ghost text-xs' : 'btn-primary text-xs'}
            onClick={preview ? stopPreview : startPreview}
          >
            {preview ? '■ Stop preview' : '▶ Play preview'}
          </button>
          <button type="button" className="btn-primary text-xs" onClick={publish} disabled={publishing}>
            {publishing ? 'Working…' : published ? 'Unpublish' : 'Publish'}
          </button>
        </div>
      </div>

      {published && slug && (
        <div className="card flex flex-wrap items-center gap-2 px-3 py-2 text-xs">
          <span className="text-emerald-300">Live scene</span>
          <Link to={`/scene/${slug}`} className="text-cyan-300 underline">
            /scene/{slug}
          </Link>
          <span className="text-white/40">Published scenes are playable by anyone, without an account.</span>
        </div>
      )}

      <div className="flex gap-1.5 lg:hidden">
        {tab('objects', 'Objects')}
        {tab('scene', 'World')}
        {tab('inspect', 'Inspector')}
        {tab('logic', 'Logic')}
      </div>

      <div className="grid gap-3 lg:grid-cols-[232px_minmax(0,1fr)_296px]">
        {/* left: primitives + hierarchy */}
        <div className={`${panel === 'objects' ? 'block' : 'hidden'} space-y-3 lg:block`}>
          <div className="card p-3">
            <p className="label">Add to scene</p>
            <div className="grid grid-cols-3 gap-1.5">
              {PRIMITIVES.map((primitive) => (
                <button
                  key={primitive.type}
                  type="button"
                  onClick={() => addObject(primitive.type)}
                  className="rounded-xl border border-white/8 bg-white/[0.03] py-2 text-center transition hover:border-violet-400/40 hover:bg-violet-500/10"
                >
                  <span className="block text-base leading-none text-violet-200">{primitive.glyph}</span>
                  <span className="mt-1 block text-[9px] uppercase tracking-wide text-white/45">{primitive.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/5 px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-white/45">Hierarchy</p>
              <span className="text-[10px] text-white/30">{data.objects.length}</span>
            </div>
            <div className="max-h-[280px] overflow-y-auto">
              {data.objects.map((object) => (
                <button
                  key={object.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(object.id);
                    setPanel('inspect');
                  }}
                  className={`flex w-full items-center gap-2 border-b border-white/[0.04] px-3 py-2 text-left text-[11px] transition ${
                    object.id === selectedId ? 'bg-cyan-400/10 text-white' : 'text-white/60 hover:bg-white/[0.03]'
                  }`}
                >
                  <span className="text-white/30">{object.type === 'player' ? '☗' : '▣'}</span>
                  <span className="truncate">{object.name}</span>
                </button>
              ))}
              {data.objects.length === 0 && <p className="px-3 py-4 text-[11px] text-white/35">Scene is empty — add a primitive.</p>}
            </div>
          </div>
        </div>

        {/* center: viewport */}
        <div className="space-y-3">
          <div className="card relative overflow-hidden p-0">
            <div ref={mountRef} className="h-[360px] w-full sm:h-[440px] lg:h-[520px]" />
            {preview && (
              <>
                <div className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-[10px] uppercase tracking-wide text-emerald-300">
                  Preview · WASD to move · Space to jump
                </div>
                <div className="absolute bottom-3 left-3 grid grid-cols-3 gap-1 sm:hidden">
                  {[
                    ['', 'w', ''],
                    ['a', 's', 'd'],
                  ]
                    .flat()
                    .filter(Boolean)
                    .map((key) => (
                      <button
                        key={key}
                        type="button"
                        className="h-11 w-11 rounded-xl border border-white/15 bg-black/55 text-sm font-semibold text-white active:bg-violet-500/40"
                        onPointerDown={(event) => {
                          event.preventDefault();
                          keysRef.current.add(key);
                        }}
                        onPointerUp={() => keysRef.current.delete(key)}
                        onPointerLeave={() => keysRef.current.delete(key)}
                      >
                        {key.toUpperCase()}
                      </button>
                    ))}
                </div>
                <button
                  type="button"
                  className="absolute bottom-3 right-3 h-12 w-12 rounded-full border border-white/15 bg-black/55 text-xs font-semibold text-white active:bg-violet-500/40 sm:hidden"
                  onPointerDown={(event) => {
                    event.preventDefault();
                    keysRef.current.add(' ');
                  }}
                  onPointerUp={() => keysRef.current.delete(' ')}
                >
                  Jump
                </button>
              </>
            )}
            {!preview && (
              <div className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-black/50 px-2.5 py-1 text-[10px] text-white/45">
                Drag to orbit · scroll to zoom · click an object to select
              </div>
            )}
          </div>

          <div className={`${panel === 'logic' ? 'block' : 'hidden'} card p-3 lg:block`}>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-white/45">Game logic (sandboxed)</p>
              <span className="rounded-full bg-emerald-400/10 px-2 py-0.5 text-[9px] uppercase tracking-wide text-emerald-300">
                isolated iframe
              </span>
              <div className="ml-auto flex gap-1.5">
                <button
                  type="button"
                  className="btn-ghost text-[11px]"
                  onClick={() => {
                    setRunId((current) => current + 1);
                    setLogs([]);
                    toast.push('Script restarted.', 'success');
                  }}
                >
                  Restart script
                </button>
                <button type="button" className="btn-ghost text-[11px]" onClick={() => setLogs([])}>
                  Clear log
                </button>
              </div>
            </div>
            <textarea
              value={data.script}
              onChange={(event) => updateScene((current) => ({ ...current, script: event.target.value.slice(0, 20000) }))}
              spellCheck={false}
              rows={9}
              className="mt-2 w-full resize-y rounded-xl border border-white/8 bg-black/50 p-3 font-mono text-[11px] leading-relaxed text-cyan-100 outline-none focus:border-violet-400/50"
            />
            <div className="mt-2 max-h-28 overflow-y-auto rounded-xl bg-black/40 p-2 font-mono text-[10px]">
              {logs.length === 0 && <p className="text-white/30">No script output yet. Press “Play preview” to run your logic.</p>}
              {logs.map((entry, index) => (
                <p key={index} className={entry.level === 'error' ? 'text-rose-300' : 'text-emerald-200/80'}>
                  {entry.text}
                </p>
              ))}
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-white/35">
              Scripts run with an opaque origin inside a sandboxed frame: no DOM, cookies or storage access. They can only call the
              NEXUS scene API, which is validated here before touching the scene.
            </p>
          </div>
        </div>

        {/* right: inspector / world */}
        <div className="space-y-3">
          <div className={`${panel === 'inspect' ? 'block' : 'hidden'} card space-y-3 p-3 lg:block`}>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-white/45">Inspector</p>
            {!selected && <p className="text-[11px] text-white/35">Select an object in the viewport or hierarchy.</p>}
            {selected && (
              <div className="space-y-3">
                <div>
                  <p className="label">Name</p>
                  <input
                    value={selected.name}
                    onChange={(event) => patchObject(selected.id, { name: event.target.value.slice(0, 40) })}
                    className="input text-xs"
                  />
                </div>
                <VecField label="Position" value={selected.pos} onChange={(pos) => patchObject(selected.id, { pos })} />
                <VecField
                  label="Rotation (rad)"
                  value={selected.rot}
                  step={0.05}
                  onChange={(rot) => patchObject(selected.id, { rot })}
                />
                <VecField label="Scale" value={selected.scale} step={0.1} onChange={(scale) => patchObject(selected.id, { scale })} />

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="label">Material</p>
                    <input
                      type="color"
                      value={selected.color}
                      onChange={(event) => patchObject(selected.id, { color: event.target.value })}
                      className="h-8 w-full cursor-pointer rounded-lg border border-white/10 bg-transparent"
                    />
                  </div>
                  <div>
                    <p className="label">Behaviour</p>
                    <select
                      value={selected.behavior}
                      onChange={(event) => patchObject(selected.id, { behavior: event.target.value as Behavior })}
                      className="input text-xs"
                    >
                      <option value="none">Static</option>
                      <option value="spin">Spin</option>
                      <option value="bob">Bob</option>
                    </select>
                  </div>
                </div>

                <Slider
                  label="Glow"
                  value={selected.emissive}
                  min={0}
                  max={1.5}
                  step={0.05}
                  onChange={(emissive) => patchObject(selected.id, { emissive })}
                />
                <Slider
                  label="Metalness"
                  value={selected.metalness}
                  min={0}
                  max={1}
                  step={0.05}
                  onChange={(metalness) => patchObject(selected.id, { metalness })}
                />
                <Slider
                  label="Roughness"
                  value={selected.roughness}
                  min={0}
                  max={1}
                  step={0.05}
                  onChange={(roughness) => patchObject(selected.id, { roughness })}
                />
                <Slider
                  label="Behaviour speed"
                  value={selected.speed}
                  min={0}
                  max={4}
                  step={0.1}
                  onChange={(speed) => patchObject(selected.id, { speed })}
                />

                <label className="flex items-center justify-between rounded-xl bg-white/[0.04] px-3 py-2 text-[11px] text-white/70">
                  Physics collider
                  <input
                    type="checkbox"
                    checked={selected.physics}
                    onChange={(event) => patchObject(selected.id, { physics: event.target.checked })}
                    className="h-4 w-4 accent-violet-500"
                  />
                </label>

                <div className="flex gap-2">
                  <button type="button" className="btn-ghost flex-1 text-[11px]" onClick={duplicateSelected}>
                    Duplicate
                  </button>
                  <button type="button" className="btn-ghost flex-1 text-[11px] text-rose-300" onClick={deleteSelected}>
                    Delete
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className={`${panel === 'scene' ? 'block' : 'hidden'} card space-y-3 p-3 lg:block`}>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-white/45">Environment</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="label">Background</p>
                <input
                  type="color"
                  value={data.env.background}
                  onChange={(event) => updateScene((current) => ({ ...current, env: { ...current.env, background: event.target.value } }))}
                  className="h-8 w-full cursor-pointer rounded-lg border border-white/10 bg-transparent"
                />
              </div>
              <div>
                <p className="label">Sun colour</p>
                <input
                  type="color"
                  value={data.env.sunColor}
                  onChange={(event) => updateScene((current) => ({ ...current, env: { ...current.env, sunColor: event.target.value } }))}
                  className="h-8 w-full cursor-pointer rounded-lg border border-white/10 bg-transparent"
                />
              </div>
            </div>
            <Slider
              label="Fog"
              value={data.env.fog}
              min={0}
              max={0.2}
              step={0.005}
              onChange={(fog) => updateScene((current) => ({ ...current, env: { ...current.env, fog } }))}
            />
            <Slider
              label="Ambient light"
              value={data.env.ambient}
              min={0}
              max={2}
              step={0.05}
              onChange={(ambient) => updateScene((current) => ({ ...current, env: { ...current.env, ambient } }))}
            />
            <Slider
              label="Key light"
              value={data.env.sun}
              min={0}
              max={4}
              step={0.1}
              onChange={(sun) => updateScene((current) => ({ ...current, env: { ...current.env, sun } }))}
            />
            <label className="flex items-center justify-between rounded-xl bg-white/[0.04] px-3 py-2 text-[11px] text-white/70">
              Show grid
              <input
                type="checkbox"
                checked={data.env.grid}
                onChange={(event) => updateScene((current) => ({ ...current, env: { ...current.env, grid: event.target.checked } }))}
                className="h-4 w-4 accent-violet-500"
              />
            </label>
            <Slider
              label="Camera FOV"
              value={data.camera.fov}
              min={30}
              max={90}
              step={1}
              onChange={(fov) => updateScene((current) => ({ ...current, camera: { ...current.camera, fov } }))}
            />
            <div className="rounded-xl bg-white/[0.03] p-2 text-[10px] leading-relaxed text-white/40">
              Lighting, fog and materials render in real time with Three.js WebGL. Physics colliders are stored per object and used by
              the preview player controller.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
