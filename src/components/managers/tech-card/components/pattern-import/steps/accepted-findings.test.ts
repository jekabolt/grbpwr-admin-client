import { describe, expect, it } from 'vitest';

import type { CardDraft, DraftShapeRef, GateCheckId, GateReport } from 'lib/pattern-import/types';
import { acceptCurrentFindings } from './accepted-findings';

const scopeKey = 'main';
const currentUrl = 'https://files.example/current.dxf';

function report(id: GateCheckId, blocks: string[]): GateReport {
  return {
    passed: false,
    durationMs: 1,
    checks: [
      {
        id,
        ok: false,
        severity: 'block',
        value: null,
        threshold: null,
        blocks,
        note: 'new check finding',
      },
    ],
  };
}

function draft(): CardDraft {
  return {
    techCardId: 1,
    scopes: [
      {
        target: {
          scopeKey,
          fabricPurpose: scopeKey,
          bomLineKey: '',
          label: 'main',
          isInterlining: false,
          sections: [],
        },
        filename: 'next.dxf',
        name: '',
        dxfText: '0\nEOF\n',
        manifest: {
          pieces: [{ identity: 'SL_LIN_L' }, { identity: 'SL_LIN_R' }],
          blocks: [
            {
              block: 'SL_LIN_L_UNI',
              identity: 'SL_LIN_L',
              sizeToken: 'UNI',
              bboxMm: [0, 0, 1, 1],
              areaMm2: 1,
            },
            {
              block: 'SL_LIN_R_UNI',
              identity: 'SL_LIN_R',
              sizeToken: 'UNI',
              bboxMm: [0, 0, 2, 2],
              areaMm2: 4,
            },
          ],
          gate: null,
        } as CardDraft['scopes'][number]['manifest'],
        identities: ['SL_LIN_L', 'SL_LIN_R'],
        replaces: {
          lineKey: 'row',
          url: currentUrl,
          filename: 'current.dxf',
          name: '',
          matchedBy: 'scope',
          convertedAt: '',
        },
      },
    ],
    pieces: [],
    aliases: [
      {
        scopeKey,
        fabricPurpose: scopeKey,
        bomLineKey: '',
        blockName: 'SL_LIN_L_UNI',
        pieceLineKey: 'piece-left',
      },
      {
        scopeKey,
        fabricPurpose: scopeKey,
        bomLineKey: '',
        blockName: 'SL_LIN_R_UNI',
        pieceLineKey: 'piece-right',
      },
    ],
    pieceUpdates: [],
    downloads: [],
  };
}

const shape = (pieceLineKey: string, acceptedGate: GateCheckId[]): DraftShapeRef => ({
  scopeKey,
  pieceLineKey,
  identity: pieceLineKey,
  url: currentUrl,
  sizes: { m: { areaMm2: 1, wMm: 1, hMm: 1 } },
  acceptedGate,
});

describe('accepted re-import findings', () => {
  it('downgrades renamed blocks bound to the same accepted pieces', () => {
    const gate = report('G12-pair', ['SL_LIN_L_UNI', 'SL_LIN_R_UNI']);
    const found = acceptCurrentFindings({ [scopeKey]: gate }, draft(), [
      shape('piece-left', ['G12-pair']),
      shape('piece-right', ['G12-pair']),
    ]);
    expect(found.gate[scopeKey].passed).toBe(true);
    expect(found.gate[scopeKey].checks[0].severity).toBe('warn');
  });

  it('keeps a new finding blocking when one bound piece did not have it', () => {
    const gate = report('G12-pair', ['SL_LIN_L_UNI', 'SL_LIN_R_UNI']);
    const found = acceptCurrentFindings({ [scopeKey]: gate }, draft(), [
      shape('piece-left', ['G12-pair']),
    ]);
    expect(found.gate[scopeKey].passed).toBe(false);
    expect(found.gate[scopeKey].checks[0].severity).toBe('block');
  });

  it('uses the current outline when the draft binding chose another piece', () => {
    const next = draft();
    next.aliases[0].pieceLineKey = 'different-piece';
    const gate = report('G5-features', ['SL_LIN_L_UNI']);
    const found = acceptCurrentFindings({ [scopeKey]: gate }, next, [
      shape('piece-left', ['G5-features']),
    ]);
    expect(found.gate[scopeKey].checks[0].severity).toBe('warn');
  });

  it('does not downgrade the same block name from another sheet', () => {
    const other = {
      ...shape('piece-left', ['G5-features']),
      url: 'https://files.example/other.dxf',
    };
    const gate = report('G5-features', ['SL_LIN_L_UNI']);
    const found = acceptCurrentFindings({ [scopeKey]: gate }, draft(), [other]);
    expect(found.gate[scopeKey].checks[0].severity).toBe('block');
  });
});
