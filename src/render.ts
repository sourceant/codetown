import { layout, type Box, type Layout } from './layout.js';
import { targetText, type Condition, type Link, type Place, type Risk, type Target, type Town } from './model.js';
import { lookup, type Change, type Impact } from './vocabulary.js';

export interface RenderOptions {
  /** Draw moving cars, smoke and flicker. Off gives a still picture. */
  animate?: boolean;
  /** Follow the reader's setting, or force one. */
  theme?: 'auto' | 'light' | 'dark';
}

const esc = (text: string) =>
  String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const STYLE = `
.ct{--bg:#eef0ea;--ground:#e2e7dc;--district:#d6ddcf;--ink:#1f2622;--muted:#5e6a63;--line:#c9d0c6;--bldg:#fbfbf7;--window:#f2c94c;--dark:#3a423d;--door:#6b4f3a;--road:#7a838a;--pipe:#3b7ea8;--outside:#d9ddd6;--add:#2e8b57;--mod:#2a6db0;--del:#a3a9a5;--bad:#c8452f;--warn:#d08a1e;--water:#4a90c2;--panel:#f8f9f5}
.ct.dark{--bg:#121614;--ground:#1c231f;--district:#232b26;--ink:#e4e8e2;--muted:#96a29a;--line:#2f3833;--bldg:#2a322d;--window:#e8b93f;--dark:#0d100e;--door:#a07a5a;--road:#8d969c;--pipe:#5aa0cc;--outside:#232925;--add:#5fb37a;--mod:#6aa8e8;--del:#5b635e;--bad:#e2654c;--warn:#e0a23c;--water:#3a7fb3;--panel:#1a201d}
@media (prefers-color-scheme:dark){.ct.auto{--bg:#121614;--ground:#1c231f;--district:#232b26;--ink:#e4e8e2;--muted:#96a29a;--line:#2f3833;--bldg:#2a322d;--window:#e8b93f;--dark:#0d100e;--door:#a07a5a;--road:#8d969c;--pipe:#5aa0cc;--outside:#232925;--add:#5fb37a;--mod:#6aa8e8;--del:#5b635e;--bad:#e2654c;--warn:#e0a23c;--water:#3a7fb3;--panel:#1a201d}}
.ct text{font-family:"IBM Plex Sans",system-ui,sans-serif;fill:var(--ink)}
.ct .mono{font-family:"IBM Plex Mono",ui-monospace,monospace}
.ct .muted{fill:var(--muted)}
.ct .place{cursor:pointer}
`;

const CHANGE_STROKE: Record<Change, string> = {
  added: 'var(--add)',
  modified: 'var(--mod)',
  deleted: 'var(--del)',
  renamed: 'var(--mod)',
  copied: 'var(--add)',
  retyped: 'var(--mod)',
};

const fill = (paint: string, stroke = 'none', extra = '') => `style="fill:${paint};stroke:${stroke}${extra}"`;

/** Draws a town as one self-contained SVG document. */
export function render(town: Town, options: RenderOptions = {}): string {
  const animate = options.animate ?? true;
  const theme = options.theme ?? 'auto';
  const map = layout(town);
  const parts: string[] = [];

  parts.push(`<rect x="0" y="0" width="${map.width}" height="${map.height}" ${fill('var(--bg)')}/>`);
  parts.push(wall(town, map));
  for (const district of map.districts) parts.push(districtPatch(town, district));
  parts.push(blastShade(town, map));

  town.links.forEach((link, index) => parts.push(road(link, map, index, animate)));
  for (const place of town.places) parts.push(drawPlace(place, map.boxes.get(place.id)!, animate));
  for (const risk of town.risks) parts.push(hazard(risk, town, map, animate));
  town.behaviors.forEach((one, index) => {
    const at = anchor(one.target, town, map);
    if (at) parts.push(signpost(one.id, `${one.before} → ${one.after}`, at.x - 34 - index * 6, at.y));
  });
  for (const test of town.tests) {
    const at = anchor(test.target, town, map);
    if (at) parts.push(badge(test.count, test.name ?? targetText(test.target), at.x + 30, at.y - 6));
  }
  if (animate) town.trips.forEach((trip, index) => parts.push(tripVehicle(trip.stops, map, index)));

  const label = town.intent ? `${town.name}: ${town.intent}` : town.name;
  return `<svg xmlns="http://www.w3.org/2000/svg" class="ct ${theme}" viewBox="0 0 ${map.width} ${map.height}" width="${map.width}" height="${map.height}" role="img" aria-label="${esc(label)}"><style>${STYLE}</style>${parts.join('')}</svg>`;
}

