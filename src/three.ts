/**
 * An interactive town in WebGL, drawn from the catalogue with three.js. The
 * page supplies three; this module only borrows it.
 */
import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';
import { TONES, type Geometry, type Tone } from './geometry.js';
import type { Town } from './model.js';
import { world, type Route } from './world.js';

export type SceneTheme = 'light' | 'dark';

export interface ScenePick {
  kind: 'place' | 'risk' | 'behavior';
  id: string;
}

export interface SceneOptions {
  theme?: SceneTheme;
  /** Cars drive, cranes turn and fires burn. Off draws one still frame. */
  animate?: boolean;
  onPick?: (pick: ScenePick) => void;
}

export interface SceneHandle {
  setTheme(theme: SceneTheme): void;
  /** Mark one place as chosen, or none. */
  select(id: string | null): void;
  dispose(): void;
}

type Palette = Record<Tone, string> & { sky: string; horizon: string };

export const PALETTES: Record<SceneTheme, Palette> = {
  light: {
    sky: '#eef0ea', horizon: '#c9d3c2',
    ground: '#e3e8da', lot: '#d5dccb', grass: '#bcd3a2', road: '#79828a', curb: '#b9c0b4', marking: '#f4f1e6',
    wall: '#fbfbf7', wall2: '#dde2da', trim: '#c4cbc1', roof: '#47524b', window: '#9cc3d6', door: '#6b4f3a', glass: '#8fb7cc',
    metal: '#8a949b', wood: '#b98a5a', leaf: '#6fa86a', trunk: '#7a5a3c', paper: '#fbfbf7', ink: '#1f2622', sign: '#2e8b57',
    add: '#2e8b57', mod: '#2a6db0', del: '#a3a9a5', bad: '#c8452f', warn: '#e8a91e', water: '#4a90c2', smoke: '#8d949a', fire: '#ff7a2e', person: '#2a6db0',
  },
  dark: {
    sky: '#0f1412', horizon: '#18201c',
    ground: '#1b221e', lot: '#27302b', grass: '#243528', road: '#3d464b', curb: '#4b544e', marking: '#bdb79a',
    wall: '#5d6b63', wall2: '#4a5650', trim: '#6b7871', roof: '#2a322e', window: '#ffc95a', door: '#a07a5a', glass: '#2b4250',
    metal: '#5d666c', wood: '#8c6643', leaf: '#33603d', trunk: '#4a3626', paper: '#d9ddd6', ink: '#0d100e', sign: '#3f9e68',
    add: '#5fb37a', mod: '#6aa8e8', del: '#5b635e', bad: '#e2654c', warn: '#e0a23c', water: '#3a7fb3', smoke: '#6a7075', fire: '#ff8a3a', person: '#6aa8e8',
  },
};

/** Tones that give their own light rather than reflect it. */
const GLOWING: Record<SceneTheme, Set<Tone>> = {
  light: new Set(['fire']),
  dark: new Set(['window', 'fire', 'sign']),
};

function buffers(geometry: Geometry, palette: Palette, keep: (tone: Tone) => boolean): THREE.BufferGeometry | null {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const colour = new THREE.Color();
  for (let v = 0; v < geometry.tones.length; v += 3) {
    const tone = TONES[geometry.tones[v]!]!;
    if (!keep(tone)) continue;
    for (let k = 0; k < 3; k++) {
      const i = v + k;
      positions.push(geometry.positions[i * 3]!, geometry.positions[i * 3 + 1]!, geometry.positions[i * 3 + 2]!);
      normals.push(geometry.normals[i * 3]!, geometry.normals[i * 3 + 1]!, geometry.normals[i * 3 + 2]!);
      colour.set(palette[TONES[geometry.tones[i]!]!]).multiplyScalar(geometry.shades[i]!);
      colors.push(colour.r, colour.g, colour.b);
    }
  }
  if (!positions.length) return null;
  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  result.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  result.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return result;
}

