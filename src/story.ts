/**
 * The story of one place in a change, and the tour through the whole change,
 * as plain data and sentences. A page renders them however it likes.
 */
import type { Behavior, Condition, Place, Risk, Target, Town } from './model.js';
import { ROLES, roleOf, type Role } from './roles.js';

const TRIGGER: Record<string, string> = {
  anyone: 'anyone sends a request',
  authenticated: 'a signed-in user acts',
  operator: 'an operator acts',
  service: 'another service calls',
  event: 'an event arrives',
  automation: 'a scheduled job runs',
  deploy: 'this is deployed',
  environment: 'the environment changes',
};
const IMPACT: Record<string, string> = {
  data_loss: 'data is lost',
  corruption: 'data is corrupted',
  disclosure: 'data leaks',
  escalation: 'someone gains access they should not have',
  wrong_answer: 'the answer is wrong',
  hang: 'it hangs',
  crash: 'it crashes',
  degraded: 'it slows down',
  rejected: 'valid requests are refused',
  none: 'nothing visible breaks',
};
const BLAST: Record<string, string> = { everyone: 'for every user', many: 'for many users', one: 'for one user', nobody: 'for no one' };
const CERTAINTY: Record<string, string> = { always: 'every time', conditional: 'under the conditions it names', possible: 'possibly' };
const PLURAL: Record<string, string> = { endpoint: 'endpoints', function: 'functions', process: 'steps', job: 'jobs', config: 'settings', class: 'classes', module: 'modules', interface: 'interfaces' };

export const CHANGE_WORD: Record<string, string> = { added: 'New', modified: 'Changed', deleted: 'Removed', renamed: 'Renamed', copied: 'Copied', retyped: 'Retyped' };

/** The place a statement is about, and the member when it names one. */
export const owner = (t: Target) => (t.kind === 'link' ? t.from : t.place);
export const memberOf = (t: Target) => (t.kind === 'member' ? t.member : null);

const listed = (names: string[]) => (names.length <= 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);