function wall(town: Town, map: Layout): string {
  const { x, y, w, h } = map.wall;
  let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="18" ${fill('var(--ground)', 'var(--line)', ';stroke-width:2;stroke-dasharray:10 6')}/>`;
  s += `<text x="${x + 16}" y="${y - 30}" font-size="17" font-weight="600">${esc(town.name)}</text>`;
  if (town.intent) {
    // The intent hangs over the gate as a banner.
    s += `<rect x="${x + 12}" y="${y - 22}" width="${Math.min(w - 24, 14 + town.intent.length * 6.6)}" height="22" rx="4" ${fill('var(--panel)', 'var(--ink)', ';stroke-width:1')}/>`;
    s += `<text x="${x + 20}" y="${y - 7}" font-size="12">${esc(town.intent)}</text>`;
  }
  if (town.purpose) {
    s += `<text x="${x + w - 12}" y="${y - 30}" text-anchor="end" font-size="11" class="muted">${esc(town.purpose)}${town.purposeNote ? `: ${esc(town.purposeNote)}` : ''}</text>`;
  }
  if (town.places.some((one) => one.kind === 'external')) {
    s += `<text x="${x + w + 100}" y="${y + 6}" text-anchor="middle" font-size="10.5" letter-spacing="1" class="muted">OUTSIDE</text>`;
  }
  return s;
}

function districtPatch(town: Town, box: Layout['districts'][number]): string {
  const district = town.districts.find((one) => one.id === box.id);
  const stroke = district?.change ? CHANGE_STROKE[district.change] : 'var(--line)';
  return `<g><rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="12" ${fill('var(--district)', stroke, `;stroke-width:${district?.change ? 2 : 1}`)}/><text x="${box.x + 12}" y="${box.y + 19}" font-size="12" font-weight="600">${esc(district?.label ?? box.id)}</text></g>`;
}

/** How much of the town a risk reaches, shaded under everything else. */
function blastShade(town: Town, map: Layout): string {
  let s = '';
  for (const risk of town.risks) {
    if (risk.blast === 'everyone') {
      const { x, y, w, h } = map.wall;
      s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="18" ${fill('var(--bad)', 'none', ';opacity:.07')}/>`;
    } else if (risk.blast === 'many') {
      const place = placeOf(risk.target, town);
      const district = map.districts.find((one) => one.id === place?.district);
      if (district) s += `<rect x="${district.x}" y="${district.y}" width="${district.w}" height="${district.h}" rx="12" ${fill('var(--bad)', 'none', ';opacity:.08')}/>`;
    }
  }
  return s;
}

function placeOf(target: Target, town: Town): Place | undefined {
  if (target.kind === 'link') return undefined;
  return town.places.find((one) => one.id === target.place);
}

/** The point on the map a statement about a target is drawn at. */
function anchor(target: Target, town: Town, map: Layout): { x: number; y: number } | undefined {
  if (target.kind === 'link') {
    const a = map.boxes.get(target.from);
    const b = map.boxes.get(target.to);
    if (!a || !b) return undefined;
    const index = town.links.findIndex((one) => one.from === target.from && one.to === target.to);
    return route(a, b, map, Math.max(index, 0)).mid;
  }
  const box = map.boxes.get(target.place);
  if (!box) return undefined;
  return { x: box.cx + box.w / 2 - 6, y: box.ground - box.h };
}

/**
 * A road follows the town's grid: down to the street under its row, along to
 * the nearest avenue, along the avenue to the destination's street, and up
 * to the door. `lane` keeps parallel roads apart.
 */
function route(a: Box, b: Box, map: Layout, lane: number): { d: string; mid: { x: number; y: number } } {
  const offset = (lane % 5) * 4 - 8;
  const sa = a.street + offset;
  const sb = b.street + offset;
  if (Math.abs(a.street - b.street) < 1) {
    const d = rounded([[a.cx, a.ground + 2], [a.cx, sa], [b.cx, sa], [b.cx, b.ground + 2]]);
    return { d, mid: { x: (a.cx + b.cx) / 2, y: sa } };
  }
  const goal = (a.cx + b.cx) / 2;
  const avenue = map.avenues.reduce((best, x) => (Math.abs(x - goal) < Math.abs(best - goal) ? x : best), map.avenues[0]!) + offset;
  const d = rounded([[a.cx, a.ground + 2], [a.cx, sa], [avenue, sa], [avenue, sb], [b.cx, sb], [b.cx, b.ground + 2]]);
  return { d, mid: { x: (a.cx + avenue) / 2, y: sa } };
}

