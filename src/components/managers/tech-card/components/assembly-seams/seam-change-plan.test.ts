import { describe, expect, it } from 'vitest';

import type { common_TechCard, common_TechCardSeam } from 'api/proto-http/admin';
import { toWire, type StoredPose, type StoredSeam } from 'lib/seams';

import { CARD6_SEAMS } from '../step-seams/card6.fixture';
import {
  changeRequest,
  isLockMoved,
  keyMapOf,
  linksByOperation,
  mergeStepKeys,
  mirrorChange,
  patchCardLinks,
  patchSentBody,
  pendingOf,
  poseChange,
} from './seam-change-plan';

const [a, b, c] = [...CARD6_SEAMS.values()];
const pose = (seamKey: string): StoredPose =>
  ({ ...a, seamKey, kind: 'pose', status: 'confirmed' }) as unknown as StoredPose;
const POSE = 'TECH_CARD_SEAM_KIND_POSE' as const;
const SEAM = 'TECH_CARD_SEAM_KIND_EDGE' as const;
const stepA = { historyKey: 'hA' };
const stepB = { historyKey: 'hB' };
const numbers = new Map([
  ['hA', 10],
  ['hB', 20],
]);
const numberOf = (step: { historyKey: string }) => numbers.get(step.historyKey) ?? 0;

describe('changeRequest — one gesture, one request', () => {
  it('addresses steps by their stored number and claims the version', () => {
    const req = changeRequest(
      7,
      41,
      {
        upsert: [a],
        link: [{ step: stepA, seamKey: a.seamKey }],
        detach: [{ step: stepB, seamKey: 'x' }],
      },
      numberOf,
    );
    expect(req?.techCardId).toBe(7);
    expect(req?.expectedLockVersion).toBe(41);
    expect(req?.upsert?.map((r) => r.seamKey)).toEqual([a.seamKey]);
    expect(req?.link).toEqual([{ operationNumber: 10, seamKey: a.seamKey }]);
    expect(req?.detach).toEqual([{ operationNumber: 20, seamKey: 'x' }]);
    expect(req?.delete).toEqual([]);
  });

  it('a step never saved (no number) sends nothing', () => {
    const req = changeRequest(
      7,
      41,
      { link: [{ step: { historyKey: 'new' }, seamKey: a.seamKey }] },
      numberOf,
    );
    expect(req).toBeNull();
  });

  it('sends each key once: rows, deletes and links', () => {
    const req = changeRequest(
      7,
      1,
      {
        upsert: [a, { ...a, note: 'later' }],
        delete: ['d', 'd'],
        link: [
          { step: stepA, seamKey: 'k' },
          { step: stepA, seamKey: 'k' },
        ],
      },
      numberOf,
    );
    expect(req?.upsert).toHaveLength(1);
    expect(req?.upsert?.[0].note).toBe('later');
    expect(req?.delete).toEqual(['d']);
    expect(req?.link).toHaveLength(1);
  });

  it('leaves output-only fields empty', () => {
    const req = changeRequest(7, 1, { upsert: [{ ...a, stale: true } as StoredSeam] }, numberOf);
    expect(req?.upsert?.[0].stale).toBeUndefined();
    expect(req?.upsert?.[0].createdAt).toBeUndefined();
  });
});

describe('the answer read back', () => {
  it('keyMap: sent → stored', () => {
    const m = keyMapOf({
      keyMap: [
        { sent: 'n', stored: 'o' },
        { sent: 's', stored: 's' },
        { sent: undefined, stored: 'x' },
      ],
    });
    expect([...m]).toEqual([
      ['n', 'o'],
      ['s', 's'],
    ]);
  });

  it('lock_version_moved is told from its field violation, or its words', () => {
    const violation = Object.assign(new Error('failed precondition'), {
      details: [
        {
          '@type': 'type.googleapis.com/google.rpc.BadRequest',
          fieldViolations: [
            { field: 'expected_lock_version', description: 'lock_version_moved; the card moved' },
          ],
        },
      ],
    });
    expect(isLockMoved(violation)).toBe(true);
    expect(isLockMoved(new Error('rpc error: lock_version_moved'))).toBe(true);
    expect(isLockMoved(new Error('contradicts_link'))).toBe(false);
    expect(isLockMoved(undefined)).toBe(false);
  });

  it('links by step number, split into seams and poses in the server order', () => {
    const by = linksByOperation(
      [
        { operationNumber: 10, seamKeys: ['s1', 'p1', 's2'] },
        { operationNumber: 20, seamKeys: [] },
      ],
      [
        { kind: SEAM, seamKey: 's1' },
        { kind: POSE, seamKey: 'p1' },
        { kind: SEAM, seamKey: 's2' },
      ],
    );
    expect(by.get(10)).toEqual({ seamKeys: ['s1', 's2'], poseKeys: ['p1'] });
    expect(by.get(20)).toEqual({ seamKeys: [], poseKeys: [] });
  });

  it('a number two steps share tells no step: left out', () => {
    const by = linksByOperation(
      [
        { operationNumber: 10, seamKeys: ['s1'] },
        { operationNumber: 10, seamKeys: ['s2'] },
        { operationNumber: 0, seamKeys: ['s3'] },
      ],
      [],
    );
    expect(by.size).toBe(0);
  });
});

