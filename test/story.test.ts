import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse, roleOf, scenario, story, tour } from '../src/index.js';

const example = (name: string) => parse(readFileSync(new URL(`../examples/${name}.town`, import.meta.url), 'utf8'));

describe('roles', () => {
  it('reads what a place is from its word, its members and its folder', () => {
    const town = parse(`service ci ".github/workflows"
  ~ process checks
service web "src/routes"
service api "src/api"
  endpoint create
database db
service core "src/core"
  function work`);
    expect(town.places.map(roleOf)).toEqual(['pipeline', 'api', 'api', 'store', 'service']);
  });
});

describe('story', () => {
  it('tells what a place is, what changed in it and what it sits beside', () => {
    const told = story(example('sourceant-189'), 'integrations_github')!;
    expect(told.lead).toMatch(/^integrations_github is the service in integrations: code that runs and does work\. This change /);
    expect(told.calls.map((n) => n.id)).toContain('outside_github');
    expect(told.untested).toBe(true);
    expect(told.risks.length).toBeGreaterThan(0);
  });

  it('reads a risk as what happens if the change merges', () => {
    expect(scenario({ trigger: 'authenticated', impact: 'wrong_answer', blast: 'one', certainty: 'conditional' })).toBe(
      'When a signed-in user acts, the answer is wrong for one user, under the conditions it names.',
    );
  });

  it('has no story for a place that is not there', () => {
    expect(story(example('corner-shop'), 'nowhere')).toBeNull();
  });
});

describe('tour', () => {
  it('starts with the whole change, then visits each touched place and each risk', () => {
    const town = example('sourceant-201');
    const steps = tour(town);
    expect(steps[0]).toMatchObject({ id: null });
    expect(steps[0]!.text).toMatch(/This change touches \d+ parts/);
    const touched = town.places.filter((p) => p.change || p.members.some((m) => m.change)).length;
    expect(steps).toHaveLength(1 + touched + town.risks.length);
  });
});
