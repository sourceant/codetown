/**
 * What a place is to a reader, which is coarser than the word it was written
 * with: a database and a data object are both a store, a service whose doors
 * are all endpoints is an API. Every drawing and every story starts here.
 */
import type { Place } from './model.js';

export type Role = 'service' | 'api' | 'pipeline' | 'store' | 'cache' | 'queue' | 'topic' | 'external' | 'person' | 'runtime';
export type Language = 'Icons' | 'City' | 'Machine';

export const LANGUAGES: Language[] = ['Icons', 'City', 'Machine'];

export interface RoleInfo {
  name: string;
  means: string;
  /** A colour that tells roles apart in every language and theme. */
  hue: string;
  /** How each language draws it, said in a few words for a legend. */
  drawn: Record<Language, string>;
}

export const ROLES: Record<Role, RoleInfo> = {
  service: { name: 'Service', means: 'Code that runs and does work', hue: '#7d8fb8', drawn: { Icons: 'an app window', City: 'an office tower', Machine: 'a machine; grey work goes in and leaves done' } },
  api: { name: 'API', means: 'Where others call in; each endpoint is one way in', hue: '#2fa596', drawn: { Icons: 'a panel of ports, one per endpoint', City: 'a roundabout; each request leaves by the exit signed with its endpoint', Machine: "a sorter; a turning gate sends each request down its endpoint's chute" } },
  pipeline: { name: 'Pipeline', means: 'Automated steps, such as CI checks', hue: '#e0883a', drawn: { Icons: 'turning gears', City: 'a train line; one station per step', Machine: 'an assembly line; one press per step, items leave green when they pass' } },
  store: { name: 'Store', means: 'Keeps data so it can be remembered', hue: '#8a6bd0', drawn: { Icons: 'stacked disks', City: 'a container yard; the crane stacks what is written', Machine: 'an automated rack; the lift shelves each write' } },
  cache: { name: 'Cache', means: 'A fast copy kept close to its readers', hue: '#d8ae2f', drawn: { Icons: 'a memory chip', City: 'a kiosk', Machine: 'a small hopper' } },
  queue: { name: 'Queue', means: 'Work waiting its turn', hue: '#3c9dd3', drawn: { Icons: 'a tube with packets', City: 'a bus stop with a line', Machine: 'a conveyor belt' } },
  topic: { name: 'Topic', means: 'Messages every subscriber hears', hue: '#d35f7c', drawn: { Icons: 'a broadcast mast', City: 'a radio tower', Machine: 'a loudspeaker' } },
  external: { name: 'Outside', means: 'A system someone else runs', hue: '#7c9a78', drawn: { Icons: 'a globe', City: 'a highway exit', Machine: 'a pipe leaving the floor' } },
  person: { name: 'Person', means: 'Someone who uses the system', hue: '#4f80dc', drawn: { Icons: 'a figure', City: 'a resident', Machine: 'an operator' } },
  runtime: { name: 'Runtime', means: 'What other software runs on', hue: '#8c919b', drawn: { Icons: 'a server rack', City: 'a power station', Machine: 'a generator' } },
};

const API_FOLDER = /(^|\/)(routes?|api|controllers?|handlers?|endpoints?)$/i;

export function roleOf(place: Place): Role {
  const k = place.kind;
  if (k === 'database' || k === 'data') return 'store';
  if (k === 'cache') return 'cache';
  if (['queue', 'deadletter', 'router', 'bus'].includes(k)) return 'queue';
  if (k === 'topic') return 'topic';
  if (k === 'external') return 'external';
  if (k === 'person') return 'person';
  if (['runtime', 'host', 'device'].includes(k)) return 'runtime';
  const m = place.members;
  if (m.length && m.every((x) => x.kind === 'process' || x.kind === 'job')) return 'pipeline';
  if (m.some((x) => x.kind === 'endpoint')) return 'api';
  if (API_FOLDER.test(place.label ?? '')) return 'api';
  return 'service';
}
