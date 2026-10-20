/**
 * An interactive town in WebGL. Each place is drawn in one of three languages
 * (Icons, City, Machine) as something doing its work: requests routed, steps
 * run, writes shelved. The page supplies three; this module only borrows it.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Place, Town } from './model.js';
import { ROLES, roleOf, type Language, type Role } from './roles.js';
import { createKit } from './scene/models.js';
import { CHANGE_WORD, memberOf, owner } from './story.js';

export type { Language } from './roles.js';
export type SceneTheme = 'light' | 'dark';

export interface ScenePick {
  kind: 'place';
  id: string;
}

export interface SceneOptions {
  language?: Language;
  theme?: SceneTheme;
  /** Machines run, trains drive and cranes lift. Off draws one still frame. */
  animate?: boolean;
  /** Called when the reader picks a place. */
  onPick?: (pick: ScenePick) => void;
}

export interface SceneHandle {
  setLanguage(language: Language): void;
  setTheme(theme: SceneTheme): void;
  /** Fly to a place and mark it, or with null return to the whole town. */
  select(id: string | null): void;
  /** Show the inside of a place, its members one by one, or with null leave. */
  enter(id: string | null): void;
  dispose(): void;
}

interface Palette {
  bg: string;
  ground: string;
  plate: string;
  tile: string;
  add: string;
  mod: string;
  del: string;
  bad: string;
  ink: string;
  muted: string;
  label: string;
  line: string;
}

export const SCENE_PALETTES: Record<SceneTheme, Palette> = {
  light: { bg: '#eef0ea', ground: '#e2e7da', plate: '#d4dcc8', tile: '#c9d1c0', add: '#2f9e5b', mod: '#2f74c0', del: '#9aa19c', bad: '#d6453a', ink: '#1d2420', muted: '#5d685f', label: 'rgba(251,251,248,.9)', line: '#d4d9cf' },
  dark: { bg: '#111613', ground: '#1a211d', plate: '#232c26', tile: '#2b352f', add: '#4fbf7a', mod: '#5a9de6', del: '#5d6560', bad: '#e8604f', ink: '#e3e8e2', muted: '#95a198', label: 'rgba(24,30,27,.88)', line: '#2a332e' },
};

const LINK_HUE: Record<string, string> = { calls: '#7d8fb8', reads: '#8a6bd0', writes: '#8a6bd0', sends: '#3c9dd3', triggers: '#e0883a', transfers: '#b88a55' };
const SPACING = 2.1;
const STYLE_ID = 'codetown-scene-style';
const STYLE = `
.ct3-overlay{position:absolute;inset:0;pointer-events:none;overflow:hidden;font:500 11px/1.3 ui-monospace,SFMono-Regular,Menlo,monospace}
.ct3-tag{position:absolute;left:0;top:0;white-space:nowrap;padding:3px 7px;border-radius:5px;border:1px solid var(--ct3-line);background:var(--ct3-label);color:var(--ct3-ink);transition:opacity .2s}
button.ct3-tag{pointer-events:auto;cursor:pointer;font:inherit}
.ct3-tag b{font:600 10px system-ui,sans-serif;text-transform:uppercase;letter-spacing:.06em;color:var(--ct3-muted);margin-right:4px}
.ct3-tag.ct3-dim{opacity:.3}
.ct3-district{border:0;background:none;font:600 10px system-ui,sans-serif;text-transform:uppercase;letter-spacing:.12em;color:var(--ct3-muted)}
.ct3-big{font-size:12px;letter-spacing:.04em;text-transform:none}
.ct3-risk,.ct3-behavior{border:0;border-radius:10px;color:#fff;font-weight:600;font-family:system-ui,sans-serif}
.ct3-risk{background:var(--ct3-bad)}.ct3-behavior{background:var(--ct3-add)}
.ct3-chip{margin-left:6px;font:600 10px system-ui,sans-serif;padding:1px 5px;border-radius:3px;color:#fff;background:var(--ct3-mod)}
.ct3-chip.added{background:var(--ct3-add)}.ct3-chip.deleted{background:var(--ct3-del)}
.ct3-mark{margin-left:4px;font:600 10px system-ui,sans-serif;color:#fff;border-radius:8px;padding:0 5px}
.ct3-mark.behavior{background:var(--ct3-add)}.ct3-mark.risk{background:var(--ct3-bad)}
`;

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export interface Spot {
  x: number;
  z: number;
}

