import { describe, expect, it } from 'vitest';

import {
  CAD_MANNEQUIN_ARRANGEMENT_CLAIMS_V1,
  CAD_MANNEQUIN_ARRANGEMENT_DOCUMENT_V1,
  CAD_MANNEQUIN_ARRANGEMENT_LIMITS_V1,
  CAD_MANNEQUIN_ARRANGEMENT_MEDIA_TYPE_V1,
  createCadMannequinArrangementDocumentV1,
  decodeCadMannequinArrangementDocumentV1,
  encodeCadMannequinArrangementDocumentV1,
  fingerprintCadMannequinArrangementDocumentV1,
  parseCadMannequinArrangementDocumentV1,
  type CadMannequinArrangementBindingsV1,
  type CadMannequinArrangementPieceV1,
} from './cad-mannequin-arrangement-document-v1';

const hash = (character: string) => character.repeat(64);

const BINDINGS: CadMannequinArrangementBindingsV1 = Object.freeze({
  card: Object.freeze({ techCardId: 11, cardLockVersion: 7 }),
  scope: Object.freeze({
    scopeKey: 'material:main',
    patternLineKey: 'pattern:main',
    sizeToken: 'M',
  }),
  savedRow: Object.freeze({ revision: 3, dxfSha256: hash('a') }),
  source: Object.freeze({
    catalogCanonicalSha256: hash('b'),
    sizeSelectionCanonicalSha256: hash('c'),
  }),
  mannequin: Object.freeze({
    baseModelId: 42,
    modelFormRevisionKeyV1: '["model-form:edit",42,"Vera"]',
    poseBinding: Object.freeze({ canonicalKey: '{"schema":"pose-v2","arms":"rest"}' }),
  }),
});

const FRONT: CadMannequinArrangementPieceV1 = Object.freeze({
  pieceKey: 'material:main::front',
  scopeKey: 'material:main',
  pieceId: 'front',
  pieceLineKey: 'piece:front',
  transform: Object.freeze({
    offsetM: Object.freeze([0.12, 0.03, -0.04] as const),
    rotationRad: 0.4,
  }),
});

const BACK: CadMannequinArrangementPieceV1 = Object.freeze({
  pieceKey: 'material:main::back',
  scopeKey: 'material:main',
  pieceId: 'back',
  pieceLineKey: 'piece:back',
  transform: Object.freeze({
    offsetM: Object.freeze([-0, -0.08, 0.02] as const),
    rotationRad: -0,
  }),
});

function create(
  pieces: readonly CadMannequinArrangementPieceV1[] = [FRONT, BACK],
  bindings: CadMannequinArrangementBindingsV1 = BINDINGS,
) {
  return createCadMannequinArrangementDocumentV1({ bindings, pieces });
}