/** A polyline with its corners rounded. */
function rounded(points: [number, number][]): string {
  const r = 10;
  let d = `M${points[0]![0]} ${points[0]![1]}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i - 1]!;
    const [x, y] = points[i]!;
    const [nx, ny] = points[i + 1]!;
    const inLen = Math.hypot(x - px, y - py) || 1;
    const outLen = Math.hypot(nx - x, ny - y) || 1;
    const ri = Math.min(r, inLen / 2, outLen / 2);
    d += ` L${x - ((x - px) / inLen) * ri} ${y - ((y - py) / inLen) * ri} Q${x} ${y} ${x + ((nx - x) / outLen) * ri} ${y + ((ny - y) / outLen) * ri}`;
  }
  const last = points[points.length - 1]!;
  return d + ` L${last[0]} ${last[1]}`;
}

function road(link: Link, map: Layout, index: number, animate: boolean): string {
  const a = map.boxes.get(link.from);
  const b = map.boxes.get(link.to);
  if (!a || !b) return '';
  const { d, mid } = route(a, b, map, index);
  const width = { low: 2.5, normal: 4.5, high: 8 }[link.traffic];
  const has = (kind: string) => link.conditions.some((one) => one.kind === kind);
  const colour = link.change ? CHANGE_STROKE[link.change] : 'var(--road)';
  const deleted = link.change === 'deleted';
  let s = '';

  switch (link.kind) {
    case 'reads':
    case 'writes':
      s += `<path d="${d}" ${fill('none', link.change ? colour : 'var(--pipe)', `;stroke-width:${width - 1};stroke-linecap:round`)}/>`;
      s += `<path d="${d}" ${fill('none', 'var(--bg)', ';stroke-width:1;opacity:.6')}/>`;
      break;
    case 'sends':
    case 'transfers':
      s += `<path d="${d}" ${fill('none', colour, `;stroke-width:${width};stroke-dasharray:3 4;stroke-linecap:butt`)}/>`;
      break;
    case 'triggers':
      s += `<path d="${d}" ${fill('none', colour, ';stroke-width:1.5;stroke-dasharray:1 4;stroke-linecap:round')}/>`;
      break;
    case 'calls':
      s += `<path d="${d}" ${fill('none', colour, `;stroke-width:${width};stroke-linecap:round;opacity:.9`)}/>`;
      if (link.traffic !== 'low') s += `<path d="${d}" ${fill('none', 'var(--bg)', ';stroke-width:1;stroke-dasharray:6 7')}/>`;
      break;
    default:
      // Structural links are footpaths: they do not carry traffic.
      s += `<path d="${d}" ${fill('none', colour, ';stroke-width:1.5;stroke-dasharray:2 5;opacity:.8')}/>`;
  }
  if (deleted) s = `<g style="opacity:.45">${s}</g>`;

  if (has('broken')) {
    // A collapsed bridge: the road stops with a gap and a warning.
    s += `<rect x="${mid.x - 12}" y="${mid.y - 7}" width="24" height="14" ${fill('var(--bg)')}/>`;
    s += `<path d="M${mid.x - 12} ${mid.y - 6} l6 6 l-6 6 M${mid.x + 12} ${mid.y - 6} l-6 6 l6 6" ${fill('none', 'var(--bad)', ';stroke-width:2')}/>`;
  }
  if (has('degraded')) {
    for (const dx of [-10, 0, 10]) s += `<path d="M${mid.x + dx - 4} ${mid.y + 5} l4 -11 l4 11 z" ${fill('var(--warn)', 'var(--ink)', ';stroke-width:.6')}/>`;
  }
  if (has('errors')) s += `<g transform="translate(${mid.x + 16},${mid.y - 10}) rotate(35)"><rect x="-6" y="-4" width="12" height="8" rx="2" ${fill('var(--bad)', 'var(--ink)', ';stroke-width:.8')}/></g>`;
  if (link.label) s += `<text x="${mid.x}" y="${mid.y + 20}" text-anchor="middle" font-size="11" font-style="italic" class="muted">${esc(link.label)}</text>`;

  if (animate && !deleted && !has('broken') && ['calls', 'sends', 'transfers', 'reads', 'writes'].includes(link.kind)) {
    const slow = has('slow') || has('degraded');
    const busy = has('busy') || link.traffic === 'high';
    const duration = ({ low: 4.5, normal: 3.4, high: 2.4 }[link.traffic] ?? 3.4) * (slow ? 2.6 : 1);
    const count = busy ? 3 : 1;
    const shape = link.kind === 'calls' ? `<rect x="-5" y="-3.5" width="10" height="7" rx="1.5" ${fill('var(--mod)', 'var(--ink)', ';stroke-width:.8')}/>` : `<rect x="-4" y="-4" width="8" height="8" rx="1" ${fill('var(--window)', 'var(--ink)', ';stroke-width:.8')}/>`;
    const reverse = link.kind === 'reads' ? ' keyPoints="1;0" keyTimes="0;1" calcMode="linear"' : '';
    for (let i = 0; i < count; i++) {
      s += `<g>${shape}<animateMotion dur="${duration}s" begin="${((index * 0.37 + i * duration) / count) % duration}s" repeatCount="indefinite" rotate="auto" path="${d}"${reverse}/></g>`;
    }
  }
  const kind = lookup(link.kind)?.town ?? link.kind;
  return `<g class="link" data-from="${esc(link.from)}" data-to="${esc(link.to)}"><title>${esc(`${link.from} ${link.kind} ${link.to}${link.change ? ` (${link.change})` : ''}: ${kind}`)}</title>${s}</g>`;
}

function drawPlace(written: Place, box: Box, animate: boolean): string {
  // A place whose members changed is under work even when the place itself was not marked.
  const place: Place = written.change || !written.members.some((one) => one.change) ? written : { ...written, change: 'modified' };
  const x = box.cx - box.w / 2;
  const top = box.ground - box.h;
  const g = box.ground;
  const stroke = place.change ? CHANGE_STROKE[place.change] : 'var(--ink)';
  const has = (kind: string) => place.conditions.some((one) => one.kind === kind);
  let s = '';

  switch (place.kind) {
    case 'service':
      s += building(place, box, stroke, animate);
      break;
    case 'database':
      s += `<polygon points="${x - 4},${g - 52} ${box.cx},${top} ${x + box.w + 4},${g - 52}" ${fill('var(--road)', stroke, ';stroke-width:1.5;stroke-linejoin:round')}/>`;
      s += `<rect x="${x}" y="${g - 52}" width="${box.w}" height="52" ${fill('var(--bldg)', stroke, ';stroke-width:1.5')}/>`;
      s += `<rect x="${box.cx - 24}" y="${g - 38}" width="48" height="38" ${fill('var(--outside)', 'var(--ink)', ';stroke-width:1')}/>`;
      for (let i = 1; i < 5; i++) s += `<line x1="${box.cx - 24}" y1="${g - 38 + i * 7.6}" x2="${box.cx + 24}" y2="${g - 38 + i * 7.6}" ${fill('none', 'var(--muted)')}/>`;
      break;
    case 'cache':
      s += `<rect x="${x}" y="${top}" width="${box.w}" height="${box.h}" rx="2" ${fill('var(--panel)', stroke, ';stroke-width:1.5')}/>`;
      for (const r of [1, 2]) s += `<line x1="${x}" y1="${top + (r * box.h) / 3}" x2="${x + box.w}" y2="${top + (r * box.h) / 3}" ${fill('none', 'var(--ink)')}/>`;
      for (const [bx, r] of [[8, 0], [26, 0], [12, 1], [44, 1], [30, 2], [50, 2]] as const) {
        s += `<rect x="${x + bx}" y="${top + (r * box.h) / 3 + 4}" width="12" height="${box.h / 3 - 6}" rx="1" ${fill('var(--mod)', 'none', ';opacity:.7')}/>`;
      }
      break;
    case 'queue':
    case 'deadletter':
      s += `<rect x="${box.cx - 2}" y="${g - 36}" width="4" height="36" ${fill('var(--door)')}/>`;
      s += `<rect x="${box.cx - 20}" y="${top}" width="40" height="30" rx="10" ${fill(place.kind === 'deadletter' ? 'var(--warn)' : 'var(--mod)', stroke, ';stroke-width:1.5')}/>`;
      s += `<rect x="${box.cx + 14}" y="${top - 10}" width="3" height="18" ${fill('var(--bad)')}/><rect x="${box.cx + 14}" y="${top - 10}" width="10" height="6" ${fill('var(--bad)')}/>`;
      break;
    case 'topic':
      s += `<rect x="${box.cx - 3}" y="${g - 30}" width="6" height="30" ${fill('var(--door)')}/>`;
      s += `<rect x="${x}" y="${top}" width="${box.w}" height="44" rx="3" ${fill('var(--panel)', stroke, ';stroke-width:1.5')}/>`;
      for (const [dx, dy] of [[8, 8], [30, 6], [14, 26], [40, 24]] as const) s += `<rect x="${x + dx}" y="${top + dy}" width="16" height="12" ${fill('var(--window)', 'none', ';opacity:.8')}/>`;
      break;
    case 'external':
      s += `<rect x="${x}" y="${top}" width="${box.w}" height="${box.h}" rx="3" ${fill('var(--outside)', 'var(--muted)', ';stroke-width:1.5;stroke-dasharray:4 3')}/>`;
      for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) s += `<rect x="${x + 12 + c * 27}" y="${top + 14 + r * 20}" width="20" height="12" rx="1.5" ${fill('var(--line)')}/>`;
      s += `<rect x="${box.cx - 7}" y="${g - 20}" width="14" height="20" rx="1.5" ${fill('var(--muted)')}/>`;
      break;
    case 'person':
      s += `<circle cx="${box.cx}" cy="${top + 10}" r="8" ${fill('var(--bldg)', stroke, ';stroke-width:1.5')}/>`;
      s += `<path d="M${box.cx - 13} ${g} q0 -30 13 -30 q13 0 13 30 z" ${fill('var(--bldg)', stroke, ';stroke-width:1.5')}/>`;
      break;
    case 'runtime':
      s += `<rect x="${x}" y="${top + 20}" width="${box.w}" height="${box.h - 20}" rx="3" ${fill('var(--bldg)', stroke, ';stroke-width:1.5')}/>`;
      s += `<rect x="${x + 14}" y="${top}" width="12" height="24" ${fill('var(--road)', stroke)}/><rect x="${x + 36}" y="${top + 6}" width="12" height="18" ${fill('var(--road)', stroke)}/>`;
      s += `<path d="M${box.cx + 18} ${top + 30} l-8 16 h8 l-6 14 l16 -20 h-8 l6 -10 z" ${fill('var(--window)', 'var(--ink)', ';stroke-width:.8')}/>`;
      break;
    case 'host':
      s += `<rect x="${x}" y="${top}" width="${box.w}" height="${box.h}" rx="8" ${fill('none', stroke, ';stroke-width:1.5;stroke-dasharray:6 4')}/>`;
      break;
    case 'router':
    case 'bus':
      s += `<rect x="${x}" y="${top}" width="${box.w}" height="${box.h}" rx="3" ${fill('var(--bldg)', stroke, ';stroke-width:1.5')}/>`;
      s += `<path d="M${box.cx - 18} ${top + 18} h36 v22 h-36 z M${box.cx - 18} ${top + 18} l18 12 l18 -12" ${fill('var(--panel)', 'var(--ink)', ';stroke-width:1.2')}/>`;
      break;
    default:
      // Small goods: crates, parcels, devices.
      s += `<rect x="${x + 8}" y="${top + 12}" width="${box.w - 16}" height="${box.h - 12}" rx="3" ${fill('var(--window)', stroke, ';stroke-width:1.5;opacity:.85')}/>`;
      s += `<line x1="${box.cx}" y1="${top + 12}" x2="${box.cx}" y2="${g}" ${fill('none', 'var(--ink)', ';opacity:.5')}/>`;
  }

  s += conditionMarks(place, box, animate);
  s += changeMarks(place, box);
  s += `<text x="${box.cx}" y="${g + 18}" text-anchor="middle" font-size="12.5" font-weight="500" class="mono"${place.change === 'deleted' ? ' text-decoration="line-through"' : ''}>${esc(place.id)}</text>`;
  if (place.label) s += `<text x="${box.cx}" y="${g + 33}" text-anchor="middle" font-size="11" class="muted">${esc(place.label)}</text>`;
  if (has('down')) s = `<g style="filter:saturate(.2) brightness(.6)">${s}</g>`;
  if (place.change === 'deleted') s = `<g style="opacity:.55">${s}</g>`;

  const what = lookup(place.kind)?.town ?? place.kind;
  const notes = [what, place.change, ...place.conditions.map((one) => one.kind + (one.note ? `: ${one.note}` : ''))].filter(Boolean);
  return `<g class="place" data-id="${esc(place.id)}" tabindex="0"><title>${esc(`${place.id}: ${notes.join(', ')}`)}</title>${s}</g>`;
}

function building(place: Place, box: Box, stroke: string, animate: boolean): string {
  const x = box.cx - box.w / 2;
  const top = box.ground - box.h;
  const g = box.ground;
  let s = `<rect x="${x}" y="${top}" width="${box.w}" height="${box.h}" rx="3" ${fill('var(--bldg)', stroke, ';stroke-width:1.5')}/>`;
  s += `<rect x="${x}" y="${top}" width="${box.w}" height="7" rx="2" ${fill(stroke === 'var(--ink)' ? 'var(--road)' : stroke)}/>`;

  const windows = place.members.filter((one) => !['endpoint', 'config', 'job', 'guard', 'event'].includes(one.kind));
  windows.forEach((member, i) => {
    const wx = x + 14 + (i % 3) * 30;
    const wy = top + 16 + Math.floor(i / 3) * 22;
    const changeStroke = member.change ? CHANGE_STROKE[member.change] : 'var(--ink)';
    const broken = member.conditions.some((one) => one.kind === 'error');
    const flaky = member.conditions.some((one) => one.kind === 'flaky');
    let win = `<rect x="${wx}" y="${wy}" width="22" height="14" rx="1.5" ${fill(broken ? 'var(--dark)' : 'var(--window)', changeStroke, `;stroke-width:${member.change ? 2 : 1}`)}>`;
    if (flaky && animate) win += `<animate attributeName="opacity" values="1;.2;1;1;.3;1" dur="1.6s" repeatCount="indefinite"/>`;
    win += `</rect>`;
    if (member.change === 'deleted') win += `<path d="M${wx} ${wy} l22 14 M${wx + 22} ${wy} l-22 14" ${fill('none', 'var(--del)', ';stroke-width:2')}/>`;
    if (member.change === 'added') win += `<text x="${wx + 11}" y="${wy - 2}" text-anchor="middle" font-size="9" font-weight="700" style="fill:var(--add)">+</text>`;
    if (broken) win += `<path d="M${wx + 4} ${wy + 3} l6 5 l-3 3 l8 2" ${fill('none', 'var(--bad)', ';stroke-width:1.2')}/>`;
    if (member.conditions.some((one) => one.kind === 'bug')) win += crack(wx + 24, wy + 4);
    s += `<g><title>${esc(`${member.kind} ${member.name}${member.change ? ` (${member.change})` : ''}${member.conditions.map((c) => `, ${c.kind}`).join('')}`)}</title>${win}</g>`;
  });

  const doors = place.members.filter((one) => one.kind === 'endpoint');
  const shown = doors.slice(0, 4);
  const start = box.cx - (shown.length * 16 - 4) / 2;
  shown.forEach((door, i) => {
    const doorStroke = door.change ? CHANGE_STROKE[door.change] : 'none';
    s += `<rect x="${start + i * 16}" y="${g - 20}" width="12" height="20" rx="1.5" ${fill('var(--door)', doorStroke, `;stroke-width:${door.change ? 2 : 0}`)}><title>${esc(`endpoint ${door.name}${door.change ? ` (${door.change})` : ''}`)}</title></rect>`;
  });
  if (doors.length > 4) s += `<text x="${start + 4 * 16 + 2}" y="${g - 6}" font-size="10">+${doors.length - 4}</text>`;

  const config = place.members.filter((one) => one.kind === 'config');
  if (config.length) {
    const rx = x + box.w + 4;
    s += `<g><title>${esc(`config ${config.map((one) => one.name).join(', ')}`)}</title><rect x="${rx}" y="${g - 40}" width="15" height="19" rx="1.5" ${fill('var(--panel)', config.some((one) => one.change) ? 'var(--mod)' : 'var(--ink)', ';stroke-width:1')}/><line x1="${rx + 3}" y1="${g - 34}" x2="${rx + 12}" y2="${g - 34}" ${fill('none', 'var(--muted)')}/><line x1="${rx + 3}" y1="${g - 29}" x2="${rx + 12}" y2="${g - 29}" ${fill('none', 'var(--muted)')}/></g>`;
  }
  const guards = place.members.filter((one) => one.kind === 'guard');
  if (guards.length) {
    const gx = x - 20;
    s += `<g><title>${esc(`guard ${guards.map((one) => one.name).join(', ')}`)}</title><rect x="${gx}" y="${g - 26}" width="4" height="26" ${fill('var(--ink)')}/><rect x="${gx + 10}" y="${g - 26}" width="4" height="26" ${fill('var(--ink)')}/><rect x="${gx - 2}" y="${g - 22}" width="18" height="4" ${fill('var(--warn)')}/><rect x="${gx - 2}" y="${g - 12}" width="18" height="4" ${fill('var(--warn)')}/></g>`;
  }
  const jobs = place.members.filter((one) => one.kind === 'job');
  if (jobs.length) {
    const cx = box.cx;
    const cy = top - 14;
    s += `<g><title>${esc(`job ${jobs.map((one) => one.name).join(', ')}`)}</title><rect x="${cx - 2}" y="${cy + 8}" width="4" height="6" ${fill('var(--ink)')}/><circle cx="${cx}" cy="${cy}" r="10" ${fill('var(--panel)', 'var(--ink)', ';stroke-width:1.5')}/><line x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy - 6}" ${fill('none', 'var(--ink)', ';stroke-width:1.5')}>${animate ? `<animateTransform attributeName="transform" type="rotate" from="0 ${cx} ${cy}" to="360 ${cx} ${cy}" dur="8s" repeatCount="indefinite"/>` : ''}</line></g>`;
  }
  const events = place.members.filter((one) => one.kind === 'event');
  if (events.length) {
    s += `<g><title>${esc(`event ${events.map((one) => one.name).join(', ')}`)}</title><path d="M${x + box.w - 18} ${top + 20} q0 -10 7 -10 q7 0 7 10 l2 4 h-18 z" ${fill('var(--window)', 'var(--ink)', ';stroke-width:1')}/></g>`;
  }
  return s;
}

