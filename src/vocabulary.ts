/**
 * Every word Codetown understands, where it comes from, and what it means.
 *
 * The parser, the formatter and the renderer all read this table, so a word
 * is added to the language by adding it here with its source. A word whose
 * `source` is null came from the first prototype and only has a candidate.
 */

export type Layer = 'scale' | 'type' | 'link' | 'state' | 'condition' | 'review';

/** How a word is written: as a place, inside a place, between places, or about one. */
export type Role = 'place' | 'member' | 'link' | 'condition' | 'means';

export interface Source {
  name: string;
  term: string;
  url?: string;
}

export interface Concept {
  keyword: string;
  aliases: string[];
  layer: Layer;
  role: Role;
  means: string;
  source: Source | null;
  candidate?: Source;
  /** What the town world draws for it. */
  town: string;
}

const C4: Omit<Source, 'term'> = { name: 'C4 model', url: 'https://c4model.com/abstractions' };
const ARCHIMATE: Omit<Source, 'term'> = { name: 'ArchiMate 3.2', url: 'https://github.com/archimatetool/archi' };
const LSP: Omit<Source, 'term'> = {
  name: 'Language Server Protocol SymbolKind',
  url: 'https://github.com/microsoft/vscode-languageserver-node',
};
const EIP: Omit<Source, 'term'> = {
  name: 'Enterprise Integration Patterns',
  url: 'https://www.enterpriseintegrationpatterns.com/patterns/messaging/toc.html',
};
const DEPENDABILITY: Omit<Source, 'term'> = {
  name: 'Avizienis et al. 2004, Basic Concepts and Taxonomy of Dependable and Secure Computing',
  url: 'https://doi.org/10.1109/TDSC.2004.2',
};
const SRE: Omit<Source, 'term'> = {
  name: 'Google SRE book, four golden signals',
  url: 'https://sre.google/sre-book/monitoring-distributed-systems/',
};
const TWELVE: Omit<Source, 'term'> = { name: 'The Twelve-Factor App', url: 'https://12factor.net/' };

const from = (base: Omit<Source, 'term'>, term: string): Source => ({ ...base, term });

function concept(
  keyword: string,
  layer: Layer,
  role: Role,
  means: string,
  source: Source | null,
  town: string,
  aliases: string[] = [],
  candidate?: Source,
): Concept {
  return { keyword, aliases, layer, role, means, source, town, ...(candidate ? { candidate } : {}) };
}

