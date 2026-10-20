/**
 * A town laid out in three dimensions: lots on a street grid, districts as
 * blocks of lots, things outside beyond the edge, and the route each link's
 * traffic drives. The result is plain data, so any renderer can draw it.
 */
import { Builder, type Geometry, type Tone, type Vec3 } from './geometry.js';
import { car, hazard, lamp, placeModel, tree, type Model, type Part } from './catalog.js';
import type { Place, Target, Town } from './model.js';

/** Distance between lot centres: one lot and one street. */
export const PITCH = 1.5;
const STREET = 0.42;
const MAX_COLUMNS = 6;

export interface WorldPlace {
  id: string;
  label: string;
  sub: string;
  x: number;
  z: number;
  model: Model;
  change?: string;
}

export interface Route {
  from: string;
  to: string;
  kind: string;
  points: Vec3[];
  cars: number;
  /** Lots per second. */
  speed: number;
  tone: Tone;
  stopped: boolean;
}

export interface Pin {
  kind: 'risk' | 'behavior';
  id: string;
  at: Vec3;
  text: string;
}

export interface WorldDistrict {
  id: string;
  label: string;
  x: number;
  z: number;
  w: number;
  d: number;
}

export interface World {
  title: string;
  intent?: string;
  bounds: { x: number; z: number; w: number; d: number };
  ground: Geometry;
  places: WorldPlace[];
  hazards: Part[];
  routes: Route[];
  pins: Pin[];
  districts: WorldDistrict[];
  /** A car to instance for traffic, nose toward +x. */
  car: Geometry;
}

interface Cell {
  place: Place;
  col: number;
  row: number;
}

function pack(town: Town): { cells: Cell[]; districts: { id: string; label: string; col: number; row: number; cols: number; rows: number }[] } {
  const inside = town.places.filter((p) => p.kind !== 'external' && p.kind !== 'person');
  const groups = new Map<string, Place[]>();
  for (const place of inside) {
    const key = place.district ?? '';
    groups.set(key, [...(groups.get(key) ?? []), place]);
  }
  const cells: Cell[] = [];
  const districts: { id: string; label: string; col: number; row: number; cols: number; rows: number }[] = [];
  let col = 0;
  let row = 0;
  let bandRows = 0;
  for (const [id, places] of groups) {
    const cols = Math.min(MAX_COLUMNS, Math.max(1, Math.ceil(Math.sqrt(places.length))));
    const rows = Math.ceil(places.length / cols);
    if (col > 0 && col + cols > MAX_COLUMNS) {
      col = 0;
      row += bandRows;
      bandRows = 0;
    }
    places.forEach((place, i) => cells.push({ place, col: col + (i % cols), row: row + Math.floor(i / cols) }));
    const label = town.districts.find((d) => d.id === id)?.label ?? id;
    if (id) districts.push({ id, label, col, row, cols, rows });
    col += cols;
    bandRows = Math.max(bandRows, rows);
  }
  const width = Math.max(1, ...cells.map((c) => c.col + 1));
  const depth = row + bandRows;
  // Outside systems stand in a row behind the town, people in front of it.
  town.places.filter((p) => p.kind === 'external').forEach((place, i) => cells.push({ place, col: Math.round(((i + 0.5) * width) / Math.max(1, town.places.filter((p) => p.kind === 'external').length) - 0.5), row: -1 }));
  town.places.filter((p) => p.kind === 'person').forEach((place, i) => cells.push({ place, col: i, row: depth }));
  return { cells, districts };
}

const centre = (n: number) => n * PITCH;
/** The street in front of a row of lots, and the avenue to the right of a column. */
const streetZ = (row: number) => centre(row) + PITCH / 2;
const avenueX = (col: number) => centre(col) + PITCH / 2;

function roads(b: Builder, cols: number, rowsFrom: number, rowsTo: number) {
  const x0 = avenueX(-1);
  const x1 = avenueX(cols - 1);
  for (let row = rowsFrom - 1; row <= rowsTo; row++) {
    const z = streetZ(row);
    b.slab((x0 + x1) / 2, 0, z, x1 - x0 + STREET, 0.02, STREET, 'road');
    for (let x = x0 + 0.3; x < x1 - 0.2; x += 0.3) b.slab(x, 0.02, z, 0.14, 0.004, 0.02, 'marking');
  }
  const z0 = streetZ(rowsFrom - 1);
  const z1 = streetZ(rowsTo);
  for (let col = -1; col < cols; col++) {
    const x = avenueX(col);
    b.slab(x, 0.002, (z0 + z1) / 2, STREET, 0.02, z1 - z0 + STREET, 'road');
    for (let z = z0 + 0.3; z < z1 - 0.2; z += 0.3) b.slab(x, 0.022, z, 0.02, 0.004, 0.14, 'marking');
  }
}

/** Where a risk or a behavior stands: in front of the place, a little to one side. */
function standing(target: Target, at: Map<string, WorldPlace>, offset: number): Vec3 | null {
  const id = target.kind === 'link' ? target.from : target.place;
  const place = at.get(id);
  if (!place) return null;
  return [place.x + offset, 0.04, place.z + 0.5];
}