function crack(x: number, y: number): string {
  return `<path d="M${x} ${y} l5 6 l-3 4 l6 7 l-2 5" ${fill('none', 'var(--bad)', ';stroke-width:1.6;stroke-linecap:round')}><title>bug</title></path>`;
}

function conditionMarks(place: Place, box: Box, animate: boolean): string {
  const x = box.cx - box.w / 2;
  const top = box.ground - box.h;
  const g = box.ground;
  const right = x + box.w;
  let s = '';
  const notes = (kind: string) => place.conditions.filter((one) => one.kind === kind).map((one) => one.note).filter(Boolean).join('; ');
  const titled = (kind: string, body: string) => `<g><title>${esc(kind + (notes(kind) ? `: ${notes(kind)}` : ''))}</title>${body}</g>`;
  const on = (kind: string) => place.conditions.some((one: Condition) => one.kind === kind);

  if (on('bug')) s += titled('bug', crack(x + 10, top + box.h * 0.45).replace(/<title>bug<\/title>/, ''));
  if (on('error')) s += titled('error', `<rect x="${x + 6}" y="${top + box.h * 0.6}" width="14" height="10" ${fill('var(--dark)', 'var(--bad)', ';stroke-width:1')}/>`);
  if (on('wrong')) s += titled('wrong', `<rect x="${box.cx + 10}" y="${g - 12}" width="12" height="12" rx="1" ${fill('var(--window)', 'var(--bad)', ';stroke-width:1.5')}/><text x="${box.cx + 16}" y="${g - 3}" text-anchor="middle" font-size="10" font-weight="700" style="fill:var(--bad)">?</text>`);
  if (on('late') || on('full')) {
    // A queue out of the door.
    const kind = on('late') ? 'late' : 'full';
    let queue = '';
    for (let i = 0; i < 4; i++) queue += `<circle cx="${x - 8 - i * 9}" cy="${g - 14}" r="3.5" ${fill('var(--muted)')}/><rect x="${x - 11 - i * 9}" y="${g - 10}" width="6" height="10" rx="2" ${fill('var(--muted)')}/>`;
    s += titled(kind, queue);
  }
  if (on('busy')) {
    let crowd = '';
    for (let i = 0; i < 6; i++) crowd += `<circle cx="${box.cx - 20 + i * 8}" cy="${g + 8 + (i % 2) * 4}" r="3" ${fill('var(--muted)', 'none', ';opacity:.7')}/>`;
    s += titled('busy', crowd);
  }
  if (on('slow') || on('errors')) {
    const kind = on('errors') ? 'errors' : 'slow';
    s += titled(kind, `<path d="M${right - 10} ${top} q-6 -10 2 -16 q8 -6 2 -14" ${fill('none', 'var(--muted)', ';stroke-width:3;stroke-linecap:round;opacity:.6')}>${animate ? '<animate attributeName="opacity" values=".2;.7;.2" dur="3s" repeatCount="indefinite"/>' : ''}</path>`);
  }
  if (on('down')) s += titled('down', `<rect x="${box.cx - 18}" y="${g - 22}" width="36" height="22" ${fill('var(--dark)')}/><text x="${box.cx}" y="${g - 8}" text-anchor="middle" font-size="8" font-weight="700" style="fill:var(--bad)">CLOSED</text>`);
  if (on('guarded')) s += titled('guarded', `<path d="M${x - 6} ${g} v-14 M${x - 6} ${g - 10} h${box.w + 12} M${x - 6} ${g - 4} h${box.w + 12} M${right + 6} ${g} v-14" ${fill('none', 'var(--muted)', ';stroke-width:1.5')}/>`);
  if (on('fallback')) s += titled('fallback', `<rect x="${right + 4}" y="${g - 18}" width="18" height="18" rx="2" ${fill('var(--panel)', 'var(--ink)', ';stroke-width:1')}/><path d="M${right + 14} ${g - 15} l-5 7 h4 l-3 6 l7 -8 h-4 l3 -5 z" ${fill('var(--window)')}/>`);
  if (on('monitored')) s += titled('monitored', `<path d="M${right + 16} ${g} l4 -44 l4 44 z" ${fill('var(--bldg)', 'var(--ink)', ';stroke-width:1')}/><rect x="${right + 13}" y="${g - 52}" width="14" height="9" ${fill('var(--panel)', 'var(--ink)', ';stroke-width:1')}/>`);
  if (on('fix')) {
    // A repair worker with a wrench beside the crack being patched.
    s += titled('fix', `<circle cx="${x - 12}" cy="${g - 26}" r="4" ${fill('var(--warn)', 'var(--ink)', ';stroke-width:1')}/><rect x="${x - 15}" y="${g - 22}" width="7" height="22" rx="2" ${fill('var(--warn)', 'var(--ink)', ';stroke-width:1')}/><path d="M${x - 8} ${g - 18} l10 -6" ${fill('none', 'var(--ink)', ';stroke-width:2;stroke-linecap:round')}>${animate ? `<animateTransform attributeName="transform" type="rotate" values="0 ${x - 8} ${g - 18};-20 ${x - 8} ${g - 18};0 ${x - 8} ${g - 18}" dur="1.2s" repeatCount="indefinite"/>` : ''}</path>`);
  }
  return s;
}

