import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

export interface GameProps {
  paused: boolean;
  quality: 'low' | 'high';
  onFinish: (result: { score: number; meta: string }) => void;
  onProgress?: (data: Record<string, unknown>) => void;
}

const ROAD_RADIUS = 64;
const ROAD_WIDTH = 20;
const TOTAL_LAPS = 3;

interface Car {
  mesh: THREE.Group;
  speed: number;
  heading: number;
  x: number;
  z: number;
  ai: boolean;
  angle: number;
  lane: number;
  aiSpeed: number;
}

function createCar(color: number, glow: number) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(2.1, 0.7, 4.4),
    new THREE.MeshStandardMaterial({ color, metalness: 0.85, roughness: 0.25, emissive: glow, emissiveIntensity: 0.35 }),
  );
  body.position.y = 0.55;
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 0.55, 1.9),
    new THREE.MeshStandardMaterial({ color: 0x0a0820, metalness: 0.6, roughness: 0.1, emissive: glow, emissiveIntensity: 0.55 }),
  );
  cabin.position.set(0, 1.05, -0.2);
  const wing = new THREE.Mesh(
    new THREE.BoxGeometry(2.3, 0.12, 0.6),
    new THREE.MeshStandardMaterial({ color: glow, emissive: glow, emissiveIntensity: 1.4 }),
  );
  wing.position.set(0, 1.2, -2);
  const wheels = new THREE.Group();
  const wheelGeometry = new THREE.CylinderGeometry(0.45, 0.45, 0.35, 12);
  const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x08060f, roughness: 0.9 });
  [
    [-1.05, 0.42, 1.45],
    [1.05, 0.42, 1.45],
    [-1.05, 0.42, -1.45],
    [1.05, 0.42, -1.45],
  ].forEach(([x, y, z]) => {
    const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, y, z);
    wheels.add(wheel);
  });
  group.add(body, cabin, wing, wheels);
  return group;
}