export const CONCEPTS: readonly Concept[] = [
  // Places: things that stand in the town.
  concept('service', 'scale', 'place', 'An application that runs on its own', from(C4, 'Container: application'), 'Building', ['app', 'building']),
  concept('database', 'scale', 'place', 'A store of data', from(C4, 'Container: data store'), 'Warehouse', ['db', 'warehouse', 'store']),
  concept('cache', 'type', 'place', 'A fast copy of data kept near its readers', null, 'Shelf by the counter', ['shelf'], from(C4, 'Container: data store')),
  concept('external', 'scale', 'place', 'A software system someone else runs', from(C4, 'Software system'), 'Building outside the wall', ['outside', 'thirdparty']),
  concept('person', 'scale', 'place', 'Someone who uses the system', from(C4, 'Person'), 'Resident walking in', ['user', 'actor']),
  concept('queue', 'link', 'place', 'Messages waiting for one receiver', from(EIP, 'Point-to-Point Channel'), 'Mailbox', ['mailbox', 'channel']),
  concept('topic', 'link', 'place', 'Messages every subscriber receives', from(EIP, 'Publish-Subscribe Channel'), 'Notice board', ['pubsub']),
  concept('deadletter', 'link', 'place', 'Messages nobody could deliver', from(EIP, 'Dead Letter Channel'), 'Lost and found box'),
  concept('router', 'link', 'place', 'Sends each message on by its content', from(EIP, 'Message Router'), 'Sorting office'),
  concept('bus', 'link', 'place', 'A shared channel many systems use', from(EIP, 'Message Bus'), 'Ring road with a post van'),
  concept('host', 'type', 'place', 'A machine or environment that runs software', from(ARCHIMATE, 'Node'), 'Plot of land'),
  concept('device', 'type', 'place', 'A physical device', from(ARCHIMATE, 'Device'), 'Vehicle or machine'),
  concept('runtime', 'type', 'place', 'Software that other software runs on', from(ARCHIMATE, 'System software'), 'Power station'),
  concept('artifact', 'type', 'place', 'A deployable file', from(ARCHIMATE, 'Artifact'), 'Shipping crate'),
  concept('data', 'type', 'place', 'A piece of data passed around', from(ARCHIMATE, 'Data object'), 'Parcel', ['parcel']),

  // Members: things inside a place.
  concept('endpoint', 'type', 'member', 'Where others call in', from(ARCHIMATE, 'Application interface'), 'Door', ['door', 'api', 'route']),
  concept('offer', 'type', 'member', 'A service offered to callers', from(ARCHIMATE, 'Application service'), 'Menu board'),
  concept('function', 'type', 'member', 'A function or method', from(LSP, 'Function, Method, Operator'), 'Worker at a window', ['worker', 'method']),
  concept('constructor', 'type', 'member', 'Builds an object', from(LSP, 'Constructor'), 'Builder'),
  concept('class', 'type', 'member', 'A class or struct', from(LSP, 'Class, Struct'), 'Workshop', ['struct']),
  concept('interface', 'type', 'member', 'A contract others implement', from(LSP, 'Interface'), 'Contract on the door'),
  concept('module', 'type', 'member', 'A module, namespace or package', from(LSP, 'Module, Namespace, Package'), 'Wing', ['package', 'namespace']),
  concept('file', 'type', 'member', 'A source file', from(LSP, 'File'), 'Room'),
  concept('constant', 'type', 'member', 'A fixed value or enum', from(LSP, 'Constant, Enum'), 'Sign on the wall', ['enum']),
  concept('field', 'type', 'member', 'A field, property or variable', from(LSP, 'Field, Property, Variable'), 'Tool on the bench', ['property', 'variable']),
  concept('event', 'type', 'member', 'Something that happens and others react to', from(ARCHIMATE, 'Application event'), 'Bell'),
  concept('generic', 'type', 'member', 'A type parameter', from(LSP, 'TypeParameter'), 'Blank label'),
  concept('process', 'type', 'member', 'A sequence of steps', from(ARCHIMATE, 'Application process'), 'Assembly line'),
  concept('config', 'type', 'member', 'Settings read at start', null, 'Rulebook on the wall', ['rulebook', 'env'], from(TWELVE, 'III. Config')),
  concept('job', 'type', 'member', 'Work that runs on a schedule', null, 'Clock tower', ['clock', 'cron'], from(TWELVE, 'XII. Admin processes')),
  concept('guard', 'type', 'member', 'A check on who may come in', null, 'Gate with a guard', ['auth']),

  // Links: how places reach each other.
  concept('calls', 'link', 'link', 'Asks and waits for an answer', from(ARCHIMATE, 'Serving'), 'Road', ['road', 'uses']),
  concept('reads', 'link', 'link', 'Reads data', from(ARCHIMATE, 'Access, read'), 'Pipe out'),
  concept('writes', 'link', 'link', 'Writes data', from(ARCHIMATE, 'Access, write'), 'Pipe in'),
  concept('sends', 'link', 'link', 'Hands something on without waiting', from(ARCHIMATE, 'Flow'), 'Conveyor belt', ['publishes', 'emits']),
  concept('triggers', 'link', 'link', 'Starts something', from(ARCHIMATE, 'Triggering'), 'Bell wire'),
  concept('transfers', 'link', 'link', 'Moves whole files', from(EIP, 'File Transfer'), 'Delivery truck'),
  concept('runs', 'link', 'link', 'Runs on or is assigned to', from(ARCHIMATE, 'Assignment'), 'Worker at a desk', ['hosts']),
  concept('implements', 'link', 'link', 'Makes a contract real', from(ARCHIMATE, 'Realization'), 'Blueprint'),
  concept('extends', 'link', 'link', 'A special case of', from(ARCHIMATE, 'Specialization'), 'Same building style'),
  concept('relates', 'link', 'link', 'Related in a way not said', from(ARCHIMATE, 'Association'), 'Footpath'),
  concept('influences', 'link', 'link', 'Affects without calling', from(ARCHIMATE, 'Influence'), 'Signpost'),

  // Conditions: how a place, member or link is doing.
  concept('bug', 'condition', 'condition', 'A cause of wrong behavior, hidden until reached', from(DEPENDABILITY, 'Fault'), 'Crack in a wall', ['fault']),
  concept('error', 'condition', 'condition', 'Wrong state inside, not yet seen outside', from(DEPENDABILITY, 'Error'), 'Damage behind a window'),
  concept('wrong', 'condition', 'condition', 'Gives a wrong answer', from(DEPENDABILITY, 'Content failure'), 'Wrong parcel handed over'),
  concept('late', 'condition', 'condition', 'Answers too late', from(DEPENDABILITY, 'Timing failure'), 'Queue out of the door'),
  concept('down', 'condition', 'condition', 'Gives no answer at all', from(DEPENDABILITY, 'Halt failure'), 'Building dark, door shut', ['failure']),
  concept('flaky', 'condition', 'condition', 'Sometimes right, sometimes not', from(DEPENDABILITY, 'Erratic failure'), 'Flickering lights'),
  concept('slow', 'condition', 'condition', 'Takes long to answer', from(SRE, 'Latency'), 'Cars crawl'),
  concept('busy', 'condition', 'condition', 'Many requests', from(SRE, 'Traffic'), 'Many cars'),
  concept('errors', 'condition', 'condition', 'Many requests fail', from(SRE, 'Errors'), 'Crashed cars'),
  concept('full', 'condition', 'condition', 'No room for more work', from(SRE, 'Saturation'), 'Car park full'),
  concept('broken', 'condition', 'condition', 'The connection fails', null, 'Collapsed bridge'),
  concept('degraded', 'condition', 'condition', 'The connection works poorly', null, 'Road works'),

  // Means: what is done about faults.
  concept('guarded', 'condition', 'means', 'Faults are prevented', from(DEPENDABILITY, 'Fault prevention'), 'Fence and building code plaque'),
  concept('fallback', 'condition', 'means', 'Faults are tolerated', from(DEPENDABILITY, 'Fault tolerance'), 'Detour and backup generator'),
  concept('fix', 'condition', 'means', 'A fault is removed', from(DEPENDABILITY, 'Fault removal'), 'Repair crew'),
  concept('monitored', 'condition', 'means', 'Faults are forecast', from(DEPENDABILITY, 'Fault forecasting'), 'Watchtower'),
];

