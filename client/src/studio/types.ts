/** Shared scene model for the NEXUS Studio editor and published scene player. */

export type PrimitiveType = 'box' | 'sphere' | 'cylinder' | 'torus' | 'plane' | 'player';
export type Vec3 = [number, number, number];
export type Behavior = 'none' | 'spin' | 'bob';

export interface SceneObject {
  id: string;
  name: string;
  type: PrimitiveType;
  pos: Vec3;
  rot: Vec3;
  scale: Vec3;
  color: string;
  emissive: number;
  metalness: number;
  roughness: number;
  physics: boolean;
  behavior: Behavior;
  speed: number;
}

export interface SceneEnv {
  background: string;
  fog: number;
  ambient: number;
  sun: number;
  sunColor: string;
  grid: boolean;
}

export interface SceneCamera {
  fov: number;
  pos: Vec3;
}

export interface SceneData {
  version: 1;
  objects: SceneObject[];
  env: SceneEnv;
  camera: SceneCamera;
  script: string;
}

export const PALETTE = ['#7C3AED', '#22D3EE', '#E946C7', '#F5C86B', '#8B5CF6', '#4ADE80', '#B6BCD6', '#141225'];

export function uid(prefix = 'obj'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

export function makeObject(type: PrimitiveType, index = 0): SceneObject {
  const palette = PALETTE[index % PALETTE.length];
  return {
    id: uid(),
    name: type === 'player' ? 'Player' : `${type[0].toUpperCase()}${type.slice(1)} ${index + 1}`,
    type,
    pos: [index * 2 - 2, type === 'plane' ? 0 : 1, 0],
    rot: [0, 0, 0],
    scale: type === 'plane' ? [6, 1, 6] : [1, 1, 1],
    color: type === 'player' ? '#22D3EE' : palette,
    emissive: type === 'player' ? 0.55 : 0.18,
    metalness: 0.45,
    roughness: 0.32,
    physics: true,
    behavior: 'none',
    speed: 1,
  };
}

export function defaultScene(): SceneData {
  return {
    version: 1,
    objects: [
      {
        ...makeObject('plane', 0),
        name: 'Arena Floor',
        pos: [0, 0, 0],
        scale: [8, 1, 8],
        color: '#141225',
        emissive: 0.05,
        metalness: 0.2,
        roughness: 0.9,
      },
      { ...makeObject('player', 1), pos: [0, 1, 4], name: 'Player' },
      { ...makeObject('box', 2), pos: [-3, 1, -2], color: '#7C3AED', behavior: 'spin', speed: 0.7 },
      { ...makeObject('torus', 3), pos: [3, 1.4, -2], color: '#E946C7', behavior: 'bob', speed: 1.2 },
      { ...makeObject('sphere', 4), pos: [0, 1, -5], color: '#22D3EE', emissive: 0.6 },
    ],
    env: { background: '#06060F', fog: 0.035, ambient: 0.55, sun: 1.4, sunColor: '#9F7BFF', grid: true },
    camera: { fov: 55, pos: [7, 6, 10] },
    script: [
      '// Sandboxed game logic — runs inside an isolated iframe.',
      '// API: NEXUS.move(name, x, y, z), .rotate(name, x, y, z),',
      '//      .color(name, "#hex"), .spawn(type, name, x, y, z, color),',
      '//      .destroy(name), .log(...args), .onTick(fn)',
      '',
      'let t = 0;',
      'NEXUS.onTick((dt) => {',
      '  t += dt;',
      '  NEXUS.rotate("Torus 4", 0, dt * 1.2, 0);',
      '  NEXUS.move("Sphere 5", Math.sin(t) * 3, 1 + Math.sin(t * 2) * 0.6, -5);',
      '});',
    ].join('\n'),
  };
}

/** Defensive parse for scenes coming back from the API or localStorage. */
export function normaliseScene(input: any): SceneData {
  const base = defaultScene();
  if (!input || typeof input !== 'object') return base;
  const objects = Array.isArray(input.objects)
    ? input.objects
        .filter((o: any) => o && typeof o.id === 'string' && typeof o.name === 'string')
        .slice(0, 120)
        .map((o: any, index: number) => {
          const fallback = makeObject((o.type as PrimitiveType) ?? 'box', index);
          return {
            ...fallback,
            ...o,
            pos: Array.isArray(o.pos) && o.pos.length === 3 ? (o.pos.map(Number) as Vec3) : fallback.pos,
            rot: Array.isArray(o.rot) && o.rot.length === 3 ? (o.rot.map(Number) as Vec3) : fallback.rot,
            scale: Array.isArray(o.scale) && o.scale.length === 3 ? (o.scale.map(Number) as Vec3) : fallback.scale,
            emissive: Number(o.emissive ?? fallback.emissive),
            metalness: Number(o.metalness ?? fallback.metalness),
            roughness: Number(o.roughness ?? fallback.roughness),
            speed: Number(o.speed ?? 1),
            color: typeof o.color === 'string' ? o.color : fallback.color,
            script: undefined,
          } as SceneObject;
        })
    : base.objects;
  return {
    version: 1,
    objects,
    env: { ...base.env, ...(input.env ?? {}) },
    camera: { ...base.camera, ...(input.camera ?? {}) },
    script: typeof input.script === 'string' ? input.script.slice(0, 20_000) : '',
  };
}