export default function NeonRacer({ paused, quality, onFinish, onProgress }: GameProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const pausedRef = useRef(paused);
  const controlsRef = useRef({ throttle: false, brake: false, left: false, right: false });
  const [hud, setHud] = useState({ speed: 0, lap: 1, time: 0, best: 0, progress: 0 });
  const [touch, setTouch] = useState(false);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    setTouch(window.matchMedia('(hover: none) and (pointer: coarse)').matches);
  }, []);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05030f);
    scene.fog = new THREE.FogExp2(0x05030f, 0.011);

    const camera = new THREE.PerspectiveCamera(68, mount.clientWidth / Math.max(1, mount.clientHeight), 0.1, 900);
    const renderer = new THREE.WebGLRenderer({ antialias: quality === 'high', powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality === 'high' ? 2 : 1.25));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.shadowMap.enabled = quality === 'high';
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.touchAction = 'none';

    /* ---------------------------------- lights --------------------------------- */
    scene.add(new THREE.HemisphereLight(0x8b5cf6, 0x0a0820, 1.15));
    const key = new THREE.DirectionalLight(0xc4b5fd, 1.5);
    key.position.set(40, 90, 30);
    key.castShadow = quality === 'high';
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.far = 260;
    scene.add(key);
    const rimA = new THREE.PointLight(0x22d3ee, 260, 220);
    rimA.position.set(ROAD_RADIUS, 26, 0);
    const rimB = new THREE.PointLight(0xd946ef, 260, 220);
    rimB.position.set(-ROAD_RADIUS, 26, 0);
    scene.add(rimA, rimB);

    /* ---------------------------------- ground --------------------------------- */
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(900, 900),
      new THREE.MeshStandardMaterial({ color: 0x0a0720, roughness: 0.55, metalness: 0.35 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = quality === 'high';
    scene.add(ground);

    const grid = new THREE.GridHelper(900, 120, 0x2a1a6b, 0x160f3d);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.5;
    grid.position.y = 0.02;
    scene.add(grid);

    /* ----------------------------------- road ---------------------------------- */
    const road = new THREE.Mesh(
      new THREE.RingGeometry(ROAD_RADIUS - ROAD_WIDTH / 2, ROAD_RADIUS + ROAD_WIDTH / 2, 160, 1),
      new THREE.MeshStandardMaterial({ color: 0x141033, roughness: 0.35, metalness: 0.6 }),
    );
    road.rotation.x = -Math.PI / 2;
    road.position.y = 0.05;
    road.receiveShadow = quality === 'high';
    scene.add(road);

    const edgeMaterial = new THREE.MeshBasicMaterial({ color: 0x22d3ee });
    const innerEdge = new THREE.Mesh(new THREE.RingGeometry(ROAD_RADIUS - ROAD_WIDTH / 2 - 0.35, ROAD_RADIUS - ROAD_WIDTH / 2, 180, 1), edgeMaterial);
    innerEdge.rotation.x = -Math.PI / 2;
    innerEdge.position.y = 0.09;
    scene.add(innerEdge);
    const outerEdge = new THREE.Mesh(
      new THREE.RingGeometry(ROAD_RADIUS + ROAD_WIDTH / 2, ROAD_RADIUS + ROAD_WIDTH / 2 + 0.35, 180, 1),
      new THREE.MeshBasicMaterial({ color: 0xd946ef }),
    );
    outerEdge.rotation.x = -Math.PI / 2;
    outerEdge.position.y = 0.09;
    scene.add(outerEdge);

    // lane dashes
    const dashGeometry = new THREE.BoxGeometry(0.32, 0.06, 2.6);
    const dashMaterial = new THREE.MeshBasicMaterial({ color: 0xf5f3ff });
    const dashes = new THREE.InstancedMesh(dashGeometry, dashMaterial, 96);
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < 96; i += 1) {
      const angle = (i / 96) * Math.PI * 2;
      const position = new THREE.Vector3(Math.cos(angle) * ROAD_RADIUS, 0.1, Math.sin(angle) * ROAD_RADIUS);
      quaternion.setFromEuler(new THREE.Euler(0, -angle, 0));
      matrix.compose(position, quaternion, scale);
      dashes.setMatrixAt(i, matrix);
    }
    scene.add(dashes);

    /* -------------------------------- cityscape -------------------------------- */
    const buildingCount = quality === 'high' ? 130 : 70;
    const buildingGeometry = new THREE.BoxGeometry(1, 1, 1);
    const palette = [0x1b1450, 0x241a63, 0x140f3c, 0x2a1b74];
    const buildings = new THREE.InstancedMesh(
      buildingGeometry,
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.7, vertexColors: false }),
      buildingCount,
    );
    buildings.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(buildingCount * 3), 3);
    const color = new THREE.Color();
    for (let i = 0; i < buildingCount; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const inner = Math.random() > 0.45;
      const radius = inner
        ? ROAD_RADIUS - ROAD_WIDTH / 2 - 14 - Math.random() * 46
        : ROAD_RADIUS + ROAD_WIDTH / 2 + 14 + Math.random() * 60;
      const height = 8 + Math.random() * (inner ? 46 : 90);
      const width = 6 + Math.random() * 10;
      const position = new THREE.Vector3(Math.cos(angle) * radius, height / 2, Math.sin(angle) * radius);
      quaternion.setFromEuler(new THREE.Euler(0, -angle, 0));
      matrix.compose(position, quaternion, new THREE.Vector3(width, height, width));
      buildings.setMatrixAt(i, matrix);
      color.setHex(palette[i % palette.length]);
      buildings.setColorAt(i, color);
    }
    buildings.instanceMatrix.needsUpdate = true;
    if (buildings.instanceColor) buildings.instanceColor.needsUpdate = true;
    scene.add(buildings);

    // neon window strips on the inner skyline
    const stripMaterial = new THREE.MeshBasicMaterial({ color: 0x7c3aed });
    for (let i = 0; i < (quality === 'high' ? 26 : 12); i += 1) {
      const angle = (i / 26) * Math.PI * 2;
      const radius = ROAD_RADIUS - ROAD_WIDTH / 2 - 22;
      const height = 26 + (i % 5) * 12;
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.6, height, 0.6), stripMaterial);
      strip.position.set(Math.cos(angle) * radius, height / 2, Math.sin(angle) * radius);
      scene.add(strip);
      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(1.1, 10, 10),
        new THREE.MeshBasicMaterial({ color: i % 2 ? 0x22d3ee : 0xf472b6 }),
      );
      cap.position.set(strip.position.x, height + 1, strip.position.z);
      scene.add(cap);
    }

    // start/finish gate
    const gate = new THREE.Group();
    const postMaterial = new THREE.MeshStandardMaterial({ color: 0x0d0a26, emissive: 0x7c3aed, emissiveIntensity: 0.8 });
    [-1, 1].forEach((side) => {
      const post = new THREE.Mesh(new THREE.BoxGeometry(1.1, 12, 1.1), postMaterial);
      post.position.set(ROAD_RADIUS + side * (ROAD_WIDTH / 2 + 1.2), 6, 0);
      gate.add(post);
    });
    const beam = new THREE.Mesh(
      new THREE.BoxGeometry(ROAD_WIDTH + 3.4, 0.9, 1.1),
      new THREE.MeshStandardMaterial({ color: 0x22d3ee, emissive: 0x22d3ee, emissiveIntensity: 1.6 }),
    );
    beam.position.set(ROAD_RADIUS, 12, 0);
    gate.add(beam);
    scene.add(gate);

    /* ----------------------------------- cars ---------------------------------- */
    const player: Car = { mesh: createCar(0x22d3ee, 0x22d3ee), speed: 0, heading: 0, x: ROAD_RADIUS, z: 0, ai: false, angle: 0, lane: 0, aiSpeed: 0 };
    player.mesh.position.set(player.x, 0, player.z);
    scene.add(player.mesh);

    const opponents: Car[] = [
      { mesh: createCar(0xd946ef, 0xd946ef), speed: 0, heading: 0, x: 0, z: 0, ai: true, angle: 1.2, lane: -4, aiSpeed: 30 },
      { mesh: createCar(0xf59e0b, 0xf59e0b), speed: 0, heading: 0, x: 0, z: 0, ai: true, angle: 3.4, lane: 4, aiSpeed: 33 },
      { mesh: createCar(0x818cf8, 0x818cf8), speed: 0, heading: 0, x: 0, z: 0, ai: true, angle: 5.1, lane: 0, aiSpeed: 27 },
    ];
    opponents.forEach((car) => scene.add(car.mesh));

    /* -------------------------------- input ------------------------------------ */
    const setKey = (event: KeyboardEvent, down: boolean) => {
      const map: Record<string, keyof typeof controlsRef.current> = {
        ArrowUp: 'throttle', KeyW: 'throttle',
        ArrowDown: 'brake', KeyS: 'brake',
        ArrowLeft: 'left', KeyA: 'left',
        ArrowRight: 'right', KeyD: 'right',
      };
      const control = map[event.code];
      if (!control) return;
      event.preventDefault();
      controlsRef.current[control] = down;
    };
    const onKeyDown = (event: KeyboardEvent) => setKey(event, true);
    const onKeyUp = (event: KeyboardEvent) => setKey(event, false);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    const onResize = () => {
      if (!mountRef.current) return;
      const width = mountRef.current.clientWidth;
      const height = Math.max(1, mountRef.current.clientHeight);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    window.addEventListener('resize', onResize);

    /* ---------------------------------- loop ----------------------------------- */
    let raf = 0;
    let last = performance.now();
    let elapsed = 0;
    let totalAngle = 0;
    let bestLap = 0;
    let lapStart = 0;
    let finished = false;
    let hudTimer = 0;

    const clockStart = performance.now();
    void clockStart;

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const rawDelta = (now - last) / 1000;
      last = now;
      const delta = Math.min(0.05, rawDelta);

      if (!pausedRef.current && !finished) {
        elapsed += delta;

        /* player physics */
        const controls = controlsRef.current;
        const maxSpeed = 46;
        if (controls.throttle) player.speed += 26 * delta;
        else if (controls.brake) player.speed -= 40 * delta;
        else player.speed -= 9 * delta;
        player.speed = THREE.MathUtils.clamp(player.speed, -8, maxSpeed);

        const distanceFromCenter = Math.hypot(player.x, player.z);
        const onRoad = Math.abs(distanceFromCenter - ROAD_RADIUS) < ROAD_WIDTH / 2;
        if (!onRoad) player.speed *= 1 - 2.2 * delta;

        const steerRate = 2.1 * Math.min(1, Math.abs(player.speed) / 16);
        if (controls.left) player.heading += steerRate * delta * Math.sign(player.speed || 1);
        if (controls.right) player.heading -= steerRate * delta * Math.sign(player.speed || 1);

        player.x += Math.sin(player.heading) * player.speed * delta;
        player.z += Math.cos(player.heading) * player.speed * delta;
        player.mesh.position.set(player.x, 0, player.z);
        player.mesh.rotation.y = player.heading;

        const previousAngle = Math.atan2(player.z, player.x);
        const nextAngle = Math.atan2(player.z, player.x);
        void previousAngle;
        void nextAngle;

        /* lap progress: accumulate angular travel around the ring */
        const angleNow = Math.atan2(player.z, player.x);
        let deltaAngle = angleNow - (player.angle || angleNow);
        if (deltaAngle > Math.PI) deltaAngle -= Math.PI * 2;
        if (deltaAngle < -Math.PI) deltaAngle += Math.PI * 2;
        player.angle = angleNow;
        totalAngle += Math.abs(deltaAngle);

        const lapsDone = Math.floor(totalAngle / (Math.PI * 2));
        if (lapsDone > 0 && lapsDone !== (hud.lap - 1)) {
          const lapTime = elapsed - lapStart;
          lapStart = elapsed;
          if (!bestLap || lapTime < bestLap) bestLap = lapTime;
        }

        /* opponents */
        opponents.forEach((car, index) => {
          car.aiSpeed = 26 + Math.sin(elapsed * 0.5 + index) * 3;
          car.angle += (car.aiSpeed / ROAD_RADIUS) * delta;
          const laneRadius = ROAD_RADIUS + car.lane;
          car.mesh.position.set(Math.cos(car.angle) * laneRadius, 0, Math.sin(car.angle) * laneRadius);
          car.mesh.rotation.y = -car.angle + Math.PI / 2;
          if (Math.hypot(car.mesh.position.x - player.x, car.mesh.position.z - player.z) < 2.6) {
            player.speed *= 0.72;
          }
        });

        if (lapsDone >= TOTAL_LAPS && !finished) {
          finished = true;
          const score = Math.max(0, Math.round(TOTAL_LAPS * 2500 + Math.max(0, 9000 - elapsed * 40)));
          onFinish({
            score,
            meta: `${TOTAL_LAPS} laps · ${elapsed.toFixed(1)}s · best lap ${bestLap ? bestLap.toFixed(1) : elapsed.toFixed(1)}s`,
          });
        }

        /* camera chase */
        const chaseDistance = 13 + player.speed * 0.12;
        const cameraTarget = new THREE.Vector3(
          player.x - Math.sin(player.heading) * chaseDistance,
          6.4 + player.speed * 0.03,
          player.z - Math.cos(player.heading) * chaseDistance,
        );
        camera.position.lerp(cameraTarget, 1 - Math.pow(0.001, delta));
        camera.lookAt(player.x + Math.sin(player.heading) * 8, 1.6, player.z + Math.cos(player.heading) * 8);

        hudTimer += delta;
        if (hudTimer > 0.1) {
          hudTimer = 0;
          setHud({
            speed: Math.round(Math.abs(player.speed) * 3.6),
            lap: Math.min(TOTAL_LAPS, lapsDone + 1),
            time: elapsed,
            best: bestLap,
            progress: Math.min(100, (totalAngle / (Math.PI * 2 * TOTAL_LAPS)) * 100),
          });
          if (onProgress && Math.round(elapsed * 10) % 20 === 0) {
            onProgress({ lap: lapsDone + 1, elapsed: Number(elapsed.toFixed(1)), bestLap: Number(bestLap.toFixed(2)) });
          }
        }
      }

      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('resize', onResize);
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const material = object.material;
          if (Array.isArray(material)) material.forEach((m) => m.dispose());
          else material.dispose();
        }
      });
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quality]);

  const press = (control: 'throttle' | 'brake' | 'left' | 'right') => ({
    onPointerDown: (event: React.PointerEvent) => {
      event.preventDefault();
      controlsRef.current[control] = true;
    },
    onPointerUp: (event: React.PointerEvent) => {
      event.preventDefault();
      controlsRef.current[control] = false;
    },
    onPointerLeave: () => {
      controlsRef.current[control] = false;
    },
    onPointerCancel: () => {
      controlsRef.current[control] = false;
    },
  });

  return (
    <div className="relative h-full w-full">
      <div ref={mountRef} className="h-full w-full" data-testid="racer-canvas" />

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-3 sm:p-4">
        <div className="rounded-2xl border border-white/10 bg-black/55 px-3 py-2 backdrop-blur-md">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/50">Lap</p>
          <p className="font-display text-lg font-bold leading-none text-white">
            {hud.lap}<span className="text-xs text-white/40">/{TOTAL_LAPS}</span>
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/55 px-3 py-2 text-right backdrop-blur-md">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/50">Time</p>
          <p className="font-display text-lg font-bold leading-none tabular-nums text-cyan-200">{hud.time.toFixed(1)}s</p>
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-3 left-3 rounded-2xl border border-white/10 bg-black/55 px-3 py-2 backdrop-blur-md sm:bottom-4 sm:left-4">
        <p className="font-display text-2xl font-extrabold leading-none tabular-nums text-white">
          {hud.speed}<span className="ml-1 text-[10px] font-semibold text-white/40">KM/H</span>
        </p>
        <div className="mt-1.5 h-1 w-24 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-gradient-to-r from-cyan to-magenta" style={{ width: `${Math.min(100, (hud.speed / 165) * 100)}%` }} />
        </div>
        <p className="mt-1 text-[10px] text-white/40">best lap {hud.best ? `${hud.best.toFixed(1)}s` : '—'}</p>
      </div>

      {touch && (
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-4">
          <div className="flex gap-2">
            <button type="button" aria-label="Steer left" className="touch-btn" {...press('left')}>◀</button>
            <button type="button" aria-label="Steer right" className="touch-btn" {...press('right')}>▶</button>
          </div>
          <div className="flex gap-2">
            <button type="button" aria-label="Brake" className="touch-btn text-rose-200" {...press('brake')}>■</button>
            <button type="button" aria-label="Accelerate" className="touch-btn text-cyan-200" {...press('throttle')}>▲</button>
          </div>
        </div>
      )}
    </div>
  );
}
