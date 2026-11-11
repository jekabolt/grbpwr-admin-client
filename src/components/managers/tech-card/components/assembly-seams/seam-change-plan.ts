// ONE SEAM GESTURE, ONE REQUEST (C7) — the pure half of ChangeTechCardSeams on this page.
//
// A gesture names rows (upsert / delete) and step links (link / detach). A step is a form row, named
// by its historyKey and addressed on the wire by the operationNumber it holds AFTER the autosave
// flush (the number is the server's and moves only with a body save). The server answers with what it
// committed: every row, every numbered step's links, the new lock_version, the stored key of each
// sent row and the keys it deleted. Here: the request, the answer read back (links by step, keys),
// the optimistic rows, and the patches the page puts into the card it stands on.

import type {
  ChangeTechCardSeamsRequest,
  ChangeTechCardSeamsResponse,
  common_TechCard,
  common_TechCardSeam,
  OperationSeamKeys,
  SeamLink,
} from 'api/proto-http/admin';
import {
  poseKeysOfWire,
  toWire,
  type StoredPose,
  type StoredRow,
  type StoredSeam,
  type TechCardSeamWire,
} from 'lib/seams';
import { extractFieldViolations, violationReason } from 'utils/field-errors';
import type { PendingOp, PosePendingOp } from './seams-store';

/** A form step by its row identity; its operationNumber is read when the request is built. */
export type StepRef = { historyKey: string };
export type StepLink = { step: StepRef; seamKey: string };

/** One gesture: rows to write or delete, step links to add or take away — one transaction. */
export type SeamChange = {
  upsert?: readonly StoredRow[];
  /** Rows to delete by key; a delete also unlinks the row from every step. */
  delete?: readonly string[];
  link?: readonly StepLink[];
  /** A detach that takes a row's last link deletes the row (server rule). */
  detach?: readonly StepLink[];
};

/** A row as the generated client sends it: output-only fields left empty. */
export const wireOut = (row: StoredRow): common_TechCardSeam => ({
  ...(toWire(row) as Omit<
    common_TechCardSeam,
    'stale' | 'createdBy' | 'createdAt' | 'updatedBy' | 'updatedAt'
  >),
  stale: undefined,
  createdBy: undefined,
  createdAt: undefined,
  updatedBy: undefined,
  updatedAt: undefined,
});

/**
 * The request for `change` at `expected`, steps resolved through `numberOf`. Null when a step has no
 * stored number (never saved): the server could not find it, so nothing is sent.
 */
export function changeRequest(
  cardId: number,
  expected: number,
  change: SeamChange,
  numberOf: (step: StepRef) => number,
): ChangeTechCardSeamsRequest | null {
  const links = (xs: readonly StepLink[] | undefined): SeamLink[] | null => {
    const out: SeamLink[] = [];
    const seen = new Set<string>();
    for (const l of xs ?? []) {
      const n = numberOf(l.step);
      if (!(n > 0)) return null;
      const id = `${n}|${l.seamKey}`;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({ operationNumber: n, seamKey: l.seamKey });
    }
    return out;
  };
  const link = links(change.link);
  const detach = links(change.detach);
  if (!link || !detach) return null;
  // One row per key: the server refuses a request that sends a key twice.
  const upsert = new Map<string, StoredRow>();
  for (const row of change.upsert ?? []) upsert.set(row.seamKey, row);
  return {
    techCardId: cardId,
    expectedLockVersion: expected,
    upsert: [...upsert.values()].map(wireOut),
    delete: [...new Set(change.delete ?? [])],
    link,
    detach,
  };
}

/** Sent key → stored key (a new row of a pair already stored lands on that row's key). */
export function keyMapOf(res: Pick<ChangeTechCardSeamsResponse, 'keyMap'>): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of res.keyMap ?? []) if (m.sent && m.stored) out.set(m.sent, m.stored);
  return out;
}

/** The card moved since the version the request claimed (FailedPrecondition, lock_version_moved). */
export function isLockMoved(e: unknown): boolean {
  if (
    extractFieldViolations(e).some(
      (v) =>
        v.field === 'expected_lock_version' &&
        violationReason(v.description) === 'lock_version_moved',
    )
  )
    return true;
  return e instanceof Error && e.message.includes('lock_version_moved');
}

/** The optimistic rows of a change: upserts laid over, deletes (and rows expected to go) hidden. */
export function pendingOf(
  change: SeamChange,
  have: { rows: readonly StoredSeam[]; poses: readonly StoredPose[] },
  gone: readonly string[] = [],
): { pending: Record<string, PendingOp>; posePending: Record<string, PosePendingOp> } {
  const pending: Record<string, PendingOp> = {};
  const posePending: Record<string, PosePendingOp> = {};
  for (const key of new Set([...(change.delete ?? []), ...gone])) {
    const pose = have.poses.find((r) => r.seamKey === key);
    if (pose) {
      posePending[key] = { kind: 'delete', row: pose };
      continue;
    }
    const row = have.rows.find((r) => r.seamKey === key);
    pending[key] = row ? { kind: 'delete', row } : { kind: 'delete' };
  }
  for (const row of change.upsert ?? []) {
    if (row.kind === 'pose') posePending[row.seamKey] = { kind: 'upsert', row };
    else pending[row.seamKey] = { kind: 'upsert', row };
  }
  return { pending, posePending };
}

export type StepKeys = { seamKeys: string[]; poseKeys: string[] };

