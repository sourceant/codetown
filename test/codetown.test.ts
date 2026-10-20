import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CONCEPTS, diff, format, parse, render, vocabulary, type Town } from '../src/index.js';

const example = (name: string) => readFileSync(new URL(`../examples/${name}.town`, import.meta.url), 'utf8');

/** A town without line numbers, so two parses of the same meaning compare equal. */
function shape(town: Town): unknown {
  return JSON.parse(JSON.stringify(town, (key, value) => (key === 'line' || key === 'diagnostics' ? undefined : value)));
}

describe('parse', () => {
  it('reads every example without a problem', () => {
    const names = readdirSync(new URL('../examples/', import.meta.url)).filter((f) => f.endsWith('.town')).map((f) => f.replace(/\.town$/, ''));
    expect(names.length).toBeGreaterThan(5);
    for (const name of names) expect([name, parse(example(name)).diagnostics]).toEqual([name, []]);
  });

  it('reads places, members, links, conditions and review overlays', () => {
    const town = parse(example('pr-209'));
    expect(town.intent).toBe('Review pull requests of any size in parts');
    expect(town.purpose).toBe('feat');
    expect(town.places.find((one) => one.id === 'investigations')?.change).toBe('added');
    const reviewer = town.places.find((one) => one.id === 'reviewer')!;
    expect(reviewer.members.map((one) => [one.name, one.change])).toEqual([
      ['review', 'modified'],
      ['read', 'modified'],
      ['plan_parts', 'added'],
      ['change_digest', 'added'],
      ['READING_BUDGET', undefined],
    ]);
    expect(town.links.find((one) => one.to === 'codeindex')).toMatchObject({ kind: 'reads', change: 'added', label: 'callers' });
    expect(town.risks[0]).toMatchObject({ id: '1', impact: 'wrong_answer', certainty: 'possible', target: { kind: 'member', place: 'callcontext', member: 'refers_to' } });
    expect(town.behaviors.map((one) => one.id)).toEqual(['B1', 'B2']);
    expect(town.tests.find((one) => one.target.kind === 'place' && one.target.place === 'callcontext')?.count).toBe(2);
    expect(town.trips[0]!.stops).toEqual(['github', 'plugin', 'reviewer', 'investigations']);
  });

  it('accepts the prototype words as aliases', () => {
    const town = parse(`city Shop
service orders "Orders"
  door POST /orders
  worker createOrder
  rulebook LIMITS
  clock cleanup
warehouse db "Postgres"
shelf hot "Redis"
road orders -> db traffic=high
fire orders "Timeouts"`);
    expect(town.diagnostics).toEqual([]);
    expect(town.places.map((one) => one.kind)).toEqual(['service', 'database', 'cache']);
    expect(town.places[0]!.members.map((one) => one.kind)).toEqual(['endpoint', 'function', 'config', 'job']);
    expect(town.links[0]).toMatchObject({ from: 'orders', to: 'db', kind: 'calls', traffic: 'high' });
    expect(town.risks[0]).toMatchObject({ impact: 'crash', certainty: 'always', text: 'Timeouts' });
  });

  it('puts conditions on the place, member or link they name', () => {
    const town = parse(`service a
  function go
service b
a calls b
bug a.go "off by one"
broken a -> b
slow b`);
    expect(town.diagnostics).toEqual([]);
    expect(town.places[0]!.members[0]!.conditions).toMatchObject([{ kind: 'bug', note: 'off by one' }]);
    expect(town.links[0]!.conditions).toMatchObject([{ kind: 'broken' }]);
    expect(town.places[1]!.conditions).toMatchObject([{ kind: 'slow' }]);
  });

  it('warns that a world other than the town is drawn as the town for now', () => {
    expect(parse('world bank\nservice a').diagnostics).toEqual([
      { line: 1, message: 'the bank world is not drawn yet, so the town is used.', severity: 'warning' },
    ]);
  });

  it('says what is wrong and on which line', () => {
    const town = parse(`service a
  table x
widget b
a calls nowhere
risk 1 at a "x" impact=meltdown
  function stray`);
    expect(town.diagnostics.map((one) => [one.line, one.message])).toEqual([
      [2, '"table" cannot go inside a place. Inside a place write a member such as function, endpoint or config, or a condition such as bug.'],
      [3, '"widget" is not a Codetown word.'],
      [4, 'nothing is called "nowhere".'],
      [5, 'impact is one of data_loss, corruption, disclosure, escalation, wrong_answer, hang, crash, degraded, rejected, none, not "meltdown".'],
      [6, '"function" is indented but no place comes before it.'],
    ]);
  });
});

