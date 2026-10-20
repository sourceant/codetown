import { describe, expect, it } from 'vitest';
import { Builder, type Geometry } from '../src/geometry.js';

/** Every face of a closed solid points away from its centre. */
function outward(g: Geometry, centre: [number, number, number]) {
  const wrong: number[] = [];
  for (let t = 0; t < g.positions.length / 9; t++) {
    const at = t * 9;
    const mx = (g.positions[at]! + g.positions[at + 3]! + g.positions[at + 6]!) / 3 - centre[0];
    const my = (g.positions[at + 1]! + g.positions[at + 4]! + g.positions[at + 7]!) / 3 - centre[1];
    const mz = (g.positions[at + 2]! + g.positions[at + 5]! + g.positions[at + 8]!) / 3 - centre[2];
    const dot = mx * g.normals[at]! + my * g.normals[at + 1]! + mz * g.normals[at + 2]!;
    if (dot <= 0) wrong.push(t);
  }
  return wrong;
}

describe('geometry', () => {
  it('builds solids whose faces all point outward', () => {
    const shapes: [string, (b: Builder) => void, [number, number, number]][] = [
      ['block', (b) => b.block(0, 0, 0, 0.8, 1, 0.6, 'wall'), [0, 0.5, 0]],
      ['slab', (b) => b.slab(0, 0, 0, 0.8, 1, 0.6, 'wall'), [0, 0.5, 0]],
      ['cylinder', (b) => b.cylinder(0, 0, 0, 0.3, 1, 'metal'), [0, 0.5, 0]],
      ['cone', (b) => b.cylinder(0, 0, 0, 0.3, 1, 'fire', { top: 0 }), [0, 0.3, 0]],
      ['tube', (b) => b.tube(0, 0, 0, 0.1, 1, 'metal'), [0, 0, 0]],
      ['gable', (b) => b.gable(0, 0, 0, 1, 0.8, 0.3, 'roof'), [0, 0.1, 0]],
      ['arch', (b) => b.arch(0, 0, 0, 1, 0.8, 'roof'), [0, 0.1, 0]],
      ['ball', (b) => b.ball(0, 0, 0, 0.5, 'leaf'), [0, 0, 0]],
    ];
    for (const [name, build, centre] of shapes) {
      const b = new Builder();
      build(b);
      expect([name, outward(b.geometry, centre)]).toEqual([name, []]);
    }
  });

  it('keeps a chamfered block within the triangle budget', () => {
    const b = new Builder();
    b.block(0, 0, 0, 0.8, 1, 0.8, 'wall');
    expect(b.triangles).toBeLessThanOrEqual(40);
  });

  it('turns added geometry in quarter turns about the vertical', () => {
    const part = new Builder();
    part.slab(0.5, 0, 0, 0.1, 0.1, 0.1, 'wall');
    const whole = new Builder();
    whole.add(part.geometry, 0, 0, 0, 1);
    const xs = whole.geometry.positions.filter((_, i) => i % 3 === 0);
    const zs = whole.geometry.positions.filter((_, i) => i % 3 === 2);
    expect(Math.max(...xs.map(Math.abs))).toBeLessThan(0.1);
    expect(Math.min(...zs)).toBeCloseTo(-0.55);
  });
});
