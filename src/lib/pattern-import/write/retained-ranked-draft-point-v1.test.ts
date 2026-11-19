import { describe, expect, it } from 'vitest';
import { readDxf } from '../adapters/dxf/extract';
import { segmentDxf } from '../adapters/dxf/segment';
import { sha256Hex } from '../adapters/vector/builder';
import { AUTHORED_POINT_LAYERS } from '../manifest/authored-point';
import {
  writeDxfWithRetainedRankedDraftPointV1,
  type RetainedRankedDraftPointInputV1,
} from './index';

type Tag = [number, string | number];

function closedRectangle(layer: string, low: number, high: number): Tag[] {
  return [
    [0, 'POLYLINE'],
    [8, layer],
    [66, 1],
    [70, 1],
    ...[
      [low, low],
      [high, low],
      [high, high],
      [low, high],
    ].flatMap(([x, y]): Tag[] => [
      [0, 'VERTEX'],
      [8, layer],
      [10, x],
      [20, y],
    ]),
    [0, 'SEQEND'],
  ];
}

const sizes = ['XS', 'S', 'M', 'L', 'XL'];
const block = (size: string, width: number): Tag[] => [
  [0, 'BLOCK'],
  [8, 1],
  [2, 'BLT_' + size],
  [70, 64],
  [10, 0],
  [20, 0],
  ...closedRectangle('1', 0, width),
  ...closedRectangle('14', 1, width - 1),
  [0, 'POINT'],
  [8, '2'],
  [10, 0],
  [20, 0],
  [999, 'Unrelated original block comment'],
  [0, 'ENDBLK'],
];

function fixture(eol = '\n') {
  const tags: Tag[] = [
    [0, 'SECTION'],
    [2, 'HEADER'],
    [9, '$ACADVER'],
    [1, 'AC1009'],
    [9, '$INSUNITS'],
    [70, 4],
    [0, 'ENDSEC'],
    [0, 'SECTION'],
    [2, 'BLOCKS'],
    ...sizes.flatMap((size, rank) => block(size, 18 + rank)),
    [0, 'ENDSEC'],
    [0, 'SECTION'],
    [2, 'ENTITIES'],
    ...sizes.flatMap((size): Tag[] => [
      [0, 'INSERT'],
      [8, 1],
      [2, 'BLT_' + size],
      [10, 0],
      [20, 0],
    ]),
    [0, 'ENDSEC'],
    [0, 'EOF'],
  ];
  // CLO R12 is handleless, can omit its TABLES section, and need not align group codes.
  return tags.map(([code, value]) => code + eol + value + eol).join('');
}

async function input(text: string): Promise<RetainedRankedDraftPointInputV1> {
  const bytes = new TextEncoder().encode(text).buffer;
  return {
    file: { id: 'original', name: 'five-ranked-r12.dxf', bytes },
    sourceSha256: await sha256Hex(bytes),
    blockName: 'BLT_M',
    sizeToken: 'M',
    pointMm: { x: 8.123456, y: 9 },
  };
}

describe('one retained R12 Draft point', () => {
  it.each(['\n', '\r\n'])(
    'adds exactly one entity and preserves all bytes around it with %j',
    async (eol) => {
      const initial = fixture(eol);
      const args = await input(initial);
      const result = await writeDxfWithRetainedRankedDraftPointV1(args);
      const { byteOffset, byteLength, entitySha256 } = result.insertion;
      const output = new Uint8Array(result.bytes);
      const added = output.slice(byteOffset, byteOffset + byteLength);
      expect(await sha256Hex(added.buffer)).toBe(entitySha256);
      expect(result.outputSha256).toBe(await sha256Hex(result.bytes));
      expect(result.sourceSha256).toBe(args.sourceSha256);
      expect(new TextDecoder().decode(added)).toBe(
        [
          '  0',
          'POINT',
          '  8',
          AUTHORED_POINT_LAYERS['draft-point'],
          ' 10',
          '8.123456',
          ' 20',
          '9.000000',
          ' 30',
          '0.000000',
          '',
        ].join(eol),
      );
      const source = new Uint8Array(args.file.bytes);
      expect(output.subarray(0, byteOffset)).toEqual(source.subarray(0, byteOffset));
      expect(output.subarray(byteOffset + byteLength)).toEqual(source.subarray(byteOffset));
      expect(initial.slice(byteOffset)).toMatch(/^0\r?\nENDBLK/);

      const native = await readDxf(
        { ...args.file, bytes: result.bytes },
        { sagittaMm: 0.05, keepFills: true },
      );
      const shapes = segmentDxf(native);
      expect(shapes.sizes.map(({ token }) => token)).toEqual(sizes);
      expect(
        shapes.pieces.flatMap(({ block, pointMarks }) =>
          (pointMarks ?? []).map((mark) => [block, mark]),
        ),
      ).toEqual([['BLT_M', { kind: 'draft-point', at: args.pointMm }]]);
    },
  );

  it('refuses a second identical point, even when the newly stored bytes are current', async () => {
    const original = await input(fixture());
    const first = await writeDxfWithRetainedRankedDraftPointV1(original);
    await expect(
      writeDxfWithRetainedRankedDraftPointV1({
        ...original,
        sourceSha256: first.outputSha256,
        file: { ...original.file, bytes: first.bytes },
      }),
    ).rejects.toMatchObject({
      code: 'invalid-point',
      message: expect.stringContaining('already occupies'),
    });
  });

  it.each([
    ['source-moved', (initial: string) => initial, { sourceSha256: '0'.repeat(64) }],
    ['ambiguous-block', (initial: string) => initial, { sizeToken: 'L' }],
    ['unsupported-dxf', (initial: string) => initial.replace('AC1009', 'AC1015'), {}],
    [
      'unsupported-dxf',
      (initial: string) =>
        initial.replace(
          '0\nSECTION\n2\nBLOCKS',
          '0\nSECTION\n2\nTABLES\n0\nENDSEC\n0\nSECTION\n2\nBLOCKS',
        ),
      {},
    ],
    ['ambiguous-block', (initial: string) => initial.replace('BLT_L', 'BLT_M'), {}],
    [
      'ambiguous-block',
      (initial: string) =>
        initial.replace('BLT_M\n10\n0\n20\n0\n0\nINSERT', 'BLT_M\n10\n1\n20\n0\n0\nINSERT'),
      {},
    ],
    ['invalid-point', (initial: string) => initial, { pointMm: { x: 8.1234565, y: 9 } }],
    [
      'unsupported-dxf',
      (initial: string) =>
        initial.replace('0\nBLOCK\n8\n1\n2\nBLT_M', '0\r\nBLOCK\n8\n1\n2\nBLT_M'),
      {},
    ],
    [
      'unsupported-dxf',
      (initial: string) => {
        const at = initial.indexOf('BLT_M');
        return (
          initial.slice(0, at) +
          initial.slice(at).replace('0\nVERTEX\n8\n1', '0\nVERTEX\n42\n0.1\n8\n1')
        );
      },
      {},
    ],
    ['invalid-point', (initial: string) => initial, { pointMm: { x: -1, y: 9 } }],
  ] as const)('refuses %s without producing a replacement', async (code, edit, overrides) => {
    await expect(
      writeDxfWithRetainedRankedDraftPointV1({
        ...(await input(edit(fixture()))),
        ...overrides,
      }),
    ).rejects.toMatchObject({ name: 'RetainedRankedDraftPointErrorV1', code });
  });
});