function along(points: THREE.Vector3[], lengths: number[], total: number, distance: number, out: THREE.Vector3): number {
  let d = ((distance % total) + total) % total;
  for (let i = 0; i < lengths.length; i++) {
    if (d <= lengths[i]!) {
      out.lerpVectors(points[i]!, points[i + 1]!, lengths[i]! ? d / lengths[i]! : 0);
      const dx = points[i + 1]!.x - points[i]!.x;
      const dz = points[i + 1]!.z - points[i]!.z;
      return Math.atan2(-dz, dx);
    }
    d -= lengths[i]!;
  }
  out.copy(points[points.length - 1]!);
  return 0;
}

export function mountScene(container: HTMLElement, town: Town, options: SceneOptions = {}): SceneHandle {
  const layout = world(town);
  let theme: SceneTheme = options.theme ?? 'light';
  const animate = options.animate ?? true;

  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, globalThis.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.style.display = 'block';
  if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
  container.appendChild(renderer.domElement);

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;font:600 11px/1.2 ui-sans-serif,system-ui,sans-serif';
  container.appendChild(overlay);

  const scene = new THREE.Scene();
  const { x, z, w, d } = layout.bounds;
  const middle = new THREE.Vector3(x + w / 2, 0, z + d / 2);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -100, 200);
  const yaw = Math.PI / 4;
  const pitch = Math.atan(1 / Math.SQRT2);
  const distance = 40;
  camera.position.set(middle.x + Math.sin(yaw) * Math.cos(pitch) * distance, Math.sin(pitch) * distance, middle.z + Math.cos(yaw) * Math.cos(pitch) * distance);
  camera.lookAt(middle);

  const controls = new MapControls(camera, renderer.domElement);
  controls.target.copy(middle);
  controls.enableDamping = animate;
  controls.minPolarAngle = 0.35;
  controls.maxPolarAngle = 1.2;
  controls.minZoom = 0.4;
  controls.maxZoom = 6;
  controls.screenSpacePanning = false;

  const hemi = new THREE.HemisphereLight();
  const sun = new THREE.DirectionalLight();
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  const reach = Math.max(w, d) * 0.75;
  Object.assign(sun.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, near: 0.1, far: 80 });
  sun.position.set(middle.x - 8, 14, middle.z + 6);
  sun.target.position.copy(middle);
  scene.add(hemi, sun, sun.target);

  const world3d = new THREE.Group();
  scene.add(world3d);
  const lit = new THREE.MeshLambertMaterial({ vertexColors: true });
  const glow = new THREE.MeshBasicMaterial({ vertexColors: true });
  const smoke = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.7 });

  interface Moving { object: THREE.Object3D; motion: string; base: THREE.Vector3; seed: number }
  let moving: Moving[] = [];
  let traffic: { mesh: THREE.InstancedMesh; route: Route; points: THREE.Vector3[]; lengths: number[]; total: number }[] = [];
  const pickables: THREE.Object3D[] = [];
  const outlines = new Map<string, THREE.Object3D>();

  function meshes(geometry: Geometry, palette: Palette, glowing: Set<Tone>, shadows = true, material = lit): THREE.Object3D {
    const group = new THREE.Group();
    const plain = buffers(geometry, palette, (tone) => !glowing.has(tone));
    const bright = buffers(geometry, palette, (tone) => glowing.has(tone));
    if (plain) {
      const mesh = new THREE.Mesh(plain, material);
      mesh.castShadow = shadows;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    if (bright) group.add(new THREE.Mesh(bright, glow));
    return group;
  }

  function build() {
    for (const child of [...world3d.children]) {
      child.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      world3d.remove(child);
    }
    moving = [];
    traffic = [];
    pickables.length = 0;
    outlines.clear();
    const palette = PALETTES[theme];
    const glowing = GLOWING[theme];
    scene.background = new THREE.Color(palette.sky);
    hemi.color.set(theme === 'dark' ? '#8aa0c8' : '#ffffff');
    hemi.groundColor.set(theme === 'dark' ? '#1a2220' : '#b8c4b0');
    hemi.intensity = theme === 'dark' ? 1.0 : 1.15;
    sun.color.set(theme === 'dark' ? '#9fb4e0' : '#fff4e0');
    sun.intensity = theme === 'dark' ? 0.9 : 2.1;

    world3d.add(meshes(layout.ground, palette, glowing, false));
    for (const place of layout.places) {
      const group = meshes(place.model.body, palette, glowing);
      group.position.set(place.x, 0, place.z);
      group.userData.pick = { kind: 'place', id: place.id } satisfies ScenePick;
      pickables.push(group);
      for (const part of place.model.parts) {
        const object = meshes(part.geometry, palette, glowing);
        object.position.set(part.pivot[0], part.pivot[1], part.pivot[2]);
        object.children.forEach((child) => child.position.set(-part.pivot[0], -part.pivot[1], -part.pivot[2]));
        group.add(object);
        moving.push({ object, motion: part.motion, base: object.position.clone(), seed: Math.random() * 10 });
      }
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.68, 32), new THREE.MeshBasicMaterial({ color: palette.mod }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.05;
      ring.visible = false;
      group.add(ring);
      outlines.set(place.id, ring);
      world3d.add(group);
    }
    for (const part of layout.hazards) {
      const object = meshes(part.geometry, palette, glowing, true, part.motion === 'rise' ? smoke : lit);
      object.position.set(part.pivot[0], part.pivot[1], part.pivot[2]);
      object.children.forEach((child) => child.position.set(-part.pivot[0], -part.pivot[1], -part.pivot[2]));
      world3d.add(object);
      moving.push({ object, motion: part.motion, base: object.position.clone(), seed: Math.random() * 10 });
    }
    const carGeometry = buffers(layout.car, { ...palette, wall2: '#ffffff' }, () => true)!;
    for (const route of layout.routes) {
      if (!route.cars) continue;
      const mesh = new THREE.InstancedMesh(carGeometry, lit, route.cars);
      mesh.castShadow = true;
      const tint = new THREE.Color(palette[route.tone]);
      for (let i = 0; i < route.cars; i++) mesh.setColorAt(i, tint);
      const points = route.points.map((p) => new THREE.Vector3(...p));
      const lengths = points.slice(1).map((p, i) => p.distanceTo(points[i]!));
      traffic.push({ mesh, route, points, lengths, total: lengths.reduce((a, b) => a + b, 0) });
      world3d.add(mesh);
    }
    labels();
  }

  const tags: { element: HTMLElement; at: THREE.Vector3 }[] = [];
  function labels() {
    overlay.replaceChildren();
    tags.length = 0;
    const palette = PALETTES[theme];
    const tag = (text: string, at: THREE.Vector3, css: string, pick?: ScenePick, title?: string) => {
      const element = document.createElement(pick ? 'button' : 'div');
      element.textContent = text;
      if (title) element.title = title;
      element.style.cssText = `position:absolute;left:0;top:0;transform:translate(-50%,-100%);white-space:nowrap;${css}`;
      if (pick) {
        element.style.pointerEvents = 'auto';
        element.style.cursor = 'pointer';
        element.addEventListener('click', () => options.onPick?.(pick));
      }
      overlay.appendChild(element);
      tags.push({ element, at });
    };
    for (const place of layout.places) {
      tag(place.label, new THREE.Vector3(place.x, 0, place.z + 0.62), `color:${palette.ink === '#0d100e' ? '#e4e8e2' : '#1f2622'};background:${theme === 'dark' ? 'rgba(15,20,18,.72)' : 'rgba(255,255,255,.78)'};padding:2px 6px;border-radius:4px;font-family:ui-monospace,monospace;font-weight:500;transform:translate(-50%,0)`);
    }
    for (const district of layout.districts) {
      tag(district.label, new THREE.Vector3(district.x + 0.05, 0, district.z + district.d + 0.05), `color:${theme === 'dark' ? '#b4c0b8' : '#46524b'};text-transform:uppercase;letter-spacing:.1em;font-size:10px;transform:translate(-100%,-50%)`);
    }
    for (const pin of layout.pins) {
      const risk = pin.kind === 'risk';
      tag(pin.id, new THREE.Vector3(...pin.at), `min-width:20px;height:20px;padding:0 5px;border-radius:10px;border:0;color:#fff;background:${risk ? palette.bad : palette.sign};font-weight:700;box-shadow:0 1px 3px rgba(0,0,0,.3)`, { kind: pin.kind, id: pin.id }, pin.text);
    }
  }

  const projected = new THREE.Vector3();
  function place() {
    const width = container.clientWidth;
    const height = container.clientHeight;
    for (const { element, at } of tags) {
      projected.copy(at).project(camera);
      element.style.left = `${((projected.x + 1) / 2) * width}px`;
      element.style.top = `${((1 - projected.y) / 2) * height}px`;
      element.style.display = projected.z > 1 ? 'none' : '';
    }
  }

  function fit() {
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    renderer.setSize(width, height);
    const aspect = width / height;
    // The isometric diagonal of the town, so it fills the view at first.
    const span = (w + d) * 0.74;
    const vertical = Math.max(span / aspect, (w + d) * 0.42);
    camera.left = (-vertical * aspect) / 2;
    camera.right = (vertical * aspect) / 2;
    camera.top = vertical / 2;
    camera.bottom = -vertical / 2;
    camera.updateProjectionMatrix();
  }

  const matrix = new THREE.Matrix4();
  const spot = new THREE.Vector3();
  const turn = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  function step(time: number) {
    const t = time / 1000;
    for (const m of moving) {
      if (m.motion === 'spin') m.object.rotation.y = Math.sin(t * 0.4 + m.seed) * 0.9;
      if (m.motion === 'flicker') m.object.scale.set(1, 0.8 + 0.3 * Math.abs(Math.sin(t * 9 + m.seed)), 1);
      if (m.motion === 'rise') {
        const phase = (t * 0.35 + m.seed) % 1;
        m.object.position.set(m.base.x, m.base.y + phase * 0.35, m.base.z);
        m.object.scale.setScalar(0.6 + phase);
      }
      if (m.motion === 'blink') m.object.visible = Math.sin(t * 4 + m.seed) > -0.6;
      if (m.motion === 'swing') m.object.rotation.y = Math.sin(t * 0.8 + m.seed) * 0.05;
    }
    for (const lane of traffic) {
      for (let i = 0; i < lane.route.cars; i++) {
        const angle = along(lane.points, lane.lengths, lane.total, t * lane.route.speed + (i * lane.total) / lane.route.cars, spot);
        turn.setFromAxisAngle(up, angle);
        matrix.compose(spot, turn, new THREE.Vector3(1, 1, 1));
        lane.mesh.setMatrixAt(i, matrix);
      }
      lane.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  let frame = 0;
  let disposed = false;
  function render(time = 0) {
    step(time);
    controls.update();
    renderer.render(scene, camera);
    place();
  }
  function loop(time: number) {
    if (disposed) return;
    render(time);
    frame = requestAnimationFrame(loop);
  }

  const ray = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let downAt: [number, number] | null = null;
  function onDown(event: PointerEvent) {
    downAt = [event.clientX, event.clientY];
  }
  function onUp(event: PointerEvent) {
    if (!downAt || Math.hypot(event.clientX - downAt[0], event.clientY - downAt[1]) > 4) return;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(pointer, camera);
    const hit = ray.intersectObjects(pickables, true)[0];
    let object: THREE.Object3D | null = hit?.object ?? null;
    while (object && !object.userData.pick) object = object.parent;
    if (object) options.onPick?.(object.userData.pick as ScenePick);
  }
  renderer.domElement.addEventListener('pointerdown', onDown);
  renderer.domElement.addEventListener('pointerup', onUp);
  const resize = new ResizeObserver(() => { fit(); if (!animate) render(); });
  resize.observe(container);
  if (!animate) controls.addEventListener('change', () => render());

  build();
  fit();
  if (animate) frame = requestAnimationFrame(loop);
  else render(4000);

  return {
    setTheme(next) {
      if (next === theme) return;
      theme = next;
      build();
      if (!animate) render(4000);
    },
    select(id) {
      for (const [key, ring] of outlines) ring.visible = key === id;
      if (!animate) render(4000);
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      resize.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointerup', onUp);
      world3d.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      lit.dispose();
      glow.dispose();
      smoke.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      overlay.remove();
    },
  };
}
