import type { Blast, Certainty, Change, Impact, Purpose, Traffic, Trigger, World } from './vocabulary.js';

/** Where a statement points: a place, a member of one (`orders.createOrder`), or a link (`a -> b`). */
export type Target =
  | { kind: 'place'; place: string }
  | { kind: 'member'; place: string; member: string }
  | { kind: 'link'; from: string; to: string };

export interface Condition {
  /** Canonical condition or means keyword, such as `bug`, `slow` or `fix`. */
  kind: string;
  note?: string;
  line: number;
}

export interface Member {
  kind: string;
  name: string;
  label?: string;
  change?: Change;
  conditions: Condition[];
  line: number;
}

export interface Place {
  id: string;
  kind: string;
  label?: string;
  district?: string;
  size: number;
  change?: Change;
  /** The id this place had before, when it was renamed. */
  was?: string;
  members: Member[];
  conditions: Condition[];
  line: number;
}

export interface Link {
  from: string;
  to: string;
  kind: string;
  label?: string;
  traffic: Traffic;
  change?: Change;
  conditions: Condition[];
  line: number;
}

export interface District {
  id: string;
  label?: string;
  change?: Change;
  line: number;
}

export interface Risk {
  id: string;
  target: Target;
  text: string;
  impact: Impact;
  certainty: Certainty;
  blast: Blast;
  trigger?: Trigger;
  line: number;
}

export interface Behavior {
  id: string;
  target: Target;
  before: string;
  after: string;
  line: number;
}

export interface Test {
  target: Target;
  name?: string;
  count: number;
  line: number;
}

export interface Trip {
  id: string;
  stops: string[];
  line: number;
}

export interface Diagnostic {
  line: number;
  message: string;
  severity: 'error' | 'warning';
}

export interface Town {
  name: string;
  world: World;
  intent?: string;
  purpose?: Purpose;
  purposeNote?: string;
  districts: District[];
  places: Place[];
  links: Link[];
  risks: Risk[];
  behaviors: Behavior[];
  tests: Test[];
  trips: Trip[];
  diagnostics: Diagnostic[];
}

export function emptyTown(): Town {
  return {
    name: 'Untitled',
    world: 'town',
    districts: [],
    places: [],
    links: [],
    risks: [],
    behaviors: [],
    tests: [],
    trips: [],
    diagnostics: [],
  };
}

export function targetText(target: Target): string {
  if (target.kind === 'place') return target.place;
  if (target.kind === 'member') return `${target.place}.${target.member}`;
  return `${target.from} -> ${target.to}`;
}