describe('CAD mannequin arrangement document V1', () => {
  it('round-trips canonical presentation-only data sorted by exact piece source identity', () => {
    const document = create();
    const payload = encodeCadMannequinArrangementDocumentV1(document);

    expect(parseCadMannequinArrangementDocumentV1(payload)).toEqual(document);
    expect(document.schemaVersion).toBe(CAD_MANNEQUIN_ARRANGEMENT_DOCUMENT_V1);
    expect(document.mediaType).toBe(CAD_MANNEQUIN_ARRANGEMENT_MEDIA_TYPE_V1);
    expect(document.claims).toBe(CAD_MANNEQUIN_ARRANGEMENT_CLAIMS_V1);
    expect(document.claims).toEqual({
      presentationOnly: true,
      dxfAuthority: false,
      assemblyOrderAuthority: false,
      clothAuthority: false,
      scalePersisted: false,
    });
    expect(document.pieces.map(({ pieceId }) => pieceId)).toEqual(['back', 'front']);
    expect(document.pieces[0]?.transform).toEqual({ offsetM: [0, -0.08, 0.02], rotationRad: 0 });
    expect(Object.isFrozen(document)).toBe(true);
    expect(Object.isFrozen(document.bindings.mannequin.poseBinding)).toBe(true);
    expect(Object.isFrozen(document.pieces[0]?.transform.offsetM)).toBe(true);
  });

  it('produces identical canonical bytes and digest regardless of request row order', async () => {
    const first = create([FRONT, BACK]);
    const second = create([BACK, FRONT]);

    expect(encodeCadMannequinArrangementDocumentV1(first)).toBe(
      encodeCadMannequinArrangementDocumentV1(second),
    );
    expect(await fingerprintCadMannequinArrangementDocumentV1(first)).toBe(
      await fingerprintCadMannequinArrangementDocumentV1(second),
    );
    expect(await fingerprintCadMannequinArrangementDocumentV1(first)).toMatch(
      /^sha256:[0-9a-f]{64}$/,
    );
  });

  it('binds the exact saved row, Phase-D selection, model revision and pose canonical key', async () => {
    const original = create();
    const variants: CadMannequinArrangementBindingsV1[] = [
      { ...BINDINGS, card: { ...BINDINGS.card, cardLockVersion: 8 } },
      { ...BINDINGS, savedRow: { ...BINDINGS.savedRow, dxfSha256: hash('d') } },
      {
        ...BINDINGS,
        source: { ...BINDINGS.source, catalogCanonicalSha256: hash('d') },
      },
      {
        ...BINDINGS,
        source: { ...BINDINGS.source, sizeSelectionCanonicalSha256: hash('d') },
      },
      { ...BINDINGS, scope: { ...BINDINGS.scope, sizeToken: 'L' } },
      { ...BINDINGS, mannequin: { ...BINDINGS.mannequin, baseModelId: 43 } },
      {
        ...BINDINGS,
        mannequin: { ...BINDINGS.mannequin, modelFormRevisionKeyV1: 'changed-model-revision' },
      },
      {
        ...BINDINGS,
        mannequin: {
          ...BINDINGS.mannequin,
          poseBinding: { canonicalKey: 'changed-pose-document' },
        },
      },
    ];
    const originalFingerprint = await fingerprintCadMannequinArrangementDocumentV1(original);

    for (const variant of variants) {
      expect(
        await fingerprintCadMannequinArrangementDocumentV1(create(undefined, variant)),
      ).not.toBe(originalFingerprint);
    }
  });

  it('rejects getters, symbols, hidden fields and non-plain records without invoking accessors', () => {
    let getterCalls = 0;
    const accessor = Object.defineProperty({ bindings: BINDINGS }, 'pieces', {
      enumerable: true,
      get() {
        getterCalls += 1;
        return [FRONT];
      },
    });
    expect(() => createCadMannequinArrangementDocumentV1(accessor as never)).toThrow(
      /enumerable data property/,
    );
    expect(getterCalls).toBe(0);

    const symbol = Symbol('hidden-authority');
    expect(() =>
      createCadMannequinArrangementDocumentV1({
        bindings: { ...BINDINGS, [symbol]: true } as never,
        pieces: [FRONT],
      }),
    ).toThrow(/symbol/);
    expect(() =>
      createCadMannequinArrangementDocumentV1({
        bindings: Object.create(BINDINGS) as never,
        pieces: [FRONT],
      }),
    ).toThrow(/plain record/);
    const hidden = Object.defineProperty({ ...FRONT }, 'unexpected', {
      value: true,
      enumerable: false,
    });
    expect(() => create([hidden as never])).toThrow(/hidden/);
  });

  it('rejects sparse/accessor arrays, duplicate piece keys and duplicate source identities', () => {
    const sparse = new Array(2) as CadMannequinArrangementPieceV1[];
    sparse[0] = FRONT;
    expect(() => create(sparse)).toThrow(/sparse/);

    let getterCalls = 0;
    const accessor = [FRONT] as CadMannequinArrangementPieceV1[];
    Object.defineProperty(accessor, '0', {
      enumerable: true,
      configurable: true,
      get() {
        getterCalls += 1;
        return FRONT;
      },
    });
    expect(() => create(accessor)).toThrow(/enumerable data property/);
    expect(getterCalls).toBe(0);

    expect(() => create([FRONT, { ...BACK, pieceKey: FRONT.pieceKey }])).toThrow(
      /Duplicate pieceKey/,
    );
    expect(() =>
      create([FRONT, { ...BACK, pieceLineKey: FRONT.pieceLineKey, pieceId: FRONT.pieceId }]),
    ).toThrow(/Duplicate piece source identity/);
  });

  it('rejects non-finite, out-of-envelope, cross-scope and oversized values', () => {
    expect(() =>
      create([{ ...FRONT, transform: { ...FRONT.transform, rotationRad: Number.NaN } }]),
    ).toThrow(/must be finite/);
    expect(() =>
      create([
        {
          ...FRONT,
          transform: {
            ...FRONT.transform,
            offsetM: [CAD_MANNEQUIN_ARRANGEMENT_LIMITS_V1.maxOffsetMetres + 1, 0, 0],
          },
        },
      ]),
    ).toThrow(/bounded presentation envelope/);
    expect(() =>
      create([
        {
          ...FRONT,
          transform: {
            ...FRONT.transform,
            rotationRad: CAD_MANNEQUIN_ARRANGEMENT_LIMITS_V1.maxRotationRadians + 0.01,
          },
        },
      ]),
    ).toThrow(/bounded presentation envelope/);
    expect(() => create([{ ...FRONT, scopeKey: 'material:lining' }])).toThrow(
      /differs from the saved-row scope binding/,
    );
    expect(() =>
      create(undefined, {
        ...BINDINGS,
        mannequin: {
          ...BINDINGS.mannequin,
          modelFormRevisionKeyV1: 'x'.repeat(
            CAD_MANNEQUIN_ARRANGEMENT_LIMITS_V1.maxModelRevisionLength + 1,
          ),
        },
      }),
    ).toThrow(/bounded/);
  });

  it('rejects unpaired UTF-16 surrogates while preserving valid astral pairs', () => {
    const loneHigh = String.fromCharCode(0xd83d);
    const loneLow = String.fromCharCode(0xdc00);
    const astral = String.fromCodePoint(0x1f680);
    expect(() =>
      create(undefined, {
        ...BINDINGS,
        mannequin: {
          ...BINDINGS.mannequin,
          modelFormRevisionKeyV1: `model-revision:${loneHigh}`,
        },
      }),
    ).toThrow(/unpaired UTF-16 surrogate/);
    expect(() =>
      create(undefined, {
        ...BINDINGS,
        mannequin: {
          ...BINDINGS.mannequin,
          poseBinding: { canonicalKey: `pose:${loneLow}` },
        },
      }),
    ).toThrow(/unpaired UTF-16 surrogate/);
    expect(() => create([{ ...FRONT, pieceId: `front:${loneHigh}x${loneLow}` }])).toThrow(
      /unpaired UTF-16 surrogate/,
    );

    const astralPiece = { ...FRONT, pieceId: `front:${astral}` };
    const document = create([astralPiece]);
    expect(document.pieces[0]?.pieceId).toBe(`front:${astral}`);
    expect(parseCadMannequinArrangementDocumentV1(JSON.stringify(document))).toEqual(document);
  });

  it('rejects unknown schemas, altered authority claims, malformed digests and malformed JSON', () => {
    const document = create();
    expect(() =>
      decodeCadMannequinArrangementDocumentV1({ ...document, schemaVersion: 'future-v2' }),
    ).toThrow(/Unsupported arrangement schema/);
    expect(() =>
      decodeCadMannequinArrangementDocumentV1({
        ...document,
        claims: { ...document.claims, assemblyOrderAuthority: true },
      }),
    ).toThrow(/presentation-only/);
    expect(() =>
      create(undefined, {
        ...BINDINGS,
        savedRow: { ...BINDINGS.savedRow, dxfSha256: 'ABC' },
      }),
    ).toThrow(/lowercase SHA-256/);
    expect(() => parseCadMannequinArrangementDocumentV1('{')).toThrow(/valid JSON/);
  });
});
