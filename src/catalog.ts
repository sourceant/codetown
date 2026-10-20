/**
 * The catalogue: one low-poly model per Codetown word, built in code on a
 * one-unit lot. A lot is centred on the origin, its front faces +z, and y is
 * up. Moving parts are kept apart from the body so a scene can animate them.
 */
import { Builder, type Geometry, type Tone, type Vec3 } from './geometry.js';
import type { Member, Place } from './model.js';
import type { Impact } from './vocabulary.js';

export type Motion = 'spin' | 'flicker' | 'rise' | 'blink' | 'swing';

export interface Part {
  geometry: Geometry;
  motion: Motion;
  /** The point the motion turns about or rises from. */
  pivot: Vec3;
}

export interface Model {
  body: Geometry;
  parts: Part[];
  /** Height of the tallest fixed point, where a pin or label goes. */
  height: number;
  /** Width and depth the model takes, in lots. */
  lots: [number, number];
}

export const STOREY = 0.3;
const GROUND = 0.34;
const WALL_KINDS = new Set(['endpoint', 'config', 'job', 'guard', 'event', 'offer', 'interface']);

function part(build: (b: Builder) => void, motion: Motion, pivot: Vec3): Part {
  const b = new Builder();
  build(b);
  return { geometry: b.geometry, motion, pivot };
}

const MARK: Record<string, Tone> = { added: 'add', modified: 'mod', deleted: 'del', renamed: 'mod', copied: 'add', retyped: 'mod' };

function windowRow(b: Builder, x0: number, x1: number, y: number, z: number, count: number, members: (Member | undefined)[], facing: 'front' | 'side', lit: boolean) {
  const span = x1 - x0;
  const w = Math.min(0.11, (span / count) * 0.62);
  for (let i = 0; i < count; i++) {
    const at = x0 + (span * (i + 0.5)) / count;
    const member = members[i];
    const tone: Tone = member?.change ? MARK[member.change] ?? 'window' : lit ? 'window' : 'glass';
    if (facing === 'front') {
      b.slab(at, y, z, w, 0.13, 0.012, tone);
      b.slab(at, y - 0.012, z + 0.012, w + 0.03, 0.012, 0.02, 'trim');
    } else {
      b.slab(z, y, at, 0.012, 0.13, w, tone);
      b.slab(z + 0.012, y - 0.012, at, 0.02, 0.012, w + 0.03, 'trim');
    }
  }
}

/** An office block: storeys of window bands, doors for endpoints, a roof with plant. */
function office(place: Place, b: Builder, wall: Tone): number {
  const workers = place.members.filter((m) => !WALL_KINDS.has(m.kind));
  const storeys = Math.max(2, Math.min(7, place.size + 1, 1 + Math.ceil(workers.length / 3) + 1));
  const w = 0.7;
  const d = 0.6;
  const h = GROUND + (storeys - 1) * STOREY;
  b.block(0, 0, 0, w, GROUND, d, wall, { top: 'trim' });
  for (let s = 1; s < storeys; s++) b.block(0, GROUND + (s - 1) * STOREY, 0, w, STOREY, d, wall, { chamfer: 0.015, top: wall });
  b.block(0, h, 0, w + 0.04, 0.04, d + 0.04, 'trim', { ramp: 0 });
  for (let s = 1; s < storeys; s++) {
    const y = GROUND + (s - 1) * STOREY + 0.09;
    const floor = workers.slice((s - 1) * 3, s * 3);
    windowRow(b, -w / 2 + 0.04, w / 2 - 0.04, y, d / 2 + 0.006, 3, floor, 'front', true);
    windowRow(b, -d / 2 + 0.05, d / 2 - 0.05, y, w / 2 + 0.006, 2, [], 'side', true);
  }
  const doors = place.members.filter((m) => m.kind === 'endpoint');
  const count = Math.max(1, Math.min(4, doors.length));
  for (let i = 0; i < count; i++) {
    const x = -w / 2 + (w * (i + 0.5)) / count;
    const member = doors[i];
    b.slab(x, 0, d / 2 + 0.006, 0.1, 0.2, 0.012, member?.change ? MARK[member.change]! : 'door');
    b.slab(x, 0.22, d / 2 + 0.04, 0.16, 0.02, 0.08, 'trim');
  }
  if (place.members.some((m) => m.kind === 'config')) {
    b.slab(w / 2 + 0.006, 0.12, 0.12, 0.012, 0.12, 0.09, 'paper');
    for (let i = 0; i < 3; i++) b.slab(w / 2 + 0.014, 0.15 + i * 0.03, 0.12, 0.004, 0.008, 0.06, 'ink');
  }
  b.block(-0.15, h + 0.04, -0.08, 0.16, 0.08, 0.14, 'metal');
  b.cylinder(0.18, h + 0.04, 0.06, 0.04, 0.05, 'metal', { sides: 6 });
  return h + 0.12;
}

