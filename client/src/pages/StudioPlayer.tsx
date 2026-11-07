import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import * as THREE from 'three';
import { api } from '../lib/api';
import { ErrorNote, Spinner } from '../components/ui';
import { type SceneData, normaliseScene } from '../studio/types';
import { applyEnv, buildWorld, makeMesh, tickBehaviours, type WorldHandles } from '../studio/runtime';
import { ScriptSandbox, type SandboxOp } from '../studio/ScriptSandbox';

interface PublishedScene {
  title: string;
  slug: string;
  handle: string;
  display_name: string;
  updated_at: string;
  data: any;
}

export default function StudioPlayer() {
  const { slug = '' } = useParams();
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const worldRef = useRef<WorldHandles | null>(null);
  const dataRef = useRef<SceneData | null>(null);
  const keysRef = useRef<Set<string>>(new Set());
  const elapsedRef = useRef(0);
  const velocityRef = useRef(0);
  const runningRef = useRef(false);

  const [project, setProject] = useState<PublishedScene | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [runId, setRunId] = useState(0);
  const [logs, setLogs] = useState<{ text: string; level: 'info' | 'error' }[]>([]);
  const [running, setRunning] = useState(true);

  runningRef.current = running;

  useEffect(() => {
    let active = true;
    setLoading(true);
    api
      .get<{ project: PublishedScene }>(`/studio/gallery/${slug}`)
      .then((response) => {
        if (!active) return;
        setProject(response.project);
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
  }, [slug]);

  const data = project ? normaliseScene(project.data) : null;
  dataRef.current = data;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !data) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(data.camera.fov, mount.clientWidth / Math.max(1, mount.clientHeight), 0.1, 500);
    camera.position.set(0, 6, 12);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    mount.appendChild(renderer.domElement);

    const world = buildWorld(scene, data);
    applyEnv(scene, data, world);

    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;
    worldRef.current = world;

    const onResize = () => {
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
      if (runningRef.current) {
        elapsedRef.current += delta;
        tickBehaviours(data, world, elapsedRef.current, delta);
        const playerObject = data.objects.find((object) => object.type === 'player');
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
            0.08,
          );
          camera.lookAt(playerMesh.position.x, playerMesh.position.y + 1, playerMesh.position.z);
        }
      }
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
      world.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement);
      sceneRef.current = null;
      rendererRef.current = null;
      worldRef.current = null;
    };
  }, [data?.objects, data?.env, data?.camera.fov, Boolean(data)]);

  const handleOp = useCallback((op: SandboxOp) => {
    const world = worldRef.current;
    if (!world) return;
    const mesh = op.name ? world.byName.get(op.name) : undefined;
    switch (op.op) {
      case 'move':
        if (mesh) mesh.position.set(op.x ?? mesh.position.x, op.y ?? mesh.position.y, op.z ?? mesh.position.z);
        break;
      case 'rotate':
        if (mesh) {
          mesh.rotation.x += op.x ?? 0;
          mesh.rotation.y += op.y ?? 0;
          mesh.rotation.z += op.z ?? 0;
        }
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
        if (!op.name || !dataRef.current) break;
        const type = op.type ?? 'box';
        if (!['box', 'sphere', 'cylinder', 'torus', 'plane', 'player'].includes(type)) break;
        const template = dataRef.current.objects[0];
        if (!template) break;
        const spawned = makeMesh({
          ...template,
          id: `spawn_${Math.random().toString(36).slice(2, 8)}`,
          name: op.name,
          type: type as any,
          pos: [op.x ?? 0, op.y ?? 1, op.z ?? 0],
          rot: [0, 0, 0],
          scale: [1, 1, 1],
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

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }
  if (error || !project || !data) return <ErrorNote message={error ?? 'Scene not found'} />;

  const restart = () => {
    setLogs([]);
    setRunId((current) => current + 1);
    setRunning(true);
    elapsedRef.current = 0;
    velocityRef.current = 0;
    const scene = sceneRef.current;
    if (scene) {
      worldRef.current?.dispose();
      const world = buildWorld(scene, data);
      applyEnv(scene, data, world);
      worldRef.current = world;
    }
  };

  return (
    <div className="space-y-4">
      <ScriptSandbox
        runId={runId}
        running={running}
        script={data.script}
        onOp={handleOp}
        onLog={(text, level) => setLogs((current) => [...current.slice(-30), { text, level }])}
      />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-violet-300/80">Published scene</p>
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">{project.title}</h1>
          <p className="mt-1 text-sm text-white/50">
            by{' '}
            <Link to={`/u/${project.handle}`} className="text-cyan-300 hover:underline">
              {project.display_name}
            </Link>{' '}
            · built in NEXUS Studio
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn-ghost text-xs" onClick={() => setRunning((current) => !current)}>
            {running ? 'Pause' : 'Resume'}
          </button>
          <button type="button" className="btn-primary text-xs" onClick={restart}>
            Restart
          </button>
        </div>
      </div>

      <div className="card relative overflow-hidden p-0">
        <div ref={mountRef} className="h-[320px] w-full sm:h-[440px] lg:h-[520px]" />
        <div className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-[10px] uppercase tracking-wide text-emerald-300">
          WASD / arrows to move · space to jump
        </div>
        <div className="absolute bottom-3 left-3 grid grid-cols-3 gap-1 sm:hidden">
          {['w', 'a', 's', 'd']
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
      </div>

      {logs.length > 0 && (
        <div className="card p-3 font-mono text-[10px]">
          {logs.map((entry, index) => (
            <p key={index} className={entry.level === 'error' ? 'text-rose-300' : 'text-emerald-200/80'}>
              {entry.text}
            </p>
          ))}
        </div>
      )}

      <div className="card flex flex-wrap items-center gap-3 p-4 text-xs text-white/50">
        <span>Rendered live with Three.js WebGL — no pre-baked screenshots.</span>
        <Link to="/create" className="text-cyan-300 hover:underline">
          Make your own scene →
        </Link>
      </div>
    </div>
  );
}
