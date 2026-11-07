import * as THREE from 'three';
import type { SceneData, SceneObject } from './types';

/** Three.js world construction shared by the editor and the published scene player. */

function geometryFor(object: SceneObject): THREE.BufferGeometry {
  switch (object.type) {
    case 'sphere':
      return new THREE.SphereGeometry(0.6, 32, 24);
    case 'cylinder':
      return new THREE.CylinderGeometry(0.5, 0.5, 1.2, 32);
    case 'torus':
      return new THREE.TorusGeometry(0.55, 0.2, 20, 48);
    case 'plane':
      return new THREE.BoxGeometry(1, 0.1, 1);
    case 'player':
      return new THREE.CapsuleGeometry(0.35, 0.9, 8, 16);
    default:
      return new THREE.BoxGeometry(1, 1, 1);
  }
}

export function makeMesh(object: SceneObject): THREE.Mesh {
  const color = new THREE.Color(object.color);
  const material = new THREE.MeshStandardMaterial({
    color,
    metalness: object.metalness,
    roughness: object.roughness,
    emissive: color.clone().multiplyScalar(object.emissive),
    emissiveIntensity: Math.max(0.01, object.emissive),
  });
  const mesh = new THREE.Mesh(geometryFor(object), material);
  mesh.name = object.name;
  mesh.userData.id = object.id;
  mesh.userData.kind = object.type;
  mesh.position.fromArray(object.pos);
  mesh.rotation.fromArray(object.rot);
  mesh.scale.fromArray(object.scale);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export interface WorldHandles {
  group: THREE.Group;
  meshes: Map<string, THREE.Mesh>;
  byName: Map<string, THREE.Mesh>;
  dispose: () => void;
}

export function buildWorld(scene: THREE.Scene, data: SceneData): WorldHandles {
  const group = new THREE.Group();
  group.name = 'nexus-world';
  const meshes = new Map<string, THREE.Mesh>();
  const byName = new Map<string, THREE.Mesh>();

  for (const object of data.objects) {
    const mesh = makeMesh(object);
    group.add(mesh);
    meshes.set(object.id, mesh);
    byName.set(object.name, mesh);
  }

  const grid = new THREE.GridHelper(40, 40, new THREE.Color('#3B2E7A'), new THREE.Color('#151230'));
  grid.position.y = 0.06;
  grid.name = 'nexus-grid';
  group.add(grid);

  const ambient = new THREE.AmbientLight(new THREE.Color('#8E8BFF'), data.env.ambient);
  ambient.name = 'nexus-ambient';
  const sun = new THREE.DirectionalLight(new THREE.Color(data.env.sunColor), data.env.sun);
  sun.position.set(8, 14, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.name = 'nexus-sun';
  const rim = new THREE.PointLight(new THREE.Color('#22D3EE'), data.env.sun * 0.5, 40);
  rim.position.set(-8, 5, -6);
  rim.name = 'nexus-rim';
  group.add(ambient, sun, rim);

  scene.add(group);

  return {
    group,
    meshes,
    byName,
    dispose: () => {
      scene.remove(group);
      group.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.geometry.dispose();
          const material = mesh.material as THREE.Material | THREE.Material[];
          if (Array.isArray(material)) material.forEach((m) => m.dispose());
          else material?.dispose();
        }
      });
      const gridHelper = group.getObjectByName('nexus-grid') as THREE.GridHelper | undefined;
      gridHelper?.dispose?.();
    },
  };
}

export function applyEnv(scene: THREE.Scene, data: SceneData, handles: WorldHandles): void {
  scene.background = new THREE.Color(data.env.background);
  scene.fog = data.env.fog > 0 ? new THREE.FogExp2(new THREE.Color(data.env.background), data.env.fog) : null;
  const ambient = handles.group.getObjectByName('nexus-ambient') as THREE.AmbientLight | undefined;
  const sun = handles.group.getObjectByName('nexus-sun') as THREE.DirectionalLight | undefined;
  if (ambient) ambient.intensity = data.env.ambient;
  if (sun) {
    sun.intensity = data.env.sun;
    sun.color = new THREE.Color(data.env.sunColor);
  }
  const grid = handles.group.getObjectByName('nexus-grid');
  if (grid) grid.visible = data.env.grid;
}

/** Runs authored behaviours (spin/bob) — the visual-scripting baseline. */
export function tickBehaviours(data: SceneData, handles: WorldHandles, elapsed: number, delta: number): void {
  for (const object of data.objects) {
    if (object.behavior === 'none') continue;
    const mesh = handles.meshes.get(object.id);
    if (!mesh) continue;
    if (object.behavior === 'spin') mesh.rotation.y += delta * object.speed;
    if (object.behavior === 'bob') mesh.position.y = object.pos[1] + Math.sin(elapsed * object.speed * 1.6) * 0.5;
  }
}