const BY_WORD = new Map<string, Concept>();
for (const one of CONCEPTS) {
  for (const word of [one.keyword, ...one.aliases]) {
    if (BY_WORD.has(word)) throw new Error(`Codetown word "${word}" is defined twice`);
    BY_WORD.set(word, one);
  }
}

/** The concept a written word stands for, by its keyword or an alias. */
export function lookup(word: string): Concept | undefined {
  return BY_WORD.get(word.toLowerCase());
}

/** git change letters, written as a mark before a line. */
export const CHANGES = {
  '+': 'added',
  '~': 'modified',
  '-': 'deleted',
  '>': 'renamed',
  '*': 'copied',
  '!': 'retyped',
} as const;
export type ChangeMark = keyof typeof CHANGES;
export type Change = (typeof CHANGES)[ChangeMark];

/** Conventional Commits types: what a change is for. */
export const PURPOSES = ['fix', 'feat', 'refactor', 'perf', 'test', 'docs', 'build', 'ci', 'style', 'chore', 'revert'] as const;
export type Purpose = (typeof PURPOSES)[number];

/** SourceAnt finding answers, as the review writes them. */
export const IMPACTS = ['data_loss', 'corruption', 'disclosure', 'escalation', 'wrong_answer', 'hang', 'crash', 'degraded', 'rejected', 'none'] as const;
export const CERTAINTIES = ['always', 'conditional', 'possible'] as const;
export const BLASTS = ['everyone', 'many', 'one', 'nobody'] as const;
export const TRIGGERS = ['anyone', 'authenticated', 'operator', 'service', 'event', 'automation', 'deploy', 'environment'] as const;
export type Impact = (typeof IMPACTS)[number];
export type Certainty = (typeof CERTAINTIES)[number];
export type Blast = (typeof BLASTS)[number];
export type Trigger = (typeof TRIGGERS)[number];

export const TRAFFIC = ['low', 'normal', 'high'] as const;
export type Traffic = (typeof TRAFFIC)[number];

export const WORLDS = ['town', 'body', 'workshop', 'bank'] as const;
export type World = (typeof WORLDS)[number];
