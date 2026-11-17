import type { StoredSeam } from 'lib/seams';
import { describe, expect, it } from 'vitest';

import type { PatternImportDxfPhaseEZeroConnectPendingHandoffV1 } from './cad-table-zero-connect-post-save-owner-v1';
import {
  activatePatternImportDxfPhaseEZeroConnectSecondSaveCompletionV1,
  blocksPatternImportDxfPhaseEZeroConnectNextConnectionV1,
  createPatternImportDxfPhaseEZeroConnectSecondSaveCompletionOwnerV1,
  deactivatePatternImportDxfPhaseEZeroConnectSecondSaveCompletionV1,
  resolvePatternImportDxfPhaseEZeroConnectSecondSaveCompletionV1,
  type PatternImportDxfPhaseEZeroConnectSecondSaveCompletionSlotV1,
} from './zero-connect-second-save-completion-v1';

const HISTORY = 'cad-connect-1';
const SEAM = '01JSEAM0000000000000000000';
const CARD = 11;
const SCOPE = 'TECH_CARD_BOM_PURPOSE_MAIN';
const BOM_LINE = 'bom-main';
const PATTERN_LINE = 'pattern-main';
const PATTERN_URL = 'https://cdn.test/card-11-main.dxf';
const PATTERN_SHA = 'c'.repeat(64);
const PATTERN_BYTES = 4_096;
const PATTERN_REVISION = 7;
const ATTACH_LOCK = 42;
const SAVED_AT = 100;

function storedSeam(overrides: Partial<StoredSeam> = {}): StoredSeam {
  const anchor = (piece: string, edgeHint: string) => ({
    piece,
    samples: [
      [0, 0],
      [0.25, 0],
      [0.5, 0],
      [0.75, 0],
      [1, 0],
    ] as [number, number][],
    perimShare: 0.25,
    lenMm: 100,
    notches: 0,
    turnDeg: 0,
    range: [0, 1] as [number, number],
    edgeHint,
    contourSig: '0123456789abcdef',
  });
  return {
    seamKey: SEAM,
    status: 'confirmed',
    kind: 'edge',
    direction: 'same',
    source: 'manual',
    sideA: [anchor('piece-front', 'front#1')],
    sideB: [anchor('piece-back', 'back#2')],
    anchoredSize: 'M',
    note: '',
    stale: false,
    ...overrides,
  };
}

function attachedPending(
  overrides: Record<string, unknown> = {},
): PatternImportDxfPhaseEZeroConnectPendingHandoffV1 {
  return {
    status: 'in-memory-final-seam-attached-awaiting-second-save',
    historyKey: HISTORY,
    savedOperationNumber: 10,
    finalSeamKey: SEAM,
    echoedStoredSeam: storedSeam(),
    afterSeamAttachCardLockVersion: ATTACH_LOCK,
    catalog: {
      techCardId: CARD,
      scopeKey: SCOPE,
      sourceFileId: 'saved-dxf:11:main:7',
      canonicalSha256: 'a'.repeat(64),
      sizeSelectionCanonicalSha256: 'b'.repeat(64),
    },
    refreshedAuthoringAuthority: {
      row: {
        techCardId: CARD,
        scopeKey: SCOPE,
        patternLineKey: PATTERN_LINE,
        revision: PATTERN_REVISION,
        cardLockVersion: ATTACH_LOCK - 1,
        url: PATTERN_URL,
        sizeBytes: PATTERN_BYTES,
        sha256: PATTERN_SHA,
      },
      sourceFileId: 'saved-dxf:11:main:7',
      catalogCanonicalSha256: 'a'.repeat(64),
      sizeSelectionCanonicalSha256: 'b'.repeat(64),
    },
    candidate: {
      connection: {
        sides: [{ pieceLineKey: 'piece-front' }, { pieceLineKey: 'piece-back' }],
      },
    },
    ...overrides,
  } as unknown as PatternImportDxfPhaseEZeroConnectPendingHandoffV1;
}

