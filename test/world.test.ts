import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { placeModel } from '../src/catalog.js';
import { TONES } from '../src/geometry.js';
import { parse } from '../src/index.js';
import { PITCH, world } from '../src/world.js';

const example = (name: string) => parse(readFileSync(new URL(`../examples/${name}.town`, import.meta.url), 'utf8'));
const triangles = (positions: number[]) => positions.length / 9;

describe('world', () => {
  it('puts every place on its own lot of the street grid', () => {
    const town = example('corner-shop');
    const built = world(town);
    expect(built.places.map((p) => p.id).sort()).toEqual(town.places.map((p) => p.id).sort());
    const lots = new Set(built.places.map((p) => `${p.x / PITCH}:${p.z / PITCH}`));
    expect(lots.size).toBe(built.places.length);
    for (const p of built.places) {
      expect(Number.isInteger(p.x / PITCH)).toBe(true);
      expect(Number.isInteger(p.z / PITCH)).toBe(true);
    }
  });

  it('stands outside systems behind the town and people in front of it', () => {
    const built = world(example('corner-shop'));
    const town = example('corner-shop');
    const z = (kind: string) => built.places.filter((p) => town.places.find((q) => q.id === p.id)!.kind === kind).map((p) => p.z);
    const inside = built.places.filter((p) => !['external', 'person'].includes(town.places.find((q) => q.id === p.id)!.kind)).map((p) => p.z);
    expect(Math.max(...z('external'))).toBeLessThan(Math.min(...inside));
    expect(Math.min(...z('person'))).toBeGreaterThan(Math.max(...inside));
  });

  it('drives each link from one front door to the other along the streets', () => {
    const town = example('corner-shop');
    const built = world(town);
    expect(built.routes).toHaveLength(town.links.length);
    for (const route of built.routes) {
      for (let i = 1; i < route.points.length; i++) {
        const [a, b] = [route.points[i - 1]!, route.points[i]!];
        // Streets run along x or z, never across a block.
        expect(a[0] === b[0] || a[2] === b[2]).toBe(true);
      }
    }
  });

  it('turns each risk into the hazard its impact names, with a pin', () => {
    const town = example('pr-209');
    const built = world(town);
    expect(built.pins.filter((p) => p.kind === 'risk').map((p) => p.id)).toEqual(town.risks.map((r) => r.id));
    expect(built.pins.filter((p) => p.kind === 'behavior').map((p) => p.id)).toEqual(town.behaviors.map((b) => b.id));
  });
});

describe('catalogue', () => {
  it('draws new work with a crane, changed work with scaffolding and removed work boarded up', () => {
    const base = { id: 'a', kind: 'service', size: 2, members: [], conditions: [], line: 1 };
    const fresh = placeModel({ ...base, change: 'added' });
    const changed = placeModel({ ...base, change: 'modified' });
    const plain = placeModel(base);
    expect(fresh.parts.map((p) => p.motion)).toContain('spin');
    expect(triangles(changed.body.positions)).toBeGreaterThan(triangles(plain.body.positions));
    expect(placeModel({ ...base, change: 'deleted' }).body.tones).toContain(TONES.indexOf('del'));
  });

  it('keeps every place within its triangle budget', () => {
    for (const kind of ['service', 'database', 'cache', 'queue', 'topic', 'external', 'runtime', 'person', 'artifact', 'host']) {
      const model = placeModel({ id: 'a', kind, size: 5, members: Array.from({ length: 9 }, (_, i) => ({ kind: 'function', name: `f${i}`, conditions: [], line: 1 })), conditions: [], line: 1 });
      expect([kind, triangles(model.body.positions) <= 1200]).toEqual([kind, true]);
    }
  });
});