/** Where every place stands: districts as blocks wrapped into rows, outside systems behind, people in front. */
export function sceneLayout(town: Town) {
  const inside = town.places.filter((p) => p.kind !== 'external' && p.kind !== 'person');
  const groups = new Map<string, Place[]>();
  for (const p of inside) groups.set(p.district ?? '', [...(groups.get(p.district ?? '') ?? []), p]);
  const cells = new Map<string, [number, number]>();
  const blocks: { id: string; label: string; col: number; row: number; cols: number; rows: number }[] = [];
  const MAX = 6;
  let col = 0;
  let row = 0;
  let band = 0;
  let width = 1;
  for (const [id, list] of groups) {
    const cols = Math.min(MAX, Math.max(1, Math.ceil(Math.sqrt(list.length))));
    const rows = Math.ceil(list.length / cols);
    if (col > 0 && col + cols > MAX) {
      col = 0;
      row += band + 0.45;
      band = 0;
    }
    list.forEach((p, i) => cells.set(p.id, [col + (i % cols), row + Math.floor(i / cols)]));
    if (id) blocks.push({ id, label: town.districts.find((d) => d.id === id)?.label ?? id, col, row, cols, rows });
    width = Math.max(width, col + cols);
    col += cols + 0.35;
    band = Math.max(band, rows);
  }
  const depth = Math.max(1, row + band);
  const outside = town.places.filter((p) => p.kind === 'external');
  outside.forEach((p, i) => cells.set(p.id, [((i + 0.5) * width) / outside.length - 0.5, -1.2]));
  town.places.filter((p) => p.kind === 'person').forEach((p, i) => cells.set(p.id, [i, depth + 0.3]));
  const cx = (width - 1) / 2;
  const cz = (depth - 1) / 2;
  const spots = new Map<string, Spot>();
  for (const [id, [x, z]] of cells) spots.set(id, { x: (x - cx) * SPACING, z: (z - cz) * SPACING });
  const districts = blocks.map((d) => ({
    id: d.id,
    label: d.label,
    x: (d.col - cx) * SPACING - 0.7,
    z: (d.row - cz) * SPACING - 0.7,
    w: (d.cols - 1) * SPACING + 1.4,
    d: (d.rows - 1) * SPACING + 1.4,
  }));
  return { spots, districts, size: Math.max(width, depth) * SPACING };
}