function observations(pending = attachedPending()) {
  const operation = {
    operationNumber: 10,
    inputKeys: ['piece-front', 'piece-back'],
    seamKeys: [SEAM],
  };
  const pattern = {
    lineKey: PATTERN_LINE,
    fabricPurpose: SCOPE,
    bomLineKey: BOM_LINE,
    url: PATTERN_URL,
    sizeBytes: PATTERN_BYTES,
    sha256: PATTERN_SHA,
    savedRowRevision: PATTERN_REVISION,
  };
  return {
    pending,
    baselineSavedAt: SAVED_AT,
    completedSavedAt: SAVED_AT + 1,
    autosaveStatus: 'saved',
    currentTechCardId: CARD,
    savedCard: {
      id: CARD,
      lockVersion: ATTACH_LOCK + 1,
      operations: [operation],
      patterns: [pattern],
      bomItems: [
        {
          lineKey: BOM_LINE,
          section: 'TECH_CARD_BOM_SECTION_FABRIC',
          purpose: SCOPE,
          name: 'Main fabric',
        },
      ],
    },
    liveOperations: [{ ...operation, historyKey: HISTORY }],
    storedSeamCardId: CARD,
    storedSeamLockVersion: ATTACH_LOCK + 1,
    storedSeams: [storedSeam()],
  };
}

