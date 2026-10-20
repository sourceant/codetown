/**
 * Low-poly geometry built from code, so the catalogue ships as source rather
 * than model files. Every triangle is flat shaded and coloured by a palette
 * key, not a colour, so one model serves the light and the dark world.
 */

export type Tone =
  | 'ground' | 'lot' | 'grass' | 'road' | 'curb' | 'marking'
  | 'wall' | 'wall2' | 'trim' | 'roof' | 'window' | 'door' | 'glass'
  | 'metal' | 'wood' | 'leaf' | 'trunk' | 'paper' | 'ink' | 'sign'
  | 'add' | 'mod' | 'del' | 'bad' | 'warn' | 'water' | 'smoke' | 'fire' | 'person';

export type Vec3 = [number, number, number];

export interface Geometry {
  positions: number[];
  normals: number[];
  /** Index into the tone list, one per vertex. */
  tones: number[];
  /** Brightness multiplier, one per vertex: the storey ramp lives here. */
  shades: number[];
}

export const TONES: Tone[] = [
  'ground', 'lot', 'grass', 'road', 'curb', 'marking',
  'wall', 'wall2', 'trim', 'roof', 'window', 'door', 'glass',
  'metal', 'wood', 'leaf', 'trunk', 'paper', 'ink', 'sign',
  'add', 'mod', 'del', 'bad', 'warn', 'water', 'smoke', 'fire', 'person',
];
const TONE_INDEX = new Map(TONES.map((tone, i) => [tone, i]));

/** How much darker the foot of a wall is than its top, as KayKit-style banding. */
export const RAMP = 0.18;

function cross(a: Vec3, b: Vec3, c: Vec3): Vec3 {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n: Vec3 = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
  const length = Math.hypot(...n) || 1;
  return [n[0] / length, n[1] / length, n[2] / length];
}

export class Builder {
  readonly geometry: Geometry = { positions: [], normals: [], tones: [], shades: [] };

  get triangles() {
    return this.geometry.positions.length / 9;
  }

  /** One triangle, counter-clockwise seen from outside. */
  tri(a: Vec3, b: Vec3, c: Vec3, tone: Tone, shades: [number, number, number] = [1, 1, 1]) {
    const n = cross(a, b, c);
    const t = TONE_INDEX.get(tone)!;
    for (const [i, p] of [a, b, c].entries()) {
      this.geometry.positions.push(...p);
      this.geometry.normals.push(...n);
      this.geometry.tones.push(t);
      this.geometry.shades.push(shades[i]!);
    }
  }

  quad(a: Vec3, b: Vec3, c: Vec3, d: Vec3, tone: Tone, shades: [number, number, number, number] = [1, 1, 1, 1]) {
    this.tri(a, b, c, tone, [shades[0], shades[1], shades[2]]);
    this.tri(a, c, d, tone, [shades[0], shades[2], shades[3]]);
  }

  /** A convex polygon, as a fan; points counter-clockwise seen from where its normal points. */
  polygon(points: Vec3[], tone: Tone, shade = 1) {
    for (let i = 1; i < points.length - 1; i++) this.tri(points[0]!, points[i]!, points[i + 1]!, tone, [shade, shade, shade]);
  }

  /**
   * A box standing on y, centred on x and z, with every vertical and top edge
   * cut at 45 degrees. Walls darken toward the foot unless `ramp` is 0.
   */
  block(x: number, y: number, z: number, w: number, h: number, d: number, tone: Tone, options: { chamfer?: number; ramp?: number; top?: Tone } = {}) {
    const c = Math.min(options.chamfer ?? 0.02, w / 4, d / 4, h / 4);
    const ramp = options.ramp ?? RAMP;
    const hw = w / 2;
    const hd = d / 2;
    const ring = (inset: number, at: number): Vec3[] => {
      const a = hw - inset;
      const b = hd - inset;
      const k = c > 0 ? c : 0;
      return [
        [x - a + k, at, z + b], [x + a - k, at, z + b], [x + a, at, z + b - k], [x + a, at, z - b + k],
        [x + a - k, at, z - b], [x - a + k, at, z - b], [x - a, at, z - b + k], [x - a, at, z + b - k],
      ];
    };
    const foot = ring(0, y);
    const shoulder = ring(0, y + h - c);
    const cap = ring(c, y + h);
    const low = 1 - ramp;
    for (let i = 0; i < 8; i++) {
      const j = (i + 1) % 8;
      this.quad(foot[i]!, foot[j]!, shoulder[j]!, shoulder[i]!, tone, [low, low, 1, 1]);
      if (c > 0) this.quad(shoulder[i]!, shoulder[j]!, cap[j]!, cap[i]!, options.top ?? tone, [1, 1, 1.04, 1.04]);
    }
    this.polygon(cap, options.top ?? tone, 1.04);
  }