/** A works with a sawtooth roof and a chimney, for places that only run processes and jobs. */
function works(place: Place, b: Builder, wall: Tone): number {
  const w = 0.82;
  const d = 0.6;
  const h = GROUND + STOREY * 0.4;
  b.block(0, 0, 0, w, h, d, wall);
  for (let i = 0; i < 3; i++) b.gable(-w / 2 + (w * (i + 0.5)) / 3, h, 0, w / 3, d, 0.14, 'roof');
  b.slab(-0.18, 0, d / 2 + 0.006, 0.26, 0.24, 0.012, 'door');
  for (let i = 0; i < 4; i++) b.slab(-0.18, 0.04 + i * 0.05, d / 2 + 0.014, 0.24, 0.008, 0.004, 'trim');
  windowRow(b, 0.04, w / 2 - 0.04, 0.14, d / 2 + 0.006, 2, place.members, 'front', true);
  b.cylinder(w / 2 - 0.1, h, -d / 2 + 0.1, 0.05, 0.36, 'wall2', { sides: 8 });
  b.cylinder(w / 2 - 0.1, h + 0.3, -d / 2 + 0.1, 0.06, 0.04, 'bad', { sides: 8, ramp: 0 });
  return h + 0.36;
}

/** A warehouse with an arched roof, roll-up doors and silos: a store of data. */
function warehouse(place: Place, b: Builder, wall: Tone): number {
  const w = 0.78;
  const d = 0.62;
  const h = GROUND + 0.04 * place.size;
  b.block(-0.06, 0, 0, w - 0.12, h, d, wall);
  b.arch(-0.06, h, 0, w - 0.1, d + 0.04, 'roof');
  for (let i = 0; i < 2; i++) {
    const x = -0.26 + i * 0.26;
    b.slab(x, 0, d / 2 + 0.006, 0.18, 0.24, 0.012, 'metal');
    for (let k = 0; k < 5; k++) b.slab(x, 0.03 + k * 0.045, d / 2 + 0.014, 0.17, 0.006, 0.004, 'trim');
  }
  const silos = Math.min(3, 1 + Math.floor(place.size / 2));
  for (let i = 0; i < silos; i++) {
    const z = -0.18 + i * 0.18;
    b.cylinder(w / 2 - 0.02, 0, z, 0.075, 0.5, 'wall2', { sides: 10 });
    b.cylinder(w / 2 - 0.02, 0.5, z, 0.075, 0.06, 'roof', { sides: 10, top: 0 });
  }
  return h + d * 0.3;
}

/** A kiosk with a striped awning: a fast copy kept near its readers. */
function kiosk(b: Builder, wall: Tone): number {
  b.block(0, 0, 0, 0.42, 0.34, 0.36, wall);
  b.slab(0, 0.1, 0.186, 0.3, 0.14, 0.012, 'glass');
  for (let i = 0; i < 6; i++) b.slab(-0.175 + i * 0.07, 0.3, 0.24, 0.07, 0.02, 0.14, i % 2 ? 'paper' : 'bad');
  for (let i = 0; i < 3; i++) b.block(-0.1 + i * 0.1, 0.1, 0.21, 0.05, 0.05, 0.04, 'wood', { chamfer: 0.006 });
  return 0.4;
}

