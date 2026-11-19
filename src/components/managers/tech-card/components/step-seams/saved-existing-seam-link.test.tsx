import type { common_Size, common_TechCard } from 'api/proto-http/admin';
import type { TechCardSeam } from 'api/proto-http/common';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';
import { SavedExistingSeamLinkControl } from './saved-existing-seam-link-control';
import {
  captureExistingSeamLink,
  existingSeamLinkCandidates,
  linkReviewedExistingSeam,
  reviewExistingSeamLink,
} from './saved-existing-seam-link';

const io = vi.hoisted(() => ({ getCard: vi.fn(), snapshot: vi.fn() }));
vi.mock('api/api', () => ({
  adminService: {},
  abortableAdminService: () => ({
    GetTechCard: io.getCard,
    GetTechCardSavedAssemblySnapshot: io.snapshot,
  }),
}));
vi.mock('lib/providers/dictionary-provider', () => ({
  useDictionary: () => ({ dictionary: { sizes: [] } }),
}));

const key = '01M5MJWRPNMSR67PD9ZWK0FAJA';
const left = '01M5MJWNB6TXGVSQ0654EB27KR';
const a = '01M5J6VRN9PX3D9SXHQGDMK6PJ';
const b = '01M5J6VRN9ZR7CFFW8TRZGWFJY';
const mainBom = '01M5J6QJWGQ6Z26SV3RKBK24E2';
const dictionary = {
  sizes: [{ id: 4, name: 'm' }] as common_Size[],
  names: new Map([[4, 'm']]),
  order: (ids: number[]) => ids,
};

function fixture() {
  const seam = {
    seamKey: key,
    kind: 'TECH_CARD_SEAM_KIND_EDGE',
    status: 'TECH_CARD_SEAM_STATUS_CONFIRMED',
    direction: 'TECH_CARD_SEAM_DIRECTION_REVERSED',
    anchoredSize: 'M',
    stale: false,
    sideA: { parts: [{ pieceLineKey: a, edgeHint: `${a}#5`, contourSig: '4c15de88893c189e' }] },
    sideB: { parts: [{ pieceLineKey: b, edgeHint: `${b}#3`, contourSig: '122d7c04f081cbb6' }] },
  } as TechCardSeam;
  const operation = {
    operationNumber: 970,
    operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
    work: 'join_lockstitch',
    inputKeys: [a, b],
    seamKeys: [left],
  };
  const other = { operationNumber: 980, inputKeys: [b], seamKeys: [] as string[] };
  const card = {
    id: 2,
    lockVersion: 1,
    seams: [seam],
    techCard: {
      sizeIds: [4],
      pieces: [{ lineKey: a }, { lineKey: b }],
      operations: [operation, other],
      bomItems: [
        {
          lineKey: mainBom,
          section: 'TECH_CARD_BOM_SECTION_FABRIC',
          purpose: 'TECH_CARD_BOM_PURPOSE_MAIN',
        },
      ],
      patterns: [
        {
          lineKey: '01M5J6V2NVSKGQ64767RT9SFTK',
          fabricPurpose: 'TECH_CARD_BOM_PURPOSE_MAIN',
          bomLineKey: mainBom,
          url: 'https://example.invalid/main.dxf',
          downloadUrl: '/fixture.dxf',
          savedRowRevision: 1,
          sha256: 'a'.repeat(64),
          sizeBytes: 3000,
        },
      ],
    },
  } as unknown as common_TechCard;
  return { card, seam, operation, other };
}

beforeEach(() => {
  io.getCard.mockReset();
  io.snapshot.mockReset();
});

it('offers the normal action for a saved join with one existing unowned edge', () => {
  const { card } = fixture();
  expect(existingSeamLinkCandidates(card, 970).map(({ seamKey }) => seamKey)).toEqual([key]);
  const markup = renderToStaticMarkup(
    <SavedExistingSeamLinkControl
      card={card}
      operationNumber={970}
      historyKey='existing-op'
      disabled={false}
      isCurrent={() => true}
      change={vi.fn()}
      nameOf={(lineKey) => lineKey}
    />,
  );
  expect(markup).toContain('Link a saved seam');
  expect(markup).not.toContain('Verify registered stations');
  expect(io.getCard).not.toHaveBeenCalled();
});

it.each([
  'unknown',
  'stale',
  'unanchored',
  'part range',
  'other owner',
  'already linked',
  'wrong work',
  'different members',
  'duplicated row',
] as const)('excludes %s before candidate review', (reason) => {
  const f = fixture();
  if (reason === 'unknown') f.seam.direction = 'TECH_CARD_SEAM_DIRECTION_UNKNOWN';
  if (reason === 'stale') f.seam.stale = true;
  if (reason === 'unanchored') f.seam.anchoredSize = '';
  if (reason === 'part range') f.seam.sideA!.parts![0]!.rangeTo = 0.75;
  if (reason === 'other owner') f.other.seamKeys.push(key);
  if (reason === 'already linked') f.operation.seamKeys.push(key);
  if (reason === 'wrong work') f.operation.work = 'press_flat';
  if (reason === 'different members') f.operation.inputKeys = [a];
  if (reason === 'duplicated row') f.card.seams!.push(structuredClone(f.seam));
  expect(existingSeamLinkCandidates(f.card, 970)).toEqual([]);
  expect(() => captureExistingSeamLink(f.card, 970, 'existing-op', key)).toThrow('changed');
  expect(io.getCard).not.toHaveBeenCalled();
});

it.each(['another owner', 'changed row', 'moved lock'] as const)(
  'rechecks the fresh FullCard for %s before reading or taking native authority',
  async (reason) => {
    const before = fixture();
    const now = fixture();
    if (reason === 'another owner') now.other.seamKeys.push(key);
    if (reason === 'changed row') now.seam.sideB!.parts![0]!.contourSig = 'another exact row';
    if (reason === 'moved lock') now.card.lockVersion = 2;
    io.getCard.mockResolvedValue({ techCard: now.card });
    await expect(
      reviewExistingSeamLink(
        captureExistingSeamLink(before.card, 970, 'existing-op', key),
        dictionary,
        () => true,
        new AbortController().signal,
      ),
    ).rejects.toThrow('changed');
    expect(io.snapshot).not.toHaveBeenCalled();
  },
);

it('refuses a forged registered-station receipt before any call or writer', async () => {
  const writer = vi.fn();
  await expect(
    linkReviewedExistingSeam(
      { sizeId: 4, sizeToken: 'M', stationCount: 30, lengthsMm: [512.497, 512.448], ratio: 0.9999 },
      writer,
      () => true,
      new AbortController().signal,
    ),
  ).rejects.toThrow('changed');
  expect(writer).not.toHaveBeenCalled();
  expect(io.getCard).not.toHaveBeenCalled();
});
