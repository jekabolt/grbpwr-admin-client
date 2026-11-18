import { expect, it, vi } from 'vitest';
import type { common_TechCard, GuardedNativePieceJoin } from 'api/proto-http/admin';
import { writeGuardedSavedPieceJoin } from './guarded-piece-join';

const keys = [
  '01JABCDEFGHJKMNPQRSTVWXYZD',
  '01JABCDEFGHJKMNPQRSTVWXYZE',
  '01JABCDEFGHJKMNPQRSTVWXYZB',
];
const bom = '01JABCDEFGHJKMNPQRSTVWXYZ8',
  line = '01JABCDEFGHJKMNPQRSTVWXYZ0';
const initial = 'https://local.test/ac17/tech-card-patterns/original.dxf',
  result = 'https://local.test/ac17/tech-card-patterns/joined.dxf';
const command = {
  expectedRow: {
    techCardId: 156,
    scopeKey: 'main',
    patternLineKey: line,
    savedRowRevision: 1,
    cardLockVersion: 1,
    url: initial,
    sizeBytes: 100,
    sha256: 'a'.repeat(64),
    patternVersion: 1,
  },
  fixed: { pieceIdentity: 'FP', pieceLineKey: keys[0] },
  moving: { pieceIdentity: 'BP', pieceLineKey: keys[1] },
  resultIdentity: 'JN',
  resultLineKey: keys[2],
  sizeToken: 'M',
  reviewedUrl: result,
  reviewedSizeBytes: 150,
  reviewedSha256: 'b'.repeat(64),
} as GuardedNativePieceJoin;
function card(saved: boolean) {
  const fabricPurpose = 'TECH_CARD_BOM_PURPOSE_MAIN';
  const pairs = saved
    ? [['JN', keys[2]]]
    : [
        ['FP', keys[0]],
        ['BP', keys[1]],
      ];
  return {
    id: 156,
    lockVersion: saved ? 2 : 1,
    techCard: {
      bomItems: [
        {
          lineKey: bom,
          section: 'TECH_CARD_BOM_SECTION_FABRIC',
          purpose: fabricPurpose,
          name: 'Shell',
        },
      ],
      patterns: [
        {
          lineKey: line,
          fabricPurpose,
          bomLineKey: bom,
          downloadUrl: '/api/p/current',
          url: saved ? result : initial,
          sizeBytes: saved ? 150 : 100,
          version: saved ? 2 : 1,
          savedRowRevision: saved ? 2 : 1,
          sha256: (saved ? 'b' : 'a').repeat(64),
          history: saved ? [{ url: initial, sha256: 'a'.repeat(64), snapshotId: 123 }] : [],
        },
      ],
      pieces: pairs.map(([name, lineKey]) => ({ name, lineKey })),
      pieceDxfAliases: {
        items: pairs.map(([blockName, pieceLineKey]) => ({
          blockName,
          pieceLineKey,
          bomLineKey: bom,
          fabricPurpose,
        })),
      },
    },
  } as common_TechCard;
}
function store() {
  const before = card(false),
    after = card(true);
  const update = vi.fn(async () => 2);
  return {
    before,
    after,
    update,
    read: vi.fn().mockResolvedValueOnce(before).mockResolvedValueOnce(after),
  };
}
it('requires one exact new alias and a saved history after one guarded write', async () => {
  const s = store();
  s.before.techCard!.pieceDxfAliases!.items!.push({
    ...s.before.techCard!.pieceDxfAliases!.items![0],
    blockName: 'FP_M',
  });
  expect(await writeGuardedSavedPieceJoin(command, s)).toBe(s.after);
  expect(s.update).toHaveBeenCalledExactlyOnceWith(command);
  expect(s.read).toHaveBeenCalledTimes(2);
});
it.each(['changed bytes', 'ambiguous alias', 'existing child'] as const)(
  'refuses %s before writing',
  async (why) => {
    const s = store(),
      body = s.before.techCard!;
    if (why === 'changed bytes') body.patterns![0]!.sha256 = 'c'.repeat(64);
    if (why === 'ambiguous alias')
      body.pieceDxfAliases!.items!.push({
        ...body.pieceDxfAliases!.items![0]!,
        pieceLineKey: keys[1],
      });
    if (why === 'existing child') body.pieces!.push({ ...body.pieces![0]!, lineKey: keys[2] });
    await expect(writeGuardedSavedPieceJoin(command, s)).rejects.toThrow();
    expect(s.update).not.toHaveBeenCalled();
  },
);
it.each([
  'missing snapshot',
  'surviving source',
  'duplicate result alias',
  'incorrect lock',
] as const)('refuses to confirm a response with %s', async (why) => {
  const s = store(),
    body = s.after.techCard!;
  if (why === 'missing snapshot') body.patterns![0]!.history = [];
  if (why === 'surviving source') body.pieces!.push(s.before.techCard!.pieces![0]!);
  if (why === 'duplicate result alias')
    body.pieceDxfAliases!.items!.push({
      ...body.pieceDxfAliases!.items![0]!,
      pieceLineKey: keys[0],
    });
  if (why === 'incorrect lock') s.update.mockResolvedValue(3);
  await expect(writeGuardedSavedPieceJoin(command, s)).rejects.toThrow();
  expect(s.update).toHaveBeenCalledTimes(1);
});