/** A depot with a loading bay; the stack of parcels shows how much is waiting. */
function depot(place: Place, b: Builder, wall: Tone): number {
  const w = 0.66;
  const d = 0.5;
  b.block(0, 0, -0.04, w, GROUND + 0.06, d, wall);
  b.gable(0, GROUND + 0.06, -0.04, w + 0.04, d + 0.04, 0.16, 'roof');
  b.slab(-0.12, 0, d / 2 - 0.034, 0.24, 0.26, 0.012, 'ink');
  b.slab(0, 0, 0.3, w, 0.06, 0.12, 'curb');
  const parcels = Math.max(1, Math.min(6, place.size + place.members.length));
  for (let i = 0; i < parcels; i++) b.block(0.12 + (i % 3) * 0.075, 0.06 + Math.floor(i / 3) * 0.06, 0.3, 0.06, 0.055, 0.06, 'wood', { chamfer: 0.006 });
  return GROUND + 0.22;
}

/** A notice board on two posts: messages every subscriber reads. */
function board(place: Place, b: Builder): number {
  b.slab(-0.22, 0, 0, 0.03, 0.42, 0.03, 'wood');
  b.slab(0.22, 0, 0, 0.03, 0.42, 0.03, 'wood');
  b.slab(0, 0.16, 0.0, 0.5, 0.26, 0.03, 'wood');
  b.slab(0, 0.42, 0.0, 0.54, 0.03, 0.06, 'roof');
  const papers = Math.max(3, Math.min(6, 2 + place.members.length));
  for (let i = 0; i < papers; i++) b.slab(-0.17 + (i % 3) * 0.17, 0.19 + Math.floor(i / 3) * 0.1, 0.018, 0.11, 0.08, 0.004, 'paper');
  return 0.45;
}

/** A building beyond the town wall, under a road sign. */
function outside(place: Place, b: Builder): number {
  const h = office({ ...place, members: [], size: Math.max(2, place.size) }, b, 'wall2');
  b.slab(-0.42, 0, 0.38, 0.03, 0.62, 0.03, 'metal');
  b.slab(0.42, 0, 0.38, 0.03, 0.62, 0.03, 'metal');
  b.slab(0, 0.5, 0.38, 0.7, 0.14, 0.03, 'sign');
  return Math.max(h, 0.64);
}

/** A power station: what other software runs on. */
function station(b: Builder, wall: Tone): number {
  b.block(0, 0, 0, 0.7, GROUND + 0.1, 0.5, wall);
  for (let i = 0; i < 2; i++) b.cylinder(-0.18 + i * 0.36, GROUND + 0.1, -0.08, 0.06, 0.5, 'wall2', { sides: 8, top: 0.045 });
  for (let i = 0; i < 3; i++) b.slab(-0.2 + i * 0.2, 0.12, 0.256, 0.1, 0.1, 0.012, 'window');
  return GROUND + 0.6;
}

function resident(b: Builder): number {
  b.cylinder(0, 0, 0, 0.05, 0.16, 'person', { sides: 8, top: 0.04 });
  b.ball(0, 0.21, 0, 0.045, 'paper');
  return 0.26;
}

function crate(b: Builder): number {
  b.block(0, 0, 0, 0.3, 0.26, 0.3, 'wood', { chamfer: 0.01 });
  for (let i = 0; i < 3; i++) b.slab(0, 0.04 + i * 0.08, 0.155, 0.3, 0.02, 0.006, 'trim');
  return 0.26;
}