/** Numbers carried by more than one step: never addressed, never patched. */
function repeated(numbers: readonly (number | undefined)[]): Set<number> {
  const seen = new Set<number>();
  const twice = new Set<number>();
  for (const n of numbers) {
    if (!n) continue;
    if (seen.has(n)) twice.add(n);
    seen.add(n);
  }
  return twice;
}

/**
 * The server's links by step number, split as the form holds them (seams / poses, each in the
 * server's order). A number on two steps is left out — no step of the form can be told by it.
 */
export function linksByOperation(
  links: readonly OperationSeamKeys[],
  seams: readonly Pick<TechCardSeamWire, 'kind' | 'seamKey'>[],
): Map<number, StepKeys> {
  const poses = poseKeysOfWire(seams);
  const twice = repeated(links.map((l) => l.operationNumber));
  const out = new Map<number, StepKeys>();
  for (const l of links) {
    const n = l.operationNumber ?? 0;
    if (!n || twice.has(n)) continue;
    const keys = (l.seamKeys ?? []).filter(Boolean);
    out.set(n, {
      seamKeys: keys.filter((k) => !poses.has(k)),
      poseKeys: keys.filter((k) => poses.has(k)),
    });
  }
  return out;
}

export const sameKeys = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((k, i) => k === b[i]);

/**
 * A step's keys after the server moved them from `before` to `after` while the form held `cur`.
 * Untouched since `before` → exactly `after`. Otherwise the form's own change stays and the server's
 * is laid over it: what the server took away goes, what it added comes.
 */
export function mergeStepKeys(
  cur: readonly string[],
  before: readonly string[],
  after: readonly string[],
): string[] {
  if (sameKeys(cur, before)) return [...after];
  const removed = new Set(before.filter((k) => !after.includes(k)));
  const kept = cur.filter((k) => !removed.has(k));
  const added = after.filter((k) => !before.includes(k) && !kept.includes(k));
  return [...kept, ...added];
}

/**
 * The card this page stands on, moved by a committed change: its version, its rows, and every
 * numbered step's links exactly as a read at that version returns them (poses inside, server order).
 * Steps sharing a number take the server's lists in order — both lists come in the card's step order.
 */
export function patchCardLinks(
  card: common_TechCard,
  a: {
    lockVersion: number;
    links: readonly OperationSeamKeys[];
    seams: readonly common_TechCardSeam[];
  },
): common_TechCard {
  const byNo = new Map<number, string[][]>();
  for (const l of a.links) {
    const n = l.operationNumber ?? 0;
    if (!n) continue;
    byNo.set(n, [...(byNo.get(n) ?? []), (l.seamKeys ?? []).filter(Boolean)]);
  }
  const taken = new Map<number, number>();
  const operations = card.techCard?.operations?.map((op) => {
    const n = op.operationNumber ?? 0;
    const lists = n ? byNo.get(n) : undefined;
    if (!lists) return op;
    const at = taken.get(n) ?? 0;
    taken.set(n, at + 1);
    const keys = lists[at];
    return keys ? { ...op, seamKeys: [...keys] } : op;
  });
  return {
    ...card,
    lockVersion: a.lockVersion,
    seams: [...a.seams],
    ...(card.techCard ? { techCard: { ...card.techCard, operations } } : {}),
  };
}

/**
 * The body this page SENT under its version (no card read back), moved the same way: each numbered
 * step's keys as the body write puts them on the wire — seams first, then poses.
 */
export function patchSentBody(
  body: Record<string, unknown>,
  links: readonly OperationSeamKeys[],
  seams: readonly Pick<TechCardSeamWire, 'kind' | 'seamKey'>[],
): Record<string, unknown> {
  const ops = body.operations;
  if (!Array.isArray(ops)) return body;
  const byNo = linksByOperation(links, seams);
  return {
    ...body,
    operations: ops.map((op: unknown) => {
      if (!op || typeof op !== 'object') return op;
      const row = op as Record<string, unknown>;
      const keys = byNo.get(typeof row.operationNumber === 'number' ? row.operationNumber : 0);
      return keys ? { ...row, seamKeys: [...new Set([...keys.seamKeys, ...keys.poseKeys])] } : op;
    }),
  };
}

/** A step's pose rows (P8) in one change: `drop` goes, `put` is written and linked, `reflag` rewritten. */
export function poseChange(
  step: StepRef,
  put: readonly StoredPose[],
  drop: readonly StoredPose[],
  reflag: readonly StoredPose[],
): SeamChange {
  const written = new Set([...put, ...reflag].map((r) => r.seamKey));
  return {
    // A key replaced in place is written, never deleted in the same breath.
    delete: drop.map((r) => r.seamKey).filter((k) => !written.has(k)),
    upsert: [...reflag, ...put],
    link: put.map((r) => ({ step, seamKey: r.seamKey })),
  };
}

/**
 * MIRROR (C7, invariant 5) as one change: the mapped rows written and linked to the step, every key
 * the step links that the mirror does not keep detached — the server deletes the ones no other step
 * links.
 */
export function mirrorChange(
  step: StepRef,
  plan: { upsert: readonly StoredRow[]; linkKeys: readonly string[] },
  stepKeys: readonly string[],
): SeamChange {
  const keep = new Set(plan.linkKeys);
  return {
    upsert: [...plan.upsert],
    link: plan.linkKeys.map((seamKey) => ({ step, seamKey })),
    detach: [...new Set(stepKeys)]
      .filter((k) => !keep.has(k))
      .map((seamKey) => ({ step, seamKey })),
  };
}