  /** A plain box with no chamfer and no ramp: four sides and a top, ten triangles. */
  slab(x: number, y: number, z: number, w: number, h: number, d: number, tone: Tone) {
    const [x0, x1, z0, z1, y1] = [x - w / 2, x + w / 2, z - d / 2, z + d / 2, y + h];
    this.quad([x0, y, z1], [x1, y, z1], [x1, y1, z1], [x0, y1, z1], tone);
    this.quad([x1, y, z0], [x0, y, z0], [x0, y1, z0], [x1, y1, z0], tone);
    this.quad([x1, y, z1], [x1, y, z0], [x1, y1, z0], [x1, y1, z1], tone);
    this.quad([x0, y, z0], [x0, y, z1], [x0, y1, z1], [x0, y1, z0], tone);
    this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], tone, [1.04, 1.04, 1.04, 1.04]);
  }

  /** An upright cylinder, or a cone when the top radius is smaller. */
  cylinder(x: number, y: number, z: number, r: number, h: number, tone: Tone, options: { sides?: number; top?: number; ramp?: number; cap?: Tone } = {}) {
    const sides = options.sides ?? 8;
    const top = options.top ?? r;
    const low = 1 - (options.ramp ?? RAMP);
    const at = (radius: number, height: number, i: number): Vec3 => {
      const a = (i / sides) * Math.PI * 2;
      return [x + Math.cos(a) * radius, height, z + Math.sin(a) * radius];
    };
    for (let i = 0; i < sides; i++) {
      const j = i + 1;
      if (top > 0) this.quad(at(r, y, j), at(r, y, i), at(top, y + h, i), at(top, y + h, j), tone, [low, low, 1, 1]);
      else this.tri(at(r, y, j), at(r, y, i), [x, y + h, z], tone, [low, low, 1]);
    }
    if (top > 0) this.polygon(Array.from({ length: sides }, (_, i) => at(top, y + h, sides - i)), options.cap ?? tone, 1.04);
  }

  /** A horizontal cylinder along x, for pipes, rollers and wheels. */
  tube(x: number, y: number, z: number, r: number, length: number, tone: Tone, sides = 6) {
    const at = (i: number, dx: number): Vec3 => {
      const a = (i / sides) * Math.PI * 2;
      return [x + dx, y + Math.sin(a) * r, z + Math.cos(a) * r];
    };
    for (let i = 0; i < sides; i++) this.quad(at(i, length / 2), at(i + 1, length / 2), at(i + 1, -length / 2), at(i, -length / 2), tone);
    this.polygon(Array.from({ length: sides }, (_, i) => at(sides - i, length / 2)), tone);
    this.polygon(Array.from({ length: sides }, (_, i) => at(i, -length / 2)), tone);
  }

  /** A gable roof over a w by d footprint, ridge along x. */
  gable(x: number, y: number, z: number, w: number, d: number, rise: number, tone: Tone, end: Tone = 'wall') {
    const hw = w / 2;
    const hd = d / 2;
    const ridgeA: Vec3 = [x - hw, y + rise, z];
    const ridgeB: Vec3 = [x + hw, y + rise, z];
    this.quad([x - hw, y, z + hd], [x + hw, y, z + hd], ridgeB, ridgeA, tone, [0.9, 0.9, 1.05, 1.05]);
    this.quad([x + hw, y, z - hd], [x - hw, y, z - hd], ridgeA, ridgeB, tone, [0.9, 0.9, 1.05, 1.05]);
    this.tri([x + hw, y, z + hd], [x + hw, y, z - hd], ridgeB, end);
    this.tri([x - hw, y, z - hd], [x - hw, y, z + hd], ridgeA, end);
  }

  /** A half cylinder roof over a w by d footprint, curving across z, as on a warehouse. */
  arch(x: number, y: number, z: number, w: number, d: number, tone: Tone, end: Tone = 'wall', segments = 8) {
    const hw = w / 2;
    const r = d / 2;
    const at = (i: number, dx: number): Vec3 => {
      const a = (i / segments) * Math.PI;
      return [x + dx, y + Math.sin(a) * r * 0.6, z + Math.cos(a) * r];
    };
    for (let i = 0; i < segments; i++) {
      const shade = 0.92 + 0.12 * Math.sin(((i + 0.5) / segments) * Math.PI);
      this.quad(at(i, hw), at(i + 1, hw), at(i + 1, -hw), at(i, -hw), tone, [shade, shade, shade, shade]);
    }
    this.polygon(Array.from({ length: segments + 1 }, (_, i) => at(segments - i, hw)), end);
    this.polygon(Array.from({ length: segments + 1 }, (_, i) => at(i, -hw)), end);
  }

  /** A low-poly ball: an octahedron split once. */
  ball(x: number, y: number, z: number, r: number, tone: Tone) {
    const p: Vec3[] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    const faces = [[0, 2, 4], [4, 2, 1], [1, 2, 5], [5, 2, 0], [4, 3, 0], [1, 3, 4], [5, 3, 1], [0, 3, 5]];
    const mid = (a: Vec3, b: Vec3): Vec3 => {
      const m: Vec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
      const l = Math.hypot(...m);
      return [m[0] / l, m[1] / l, m[2] / l];
    };
    const put = (v: Vec3): Vec3 => [x + v[0] * r, y + v[1] * r, z + v[2] * r];
    for (const [i, j, k] of faces) {
      const a = p[i!]!, b = p[j!]!, c = p[k!]!;
      const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
      for (const [u, v, w] of [[a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]] as Vec3[][]) this.tri(put(u!), put(v!), put(w!), tone);
    }
  }

  /** Another builder's triangles, moved and turned a multiple of 90 degrees about y. */
  add(other: Geometry, dx = 0, dy = 0, dz = 0, quarterTurns = 0) {
    const turn = ((quarterTurns % 4) + 4) % 4;
    const rotate = (px: number, pz: number): [number, number] =>
      turn === 0 ? [px, pz] : turn === 1 ? [pz, -px] : turn === 2 ? [-px, -pz] : [-pz, px];
    const g = this.geometry;
    for (let i = 0; i < other.positions.length; i += 3) {
      const [px, pz] = rotate(other.positions[i]!, other.positions[i + 2]!);
      g.positions.push(px + dx, other.positions[i + 1]! + dy, pz + dz);
      const [nx, nz] = rotate(other.normals[i]!, other.normals[i + 2]!);
      g.normals.push(nx, other.normals[i + 1]!, nz);
    }
    g.tones.push(...other.tones);
    g.shades.push(...other.shades);
  }
}