function plot(b: Builder): number {
  for (let i = 0; i < 12; i++) {
    const t = (i / 12) * 4;
    const side = Math.floor(t);
    const f = t - side - 0.5;
    const [x, z] = side === 0 ? [f * 0.9, 0.45] : side === 1 ? [0.45, -f * 0.9] : side === 2 ? [-f * 0.9, -0.45] : [-0.45, f * 0.9];
    b.slab(x, 0, z, 0.025, 0.12, 0.025, 'wood');
  }
  return 0.12;
}

/** A crane beside work that is new: tower, jib, counterweight and hook. */
function crane(height: number): Part[] {
  const top = height + 0.32;
  const tower = part((b) => {
    for (let k = 0; k < Math.ceil(top / 0.1); k++) {
      b.slab(0.43, k * 0.1, -0.2, 0.06, 0.012, 0.06, 'warn');
      b.slab(0.43, k * 0.1, -0.2, 0.012, 0.1, 0.012, 'warn');
    }
    for (const [dx, dz] of [[-0.03, -0.03], [0.03, -0.03], [-0.03, 0.03], [0.03, 0.03]]) b.slab(0.43 + dx!, 0, -0.2 + dz!, 0.012, top, 0.012, 'warn');
    b.slab(0.43, top - 0.04, -0.2, 0.08, 0.08, 0.08, 'glass');
  }, 'swing', [0.43, 0, -0.2]);
  const jib = part((b) => {
    b.slab(0.43 - 0.26, top + 0.04, -0.2, 0.62, 0.025, 0.025, 'warn');
    b.slab(0.43 + 0.16, top - 0.02, -0.2, 0.08, 0.06, 0.07, 'metal');
    b.slab(0.43 - 0.5, top - 0.18, -0.2, 0.004, 0.22, 0.004, 'ink');
    b.slab(0.43 - 0.5, top - 0.22, -0.2, 0.04, 0.04, 0.04, 'warn');
  }, 'spin', [0.43, 0, -0.2]);
  return [tower, jib];
}

/** Scaffolding on two faces of work that changed. */
function scaffold(b: Builder, height: number) {
  const front = 0.36;
  const side = 0.41;
  for (let x = -0.33; x <= 0.34; x += 0.22) b.slab(x, 0, front, 0.014, height, 0.014, 'metal');
  for (let z = -0.28; z <= 0.29; z += 0.19) b.slab(side, 0, z, 0.014, height, 0.014, 'metal');
  for (let y = GROUND; y < height; y += STOREY) {
    b.slab(0, y, front, 0.7, 0.014, 0.05, 'mod');
    b.slab(side, y, 0, 0.05, 0.014, 0.6, 'mod');
  }
}

/** Boards over windows and a cross on the door: work that is going away. */
function boarded(b: Builder, height: number) {
  for (let y = GROUND + 0.09; y < height - 0.1; y += STOREY) for (let i = 0; i < 3; i++) b.slab(-0.23 + i * 0.23, y + 0.04, 0.322, 0.14, 0.04, 0.008, 'wood');
  const s = 0.12;
  for (const dir of [1, -1]) {
    const pts = (o: number): Vec3 => [o * dir * s, 0.1 + o * s, 0.33];
    b.quad([pts(-1)[0] - 0.01, pts(-1)[1], 0.33], [pts(-1)[0] + 0.01, pts(-1)[1], 0.33], [pts(1)[0] + 0.01, pts(1)[1], 0.33], [pts(1)[0] - 0.01, pts(1)[1], 0.33], 'wood');
  }
}