function changeMarks(place: Place, box: Box): string {
  const x = box.cx - box.w / 2;
  const top = box.ground - box.h;
  const right = x + box.w;
  switch (place.change) {
    case 'added':
      // A crane over new building work.
      return `<g><title>added</title><path d="M${right + 8} ${box.ground} v-${box.h + 46} h-${box.w * 0.7} M${right + 8} ${top - 46} l-14 14 M${right + 8 - box.w * 0.55} ${top - 46} v24" ${fill('none', 'var(--add)', ';stroke-width:3;stroke-linecap:round')}/><rect x="${right + 8 - box.w * 0.55 - 6}" y="${top - 22}" width="12" height="8" ${fill('var(--add)')}/></g>`;
    case 'modified': {
      // Light scaffolding on both sides, so the building stays readable.
      let s = '<g style="opacity:.75"><title>modified</title>';
      for (const px of [x - 7, right + 7]) s += `<line x1="${px}" y1="${box.ground}" x2="${px}" y2="${top - 8}" ${fill('none', 'var(--mod)', ';stroke-width:2')}/>`;
      for (let py = box.ground - 16; py > top - 8; py -= 26) {
        s += `<line x1="${x - 11}" y1="${py}" x2="${x - 3}" y2="${py}" ${fill('none', 'var(--mod)', ';stroke-width:2')}/><line x1="${right + 3}" y1="${py}" x2="${right + 11}" y2="${py}" ${fill('none', 'var(--mod)', ';stroke-width:2')}/>`;
      }
      s += `<line x1="${x - 7}" y1="${top - 8}" x2="${right + 7}" y2="${top - 8}" ${fill('none', 'var(--mod)', ';stroke-width:2')}/>`;
      return s + '</g>';
    }
    case 'deleted':
      return `<g><title>deleted</title><path d="M${x} ${top + 10} L${right} ${box.ground - 10} M${right} ${top + 10} L${x} ${box.ground - 10}" ${fill('none', 'var(--del)', ';stroke-width:6;opacity:.8')}/></g>`;
    case 'renamed':
      return `<g><title>renamed${place.was ? ` from ${esc(place.was)}` : ''}</title><rect x="${box.cx - 30}" y="${top - 26}" width="60" height="16" rx="2" ${fill('var(--panel)', 'var(--mod)', ';stroke-width:1.5')}/><text x="${box.cx}" y="${top - 14}" text-anchor="middle" font-size="9" class="mono">${esc(place.was ?? 'new name')}</text></g>`;
    case 'copied':
      return `<g><title>copied</title><rect x="${x + 8}" y="${top - 8}" width="${box.w}" height="${box.h}" rx="3" ${fill('none', 'var(--add)', ';stroke-width:1.5;stroke-dasharray:4 3')}/></g>`;
    case 'retyped':
      return `<g><title>type changed</title><rect x="${box.cx - 22}" y="${top - 24}" width="44" height="14" rx="2" ${fill('var(--mod)')}/><path d="M${box.cx - 12} ${top - 17} h24 m-5 -4 l5 4 l-5 4" ${fill('none', 'var(--bg)', ';stroke-width:1.5')}/></g>`;
    default:
      return '';
  }
}

