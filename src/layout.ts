import type { Place, Town } from './model.js';

export interface Box {
  /** Centre of the place's footprint. */
  cx: number;
  /** Ground line the place stands on. */
  ground: number;
  w: number;
  h: number;
  /** The street running below this place's row. */
  street: number;
}

export interface DistrictBox {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Layout {
  width: number;
  height: number;
  wall: { x: number; y: number; w: number; h: number };
  boxes: Map<string, Box>;
  districts: DistrictBox[];
  /** Vertical avenues between columns, where roads change rows. */
  avenues: number[];
}

const CELL = 176;
const PER_ROW = 3;
const MAX_COLS = 4;
const LABEL = 54;
const STREET = 54;
const ROOF = 46;
const PAD = 28;
const BANNER = 64;

/** How much room a place takes, from what it is and what it holds. */
export function footprint(place: Place): { w: number; h: number } {
  const members = place.members.length;
  switch (place.kind) {
    case 'service': {
      const windows = place.members.filter((one) => !['endpoint', 'config', 'job', 'guard', 'event'].includes(one.kind)).length;
      const rows = Math.ceil(windows / 3);
      return { w: 112, h: Math.max(48 + place.size * 22, 44 + rows * 22 + 28) };
    }
    case 'database':
      return { w: 136, h: 64 + place.size * 6 };
    case 'cache':
      return { w: 76, h: 56 };
    case 'external':
      return { w: 100, h: 84 + members * 4 };
    case 'person':
      return { w: 40, h: 56 };
    case 'runtime':
      return { w: 110, h: 76 };
    case 'host':
      return { w: 150, h: 40 };
    case 'queue':
    case 'deadletter':
      return { w: 48, h: 66 };
    case 'topic':
      return { w: 70, h: 70 };
    case 'router':
    case 'bus':
      return { w: 100, h: 70 };
    default:
      return { w: 64, h: 52 };
  }
}

/** Positions for every place: districts as neighbourhoods, outsiders beyond the wall, people at the gate. */
export function layout(town: Town): Layout {
  const boxes = new Map<string, Box>();
  const outside = town.places.filter((one) => one.kind === 'external');
  const people = town.places.filter((one) => one.kind === 'person');
  const inside = town.places.filter((one) => one.kind !== 'external' && one.kind !== 'person');

  const groups: { id: string; places: Place[] }[] = [];
  for (const district of town.districts) {
    groups.push({ id: district.id, places: inside.filter((one) => one.district === district.id) });
  }
  const loose = inside.filter((one) => !one.district || !town.districts.some((d) => d.id === one.district));
  if (loose.length || !groups.length) groups.push({ id: '', places: loose });

  const left = PAD + (people.length ? 70 : 0);
  const blocks = groups
    .filter((group) => group.places.length || group.id)
    .map((group) => {
      const rows: Place[][] = [];
      for (let i = 0; i < group.places.length; i += PER_ROW) rows.push(group.places.slice(i, i + PER_ROW));
      return { id: group.id, rows: rows.length ? rows : [[]], cols: Math.max(1, Math.min(PER_ROW, group.places.length)) };
    });

  // Districts sit side by side and wrap, like words on a line, so a town of
  // many small districts stays wide instead of growing into a column.
  const bands: (typeof blocks)[] = [];
  let used = 0;
  for (const block of blocks) {
    if (!bands.length || used + block.cols > MAX_COLS) {
      bands.push([]);
      used = 0;
    }
    bands[bands.length - 1]!.push(block);
    used += block.cols;
  }
  const cols = Math.max(1, ...bands.map((band) => band.reduce((sum, block) => sum + block.cols, 0)));
  const innerWidth = cols * CELL;
  let y = PAD + BANNER;
  const districts: DistrictBox[] = [];
  const streets: number[] = [];

  for (const band of bands) {
    const top = y;
    const titled = band.some((block) => block.id);
    y += titled ? 30 : 0;
    const depth = Math.max(...band.map((block) => block.rows.length));
    // Rows line up across the band, so every district in it shares the same streets.
    for (let r = 0; r < depth; r++) {
      const tallest = Math.max(40, ...band.flatMap((block) => (block.rows[r] ?? []).map((one) => footprint(one).h)));
      const ground = y + ROOF + tallest;
      let cell = 0;
      for (const block of band) {
        const row = block.rows[r] ?? [];
        const offset = ((block.cols - row.length) * CELL) / 2;
        row.forEach((place, i) => {
          const size = footprint(place);
          boxes.set(place.id, { cx: left + 16 + cell * CELL + offset + CELL * i + CELL / 2, ground, street: ground + LABEL - 6, ...size });
        });
        cell += block.cols;
      }
      streets.push(ground + LABEL - 6);
      y = ground + LABEL + STREET;
    }
    let cell = 0;
    for (const block of band) {
      if (block.id) districts.push({ id: block.id, x: left + 16 + cell * CELL + 4, y: top, w: block.cols * CELL - 8, h: y - top - STREET + 12 });
      cell += block.cols;
    }
    y += titled ? 16 : 0;
  }

  const wall = { x: left - 8, y: PAD + BANNER - 18, w: innerWidth + 48, h: Math.max(y - (PAD + BANNER) - STREET + 40, 160) };

  // Places beyond the wall join the town's streets rather than cut across its rows.
  const snap = (ground: number) => streets.find((one) => one >= ground + 12) ?? streets[streets.length - 1] ?? ground + LABEL;
  let outsideY = PAD + BANNER + 10;
  for (const place of outside) {
    const size = footprint(place);
    const ground = outsideY + ROOF + size.h;
    boxes.set(place.id, { cx: wall.x + wall.w + 100, ground, street: snap(ground), ...size });
    outsideY += ROOF + size.h + LABEL + 20;
  }
  let peopleY = PAD + BANNER + 30;
  for (const place of people) {
    const size = footprint(place);
    const ground = peopleY + size.h;
    boxes.set(place.id, { cx: PAD + 24, ground, street: snap(ground), ...size });
    peopleY += size.h + LABEL + 10;
  }

  const avenues = [left + 16 - 8];
  for (let c = 1; c <= cols; c++) avenues.push(left + 16 + c * CELL);
  avenues.push(wall.x + wall.w + 18);
  const width = wall.x + wall.w + (outside.length ? 210 : PAD);
  const height = Math.max(wall.y + wall.h, outsideY, peopleY) + PAD;
  return { width, height, wall, boxes, districts, avenues };
}
