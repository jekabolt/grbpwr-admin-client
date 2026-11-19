import type { ChangeTechCardSeamsRequest, common_TechCard } from 'api/proto-http/admin';
import { toWire, type StoredSeam } from 'lib/seams';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';
import { runSeamChange } from '../assembly-seams/seam-change';
import type { SeamFormBridge } from '../assembly-seams/seam-form-bridge';
import { hydrateSeams, resetSeams } from '../assembly-seams/seams-store';
import type { SeamWrites } from '../assembly-seams/use-seam-decisions';
import {
  captureSavedSurfaceDirection,
  isPlacedSurfaceDirectionSeam,
  SavedSurfaceDirection,
  writeSavedSurfaceDirection,
} from './saved-surface-direction';

const io = vi.hoisted(() => ({ snapshot: vi.fn() }));
vi.mock('api/api', () => ({
  adminService: {},
  abortableAdminService: () => ({ GetTechCardSavedAssemblySnapshot: io.snapshot }),
}));

const KEYS = {
  seam: '01M670HJDTKYTHVGYK5G019YD3',
  a: '01M5J6YX6FB4KP34F86QF2RW0H',
  b: '01M5J6VRN9EFQ9ZQ4YHW8YVPG8',
};
const clock = `asm:v1:${'a'.repeat(32)}:19`;
const placement = { xMm: 0.6, yMm: -1.2, rotDeg: 0, flip: false };
const part: StoredSeam['sideA'][number] = {
  piece: KEYS.a,
  samples: [
    [0.842, 0.435],
    [0.631, 0.435],
    [0.421, 0.435],
    [0.21, 0.435],
    [0, 0.435],
  ],
  perimShare: 0.1809,
  lenMm: 194.4,
  notches: 0,
  turnDeg: 0,
  range: [0, 1],
  edgeHint: 'i0',
  contourSig: '243d925601994c00',
  placement,
};
const seam: StoredSeam = {
  seamKey: KEYS.seam,
  status: 'confirmed',
  stale: false,
  kind: 'surface',
  direction: 'unknown',
  source: 'manual',
  sideA: [part],
  sideB: [
    {
      ...part,
      piece: KEYS.b,
      edgeHint: `${KEYS.b}#3`,
      contourSig: 'f3e35614d51a864e',
      samples: [
        [0, 0],
        [0.21, 0],
        [0.421, 0],
        [0.631, 0],
        [0.842, 0],
      ],
      perimShare: 0.2612,
      notches: 2,
      range: [0.125, 0.875],
      layer: 'over',
    },
  ],
  anchoredSize: 'M',
  note: 'Hand placed',
};
const operations = [
  { operationNumber: 540, seamKeys: ['unrelated'] },
  { operationNumber: 570, seamKeys: [seam.seamKey] },
];
const sheets = [
  {
    scopeKey: 'main',
    fabricPurpose: 'TECH_CARD_BOM_PURPOSE_MAIN',
    lineKey: '01M5J6V2NVSKGQ64767RT9SFTK',
    bomLineKey: '01M5MHWYK52DB21THZJQ3B9A05',
    pieceLineKey: KEYS.b,
    blockName: 'P_L_U',
  },
  {
    scopeKey: 'pocketing',
    fabricPurpose: 'TECH_CARD_BOM_PURPOSE_POCKETING',
    lineKey: '01M5J6Y8NBKTEC6X9YH3PX2PQ5',
    bomLineKey: '01M5MHWYK52DB21THZJQ3B9A06',
    pieceLineKey: KEYS.a,
    blockName: 'PCK_L_MAIN',
  },
];
const card = {
  id: 6,
  lockVersion: 334,
  techCard: {
    operations,
    bomItems: sheets.map(({ bomLineKey, fabricPurpose }) => ({
      lineKey: bomLineKey,
      section: 'TECH_CARD_BOM_SECTION_FABRIC',
      purpose: fabricPurpose,
    })),
    patterns: sheets.map(({ lineKey, scopeKey, fabricPurpose, bomLineKey }, index) => ({
      lineKey,
      fabricPurpose,
      bomLineKey,
      url: `https://objects.invalid/${scopeKey}.dxf`,
      downloadUrl: `https://objects.invalid/signed/${scopeKey}`,
      savedRowRevision: 7,
      version: 9,
      sizeBytes: 2083,
      sha256: (index === 0 ? 'a' : 'b').repeat(64),
    })),
    pieceDxfAliases: {
      items: sheets.map(({ pieceLineKey, blockName, fabricPurpose, bomLineKey }) => ({
        pieceLineKey,
        blockName,
        fabricPurpose,
        bomLineKey,
      })),
    },
  },
} as unknown as common_TechCard;