/** A risk is drawn as the hazard its impact names, solid only when it always happens. */
function hazard(risk: Risk, town: Town, map: Layout, animate: boolean): string {
  const at = anchor(risk.target, town, map);
  if (!at) return '';
  const { x, y } = at;
  const faint = risk.certainty === 'possible' ? ';opacity:.5;stroke-dasharray:3 2' : '';
  const shapes: Record<Impact, string> = {
    crash: flame(x - 10, y, animate, faint),
    hang: `<g>${[0, 1, 2].map((i) => `<rect x="${x - 26 + i * 13}" y="${y + 6}" width="11" height="7" rx="1.5" ${fill('var(--warn)', 'var(--ink)', `;stroke-width:.8${faint}`)}/>`).join('')}</g>`,
    degraded: `<path d="M${x} ${y} q-6 -10 2 -16 q8 -6 2 -14" ${fill('none', 'var(--muted)', `;stroke-width:4;stroke-linecap:round;opacity:.6${faint}`)}/>`,
    data_loss: `<path d="M${x - 40} ${y + 30} q10 -6 20 0 t20 0 t20 0 t20 0 v10 h-80 z" ${fill('var(--water)', 'none', `;opacity:.7${faint}`)}>${animate ? '<animateTransform attributeName="transform" type="translate" values="0 0;4 0;0 0" dur="2s" repeatCount="indefinite"/>' : ''}</path>`,
    corruption: `<g>${[0, 1].map((i) => `<rect x="${x - 18 + i * 14}" y="${y + 4}" width="12" height="12" rx="1" ${fill('#7a8f3a', 'var(--ink)', `;stroke-width:.8${faint}`)}/>`).join('')}</g>`,
    disclosure: `<g><rect x="${x - 10}" y="${y - 4}" width="20" height="22" rx="2" ${fill('var(--panel)', 'var(--bad)', `;stroke-width:2${faint}`)}/><path d="M${x + 10} ${y - 4} l10 6 v22 l-10 -6" ${fill('var(--bg)', 'var(--bad)', `;stroke-width:2${faint}`)}/></g>`,
    escalation: `<path d="M${x - 12} ${y + 20} v-22 M${x + 12} ${y + 20} v-22 M${x - 14} ${y + 2} l10 3 M${x + 14} ${y + 4} l-11 4" ${fill('none', 'var(--bad)', `;stroke-width:2.5;stroke-linecap:round${faint}`)}/>`,
    wrong_answer: `<g><rect x="${x - 8}" y="${y}" width="16" height="16" rx="1" ${fill('var(--window)', 'var(--bad)', `;stroke-width:1.5${faint}`)}/><text x="${x}" y="${y + 12}" text-anchor="middle" font-size="12" font-weight="700" style="fill:var(--bad)">?</text></g>`,
    rejected: `<rect x="${x - 16}" y="${y}" width="32" height="12" rx="2" ${fill('var(--muted)', 'none', faint)}/>`,
    none: '',
  };
  let s = shapes[risk.impact];
  if (risk.certainty === 'conditional') s += `<path d="M${x + 14} ${y - 18} l7 12 h-14 z" ${fill('var(--warn)', 'var(--ink)', ';stroke-width:.8')}/><text x="${x + 14}" y="${y - 8}" text-anchor="middle" font-size="8" font-weight="700">!</text>`;
  // The pin carries the risk's number so a list beside the map can point at it.
  s += `<circle cx="${x + 16}" cy="${y - 26}" r="9" ${fill('var(--bad)')}/><text x="${x + 16}" y="${y - 22}" text-anchor="middle" font-size="10" font-weight="700" style="fill:#fff">${esc(risk.id)}</text>`;
  const said = `risk ${risk.id}: ${risk.text} (${risk.impact.replace('_', ' ')}, ${risk.certainty}, reaches ${risk.blast}${risk.trigger ? `, caused by ${risk.trigger}` : ''})`;
  return `<g class="risk" data-risk="${esc(risk.id)}"><title>${esc(said)}</title>${s}</g>`;
}

