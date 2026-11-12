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

type Owed = { fuse?: boolean; links?: OwedLink[] };

function read(cardId: number): Owed {
  try {
    const raw = localStorage.getItem(key(cardId));
    return raw ? (JSON.parse(raw) as Owed) : {};
  } catch {
    return {};
  }
}

function write(cardId: number, owed: Owed): void {
  try {
    if (owed.fuse || owed.links?.length) localStorage.setItem(key(cardId), JSON.stringify(owed));
    else localStorage.removeItem(key(cardId));
  } catch {
    /* storage unavailable: the debt stays in memory, and the page's guard counts it as unsaved */
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
