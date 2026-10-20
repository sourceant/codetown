import type { Link, Member, Place, Town } from './model.js';

const linkKey = (link: Link) => `${link.from} ${link.kind} ${link.to}`;

function membersOf(before: Place | undefined, after: Place): { members: Member[]; changed: boolean } {
  const old = new Map((before?.members ?? []).map((one) => [`${one.kind} ${one.name}`, one]));
  const members: Member[] = [];
  let changed = false;
  for (const member of after.members) {
    const key = `${member.kind} ${member.name}`;
    const was = old.get(key);
    old.delete(key);
    if (!was) {
      members.push({ ...member, change: 'added' });
      changed = true;
    } else if ((was.label ?? '') !== (member.label ?? '')) {
      members.push({ ...member, change: 'modified' });
      changed = true;
    } else {
      members.push({ ...member });
    }
  }
  for (const gone of old.values()) {
    members.push({ ...gone, conditions: [], change: 'deleted' });
    changed = true;
  }
  return { members, changed };
}

/**
 * One town showing how `before` became `after`: everything `after` holds,
 * marked added, modified or renamed, plus what `before` had and `after` lost,
 * marked deleted. Conditions, risks, behaviors, tests and trips are the
 * after town's, since they describe the change, not the system before it.
 */
export function diff(before: Town, after: Town): Town {
  const oldPlaces = new Map(before.places.map((one) => [one.id, one]));
  const renamedFrom = new Set(after.places.map((one) => one.was).filter((one): one is string => !!one));
  const places: Place[] = [];

  for (const place of after.places) {
    const was = oldPlaces.get(place.id) ?? (place.was ? oldPlaces.get(place.was) : undefined);
    const { members, changed } = membersOf(was, place);
    let change = place.change;
    if (!was) change = 'added';
    else if (place.was && place.was !== place.id) change = 'renamed';
    else if (changed || was.kind !== place.kind || (was.label ?? '') !== (place.label ?? '') || was.size !== place.size || was.district !== place.district) {
      change = 'modified';
    } else change = undefined;
    places.push({ ...place, members, ...(change ? { change } : {}) });
  }
  for (const gone of before.places) {
    if (after.places.some((one) => one.id === gone.id) || renamedFrom.has(gone.id)) continue;
    places.push({ ...gone, conditions: [], members: gone.members.map((one) => ({ ...one, conditions: [] })), change: 'deleted' });
  }

  const oldLinks = new Map(before.links.map((one) => [linkKey(one), one]));
  const links: Link[] = [];
  for (const link of after.links) {
    const was = oldLinks.get(linkKey(link));
    oldLinks.delete(linkKey(link));
    const change = !was ? 'added' : (was.label ?? '') !== (link.label ?? '') || was.traffic !== link.traffic ? 'modified' : undefined;
    const { change: _ignored, ...rest } = link;
    links.push({ ...rest, ...(change ? { change } : {}) });
  }
  for (const gone of oldLinks.values()) links.push({ ...gone, conditions: [], change: 'deleted' });

  const oldDistricts = new Set(before.districts.map((one) => one.id));
  const districts = after.districts.map((one) => (oldDistricts.has(one.id) ? { ...one } : { ...one, change: 'added' as const }));
  for (const gone of before.districts) {
    if (!after.districts.some((one) => one.id === gone.id)) districts.push({ ...gone, change: 'deleted' });
  }

  return {
    ...after,
    districts,
    places,
    links,
    diagnostics: [...after.diagnostics],
  };
}