function flame(x: number, y: number, animate: boolean, faint: string): string {
  let s = `<g transform="translate(${x},${y})"><path d="M0 0 C-9 -9 -4 -17 0 -28 C3 -18 12 -13 9 0 Z" ${fill('var(--bad)', 'none', faint)}/>`;
  s += `<path d="M2 0 C-2 -5 0 -10 2 -15 C4 -9 7 -6 6 0 Z" ${fill('var(--window)', 'none', faint)}/>`;
  if (animate && !faint) {
    for (let i = 0; i < 3; i++) {
      s += `<circle cx="3" cy="-30" r="4" ${fill('var(--road)', 'none', ';opacity:0')}><animate attributeName="cy" from="-30" to="-58" dur="2.4s" begin="${i * 0.8}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;.45;0" dur="2.4s" begin="${i * 0.8}s" repeatCount="indefinite"/></circle>`;
    }
  }
  return s + '</g>';
}

function signpost(id: string, text: string, x: number, y: number): string {
  return `<g class="behavior" data-behavior="${esc(id)}"><title>${esc(`${id}: ${text}`)}</title><rect x="${x - 1}" y="${y - 30}" width="3" height="30" ${fill('var(--door)')}/><rect x="${x - 14}" y="${y - 44}" width="30" height="16" rx="2" ${fill('var(--add)')}/><text x="${x + 1}" y="${y - 32}" text-anchor="middle" font-size="10" font-weight="700" style="fill:#fff">${esc(id)}</text></g>`;
}

