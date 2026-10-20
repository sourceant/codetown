import { CHANGES, type Change } from './vocabulary.js';
import { targetText, type Condition, type Town } from './model.js';

const MARK = Object.fromEntries(Object.entries(CHANGES).map(([mark, change]) => [change, mark])) as Record<Change, string>;

const q = (text: string) => `"${text.replace(/"/g, '\\"')}"`;
const mark = (change?: Change) => (change ? `${MARK[change]} ` : '');

/** The canonical text of a town: one way to write each thing, in a fixed order. */
export function format(town: Town): string {
  const out: string[] = [];
  out.push(`system ${q(town.name)}`);
  if (town.world !== 'town') out.push(`world ${town.world}`);
  if (town.intent) out.push(`intent ${q(town.intent)}`);
  if (town.purpose) out.push(`purpose ${town.purpose}${town.purposeNote ? ` ${q(town.purposeNote)}` : ''}`);

  if (town.districts.length) out.push('');
  for (const district of town.districts) {
    out.push(`${mark(district.change)}district ${district.id}${district.label ? ` ${q(district.label)}` : ''}`);
  }

  const conditions: string[] = [];
  const conditionLines = (target: string, list: Condition[]) => {
    for (const one of list) conditions.push(`${one.kind} ${target}${one.note ? ` ${q(one.note)}` : ''}`);
  };

  for (const place of town.places) {
    out.push('');
    const opts = [
      place.district ? `in=${place.district}` : '',
      place.size !== 2 ? `size=${place.size}` : '',
      place.was ? `was=${place.was}` : '',
    ].filter(Boolean);
    out.push(`${mark(place.change)}${place.kind} ${place.id}${place.label ? ` ${q(place.label)}` : ''}${opts.length ? ` ${opts.join(' ')}` : ''}`);
    for (const member of place.members) {
      out.push(`  ${mark(member.change)}${member.kind} ${member.name}${member.label ? ` ${q(member.label)}` : ''}`);
      conditionLines(`${place.id}.${member.name}`, member.conditions);
    }
    conditionLines(place.id, place.conditions);
  }

  if (town.links.length) out.push('');
  for (const link of town.links) {
    const traffic = link.traffic !== 'normal' ? ` traffic=${link.traffic}` : '';
    out.push(`${mark(link.change)}${link.from} ${link.kind} ${link.to}${link.label ? ` ${q(link.label)}` : ''}${traffic}`);
    conditionLines(`${link.from} -> ${link.to}`, link.conditions);
  }

  if (conditions.length) out.push('', ...conditions);

  if (town.trips.length) out.push('');
  for (const trip of town.trips) out.push(`trip ${trip.id}: ${trip.stops.join(' -> ')}`);

  if (town.behaviors.length) out.push('');
  for (const one of town.behaviors) {
    out.push(`behavior ${one.id} at ${targetText(one.target)} ${q(one.before)} -> ${q(one.after)}`);
  }

  if (town.risks.length) out.push('');
  for (const risk of town.risks) {
    const opts = [`impact=${risk.impact}`, `certainty=${risk.certainty}`, `blast=${risk.blast}`];
    if (risk.trigger) opts.push(`trigger=${risk.trigger}`);
    out.push(`risk ${risk.id} at ${targetText(risk.target)} ${q(risk.text)} ${opts.join(' ')}`);
  }

  if (town.tests.length) out.push('');
  for (const test of town.tests) {
    out.push(`test ${targetText(test.target)}${test.name ? ` ${q(test.name)}` : ''}${test.count !== 1 ? ` count=${test.count}` : ''}`);
  }

  return out.join('\n') + '\n';
}