describe('zero-connect second-save completion', () => {
  it('clears only after the exact second save and admits connection #2 without a remount', () => {
    const pending = attachedPending();
    expect(
      blocksPatternImportDxfPhaseEZeroConnectNextConnectionV1(
        pending,
        observations(pending).liveOperations,
      ),
    ).toBe(true);

    const completed = resolvePatternImportDxfPhaseEZeroConnectSecondSaveCompletionV1(
      observations(pending),
    );
    expect(completed).toMatchObject({ ok: true, completedPending: pending, nextPending: null });
    expect(
      blocksPatternImportDxfPhaseEZeroConnectNextConnectionV1(
        completed.nextPending,
        observations(pending).liveOperations,
      ),
    ).toBe(false);
  });

  it('does not clear on local seam attachment, the first save signal, or a failed save', () => {
    expect(
      resolvePatternImportDxfPhaseEZeroConnectSecondSaveCompletionV1({
        ...observations(),
        completedSavedAt: SAVED_AT,
      }),
    ).toMatchObject({ ok: false, blocker: { code: 'second-save-completion-save-unconfirmed' } });
    expect(
      resolvePatternImportDxfPhaseEZeroConnectSecondSaveCompletionV1({
        ...observations(),
        autosaveStatus: 'error',
      }),
    ).toMatchObject({ ok: false, blocker: { code: 'second-save-completion-save-unconfirmed' } });
    expect(
      resolvePatternImportDxfPhaseEZeroConnectSecondSaveCompletionV1({
        ...observations(),
        pending: {
          ...attachedPending(),
          status: 'in-memory-awaiting-save-direction-and-seam-link',
        } as PatternImportDxfPhaseEZeroConnectPendingHandoffV1,
      }),
    ).toMatchObject({ ok: false, blocker: { code: 'second-save-completion-pending-invalid' } });
  });

  it.each([
    ['wrong route card', { currentTechCardId: 6 }, 'second-save-completion-card-mismatch'],
    [
      'wrong saved card',
      { savedCard: { ...observations().savedCard, id: 6 } },
      'second-save-completion-card-mismatch',
    ],
    [
      'concurrent lock',
      { savedCard: { ...observations().savedCard, lockVersion: ATTACH_LOCK + 2 } },
      'second-save-completion-lock-mismatch',
    ],
    [
      'stale lock',
      { savedCard: { ...observations().savedCard, lockVersion: ATTACH_LOCK } },
      'second-save-completion-lock-mismatch',
    ],
    [
      'wrong history',
      { liveOperations: [{ ...observations().liveOperations[0], historyKey: 'other' }] },
      'second-save-completion-live-operation-mismatch',
    ],
    [
      'wrong operation number',
      { liveOperations: [{ ...observations().liveOperations[0], operationNumber: 20 }] },
      'second-save-completion-live-operation-mismatch',
    ],
    [
      'reordered live inputs',
      {
        liveOperations: [
          { ...observations().liveOperations[0], inputKeys: ['piece-back', 'piece-front'] },
        ],
      },
      'second-save-completion-live-operation-mismatch',
    ],
    [
      'additional live seam',
      { liveOperations: [{ ...observations().liveOperations[0], seamKeys: [SEAM, 'other'] }] },
      'second-save-completion-live-operation-mismatch',
    ],
    [
      'non-exact live seam key',
      { liveOperations: [{ ...observations().liveOperations[0], seamKeys: [` ${SEAM}`] }] },
      'second-save-completion-live-operation-mismatch',
    ],
    [
      'saved operation missing seam',
      {
        savedCard: {
          ...observations().savedCard,
          operations: [{ ...observations().savedCard.operations[0], seamKeys: [] }],
        },
      },
      'second-save-completion-saved-operation-mismatch',
    ],
  ])('fails closed for %s', (_label, patch, code) => {
    expect(
      resolvePatternImportDxfPhaseEZeroConnectSecondSaveCompletionV1({
        ...observations(),
        ...patch,
      }),
    ).toMatchObject({ ok: false, blocker: { code } });
  });

  it('requires the same saved-DXF source and a confirmed non-stale exact StoredSeam', () => {
    const wrongSource = attachedPending({
      refreshedAuthoringAuthority: {
        ...(
          attachedPending() as Extract<
            PatternImportDxfPhaseEZeroConnectPendingHandoffV1,
            { status: 'in-memory-final-seam-attached-awaiting-second-save' }
          >
        ).refreshedAuthoringAuthority,
        sourceFileId: 'saved-dxf:11:other',
      },
    });
    expect(
      resolvePatternImportDxfPhaseEZeroConnectSecondSaveCompletionV1(observations(wrongSource)),
    ).toMatchObject({ ok: false, blocker: { code: 'second-save-completion-source-mismatch' } });

    const baseline = observations().savedCard;
    for (const savedCard of [
      { ...baseline, patterns: [] },
      {
        ...baseline,
        patterns: [{ ...baseline.patterns[0], sha256: 'd'.repeat(64) }],
      },
      {
        ...baseline,
        patterns: [{ ...baseline.patterns[0], lineKey: 'replacement-pattern' }],
      },
      {
        ...baseline,
        patterns: [baseline.patterns[0], { ...baseline.patterns[0], lineKey: 'ambiguous-pattern' }],
      },
      { ...baseline, bomItems: [] },
      {
        ...baseline,
        bomItems: [
          {
            ...baseline.bomItems[0],
            purpose: 'TECH_CARD_BOM_PURPOSE_LINING',
          },
        ],
      },
    ])
      expect(
        resolvePatternImportDxfPhaseEZeroConnectSecondSaveCompletionV1({
          ...observations(),
          savedCard,
        }),
      ).toMatchObject({
        ok: false,
        blocker: { code: 'second-save-completion-source-mismatch' },
      });

    for (const row of [
      storedSeam({ status: 'rejected' }),
      storedSeam({ stale: true }),
      storedSeam({ source: 'graph' }),
      storedSeam({
        sideA: [{ ...storedSeam().sideA[0]!, edgeHint: 'front#changed' }],
      }),
    ])
      expect(
        resolvePatternImportDxfPhaseEZeroConnectSecondSaveCompletionV1({
          ...observations(),
          storedSeams: [row],
        }),
      ).toMatchObject({
        ok: false,
        blocker: { code: 'second-save-completion-stored-seam-mismatch' },
      });
  });

  it('fails closed when a newer pending supersedes the owner', () => {
    const first = attachedPending();
    const second = attachedPending({ historyKey: 'cad-connect-2' });
    const owner = createPatternImportDxfPhaseEZeroConnectSecondSaveCompletionOwnerV1();
    owner.bindCurrent(first, SAVED_AT);
    owner.bindCurrent(second, SAVED_AT);
    expect(
      owner.complete({
        ...observations(first),
        pending: first,
        currentPending: first,
      }),
    ).toMatchObject({
      ok: false,
      blocker: { code: 'second-save-completion-owner-superseded' },
    });
  });

  it('keeps the replayed StrictMode owner current and disposes the obsolete setup', () => {
    const pending = attachedPending();
    const slot: PatternImportDxfPhaseEZeroConnectSecondSaveCompletionSlotV1 = { current: null };
    const first = activatePatternImportDxfPhaseEZeroConnectSecondSaveCompletionV1(
      slot,
      pending,
      SAVED_AT,
    );
    deactivatePatternImportDxfPhaseEZeroConnectSecondSaveCompletionV1(slot, first);
    const replay = activatePatternImportDxfPhaseEZeroConnectSecondSaveCompletionV1(
      slot,
      pending,
      SAVED_AT,
    );
    expect(first.complete({ ...observations(pending), currentPending: pending })).toMatchObject({
      ok: false,
      blocker: { code: 'second-save-completion-owner-superseded' },
    });
    expect(replay.complete({ ...observations(pending), currentPending: pending })).toMatchObject({
      ok: true,
      nextPending: null,
    });
  });
});