/** Drive from the front of one lot to the front of another along the streets. */
function drive(a: WorldPlace, b: WorldPlace): Vec3[] {
  const rowA = Math.round(a.z / PITCH);
  const rowB = Math.round(b.z / PITCH);
  const lane = 0.08;
  const za = streetZ(rowA) - lane;
  const zb = streetZ(rowB) - lane;
  const points: Vec3[] = [[a.x + 0.2, 0.02, a.z + 0.45], [a.x + 0.2, 0.02, za]];
  if (rowA !== rowB) {
    const side = b.x >= a.x ? 1 : -1;
    const x = a.x + (side * PITCH) / 2 + lane * side;
    points.push([x, 0.02, za], [x, 0.02, zb]);
  }
  points.push([b.x - 0.2, 0.02, zb], [b.x - 0.2, 0.02, b.z + 0.45]);
  return points;
}

const LINK_TONE: Record<string, Tone> = { calls: 'wall2', reads: 'water', writes: 'water', sends: 'warn', transfers: 'wood', triggers: 'bad' };

export function world(town: Town): World {
  const { cells, districts } = pack(town);
  const cols = Math.max(1, ...cells.filter((c) => c.row >= 0).map((c) => c.col + 1));
  const lastRow = Math.max(0, ...cells.map((c) => c.row));
  const firstRow = Math.min(0, ...cells.map((c) => c.row));
  const ground = new Builder();
  const pad = 0.6;
  const bx0 = avenueX(-1) - pad;
  const bx1 = avenueX(cols - 1) + pad;
  const bz0 = streetZ(firstRow - 1) - pad;
  const bz1 = streetZ(lastRow) + pad;
  ground.slab((bx0 + bx1) / 2, -0.06, (bz0 + bz1) / 2, bx1 - bx0, 0.06, bz1 - bz0, 'ground');
  roads(ground, cols, firstRow, lastRow);

  const worldDistricts: WorldDistrict[] = districts.map((d) => {
    const x = centre(d.col) - 0.55;
    const z = centre(d.row) - 0.55;
    const w = (d.cols - 1) * PITCH + 1.1;
    const dd = (d.rows - 1) * PITCH + 1.1;
    ground.slab(x + w / 2, 0, z + dd / 2, w, 0.012, dd, 'grass');
    return { id: d.id, label: d.label, x, z, w, d: dd };
  });

  const places: WorldPlace[] = cells.map(({ place, col, row }) => ({
    id: place.id,
    label: place.id,
    sub: place.label ?? '',
    x: centre(col),
    z: centre(row),
    model: placeModel(place),
    change: place.change,
  }));
  const at = new Map(places.map((p) => [p.id, p]));

  // Trees and lamps on the corners nobody built on.
  const taken = new Set(cells.map((c) => `${c.col}:${c.row}`));
  for (let row = firstRow; row <= lastRow; row++) {
    for (let col = 0; col < cols; col++) {
      if (!taken.has(`${col}:${row}`) && row >= 0) {
        tree(ground, centre(col) - 0.2, centre(row) - 0.1, 1.4);
        tree(ground, centre(col) + 0.22, centre(row) + 0.15, 1.1);
        tree(ground, centre(col) - 0.05, centre(row) + 0.3, 0.9);
      }
      lamp(ground, avenueX(col) - STREET / 2 - 0.04, streetZ(row) - STREET / 2 - 0.04);
    }
  }

  const routes: Route[] = [];
  for (const link of town.links) {
    const a = at.get(link.from);
    const b = at.get(link.to);
    if (!a || !b) continue;
    const traffic = link.traffic === 'high' ? 4 : link.traffic === 'low' ? 1 : 2;
    const conditions = new Set(link.conditions.map((c) => c.kind));
    const stopped = link.change === 'deleted' || conditions.has('broken') || conditions.has('down');
    routes.push({
      from: link.from,
      to: link.to,
      kind: link.kind,
      points: drive(a, b),
      cars: stopped ? 0 : conditions.has('busy') ? traffic + 3 : traffic,
      speed: conditions.has('slow') || conditions.has('late') ? 0.15 : 0.7,
      tone: link.change === 'added' ? 'add' : link.change === 'modified' ? 'mod' : LINK_TONE[link.kind] ?? 'wall2',
      stopped,
    });
  }

  const hazards: Part[] = [];
  const pins: Pin[] = [];
  town.risks.forEach((risk, i) => {
    const spot = standing(risk.target, at, -0.25 + (i % 3) * 0.2);
    if (!spot) return;
    hazards.push(...hazard(risk.impact, spot));
    const place = at.get(risk.target.kind === 'link' ? risk.target.from : risk.target.place)!;
    pins.push({ kind: 'risk', id: risk.id, at: [spot[0], place.model.height + 0.25, place.z], text: risk.text });
  });
  town.behaviors.forEach((behavior, i) => {
    const spot = standing(behavior.target, at, 0.3 - (i % 2) * 0.12);
    if (!spot) return;
    ground.slab(spot[0], 0, spot[2] + 0.08, 0.015, 0.26, 0.015, 'metal');
    ground.slab(spot[0], 0.2, spot[2] + 0.08, 0.14, 0.07, 0.012, 'sign');
    pins.push({ kind: 'behavior', id: behavior.id, at: [spot[0], 0.32, spot[2] + 0.08], text: `${behavior.before} → ${behavior.after}` });
  });

  const carBuilder = new Builder();
  car(carBuilder, 0, 0, 0, 'wall2');

  return {
    title: town.name ?? 'Codetown',
    intent: town.intent,
    bounds: { x: bx0, z: bz0, w: bx1 - bx0, d: bz1 - bz0 },
    ground: ground.geometry,
    places,
    hazards,
    routes,
    pins,
    districts: worldDistricts,
    car: carBuilder.geometry,
  };
}