describe('mergeStepKeys — the server moved a step the form also moved', () => {
  it('an untouched step takes exactly the server keys', () => {
    expect(mergeStepKeys(['a'], ['a'], ['a', 'b'])).toEqual(['a', 'b']);
  });

  it('the form edit stays, the server change is laid over it', () => {
    // The operator removed x meanwhile; the server added b and took a away.
    expect(mergeStepKeys(['a', 'y'], ['a', 'x'], ['x', 'b'])).toEqual(['y', 'b']);
  });

  it('a key both added never doubles', () => {
    expect(mergeStepKeys(['a', 'b'], ['a'], ['a', 'b'])).toEqual(['a', 'b']);
  });
});

describe('the card the page stands on, moved by the change', () => {
  const card = {
    id: 7,
    lockVersion: 41,
    seams: [],
    techCard: {
      operations: [
        { operationNumber: 10, seamKeys: ['old'] },
        { operationNumber: 20, seamKeys: ['keep'] },
        { operationNumber: 30, seamKeys: ['z'] },
      ],
    },
  } as unknown as common_TechCard;
  const seams = [toWire(a), toWire(b)] as common_TechCardSeam[];

  it('patchCardLinks: version, rows and each named step as a read returns it', () => {
    const next = patchCardLinks(card, {
      lockVersion: 42,
      links: [
        { operationNumber: 10, seamKeys: [a.seamKey] },
        { operationNumber: 20, seamKeys: ['keep', b.seamKey] },
      ],
      seams,
    });
    expect(next.lockVersion).toBe(42);
    expect(next.seams).toEqual(seams);
    expect(next.techCard?.operations?.map((op) => op.seamKeys)).toEqual([
      [a.seamKey],
      ['keep', b.seamKey],
      ['z'],
    ]);
    // The card the page held is not touched.
    expect(card.techCard?.operations?.[0].seamKeys).toEqual(['old']);
  });

  it('patchSentBody: the body as the write puts it on the wire, seams then poses', () => {
    const body = {
      title: 't',
      operations: [
        { operationNumber: 10, seamKeys: ['old'] },
        { operationNumber: 20, seamKeys: ['keep'] },
      ],
    };
    const next = patchSentBody(
      body,
      [{ operationNumber: 10, seamKeys: ['p1', a.seamKey] }],
      [
        { kind: POSE, seamKey: 'p1' },
        { kind: SEAM, seamKey: a.seamKey },
      ],
    );
    expect(next.title).toBe('t');
    expect(next.operations).toEqual([
      { operationNumber: 10, seamKeys: [a.seamKey, 'p1'] },
      { operationNumber: 20, seamKeys: ['keep'] },
    ]);
  });
});

describe('composite gestures', () => {
  it('optimistic rows: upserts laid over, deletes and expected deletions hidden', () => {
    const p = pose('P');
    const { pending, posePending } = pendingOf(
      { upsert: [c], delete: [a.seamKey, 'P'] },
      { rows: [a, b], poses: [p] },
      [b.seamKey],
    );
    expect(pending[c.seamKey]).toEqual({ kind: 'upsert', row: c });
    expect(pending[a.seamKey]).toEqual({ kind: 'delete', row: a });
    expect(pending[b.seamKey]).toEqual({ kind: 'delete', row: b });
    expect(posePending.P).toEqual({ kind: 'delete', row: p });
  });

  it('a pose replaced in place is written, never deleted in the same breath', () => {
    const keep = pose('K');
    const gone = pose('G');
    const fresh = pose('N');
    const change = poseChange(stepA, [fresh], [keep, gone], [keep]);
    expect(change.delete).toEqual(['G']);
    expect(change.upsert?.map((r) => r.seamKey)).toEqual(['K', 'N']);
    expect(change.link).toEqual([{ step: stepA, seamKey: 'N' }]);
  });

  it('MIRROR: rows written and linked, the other keys of the step detached', () => {
    const change = mirrorChange(stepA, { upsert: [a], linkKeys: [a.seamKey] }, [
      a.seamKey,
      'x',
      'x',
    ]);
    expect(change.upsert).toEqual([a]);
    expect(change.link).toEqual([{ step: stepA, seamKey: a.seamKey }]);
    expect(change.detach).toEqual([{ step: stepA, seamKey: 'x' }]);
  });
});