export function mountScene(container: HTMLElement, town: Town, options: SceneOptions = {}): SceneHandle {
  let language: Language = options.language ?? 'Icons';
  let theme: SceneTheme = options.theme ?? 'light';
  const animate = options.animate ?? true;

  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = STYLE;
    document.head.appendChild(style);
  }
  if (getComputedStyle(container).position === 'static') container.style.position = 'relative';

  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, globalThis.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.style.display = 'block';
  container.appendChild(renderer.domElement);
  const overlay = document.createElement('div');
  overlay.className = 'ct3-overlay';
  container.appendChild(overlay);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = animate;
  controls.maxPolarAngle = 1.35;
  controls.minDistance = 2;
  controls.maxDistance = 60;
  const hemi = new THREE.HemisphereLight('#ffffff', '#b8c4b0', 1.2);
  const sun = new THREE.DirectionalLight('#fff4e0', 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  scene.add(hemi, sun, sun.target);
  const world = new THREE.Group();
  scene.add(world);

  const anims: ((t: number) => void)[] = [];
  let kit = createKit({ anims, palette: SCENE_PALETTES[theme], dark: theme === 'dark' });
  let placed = new Map<string, { group: THREE.Group; top: number; x: number; z: number; role: Role }>();
  let tags: { el: HTMLElement; at: THREE.Vector3 }[] = [];
  let selected: string | null = null;
  let inside: string | null = null;
  let tween: { from: THREE.Vector3; to: THREE.Vector3; tFrom: THREE.Vector3; tTo: THREE.Vector3; start: number } | null = null;
  const layout = sceneLayout(town);

  function paintVariables() {
    const p = SCENE_PALETTES[theme];
    for (const [key, value] of Object.entries({ line: p.line, label: p.label, ink: p.ink, muted: p.muted, bad: p.bad, add: p.add, mod: p.mod, del: p.del })) overlay.style.setProperty(`--ct3-${key}`, value);
  }

  function tag(html: string, at: THREE.Vector3, cls: string, onClick?: () => void) {
    const el = document.createElement(onClick ? 'button' : 'div');
    el.className = `ct3-tag ${cls}`;
    el.innerHTML = html;
    if (onClick) {
      (el as HTMLButtonElement).type = 'button';
      el.addEventListener('click', onClick);
    }
    overlay.appendChild(el);
    tags.push({ el, at });
    return el;
  }

  function clear() {
    for (const child of [...world.children]) {
      world.remove(child);
      child.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    }
    anims.length = 0;
    overlay.replaceChildren();
    tags = [];
    placed = new Map();
  }

  function tile(place: Place) {
    const p = SCENE_PALETTES[theme];
    const colour = place.change === 'added' ? p.add : place.change === 'modified' || place.change === 'renamed' ? p.mod : place.change === 'deleted' ? p.del : p.tile;
    const t = kit.mesh(new THREE.BoxGeometry(1.2, 0.06, 1.2), colour);
    t.position.y = 0.03;
    t.castShadow = false;
    return t;
  }

  function light() {
    const dark = theme === 'dark';
    scene.background = new THREE.Color(SCENE_PALETTES[theme].bg);
    hemi.intensity = dark ? 0.75 : 1.2;
    hemi.color.set(dark ? '#9fb2d8' : '#ffffff');
    hemi.groundColor.set(dark ? '#1a2220' : '#b8c4b0');
    sun.intensity = dark ? 1.0 : 2.2;
    sun.color.set(dark ? '#a9bde6' : '#fff4e0');
  }

  function build(): void {
    clear();
    light();
    paintVariables();
    if (inside) return buildInside();
    const p = SCENE_PALETTES[theme];
    const { spots, districts, size } = layout;
    const ground = kit.mesh(new THREE.BoxGeometry(size + 2.4, 0.1, size + 2.4), p.ground);
    ground.position.y = -0.05;
    ground.castShadow = false;
    world.add(ground);
    for (const d of districts) {
      const plate = kit.mesh(new THREE.BoxGeometry(d.w, 0.02, d.d), p.plate);
      plate.position.set(d.x + d.w / 2, 0.01, d.z + d.d / 2);
      plate.castShadow = false;
      world.add(plate);
      tag(esc(d.label), new THREE.Vector3(d.x + 0.1, 0.02, d.z + d.d), 'ct3-district');
    }
    sun.position.set(-size, size * 1.4, size * 0.8);
    Object.assign(sun.shadow.camera, { left: -size, right: size, top: size, bottom: -size, near: 0.1, far: size * 6 });
    sun.shadow.camera.updateProjectionMatrix();

    const models = kit.MODELS[language];
    for (const place of town.places) {
      const spot = spots.get(place.id) ?? { x: 0, z: 0 };
      const role = roleOf(place);
      const info = ROLES[role];
      const group = new THREE.Group();
      group.position.set(spot.x, 0, spot.z);
      group.add(tile(place));
      const model = (models[role] ?? models.service)(place, info.hue) as { group: THREE.Group; top: number };
      if (place.change === 'deleted') {
        model.group.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.material && !Array.isArray(m.material)) {
            m.material = m.material.clone();
            m.material.transparent = true;
            m.material.opacity = 0.35;
          }
        });
      }
      group.add(model.group);
      if (place.change === 'deleted') group.add(kit.REMOVAL[language]().group);
      group.userData.id = place.id;
      world.add(group);
      placed.set(place.id, { group, top: model.top, x: spot.x, z: spot.z, role });
      const changed = place.members.filter((m) => m.change).length;
      const badge = place.change ? `<span class="ct3-chip ${place.change}">${CHANGE_WORD[place.change]}</span>` : changed ? `<span class="ct3-chip">${changed} changed</span>` : '';
      tag(`<b>${info.name}</b>${esc(place.id)}${badge}`, new THREE.Vector3(spot.x, model.top + 0.12, spot.z), 'ct3-place', () => pick(place.id)).dataset.id = place.id;
    }

    for (const link of town.links) {
      const a = placed.get(link.from);
      const b = placed.get(link.to);
      if (!a || !b) continue;
      if (language === 'City') {
        road(a, b, link.change, link.traffic, link.conditions.some((c) => c.kind === 'slow'));
        continue;
      }
      const start = new THREE.Vector3(a.x, 0.25, a.z);
      const end = new THREE.Vector3(b.x, 0.25, b.z);
      const mid = start.clone().lerp(end, 0.5);
      mid.y = 0.8 + start.distanceTo(end) * 0.18;
      const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
      const hue = link.change === 'added' ? p.add : link.change === 'deleted' ? p.del : LINK_HUE[link.kind] ?? '#7d8fb8';
      const tube = kit.mesh(new THREE.TubeGeometry(curve, 32, 0.018, 6), hue, { transparent: true, opacity: 0.55 });
      tube.castShadow = false;
      world.add(tube);
      if (link.change === 'deleted') continue;
      const n = link.traffic === 'high' ? 5 : link.traffic === 'low' ? 1 : 3;
      const slow = link.conditions.some((c) => c.kind === 'slow');
      for (let i = 0; i < n; i++) {
        const dot = kit.ball(0.045, hue, 0, 0, 0, { emissive: hue, emissiveIntensity: 0.4 });
        world.add(dot);
        anims.push((t) => dot.position.copy(curve.getPoint((t * (slow ? 0.08 : 0.3) + i / n) % 1)));
      }
    }

    const risks = new Map<string, string[]>();
    for (const r of town.risks) risks.set(owner(r.target), [...(risks.get(owner(r.target)) ?? []), r.id]);
    for (const [id, list] of risks) {
      const at = placed.get(id);
      if (!at) continue;
      const ring = kit.mesh(new THREE.TorusGeometry(0.7, 0.03, 6, 40), p.bad, { emissive: p.bad, transparent: true });
      ring.material = (ring.material as THREE.Material).clone();
      ring.rotation.x = Math.PI / 2;
      ring.position.set(at.x, 0.08, at.z);
      world.add(ring);
      anims.push((t) => {
        const f = (t * 0.6) % 1;
        ring.scale.setScalar(0.9 + f * 0.35);
        (ring.material as THREE.Material).opacity = 1 - f;
      });
      tag(list.length === 1 ? `Risk ${esc(list[0])}` : `${list.length} risks`, new THREE.Vector3(at.x - 0.45, at.top + 0.05, at.z), 'ct3-risk', () => pick(id));
    }
    const behaviors = new Map<string, string[]>();
    for (const b of town.behaviors) behaviors.set(owner(b.target), [...(behaviors.get(owner(b.target)) ?? []), b.id]);
    for (const [id, list] of behaviors) {
      const at = placed.get(id);
      if (at) tag(list.map(esc).join(' '), new THREE.Vector3(at.x + 0.45, at.top + 0.05, at.z), 'ct3-behavior', () => pick(id));
    }
    mark();
  }

  /**
   * A street-level road from the front of one lot to the front of another:
   * out to the street, along to the avenue, down to the other street, in.
   */
  function road(a: { x: number; z: number }, b: { x: number; z: number }, change: string | undefined, traffic: string, slow: boolean) {
    const p = SCENE_PALETTES[theme];
    const gap = SPACING / 2;
    const side = b.x >= a.x ? 1 : -1;
    const avenue = a.x + side * gap;
    const points = [
      new THREE.Vector3(a.x + 0.2, 0.07, a.z + 0.6),
      new THREE.Vector3(a.x + 0.2, 0.07, a.z + gap),
      new THREE.Vector3(avenue, 0.07, a.z + gap),
      new THREE.Vector3(avenue, 0.07, b.z + gap),
      new THREE.Vector3(b.x - 0.2, 0.07, b.z + gap),
      new THREE.Vector3(b.x - 0.2, 0.07, b.z + 0.6),
    ].filter((pt, i, all) => i === 0 || pt.distanceTo(all[i - 1]!) > 0.001);
    const asphalt = change === 'deleted' ? p.del : '#5d646b';
    const lengths: number[] = [];
    for (let i = 1; i < points.length; i++) {
      const from = points[i - 1]!;
      const to = points[i]!;
      const length = from.distanceTo(to);
      lengths.push(length);
      const along = Math.abs(to.x - from.x) > Math.abs(to.z - from.z);
      const slab = kit.box(along ? length + 0.18 : 0.18, 0.012, along ? 0.18 : length + 0.18, asphalt, (from.x + to.x) / 2, 0.06, (from.z + to.z) / 2);
      slab.castShadow = false;
      world.add(slab);
      if (change === 'added' || change === 'modified') {
        const edge = kit.box(along ? length : 0.02, 0.004, along ? 0.02 : length, change === 'added' ? p.add : p.mod, (from.x + to.x) / 2, 0.073, (from.z + to.z) / 2);
        world.add(edge);
      }
      for (let d = 0.1; d < length - 0.05; d += 0.2) {
        const f = d / length;
        world.add(kit.box(along ? 0.08 : 0.012, 0.003, along ? 0.012 : 0.08, '#f4f1e6', from.x + (to.x - from.x) * f, 0.073, from.z + (to.z - from.z) * f));
      }
    }
    if (change === 'deleted') {
      const mid = points[Math.floor(points.length / 2)]!;
      for (let i = 0; i < 4; i++) world.add(kit.box(0.04, 0.05, 0.03, i % 2 ? '#f4f1e6' : p.bad, mid.x - 0.06 + i * 0.04, 0.075, mid.z));
      return;
    }
    const total = lengths.reduce((x, y) => x + y, 0);
    const n = traffic === 'high' ? 4 : traffic === 'low' ? 1 : 2;
    const colours = ['#f2c14c', '#4f80dc', '#e0883a', '#d35f7c'];
    for (let i = 0; i < n; i++) {
      const car = kit.box(0.1, 0.05, 0.06, colours[i % colours.length], 0, 0.075, 0);
      world.add(car);
      anims.push((t) => {
        let d = ((t * (slow ? 0.08 : 0.35) + i / n) % 1) * total;
        for (let k = 0; k < lengths.length; k++) {
          if (d <= lengths[k]! || k === lengths.length - 1) {
            const from = points[k]!;
            const to = points[k + 1]!;
            const f = Math.min(1, d / (lengths[k]! || 1));
            car.position.set(from.x + (to.x - from.x) * f, 0.075, from.z + (to.z - from.z) * f);
            car.rotation.y = Math.atan2(-(to.z - from.z), to.x - from.x);
            break;
          }
          d -= lengths[k]!;
        }
      });
    }
  }

  function buildInside(): void {
    const place = town.places.find((p) => p.id === inside);
    if (!place) {
      inside = null;
      return build();
    }
    const info = ROLES[roleOf(place)];
    const members = place.members;
    const cols = Math.max(2, Math.ceil(Math.sqrt(members.length)));
    const rows = Math.max(1, Math.ceil(members.length / cols));
    const w = cols * 0.9 + 0.6;
    const d = rows * 0.9 + 0.8;
    const floor = kit.mesh(new THREE.BoxGeometry(w, 0.08, d), SCENE_PALETTES[theme].plate);
    floor.position.y = -0.04;
    world.add(floor);
    for (const [x, z, ww, dd] of [[0, -d / 2, w, 0.06], [-w / 2, 0, 0.06, d], [w / 2, 0, 0.06, d]] as const) world.add(kit.box(ww, 0.32, dd, kit.shade(info.hue, 0.9), x, 0, z));
    members.forEach((m, i) => {
      const hue = kit.memberHue(m) === '#3a4048' ? info.hue : kit.memberHue(m);
      const shape = (kit.MEMBER_SHAPE[m.kind] ?? kit.MEMBER_SHAPE.function)(hue) as THREE.Object3D;
      const x = -w / 2 + 0.75 + (i % cols) * 0.9;
      const z = -d / 2 + 0.75 + Math.floor(i / cols) * 0.9;
      shape.position.set(x, 0, z);
      world.add(shape);
      if (m.change === 'deleted') {
        const boards = kit.crossed(0.4, 0.3, 0, 0.18);
        boards.position.set(x, 0, z);
        world.add(boards);
      }
      const marks =
        town.behaviors.filter((b) => owner(b.target) === place.id && memberOf(b.target) === m.name).map((b) => `<span class="ct3-mark behavior">${esc(b.id)}</span>`).join('') +
        town.risks.filter((r) => owner(r.target) === place.id && memberOf(r.target) === m.name).map((r) => `<span class="ct3-mark risk">${esc(r.id)}</span>`).join('');
      tag(`<b>${esc(m.kind)}</b>${esc(m.name)}${m.change ? `<span class="ct3-chip ${m.change}">${CHANGE_WORD[m.change]}</span>` : ''}${marks}`, new THREE.Vector3(x, 0.45, z), 'ct3-place');
    });
    if (!members.length) tag('Nothing inside was named in this change', new THREE.Vector3(0, 0.3, 0), 'ct3-district');
    tag(`Inside <b>${esc(place.id)}</b>`, new THREE.Vector3(0, 0.36, -d / 2), 'ct3-district ct3-big');
    frame(Math.max(w, d) * 1.5);
  }

  function mark() {
    for (const [id, p] of placed) p.group.scale.setScalar(selected === id ? 1.08 : 1);
    for (const t of tags) t.el.classList.toggle('ct3-dim', !!selected && !!t.el.dataset.id && t.el.dataset.id !== selected);
  }

  function moveTo(position: THREE.Vector3, target: THREE.Vector3) {
    if (!animate) {
      camera.position.copy(position);
      controls.target.copy(target);
      return;
    }
    tween = { from: camera.position.clone(), to: position, tFrom: controls.target.clone(), tTo: target, start: performance.now() };
  }

  function frame(size: number, at = new THREE.Vector3()) {
    const dir = new THREE.Vector3(0.9, 1.05, 1.25).normalize();
    moveTo(at.clone().add(dir.multiplyScalar(Math.max(4.5, size * 1.45 + 2))), at);
  }

  function focus(id: string | null) {
    selected = id;
    mark();
    const p = id ? placed.get(id) : null;
    if (p && !inside) moveTo(new THREE.Vector3(p.x + 2.6, 2.8, p.z + 3.6), new THREE.Vector3(p.x, 0.3, p.z));
    else if (!id && !inside) frame(layout.size);
  }

  function pick(id: string) {
    focus(id);
    options.onPick?.({ kind: 'place', id });
  }

  function fit() {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  const projected = new THREE.Vector3();
  function render(time: number) {
    const t = time / 1000;
    for (const a of anims) a(t);
    if (tween) {
      const f = Math.min(1, (time - tween.start) / 650);
      const e = 1 - Math.pow(1 - f, 3);
      camera.position.lerpVectors(tween.from, tween.to, e);
      controls.target.lerpVectors(tween.tFrom, tween.tTo, e);
      if (f >= 1) tween = null;
    }
    controls.update();
    renderer.render(scene, camera);
    const w = container.clientWidth;
    const h = container.clientHeight;
    for (const { el, at } of tags) {
      projected.copy(at).project(camera);
      el.style.transform = `translate(${((projected.x + 1) / 2) * w}px, ${((1 - projected.y) / 2) * h}px) translate(-50%, -100%)`;
      el.style.visibility = projected.z > 1 ? 'hidden' : 'visible';
    }
  }

  let frameId = 0;
  let disposed = false;
  function loop(time: number) {
    if (disposed) return;
    render(time);
    frameId = requestAnimationFrame(loop);
  }
  const still = () => render(2000);

  const ray = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let down: [number, number] | null = null;
  const onDown = (e: PointerEvent) => {
    down = [e.clientX, e.clientY];
  };
  const onUp = (e: PointerEvent) => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4 || inside) return;
    const r = renderer.domElement.getBoundingClientRect();
    pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(pointer, camera);
    let o: THREE.Object3D | null = ray.intersectObjects(world.children, true)[0]?.object ?? null;
    while (o && !o.userData.id) o = o.parent;
    if (o) pick(o.userData.id as string);
  };
  const onDouble = () => {
    if (selected && !inside) {
      inside = selected;
      build();
      if (!animate) still();
    }
  };
  renderer.domElement.addEventListener('pointerdown', onDown);
  renderer.domElement.addEventListener('pointerup', onUp);
  renderer.domElement.addEventListener('dblclick', onDouble);
  const resize = new ResizeObserver(() => {
    fit();
    if (!animate) still();
  });
  resize.observe(container);
  if (!animate) controls.addEventListener('change', still);

  fit();
  build();
  frame(layout.size);
  if (animate) frameId = requestAnimationFrame(loop);
  else still();

  return {
    setLanguage(next) {
      if (next === language) return;
      language = next;
      build();
      if (!animate) still();
    },
    setTheme(next) {
      if (next === theme) return;
      theme = next;
      kit.dispose();
      kit = createKit({ anims, palette: SCENE_PALETTES[theme], dark: theme === 'dark' });
      build();
      if (!animate) still();
    },
    select(id) {
      if (inside) {
        inside = null;
        build();
      }
      focus(id);
      if (!animate) still();
    },
    enter(id) {
      inside = id;
      build();
      if (!id) focus(selected);
      if (!animate) still();
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frameId);
      resize.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointerup', onUp);
      renderer.domElement.removeEventListener('dblclick', onDouble);
      clear();
      kit.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      overlay.remove();
    },
  };
}