/** A risk read as what happens if the change merges: "When a signed-in user acts, data leaks for many users, possibly." */
export function scenario(risk: Pick<Risk, 'trigger' | 'impact' | 'blast' | 'certainty'>): string {
  const when = risk.trigger && TRIGGER[risk.trigger] ? `When ${TRIGGER[risk.trigger]}, ` : '';
  const sentence = `${when}${IMPACT[risk.impact] ?? risk.impact}${BLAST[risk.blast] ? ` ${BLAST[risk.blast]}` : ''}${CERTAINTY[risk.certainty] ? `, ${CERTAINTY[risk.certainty]}` : ''}.`;
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

export interface Neighbour {
  id: string;
  role: Role;
  change?: string;
}

export interface Story {
  id: string;
  role: Role;
  roleName: string;
  label?: string;
  change?: string;
  /** Whether the change touches the place or anything inside it. */
  touched: boolean;
  /** Two sentences: what the place is, and what this change does to it. */
  lead: string;
  behaviors: (Behavior & { member: string | null })[];
  risks: (Risk & { member: string | null; scenario: string })[];
  conditions: (Condition & { member: string | null })[];
  tests: string[];
  /** True when the change touches the place and no test in it names the place. */
  untested: boolean;
  calledBy: Neighbour[];
  calls: Neighbour[];
  beside: Neighbour[];
  changedWith: Neighbour[];
}

function neighbour(place: Place): Neighbour {
  return { id: place.id, role: roleOf(place), ...(place.change ? { change: place.change } : {}) };
}

function lead(place: Place, town: Town): string {
  const info = ROLES[roleOf(place)];
  const district = town.districts.find((d) => d.id === place.district);
  const where = district ? district.label ?? district.id : town.name;
  const noun = info.name === 'API' ? 'API' : info.name.toLowerCase();
  const first = `${place.id} is the ${noun} ${info.name === 'API' || info.name === 'Store' ? 'of' : 'in'} ${where}: ${info.means.charAt(0).toLowerCase()}${info.means.slice(1)}.`;
  const bits: string[] = [];
  for (const [change, verb] of [['added', 'adds'], ['modified', 'edits'], ['deleted', 'removes']] as const) {
    const members = place.members.filter((m) => m.change === change);
    if (!members.length) continue;
    const kinds = [...new Set(members.map((m) => m.kind))];
    const word = kinds.length === 1 ? (members.length === 1 ? kinds[0]! : PLURAL[kinds[0]!] ?? `${kinds[0]}s`) : 'parts';
    bits.push(`${verb} ${members.length === 1 ? 'one' : members.length} ${word}: ${listed(members.map((m) => m.name))}`);
  }
  const second =
    place.change === 'added'
      ? `It is new in this change${bits.length ? ` and ${bits.join('; ')}` : ''}.`
      : place.change === 'deleted'
        ? 'This change removes it.'
        : bits.length
          ? `This change ${bits.join('; ')}.`
          : 'This change does not touch it; it is drawn because something that changed depends on it.';
  return `${first} ${second}`;
}

export function story(town: Town, id: string): Story | null {
  const place = town.places.find((p) => p.id === id);
  if (!place) return null;
  const role = roleOf(place);
  const touched = !!place.change || place.members.some((m) => m.change);
  const of = (target: Target) => owner(target) === id;
  const find = (other: string) => town.places.find((p) => p.id === other);
  const beside = town.places.filter((p) => p.id !== id && place.district && p.district === place.district);
  const tests = town.tests.filter((t) => of(t.target)).map((t) => t.name ?? 'a test');
  return {
    id,
    role,
    roleName: ROLES[role].name,
    ...(place.label ? { label: place.label } : {}),
    ...(place.change ? { change: place.change } : {}),
    touched,
    lead: lead(place, town),
    behaviors: town.behaviors.filter((b) => of(b.target)).map((b) => ({ ...b, member: memberOf(b.target) })),
    risks: town.risks.filter((r) => of(r.target)).map((r) => ({ ...r, member: memberOf(r.target), scenario: scenario(r) })),
    conditions: [...place.conditions.map((c) => ({ ...c, member: null })), ...place.members.flatMap((m) => m.conditions.map((c) => ({ ...c, member: m.name })))],
    tests,
    untested: touched && !tests.length,
    calledBy: town.links.filter((l) => l.to === id).map((l) => find(l.from)).filter((p): p is Place => !!p).map(neighbour),
    calls: town.links.filter((l) => l.from === id).map((l) => find(l.to)).filter((p): p is Place => !!p).map(neighbour),
    beside: beside.map(neighbour),
    changedWith: town.places.filter((p) => p.id !== id && !beside.includes(p) && (p.change || p.members.some((m) => m.change))).map(neighbour),
  };
}

export interface TourStep {
  /** The place the step looks at, or null for the whole change. */
  id: string | null;
  text: string;
}

/** A walk through the change: the whole first, then each touched place, then each risk. */
export function tour(town: Town): TourStep[] {
  const changed = town.places.filter((p) => p.change || p.members.some((m) => m.change));
  const added = changed.filter((p) => p.change === 'added').length;
  const steps: TourStep[] = [
    {
      id: null,
      text: `${town.intent ? `${town.intent.replace(/\.$/, '')}. ` : ''}This change touches ${changed.length} part${changed.length === 1 ? '' : 's'}${added ? `, ${added} of them new` : ''}.`,
    },
  ];
  for (const p of changed) {
    const info = ROLES[roleOf(p)];
    const parts: string[] = [];
    const news = p.members.filter((m) => m.change === 'added').map((m) => m.name);
    const edits = p.members.filter((m) => m.change === 'modified').map((m) => m.name);
    if (news.length) parts.push(`adds ${listed(news)}`);
    if (edits.length) parts.push(`changes ${listed(edits)}`);
    const said = town.behaviors.find((b) => owner(b.target) === p.id)?.after;
    const head = `${info.name} ${p.id}${p.change === 'added' ? ' is new' : ''}`;
    const what = parts.length ? `${p.change === 'added' ? ' and ' : ' '}${parts.join(' and ')}` : '';
    steps.push({ id: p.id, text: `${head}${what}.${said ? ` ${said}` : ''}` });
  }
  for (const r of town.risks) steps.push({ id: owner(r.target), text: `Risk ${r.id}: ${r.text}` });
  return steps;
}