/** The hazard a risk's impact names, set in front of what it is about. */
export function hazard(impact: Impact, at: Vec3): Part[] {
  const [x, y, z] = at;
  switch (impact) {
    case 'crash':
      return [part((b) => {
        b.cylinder(x, y, z, 0.07, 0.16, 'fire', { top: 0, sides: 6, ramp: 0 });
        b.cylinder(x + 0.05, y, z + 0.03, 0.045, 0.11, 'warn', { top: 0, sides: 6, ramp: 0 });
        b.cylinder(x - 0.05, y, z - 0.02, 0.04, 0.09, 'warn', { top: 0, sides: 6, ramp: 0 });
      }, 'flicker', [x, y, z]), ...smoke([x, y + 0.14, z])];
    case 'hang':
      return [part((b) => { for (let i = 0; i < 3; i++) car(b, x - 0.16 + i * 0.16, y, z, i === 1 ? 'warn' : 'wall2'); }, 'blink', [x, y, z])];
    case 'degraded':
      return [part((b) => barrier(b, x, y, z), 'blink', [x, y, z])];
    case 'data_loss':
      return [part((b) => { b.slab(x, y + 0.004, z, 0.7, 0.03, 0.3, 'water'); }, 'swing', [x, y, z])];
    case 'corruption':
      return [part((b) => { for (let i = 0; i < 2; i++) b.cylinder(x - 0.05 + i * 0.1, y, z, 0.04, 0.1, 'add', { sides: 8 }); b.slab(x, y, z, 0.18, 0.006, 0.12, 'add'); }, 'blink', [x, y, z])];
    case 'disclosure':
      return [part((b) => { b.block(x, y, z, 0.12, 0.1, 0.1, 'wood', { chamfer: 0.006 }); for (let i = 0; i < 4; i++) b.slab(x - 0.06 + i * 0.05, y + 0.12 + i * 0.03, z + 0.02, 0.05, 0.004, 0.06, 'paper'); }, 'rise', [x, y, z])];
    case 'escalation':
      return [part((b) => { b.slab(x - 0.12, y, z, 0.02, 0.18, 0.02, 'metal'); b.slab(x + 0.12, y, z, 0.02, 0.18, 0.02, 'metal'); b.quad([x - 0.12, y + 0.16, z], [x - 0.02, y + 0.06, z], [x - 0.02, y + 0.08, z], [x - 0.12, y + 0.18, z], 'bad'); }, 'blink', [x, y, z])];
    case 'wrong_answer':
      return [part((b) => { b.block(x, y, z, 0.12, 0.12, 0.12, 'wood', { chamfer: 0.008 }); b.slab(x, y + 0.04, z + 0.062, 0.05, 0.05, 0.004, 'bad'); }, 'blink', [x, y, z])];
    case 'rejected':
      return [part((b) => { b.slab(x - 0.18, y, z, 0.03, 0.14, 0.03, 'metal'); for (let i = 0; i < 5; i++) b.slab(x - 0.12 + i * 0.06, y + 0.11, z, 0.06, 0.03, 0.02, i % 2 ? 'paper' : 'bad'); }, 'swing', [x - 0.18, y, z])];
    default:
      return [];
  }
}

function smoke(at: Vec3): Part[] {
  return [0, 1, 2].map((i) => part((b) => b.ball(at[0] + (i - 1) * 0.03, at[1] + i * 0.08, at[2], 0.04 + i * 0.012, 'smoke'), 'rise', [at[0], at[1], at[2]]));
}

export function barrier(b: Builder, x: number, y: number, z: number) {
  for (let i = 0; i < 2; i++) b.slab(x - 0.09 + i * 0.18, y, z, 0.02, 0.12, 0.04, 'metal');
  for (let i = 0; i < 5; i++) b.slab(x - 0.1 + i * 0.05, y + 0.08, z, 0.05, 0.04, 0.02, i % 2 ? 'paper' : 'bad');
  b.cylinder(x + 0.2, y, z, 0.035, 0.09, 'warn', { top: 0.006, sides: 6, ramp: 0 });
}

/** A small car on the ground, nose toward +x. */
export function car(b: Builder, x: number, y: number, z: number, tone: Tone = 'wall2') {
  b.block(x, y + 0.025, z, 0.16, 0.05, 0.085, tone, { chamfer: 0.012, ramp: 0.1 });
  b.block(x - 0.012, y + 0.075, z, 0.085, 0.035, 0.075, 'glass', { chamfer: 0.01, ramp: 0 });
  for (const [dx, dz] of [[-0.05, 0.045], [0.05, 0.045], [-0.05, -0.045], [0.05, -0.045]]) b.tube(x + dx!, y + 0.022, z + dz!, 0.022, 0.016, 'ink', 6);
}