function fixture() {
  const capture = captureSavedSurfaceDirection(card, 570, seam);
  const snapshot = {
    serverAssemblyRevision: clock,
    rows: capture.rows.toReversed().map(({ revision: savedRowRevision, ...row }) => ({
      ...row,
      patternVersion: 9,
      savedRowRevision,
    })),
    operations: structuredClone(operations),
    ownedSeams: [{ ...toWire(seam), stale: false }],
    aliases: capture.aliases.map((alias) => ({ ...alias })),
    garmentLabels: [],
  };
  const beforePartA = snapshot.ownedSeams[0]!.sideA!.parts![0]!;
  beforePartA.layer = 'TECH_CARD_SEAM_LAYER_UNKNOWN';

  function serve() {
    const json = JSON.stringify(snapshot, (_key, item) =>
      item !== null && typeof item === 'object' && !Array.isArray(item)
        ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
        : item,
    );
    const rows = snapshot.rows.map((row) => ({
      ...row,
      downloadUrl: `/api/${row.patternLineKey}/download`,
    }));
    io.snapshot.mockResolvedValue({
      row: rows.find((row) => row.patternLineKey === capture.rows[0].patternLineKey),
      serverAssemblyRevision: clock,
      operations: snapshot.operations,
      completeSourceV1: {
        rows,
        ownedSeams: snapshot.ownedSeams,
        aliases: snapshot.aliases,
        garmentLabels: [],
        sourceSha256: createHash('sha256')
          .update('tech-card-saved-assembly-complete-source/1\0')
          .update(json)
          .digest('hex'),
        canonicalJson: Buffer.from(json).toString('base64'),
      },
    });
  }

  const call = vi.fn(async (req: ChangeTechCardSeamsRequest) => ({
    seams: req.upsert!,
    links: [],
    deletedKeys: [],
    keyMap: [],
    lockVersion: 335,
  }));
  const bridge: SeamFormBridge = {
    flush: async () => ({ ok: true }),
    hold: async () => ({ release() {} }),
    version: () => 334,
    operationNumber: () => 0,
    adopt() {},
    reread: vi.fn(async () => ({ ok: false as const, why: 'unexpected retry' })),
  };
  const change: SeamWrites['change'] = (change, opts) =>
    runSeamChange(6, change, opts, { bridge: () => bridge, call });
  const controller = new AbortController();
  return { capture, snapshot, serve, call, bridge, change, controller };
}

beforeEach(() => {
  resetSeams();
  hydrateSeams(6, [toWire(seam)], 334);
  io.snapshot.mockReset();
});

it('shows the persisted unknown direction and requires an explicit choice before Save', () => {
  const html = renderToStaticMarkup(
    <SavedSurfaceDirection
      capture={captureSavedSurfaceDirection(card, 570, seam)}
      disabled={false}
      change={vi.fn()}
      canWrite={() => true}
    />,
  );
  expect(html).toContain('Saved surface seam direction');
  expect(html).toContain('Unspecified');
  expect(html.match(/aria-pressed="false"/g)).toHaveLength(2);
  expect(html).toMatch(/<button[^>]+disabled=""[^>]*>Save direction/);
  expect(io.snapshot).not.toHaveBeenCalled();
});

it('writes exactly one original keyed row through the existing request with card lock and source clock', async () => {
  const f = fixture();
  f.serve();
  await writeSavedSurfaceDirection(
    f.capture,
    'reversed',
    f.change,
    () => true,
    f.controller.signal,
  );
  expect(io.snapshot).toHaveBeenCalledWith(
    expect.objectContaining({
      techCardId: 6,
      expectedCardLockVersion: 334,
      expectedSavedRowRevision: 7,
      expectedScopeKey: 'pocketing',
      patternLineKey: sheets[1]!.lineKey,
      sourceOnly: true,
    }),
  );
  expect(f.call).toHaveBeenCalledTimes(1);
  expect(f.call).toHaveBeenCalledWith({
    techCardId: 6,
    expectedLockVersion: 334,
    expectedServerAssemblyRevision: clock,
    delete: [],
    link: [],
    detach: [],
    upsert: [expect.objectContaining(toWire({ ...seam, direction: 'reversed' }))],
  });
  expect(f.bridge.reread).not.toHaveBeenCalled();
});

