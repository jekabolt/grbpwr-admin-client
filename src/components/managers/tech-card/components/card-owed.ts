// WHAT THE CARD IS STILL OWED BY A PAGE THAT IS GONE. The staging queue and the form live in memory;
// two writes land only after other writes did, and a reload between the two would lose them silently:
//
// - the fusing rebuild runs after the body it reads. The body's baseline already holds the new markup,
//   so nothing on a reloaded page would ever see the sheets as stale;
// - a step's link to a seam, pose or fold row travels in the whole-card body, which is too big for a
//   keepalive request, while the row itself is already on the server.
//
// One record per card in this browser, until a read shows the write landed. Per-browser by nature:
// another browser cannot know. No form values live here, only what the page cannot derive.

const key = (cardId: number) => `tech-card-owed:${cardId}`;

export type OwedField = 'seamKeys' | 'poseKeys' | 'foldKeys';

/** The fields the seam replay finishes; the fold replay reads `foldKeys` on its own rows. */
const SEAM_FIELDS: readonly OwedField[] = ['seamKeys', 'poseKeys'];

export type OwedLink = {
  /** The step: the number it had, the only identity it has on a reloaded page. */
  op: number;
  field: OwedField;
  key: string;
  /** The row's pair: the server may answer with the key of the same pair it already holds. */
  sig?: string;
  at: number;
};

export type OwedStepRemoval = {
  /** Page-local identity while the page that removed the step is still alive. */
  historyKey: string;
  /** Stored identity after a reload, before a successful removal save renumbers later steps. */
  operationNumber: number;
  /** Rows that may become unlinked when the body saves the removal. */
  candidateKeys: string[];
  /** Only a body save at or after this gesture may start its cleanup. */
  at: number;
};

type Owed = { fuse?: boolean; links?: OwedLink[]; stepRemovals?: OwedStepRemoval[] };

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const validLink = (value: unknown): value is OwedLink => {
  if (!isObject(value)) return false;
  return (
    typeof value.op === 'number' &&
    (value.field === 'seamKeys' || value.field === 'poseKeys' || value.field === 'foldKeys') &&
    typeof value.key === 'string' &&
    (value.sig === undefined || typeof value.sig === 'string') &&
    typeof value.at === 'number'
  );
};

const validStepRemoval = (value: unknown): value is OwedStepRemoval => {
  if (!isObject(value)) return false;
  return (
    typeof value.historyKey === 'string' &&
    !!value.historyKey &&
    typeof value.operationNumber === 'number' &&
    value.operationNumber > 0 &&
    Array.isArray(value.candidateKeys) &&
    value.candidateKeys.every((candidate) => typeof candidate === 'string' && !!candidate) &&
    typeof value.at === 'number'
  );
};

function parsedOwed(value: unknown): Owed {
  if (!isObject(value)) return {};
  return {
    ...(typeof value.fuse === 'boolean' ? { fuse: value.fuse } : {}),
    ...(Array.isArray(value.links) ? { links: value.links.filter(validLink) } : {}),
    ...(Array.isArray(value.stepRemovals)
      ? { stepRemovals: value.stepRemovals.filter(validStepRemoval) }
      : {}),
  };
}

/**
 * The page's own copy of a debt storage refused to keep (private mode, quota, a blocked origin).
 * A card listed here reads from memory until a storage write succeeds again; the page's guard
 * counts the debt as unsaved meanwhile. Lives as long as the page.
 */
const memory = new Map<number, Owed>();

/** The step removals this page marked or cleared, by card: storage's copy of them is stale. */
const ownRemovals = new Set<string>();
const removalId = (cardId: number, historyKey: string, operationNumber: number) =>
  `${cardId}|${historyKey}|${operationNumber}`;

function stored(cardId: number): Owed {
  try {
    const raw = localStorage.getItem(key(cardId));
    return raw ? parsedOwed(JSON.parse(raw) as unknown) : {};
  } catch {
    return {};
  }
}

function read(cardId: number): Owed {
  const kept = memory.get(cardId);
  if (!kept) return stored(cardId);
  // Another tab may have written its own cleanup debt meanwhile (U1 #6): it joins this page's copy,
  // so the next storage write does not wipe it.
  const theirs = (stored(cardId).stepRemovals ?? []).filter(
    (entry) => !ownRemovals.has(removalId(cardId, entry.historyKey, entry.operationNumber)),
  );
  if (!theirs.length) return kept;
  const mine = kept.stepRemovals ?? [];
  const known = new Set(mine.map((e) => removalId(cardId, e.historyKey, e.operationNumber)));
  const added = theirs.filter(
    (e) => !known.has(removalId(cardId, e.historyKey, e.operationNumber)),
  );
  return added.length ? { ...kept, stepRemovals: [...mine, ...added] } : kept;
}

function write(cardId: number, owed: Owed): void {
  try {
    if (owed.fuse || owed.links?.length || owed.stepRemovals?.length)
      localStorage.setItem(key(cardId), JSON.stringify(owed));
    else localStorage.removeItem(key(cardId));
    memory.delete(cardId);
  } catch {
    memory.set(cardId, owed);
  }
}

