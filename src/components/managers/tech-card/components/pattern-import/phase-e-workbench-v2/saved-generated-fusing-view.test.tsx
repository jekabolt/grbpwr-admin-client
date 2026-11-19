import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';
import type { common_Size, common_TechCard } from 'api/proto-http/admin';
import { listPatternImportDxfPhaseECadTableZeroOperationSavedChoicesV1 } from './cad-table-zero-operation-saved-preparation-v1';
import { createPatternImportDxfPhaseEZeroOperationSavedCardAuthorityV1 } from './zero-operation-saved-card-authority-v1';
import {
  readSavedGeneratedFusingView,
  SavedGeneratedFusingOutlines,
} from './saved-generated-fusing-view';

const reader = vi.hoisted(() => ({ seal: vi.fn(), prepare: vi.fn() }));
vi.mock('./saved-assembly-complete-source-rpc-v1', async (load) => ({
  ...(await load<object>()),
  readCompleteSavedAssemblySourceV1: reader.seal,
}));
vi.mock('./saved-full-assembly-complete-native-rows-v1', () => ({
  prepareSavedFullAssemblyCompleteNativeRowsV1: reader.prepare,
}));
vi.mock('api/api', () => ({ adminService: {}, abortableAdminService: () => ({}) }));

const dictionary = [
  { id: 7, name: 'M' },
  { id: 8, name: 'L' },
] as common_Size[];
const names = new Map([
    [7, 'M'],
    [8, 'L'],
  ]),
  order = (ids: number[]) => ids;
const row = {
  lineKey: 'generated-sheet',
  name: 'Fusing · generated · interfacing',
  bomLineKey: 'lining-line',
  url: 'https://object.invalid/fusing.dxf',
  downloadUrl: 'https://object.invalid/content',
  savedRowRevision: 2,
  sha256: 'a'.repeat(64),
  sizeBytes: 300,
  version: 2,
};
const card = {
  id: 6,
  lockVersion: 3,
  techCard: {
    sizeIds: [7, 8],
    patterns: [row],
    bomItems: [
      { lineKey: 'lining-line', name: 'Interfacing', section: 'TECH_CARD_BOM_SECTION_INTERLINING' },
    ],
  },
} as unknown as common_TechCard;
function fixture() {
  const choices = listPatternImportDxfPhaseECadTableZeroOperationSavedChoicesV1(card, order, names);
  if (!choices.ok) throw Error(choices.blocker.detail);
  const scope = choices.choices[0]!,
    size = scope.sizes[0]!;
  expect(scope).toMatchObject({ scopeKey: 'lining-line', isInterlining: true });
  const readTechCard = vi.fn(async () => structuredClone(card));
  const authority = createPatternImportDxfPhaseEZeroOperationSavedCardAuthorityV1({
    orderSizeIds: order,
    sizeNameById: names,
    readTechCard,
  });
  return {
    input: { techCard: card, scope, size, authority, orderSizeIds: order, sizeNameById: names },
    readTechCard,
  };
}
const layer = {
  fusingRow: { scopeKey: 'lining-line', patternLineKey: 'generated-sheet' },
  selectedSizeId: 7,
  parts: [
    {
      blockName: 'view_M',
      pieceLineKey: 'garment-a',
      sizeToken: 'M',
      hostLocalCut: {
        outer: [
          { x: 1, y: 2 },
          { x: 8, y: 2 },
          { x: 8, y: 9 },
        ],
        holes: [
          [
            { x: 3, y: 3 },
            { x: 4, y: 4 },
            { x: 4, y: 3 },
          ],
        ],
      },
    },
  ],
};
beforeEach(() => {
  vi.resetAllMocks();
  reader.seal.mockResolvedValue({ sourceSha256: 'verified' });
  reader.prepare.mockResolvedValue({ fusingLayers: [layer] });
});
it('renders the selected verified outer ring and hole after a fresh exact card read', async () => {
  const { input, readTechCard } = fixture();
  const signal = new AbortController().signal;
  const projected = await readSavedGeneratedFusingView(input, dictionary, signal);
  expect(readTechCard).toHaveBeenCalledOnce();
  expect(reader.seal).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      patternLineKey: row.lineKey,
      scopeKey: 'lining-line',
      sha256: row.sha256,
      revision: 2,
    }),
    {},
    signal,
  );
  expect(reader.prepare).toHaveBeenCalledWith(
    { sourceSha256: 'verified' },
    expect.objectContaining({ cardLockVersion: 3 }),
    signal,
    { card, sizeDictionary: dictionary, selectedSizeId: 7 },
  );
  const svg = renderToStaticMarkup(<SavedGeneratedFusingOutlines layer={projected} />);
  expect(svg).toContain('data-fusing-piece-key="garment-a"');
  expect(svg).toContain('M1,-2L8,-2L8,-9Z M3,-3L4,-4L4,-3Z');
  expect(svg).toContain('fill-rule="evenodd"');
});
it('refuses changed row, rank, or ambiguous dictionary before native reconstruction', async () => {
  const { input, readTechCard } = fixture();
  const signal = new AbortController().signal;
  readTechCard.mockResolvedValueOnce({ ...card, lockVersion: 4 });
  await expect(readSavedGeneratedFusingView(input, dictionary, signal)).rejects.toThrow();
  await expect(
    readSavedGeneratedFusingView(
      { ...input, size: { ...input.size, rank: 1 } },
      dictionary,
      signal,
    ),
  ).rejects.toThrow('dictionary entry changed');
  await expect(
    readSavedGeneratedFusingView(
      input,
      [...dictionary, { ...dictionary[0]!, name: 'other' }],
      signal,
    ),
  ).rejects.toThrow('dictionary entry changed');
  expect(reader.prepare).not.toHaveBeenCalled();
  expect(reader.seal).not.toHaveBeenCalled();
});
it('publishes no layer from another scope, a different rank, or an aborted late read', async () => {
  const { input } = fixture();
  const controller = new AbortController();
  for (const wrong of [
    { ...layer, fusingRow: { ...layer.fusingRow, scopeKey: 'another-line' } },
    { ...layer, selectedSizeId: 8 },
  ]) {
    reader.prepare.mockResolvedValueOnce({ fusingLayers: [wrong] });
    await expect(
      readSavedGeneratedFusingView(input, dictionary, controller.signal),
    ).rejects.toThrow('no exact cut outlines');
  }
  reader.prepare.mockImplementationOnce(async () => {
    controller.abort();
    return { fusingLayers: [layer] };
  });
  await expect(
    readSavedGeneratedFusingView(input, dictionary, controller.signal),
  ).rejects.toMatchObject({ name: 'AbortError' });
});