it.each(['row', 'owner', 'range', 'alias', 'stale'] as const)(
  'refuses a fresh signed source when its %s differs from the captured operation',
  async (moved) => {
    const f = fixture();
    if (moved === 'row') f.snapshot.rows[0]!.savedRowRevision++;
    if (moved === 'owner') f.snapshot.operations[0]!.seamKeys.push(seam.seamKey);
    if (moved === 'range') f.snapshot.ownedSeams[0]!.sideA!.parts![0]!.rangeTo = 1;
    if (moved === 'alias') f.snapshot.aliases[0]!.blockName = 'another occurrence';
    if (moved === 'stale') f.snapshot.ownedSeams[0]!.stale = true;
    f.serve();
    await expect(
      writeSavedSurfaceDirection(f.capture, 'same', f.change, () => true, f.controller.signal),
    ).rejects.toThrow(/The saved surface seam changed/);
    expect(f.call).not.toHaveBeenCalled();
  },
);

it.each(['lock', 'selection', 'cancel', 'server-clock'] as const)(
  'refuses a moved %s and does not retry the mutation',
  async (moved) => {
    const f = fixture();
    f.serve();
    let current = true;
    if (moved === 'lock') f.bridge.version = () => 335;
    if (moved === 'selection')
      f.bridge.hold = async () => {
        current = false;
        return { release() {} };
      };
    if (moved === 'cancel')
      f.bridge.hold = async () => {
        f.controller.abort();
        return { release() {} };
      };
    if (moved === 'server-clock') f.call.mockRejectedValue(new Error('saved Assembly moved'));
    await expect(
      writeSavedSurfaceDirection(f.capture, 'same', f.change, () => current, f.controller.signal),
    ).rejects.toThrow();
    expect(f.call).toHaveBeenCalledTimes(moved === 'server-clock' ? 1 : 0);
    expect(f.bridge.reread).not.toHaveBeenCalled();
  },
);

it('captures both signed rows on a freshly imported card with lock version zero', () => {
  const fresh = {
    ...card,
    lockVersion: 0,
    techCard: {
      ...card.techCard,
      patterns: card.techCard!.patterns!.map((pattern) => ({
        ...pattern,
        sizeBytes: String(pattern.sizeBytes),
      })),
    },
  } as unknown as common_TechCard;
  const captured = captureSavedSurfaceDirection(fresh, 570, seam);
  expect(captured.rows.map((row) => row.cardLockVersion)).toEqual([0, 0]);
  expect(captured.rows.map((row) => row.sizeBytes)).toEqual([2083, 2083]);
  expect(() => captureSavedSurfaceDirection({ ...card, lockVersion: -1 }, 570, seam)).toThrow();
});

it('keeps ambiguous and differently placed rows out of the saved direction editor', () => {
  expect(isPlacedSurfaceDirectionSeam({ ...seam, stale: true })).toBe(false);
  expect(isPlacedSurfaceDirectionSeam({ ...seam, sideB: [...seam.sideB, seam.sideB[0]!] })).toBe(
    false,
  );
  expect(
    isPlacedSurfaceDirectionSeam({
      ...seam,
      sideB: [{ ...seam.sideB[0]!, placement: { ...placement, yMm: 0 } }],
    }),
  ).toBe(false);
});

it('holds the edit before any source read when the selected row is already pending', async () => {
  const f = fixture();
  await expect(
    writeSavedSurfaceDirection(f.capture, 'same', f.change, () => false, f.controller.signal),
  ).rejects.toThrow('The saved surface seam changed');
  expect(io.snapshot).not.toHaveBeenCalled();
  expect(f.call).not.toHaveBeenCalled();
});

it('requires the same key, anchors and direction in the strict writer echo', async () => {
  const f = fixture();
  f.serve();
  f.call.mockImplementationOnce(async (req) => {
    const row = structuredClone(req.upsert![0]!);
    row.sideB!.parts![0]!.rangeTo = 0.99;
    return { seams: [row], links: [], deletedKeys: [], keyMap: [], lockVersion: 335 };
  });
  await expect(
    writeSavedSurfaceDirection(f.capture, 'same', f.change, () => true, f.controller.signal),
  ).rejects.toThrow('The saved direction could not be verified');
  expect(f.call).toHaveBeenCalledTimes(1);
  expect(f.bridge.reread).not.toHaveBeenCalled();
});