export const fuseOwed = (cardId: number): boolean => !!read(cardId).fuse;
export const markFuseOwed = (cardId: number) => write(cardId, { ...read(cardId), fuse: true });
export const clearFuseOwed = (cardId: number) => write(cardId, { ...read(cardId), fuse: false });

export const owedLinks = (cardId: number, fields: readonly OwedField[] = SEAM_FIELDS): OwedLink[] =>
  (read(cardId).links ?? []).filter((link) => fields.includes(link.field));

export function markLinkOwed(cardId: number, link: OwedLink): void {
  const owed = read(cardId);
  const others = (owed.links ?? []).filter((l) => l.key !== link.key || l.field !== link.field);
  write(cardId, { ...owed, links: [...others, link] });
}

export function clearLinkOwed(cardId: number, linkKey: string, field?: OwedField): void {
  const owed = read(cardId);
  const keep = (l: OwedLink) => l.key !== linkKey || (field !== undefined && l.field !== field);
  write(cardId, { ...owed, links: (owed.links ?? []).filter(keep) });
}

/** A removed step cannot receive its delayed seam/pose links on a later step with the same number. */
export function clearStepLinksOwed(cardId: number, operationNumber: number): void {
  const owed = read(cardId);
  const keep = (link: OwedLink) => link.op !== operationNumber || !SEAM_FIELDS.includes(link.field);
  write(cardId, { ...owed, links: (owed.links ?? []).filter(keep) });
}

export const owedStepRemovals = (cardId: number): OwedStepRemoval[] =>
  structuredClone(read(cardId).stepRemovals ?? []);

export function markStepRemovalOwed(cardId: number, entry: OwedStepRemoval): void {
  ownRemovals.add(removalId(cardId, entry.historyKey, entry.operationNumber));
  const owed = read(cardId);
  const others = (owed.stepRemovals ?? []).filter(
    (current) =>
      current.historyKey !== entry.historyKey || current.operationNumber !== entry.operationNumber,
  );
  write(cardId, {
    ...owed,
    stepRemovals: [
      ...others,
      {
        ...entry,
        candidateKeys: [...new Set(entry.candidateKeys.filter(Boolean))],
      },
    ],
  });
}

export function clearStepRemovalOwed(
  cardId: number,
  historyKey: string,
  operationNumber: number,
): void {
  ownRemovals.add(removalId(cardId, historyKey, operationNumber));
  const owed = read(cardId);
  write(cardId, {
    ...owed,
    stepRemovals: (owed.stepRemovals ?? []).filter(
      (entry) => entry.historyKey !== historyKey || entry.operationNumber !== operationNumber,
    ),
  });
}

export function hasStepRemovalOwed(
  cardId: number,
  historyKey: string,
  operationNumber: number,
): boolean {
  return (read(cardId).stepRemovals ?? []).some(
    (entry) => entry.historyKey === historyKey && entry.operationNumber === operationNumber,
  );
}

type OpLinks = { operationNumber?: number } & { [F in OwedField]?: string[] };
type RowOf = { seamKey: string; sig?: string };

/** A row the server does not hold yet: its write may still land. Then it did not. */
const ROW_WAIT_MS = 60 * 60_000;
/** A link older than this is nobody's work any more. */
const LINK_TTL_MS = 7 * 24 * 60 * 60_000;

export type OwedPlan = {
  /** The links to put on the form's steps, by the row's stored key. */
  attach: { index: number; field: OwedField; key: string }[];
  /** The links that are done or dead. */
  drop: OwedLink[];
};

/**
 * What to do with the owed links, given the card the server sent and the form on screen. A link in the
 * stored body is done. A link in the form alone stays owed: that write has not landed yet.
 */
export function planOwedLinks(
  links: readonly OwedLink[],
  stored: readonly OpLinks[],
  form: readonly OpLinks[],
  rows: readonly RowOf[],
  now: number,
): OwedPlan {
  const plan: OwedPlan = { attach: [], drop: [] };
  for (const link of links) {
    const row =
      rows.find((r) => r.seamKey === link.key) ??
      (link.sig ? rows.find((r) => r.sig === link.sig) : undefined);
    const rowKey = row?.seamKey ?? link.key;
    const age = now - link.at;
    if (stored.some((op) => op[link.field]?.includes(rowKey))) plan.drop.push(link);
    else if (!row) {
      if (age > ROW_WAIT_MS) plan.drop.push(link);
    } else if (age > LINK_TTL_MS) plan.drop.push(link);
    else if (!form.some((op) => op[link.field]?.includes(rowKey))) {
      const index = form.findIndex((op) => op.operationNumber === link.op);
      if (index >= 0) plan.attach.push({ index, field: link.field, key: rowKey });
      // The form may not hold the card yet; a card that does and has no such step dropped it.
      else if (form.length) plan.drop.push(link);
    }
  }
  return plan;
}
