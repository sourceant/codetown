import {
  BLASTS,
  CERTAINTIES,
  CHANGES,
  IMPACTS,
  PURPOSES,
  TRAFFIC,
  TRIGGERS,
  WORLDS,
  lookup,
  type ChangeMark,
  type Concept,
} from './vocabulary.js';
import { emptyTown, targetText, type Condition, type Member, type Place, type Target, type Town } from './model.js';

type Token = { text: string; quoted: boolean };

/** Words of a line, with quoted text kept whole and a `#` outside quotes ending the line. */
function tokens(line: string): Token[] {
  const out: Token[] = [];
  const pattern = /"((?:[^"\\]|\\.)*)"?|#.*$|->|[^\s"]+/g;
  for (const match of line.matchAll(pattern)) {
    const text = match[0];
    if (text.startsWith('#')) break;
    if (text.startsWith('"')) {
      out.push({ text: (match[1] ?? '').replace(/\\"/g, '"'), quoted: true });
    } else if (text !== '->' && text.includes('->')) {
      // `a->b` is written without spaces often enough to accept it.
      const [left, ...rest] = text.split('->');
      if (left) out.push({ text: left, quoted: false });
      for (const part of rest) {
        out.push({ text: '->', quoted: false });
        if (part) out.push({ text: part, quoted: false });
      }
    } else {
      out.push({ text, quoted: false });
    }
  }
  return out;
}

function splitMark(list: Token[]): { mark?: ChangeMark; rest: Token[] } {
  const first = list[0];
  if (!first || first.quoted) return { rest: list };
  if (first.text in CHANGES) return { mark: first.text as ChangeMark, rest: list.slice(1) };
  const head = first.text[0] ?? '';
  if (head in CHANGES && /[a-z]/i.test(first.text[1] ?? '')) {
    return { mark: head as ChangeMark, rest: [{ text: first.text.slice(1), quoted: false }, ...list.slice(1)] };
  }
  return { rest: list };
}

/** `key=value` options and the remaining words. */
function options(list: Token[]): { words: Token[]; opts: Map<string, string> } {
  const opts = new Map<string, string>();
  const words: Token[] = [];
  for (let i = 0; i < list.length; i++) {
    const one = list[i]!;
    if (!one.quoted && /^[a-z_]+=/.test(one.text)) {
      const at = one.text.indexOf('=');
      let value = one.text.slice(at + 1);
      if (!value && list[i + 1]?.quoted) value = list[++i]!.text;
      opts.set(one.text.slice(0, at).toLowerCase(), value);
    } else {
      words.push(one);
    }
  }
  return { words, opts };
}

function choose<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T, say: (m: string) => void, name: string): T {
  if (value === undefined) return fallback;
  if ((allowed as readonly string[]).includes(value)) return value as T;
  say(`${name} is one of ${allowed.join(', ')}, not "${value}".`);
  return fallback;
}

/** A target written as `a`, `a.member` or `a -> b`, read from the front of a token list. */
function readTarget(list: Token[]): { target?: Target; rest: Token[] } {
  const first = list[0];
  if (!first || first.quoted) return { rest: list };
  if (list[1]?.text === '->' && list[2] && !list[2].quoted) {
    return { target: { kind: 'link', from: first.text, to: list[2].text }, rest: list.slice(3) };
  }
  const dot = first.text.indexOf('.');
  if (dot > 0) {
    return {
      target: { kind: 'member', place: first.text.slice(0, dot), member: first.text.slice(dot + 1) },
      rest: list.slice(1),
    };
  }
  return { target: { kind: 'place', place: first.text }, rest: list.slice(1) };
}

const quoted = (list: Token[]) => list.filter((one) => one.quoted).map((one) => one.text);
const plain = (list: Token[]) => list.filter((one) => !one.quoted).map((one) => one.text);

export function parse(source: string): Town {
  const town = emptyTown();
  const places = new Map<string, Place>();
  const districts = new Set<string>();
  const pendingConditions: { target: Target; condition: Condition }[] = [];
  let current: Place | undefined;

  source.split(/\r?\n/).forEach((raw, index) => {
    const line = index + 1;
    const say = (message: string, severity: 'error' | 'warning' = 'error') =>
      town.diagnostics.push({ line, message, severity });
    const list = tokens(raw);
    if (!list.length) return;
    const indented = /^\s/.test(raw);
    const { mark, rest } = splitMark(list);
    const change = mark ? CHANGES[mark] : undefined;
    const head = rest[0];
    if (!head) return say('a change mark needs something after it.');
    const word = head.text.toLowerCase();
    const known = lookup(word);

    if (indented) {
      if (!current) return say(`"${head.text}" is indented but no place comes before it.`);
      if (known?.role === 'member') {
        const { words, opts } = options(rest.slice(1));
        const name = plain(words)[0];
        if (!name) return say(`give the ${known.keyword} a name, like: ${known.keyword} createOrder`);
        const member: Member = { kind: known.keyword, name, conditions: [], line, ...(change ? { change } : {}) };
        const label = quoted(words)[0];
        if (label) member.label = label;
        if (opts.size) say(`a ${known.keyword} takes no options.`, 'warning');
        current.members.push(member);
        return;
      }
      if (known?.role === 'condition' || known?.role === 'means') {
        const name = rest[1] && !rest[1].quoted ? rest[1].text : undefined;
        const target: Target = name
          ? { kind: 'member', place: current.id, member: name }
          : { kind: 'place', place: current.id };
        const note = quoted(rest.slice(1))[0];
        pendingConditions.push({ target, condition: { kind: known.keyword, line, ...(note ? { note } : {}) } });
        return;
      }
      return say(`"${head.text}" cannot go inside a place. Inside a place write a member such as function, endpoint or config, or a condition such as bug.`);
    }

    current = undefined;
    const after = rest.slice(1);

    switch (word) {
      case 'system':
      case 'city': {
        town.name = [...quoted(after), ...plain(after)].join(' ') || town.name;
        return;
      }
      case 'world': {
        town.world = choose(after[0]?.text, WORLDS, 'town', say, 'world');
        if (town.world !== 'town') say(`the ${town.world} world is not drawn yet, so the town is used.`, 'warning');
        return;
      }
      case 'intent': {
        const text = quoted(after)[0] ?? plain(after).join(' ');
        if (!text) return say('write the intent in quotes, like: intent "Refunds under 50 USD are paid at once"');
        town.intent = text;
        return;
      }
      case 'purpose': {
        town.purpose = choose(after[0]?.text, PURPOSES, 'feat', say, 'purpose');
        const note = quoted(after)[0];
        if (note) town.purposeNote = note;
        return;
      }
      case 'district': {
        const id = after[0];
        if (!id || id.quoted) return say('give the district a short id, like: district core "Review core"');
        if (districts.has(id.text)) return say(`district "${id.text}" is already defined.`);
        districts.add(id.text);
        const label = quoted(after.slice(1))[0];
        town.districts.push({ id: id.text, line, ...(label ? { label } : {}), ...(change ? { change } : {}) });
        return;
      }
      case 'risk':
      case 'fire': {
        const legacy = word === 'fire';
        const id = legacy ? String(town.risks.length + 1) : after[0]?.text;
        const body = legacy ? after : after.slice(1);
        if (!id) return say('number the risk, like: risk 1 at payments "Timeouts calling the card network"');
        const atIndex = body.findIndex((one) => !one.quoted && one.text === 'at');
        const { target, rest: tail } = readTarget(atIndex >= 0 ? body.slice(atIndex + 1) : body);
        if (!target) return say('say where the risk is, like: risk 1 at payments "why"');
        const { words, opts } = options(tail);
        town.risks.push({
          id,
          target,
          text: quoted(words)[0] ?? '',
          impact: choose(opts.get('impact'), IMPACTS, legacy ? 'crash' : 'none', say, 'impact'),
          certainty: choose(opts.get('certainty'), CERTAINTIES, legacy ? 'always' : 'possible', say, 'certainty'),
          blast: choose(opts.get('blast'), BLASTS, 'one', say, 'blast'),
          line,
          ...(opts.has('trigger') ? { trigger: choose(opts.get('trigger'), TRIGGERS, 'anyone', say, 'trigger') } : {}),
        });
        return;
      }
      case 'behavior': {
        const id = after[0]?.text;
        const atIndex = after.findIndex((one) => !one.quoted && one.text === 'at');
        if (!id || atIndex < 0) return say('write a behavior as: behavior B1 at orders "before" -> "after"');
        const { target, rest: tail } = readTarget(after.slice(atIndex + 1));
        const texts = quoted(tail);
        if (!target || texts.length < 2) return say('a behavior needs where it happens and two quoted texts: "before" -> "after"');
        town.behaviors.push({ id, target, before: texts[0]!, after: texts[1]!, line });
        return;
      }
      case 'test': {
        const { target, rest: tail } = readTarget(after);
        if (!target) return say('say what the test covers, like: test orders "orders.test.ts"');
        const { words, opts } = options(tail);
        const count = Number(opts.get('count') ?? '1');
        const name = quoted(words)[0];
        town.tests.push({ target, count: Number.isFinite(count) && count > 0 ? count : 1, line, ...(name ? { name } : {}) });
        return;
      }
      case 'trip': {
        const id = after[0]?.text.replace(/:$/, '');
        const stops = plain(after.slice(1)).filter((one) => one !== '->' && one !== ':');
        if (!id || stops.length < 2) return say('write a trip as: trip checkout: storefront -> orders -> payments');
        town.trips.push({ id, stops, line });
        return;
      }
    }

    // A link reads `from calls to`. The prototype's `road from -> to` is accepted too.
    const second = rest[1];
    const linkWord = word === 'road' ? lookup('road') : second && !second.quoted ? lookup(second.text) : undefined;
    if (linkWord?.role === 'link') {
      const parts = word === 'road' ? rest.slice(1) : rest;
      const fromId = parts[0]?.text;
      const toToken = word === 'road' ? parts[2] : parts[2];
      if (!fromId || !toToken || toToken.quoted) return say(`write a link as: orders ${linkWord.keyword} payments`);
      const { words, opts } = options(parts.slice(3));
      const label = quoted(words)[0];
      town.links.push({
        from: fromId,
        to: toToken.text,
        kind: linkWord.keyword,
        traffic: choose(opts.get('traffic'), TRAFFIC, 'normal', say, 'traffic'),
        conditions: [],
        line,
        ...(label ? { label } : {}),
        ...(change ? { change } : {}),
      });
      return;
    }

    if (known?.role === 'place') return place(known);

    if (known?.role === 'condition' || known?.role === 'means') {
      const { target, rest: tail } = readTarget(after);
      if (!target) return say(`say what is ${known.keyword}, like: ${known.keyword} payments`);
      const note = quoted(tail)[0];
      pendingConditions.push({ target, condition: { kind: known.keyword, line, ...(note ? { note } : {}) } });
      return;
    }

    if (known?.role === 'member') return say(`"${head.text}" goes inside a place: indent it under one.`);
    return say(`"${head.text}" is not a Codetown word.`);

    function place(concept: Concept) {
      const id = after[0];
      if (!id || id.quoted) return say(`give the ${concept.keyword} a short id, like: ${concept.keyword} orders`);
      if (places.has(id.text)) return say(`"${id.text}" is already used on line ${places.get(id.text)!.line}.`);
      const { words, opts } = options(after.slice(1));
      let size = Number(opts.get('size') ?? '2');
      if (!(Number.isInteger(size) && size >= 1 && size <= 5)) {
        say('size goes from 1 to 5.');
        size = 2;
      }
      const label = quoted(words)[0];
      const node: Place = {
        id: id.text,
        kind: concept.keyword,
        size,
        members: [],
        conditions: [],
        line,
        ...(label ? { label } : {}),
        ...(opts.has('in') ? { district: opts.get('in')! } : {}),
        ...(opts.has('was') ? { was: opts.get('was')! } : {}),
        ...(change ? { change } : {}),
      };
      places.set(node.id, node);
      town.places.push(node);
      current = node;
    }
  });

  town.diagnostics.push(...resolve(town, places, districts, pendingConditions));
  town.diagnostics.sort((a, b) => a.line - b.line);
  return town;
}

/** Ties statements to the places they name, and reports names nothing defines. */
function resolve(
  town: Town,
  places: Map<string, Place>,
  districts: Set<string>,
  pending: { target: Target; condition: Condition }[],
) {
  const problems: Town['diagnostics'] = [];
  const missing = (line: number, name: string) => {
    problems.push({ line, message: `nothing is called "${name}".`, severity: 'error' });
  };

  const find = (target: Target, line: number) => {
    if (target.kind === 'link') {
      const link = town.links.find((one) => one.from === target.from && one.to === target.to);
      if (!link) problems.push({ line, message: `there is no link from "${target.from}" to "${target.to}".`, severity: 'error' });
      return link;
    }
    const place = places.get(target.place);
    if (!place) {
      missing(line, target.place);
      return undefined;
    }
    if (target.kind === 'place') return place;
    const member = place.members.find((one) => one.name === target.member);
    if (!member) problems.push({ line, message: `"${target.place}" has nothing called "${target.member}".`, severity: 'error' });
    return member;
  };

  for (const place of town.places) {
    if (place.district && !districts.has(place.district)) missing(place.line, place.district);
  }
  for (const link of town.links) {
    for (const end of [link.from, link.to]) if (!places.has(end)) missing(link.line, end);
  }
  for (const { target, condition } of pending) {
    const found = find(target, condition.line);
    if (found) found.conditions.push(condition);
  }
  for (const one of [...town.risks, ...town.behaviors, ...town.tests]) find(one.target, one.line);
  for (const trip of town.trips) {
    for (const stop of trip.stops) if (!places.has(stop)) missing(trip.line, stop);
  }
  for (const risk of town.risks) {
    if (risk.impact === 'none' && risk.certainty === 'possible' && !risk.text) {
      problems.push({ line: risk.line, message: `risk ${risk.id} at ${targetText(risk.target)} says nothing about what goes wrong.`, severity: 'warning' });
    }
  }
  return problems;
}