function badge(count: number, name: string, x: number, y: number): string {
  return `<g class="test"><title>${esc(`tested: ${name}${count > 1 ? ` (${count})` : ''}`)}</title><path d="M${x} ${y - 10} l9 3 v6 q0 7 -9 11 q-9 -4 -9 -11 v-6 z" ${fill('var(--add)', 'var(--ink)', ';stroke-width:.8')}/><text x="${x}" y="${y + 3}" text-anchor="middle" font-size="9" font-weight="700" style="fill:#fff">${count}</text></g>`;
}

function tripVehicle(stops: string[], map: Layout, index: number): string {
  const boxes = stops.map((stop) => map.boxes.get(stop)).filter((one): one is Box => !!one);
  if (boxes.length < 2) return '';
  let d = '';
  for (let i = 0; i < boxes.length - 1; i++) {
    const leg = route(boxes[i]!, boxes[i + 1]!, map, 0).d;
    d += i === 0 ? leg : leg.replace(/^M/, ' L');
  }
  const duration = 2.6 * (boxes.length - 1);
  return `<g class="trip"><circle r="6" ${fill('var(--add)', 'var(--ink)', ';stroke-width:1')}><animateMotion dur="${duration}s" begin="${index * 0.6}s" repeatCount="indefinite" path="${d}"/></circle></g>`;
}