describe('format', () => {
  it('writes text that reads back to the same town', () => {
    for (const name of ['corner-shop', 'pr-209']) {
      const town = parse(example(name));
      const again = parse(format(town));
      expect(again.diagnostics).toEqual([]);
      expect(shape(again)).toEqual(shape(town));
    }
  });

  it('is stable: formatting formatted text changes nothing', () => {
    const once = format(parse(example('corner-shop')));
    expect(format(parse(once))).toBe(once);
  });
});

describe('diff', () => {
  it('marks what a change added, removed, renamed and changed', () => {
    const before = parse(`service orders
  function create
  function legacy
service old
database db
orders calls old
orders writes db`);
    const after = parse(`service orders
  function create "now validates"
  function refund
service fresh was=old
database db
service audit
orders calls fresh
orders writes db
orders sends audit`);
    const change = diff(before, after);
    const orders = change.places.find((one) => one.id === 'orders')!;
    expect(orders.change).toBe('modified');
    expect(orders.members.map((one) => [one.name, one.change])).toEqual([
      ['create', 'modified'],
      ['refund', 'added'],
      ['legacy', 'deleted'],
    ]);
    expect(change.places.find((one) => one.id === 'fresh')?.change).toBe('renamed');
    expect(change.places.find((one) => one.id === 'audit')?.change).toBe('added');
    expect(change.places.find((one) => one.id === 'old')).toBeUndefined();
    expect(change.places.find((one) => one.id === 'db')?.change).toBeUndefined();
    expect(change.links.map((one) => [one.from, one.kind, one.to, one.change])).toEqual([
      ['orders', 'calls', 'fresh', 'added'],
      ['orders', 'writes', 'db', undefined],
      ['orders', 'sends', 'audit', 'added'],
      ['orders', 'calls', 'old', 'deleted'],
    ]);
  });
});

describe('render', () => {
  it('draws a self-contained, labelled SVG with every place addressable', () => {
    const town = parse(example('pr-209'));
    const svg = render(town);
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg).toContain('aria-label="SourceAnt review: Review pull requests of any size in parts"');
    for (const place of town.places) expect(svg).toContain(`data-id="${place.id}"`);
    expect(svg).toContain('data-risk="1"');
    expect(svg).toContain('data-behavior="B1"');
  });

  it('draws a still picture when asked', () => {
    const svg = render(parse(example('corner-shop')), { animate: false, theme: 'dark' });
    expect(svg).not.toContain('<animate');
    expect(svg).toContain('class="ct dark"');
  });

  it('leaves the colours out for a page that includes them once', () => {
    const svg = render(parse('service a'), { embedStyle: false });
    expect(svg).not.toContain('<style>');
  });

  it('escapes what people write', () => {
    const svg = render(parse('system "<b>&"\nservice a "x<y"'));
    expect(svg).toContain('&lt;b&gt;&amp;');
    expect(svg).toContain('x&lt;y');
  });
});

describe('vocabulary', () => {
  it('keeps the published vocabulary file in step with the registry', () => {
    const published = JSON.parse(readFileSync(new URL('../vocabulary.json', import.meta.url), 'utf8'));
    expect(published).toEqual(JSON.parse(JSON.stringify(vocabulary())));
  });

  it('gives every word a source or a candidate, except the two connection words', () => {
    const unsourced = CONCEPTS.filter((one) => !one.source && !one.candidate).map((one) => one.keyword);
    expect(unsourced).toEqual(['guard', 'broken', 'degraded']);
  });
});