export function tree(b: Builder, x: number, z: number, scale = 1) {
  b.cylinder(x, 0, z, 0.02 * scale, 0.1 * scale, 'trunk', { sides: 5 });
  b.ball(x, 0.15 * scale, z, 0.075 * scale, 'leaf');
  b.ball(x + 0.03 * scale, 0.21 * scale, z, 0.05 * scale, 'leaf');
}

export function lamp(b: Builder, x: number, z: number) {
  b.slab(x, 0, z, 0.016, 0.3, 0.016, 'metal');
  b.slab(x + 0.03, 0.3, z, 0.07, 0.012, 0.02, 'metal');
  b.slab(x + 0.055, 0.285, z, 0.03, 0.014, 0.02, 'window');
}

/** The model for one place, with its change and its conditions on it. */
export function placeModel(place: Place): Model {
  const b = new Builder();
  const deleted = place.change === 'deleted';
  const wall: Tone = deleted ? 'del' : 'wall';
  b.slab(0, 0, 0, 0.92, 0.04, 0.88, 'lot');
  const body = new Builder();
  const onlyProcesses = place.members.length > 0 && place.members.every((m) => m.kind === 'process' || m.kind === 'job');
  let height: number;
  switch (place.kind) {
    case 'database': height = warehouse(place, body, wall); break;
    case 'cache': height = kiosk(body, wall); break;
    case 'queue': case 'deadletter': case 'router': case 'bus': height = depot(place, body, place.kind === 'deadletter' ? 'warn' : wall); break;
    case 'topic': height = board(place, body); break;
    case 'external': height = outside(place, body); break;
    case 'runtime': case 'device': height = station(body, wall); break;
    case 'person': height = resident(body); break;
    case 'artifact': case 'data': height = crate(body); break;
    case 'host': height = plot(body); break;
    default: height = onlyProcesses ? works(place, body, wall) : office(place, body, wall);
  }
  if (place.members.some((m) => m.kind === 'job')) {
    body.cylinder(-0.3, height - 0.1, -0.2, 0.05, 0.3, 'wall2', { sides: 8 });
    body.cylinder(-0.3, height + 0.2, -0.2, 0.06, 0.08, 'roof', { sides: 8, top: 0 });
    body.cylinder(-0.3, height + 0.08, -0.15, 0.035, 0.01, 'paper', { sides: 10 });
    height += 0.28;
  }
  b.add(body.geometry, 0, 0.04, 0);
  const parts: Part[] = [];
  if (place.change === 'added' || place.change === 'copied') parts.push(...crane(height));
  if (place.change === 'modified' || place.change === 'renamed' || place.change === 'retyped') scaffold(b, height);
  if (deleted) boarded(b, height);
  for (const condition of place.conditions) {
    if (condition.kind === 'bug') b.quad([-0.2, 0.16, 0.316], [-0.16, 0.18, 0.316], [-0.08, 0.36, 0.316], [-0.11, 0.37, 0.316], 'ink');
    if (condition.kind === 'down') parts.push(part((x) => barrier(x, 0, 0.04, 0.42), 'blink', [0, 0, 0.42]));
    if (condition.kind === 'guarded') for (let i = 0; i < 6; i++) b.slab(-0.42 + i * 0.168, 0.04, 0.42, 0.016, 0.1, 0.016, 'metal');
    if (condition.kind === 'monitored') { b.slab(-0.4, 0.04, -0.38, 0.03, 0.5, 0.03, 'metal'); b.block(-0.4, 0.54, -0.38, 0.1, 0.08, 0.1, 'wall2'); }
  }
  return { body: b.geometry, parts, height: height + 0.04, lots: [1, 1] };
}
