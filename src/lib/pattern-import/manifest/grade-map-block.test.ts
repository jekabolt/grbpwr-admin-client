import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { parseSheets } from 'lib/nesting/worker/parse-files';
import type { ConversionManifest } from '../types';
import { bareOf } from '../fabrics/draft';
import { buildManifest } from '../write/manifest-build';
import {
  GRADEMAP_TAG,
  GradeMapBlockError,
  readGradeMapBlock,
  readGradeMapBlockBytes,
  writeGradeMapBlock,
} from './grade-map-block';
import { embedManifest, manifestPrologueBytes, readManifest } from './index';

const dxfPath = fileURLToPath(
  new URL('../../fusing-dxf/card6-main-v10.fixture.dxf', import.meta.url),
);
const raw = readFileSync(dxfPath, 'latin1');
// A valid (empty) manifest from the writer's own builder: the block only cares that one is there.
const manifest: ConversionManifest = buildManifest(
  {
    techCardId: 1,
    scope: {
      scopeKey: 'M',
      fabricPurpose: 'TECH_CARD_BOM_PURPOSE_MAIN',
      bomLineKey: 'L1',
      label: 'main',
      isInterlining: false,
      sections: [],
    },
    pieces: [],
    sizes: [],
    source: {
      files: [],
      scale: { method: 'none', factor: 1, measuredMm: null, declaredMm: null },
      sheet: { pages: 1, method: 'single', maxResidualMm: 0 },
      sizeEncoding: 'ocg',
      variant: null,
    },
    generator: 'test',
    dialect: 'r12',
  } as never,
  [],
  [],
  '2026-11-13T00:00:00.000Z',
);
const withManifest = embedManifest(raw, manifest);

// Deterministic pseudo-random payload: compresses poorly, so it spans many comment lines.
function payload(n: number, seed = 7): Uint8Array {
  const out = new Uint8Array(n);
  let s = seed;
  for (let i = 0; i < n; i++) {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    out[i] = s >>> 24;
  }
  return out;
}

const bufOf = (text: string) => {
  const b = Buffer.from(text, 'latin1');
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

const blockLines = (text: string) =>
  text.split(/\r?\n/).filter((l) => l.startsWith(`${GRADEMAP_TAG} `));

// Deflating incompressible payloads is slow; the whole file gets a wide timeout.
describe('grade map block', { timeout: 30_000 }, () => {
  it('round trips bytes → DXF → bytes', () => {
    for (const n of [0, 1, 300, 40_000]) {
      const bytes = payload(n, n + 1);
      const text = writeGradeMapBlock(withManifest, bytes);
      const read = readGradeMapBlock(text);
      expect(read.status).toBe('ok');
      if (read.status === 'ok') expect(Array.from(read.bytes)).toEqual(Array.from(bytes));
      const viaBytes = readGradeMapBlockBytes(bufOf(text));
      expect(viaBytes).toEqual(read);
    }
  });

  it('spans several lines of at most 200 base64 characters, after the manifest', () => {
    const text = writeGradeMapBlock(withManifest, payload(40_000));
    const lines = blockLines(text);
    expect(lines.length).toBeGreaterThan(1);
    for (const l of lines) expect(l.split(' ').at(-1)!.length).toBeLessThanOrEqual(200);
    expect(text.indexOf('GRBPWR-MANIFEST')).toBeLessThan(text.indexOf(GRADEMAP_TAG));
  });

  it('reads absent from a DXF without a block', () => {
    expect(readGradeMapBlock(withManifest)).toEqual({ status: 'absent' });
    expect(readGradeMapBlockBytes(bufOf(withManifest))).toEqual({ status: 'absent' });
  });

  it('is untrusted without a manifest or when the caller distrusts it', () => {
    const noManifest = writeGradeMapBlock(raw, payload(100));
    expect(readGradeMapBlock(noManifest).status).toBe('untrusted');
    const text = writeGradeMapBlock(withManifest, payload(100));
    expect(readGradeMapBlock(text, { manifestTrusted: false }).status).toBe('untrusted');
    expect(readGradeMapBlock(text, { manifestTrusted: true }).status).toBe('ok');
  });

  it('reads a broken block as corrupt and keeps the manifest readable', () => {
    const text = writeGradeMapBlock(withManifest, payload(40_000));
    const lines = blockLines(text);
    const dropped = text.replace(`999\n${lines[1]}\n`, '');
    expect(dropped).not.toBe(text);
    const flip = (l: string) => {
      const i = l.length - 5;
      return l.slice(0, i) + (l[i] === 'A' ? 'B' : 'A') + l.slice(i + 1);
    };
    const flipped = text.replace(lines[0], flip(lines[0]));
    const truncated = text.replace(lines.at(-1)!, lines.at(-1)!.slice(0, -10));
    const duplicated = text.replace(`999\n${lines[0]}\n`, `999\n${lines[0]}\n999\n${lines[0]}\n`);
    const garbage = text.replace(lines[0], `${GRADEMAP_TAG} v1z nonsense`);
    for (const broken of [dropped, flipped, truncated, duplicated, garbage]) {
      const read = readGradeMapBlock(broken);
      expect(read.status).toBe('corrupt');
      expect(readManifest(broken)?.createdAt).toBe(manifest.createdAt);
    }
  });

  it('reads a block cut by the byte bound as corrupt, not ok', () => {
    const text = writeGradeMapBlock(withManifest, payload(40_000));
    const cut = text.slice(0, text.indexOf(GRADEMAP_TAG) + 300);
    expect(readGradeMapBlockBytes(bufOf(cut)).status).not.toBe('ok');
  });

  it('survives re-saving the manifest', () => {
    const bytes = payload(5_000);
    const text = writeGradeMapBlock(withManifest, bytes);
    const resaved = embedManifest(text, { ...manifest, createdAt: '2030-01-01T00:00:00.000Z' });
    expect(readManifest(resaved)?.createdAt).toBe('2030-01-01T00:00:00.000Z');
    const read = readGradeMapBlock(resaved);
    expect(read.status).toBe('ok');
    if (read.status === 'ok') expect(Array.from(read.bytes)).toEqual(Array.from(bytes));
  });

  it('replaces an earlier block and removes it with null', () => {
    const once = writeGradeMapBlock(withManifest, payload(3_000, 1));
    const twice = writeGradeMapBlock(once, payload(10, 2));
    const read = readGradeMapBlock(twice);
    expect(read.status).toBe('ok');
    if (read.status === 'ok') expect(Array.from(read.bytes)).toEqual(Array.from(payload(10, 2)));
    expect(writeGradeMapBlock(twice, null)).toBe(withManifest);
    expect(writeGradeMapBlock(withManifest, null)).toBe(withManifest);
  });

  it('keeps CRLF line endings', () => {
    const crlf = withManifest.replace(/\r?\n/g, '\r\n');
    const text = writeGradeMapBlock(crlf, payload(2_000));
    expect(text.replace(/\r\n/g, '')).not.toMatch(/\n/);
    expect(readGradeMapBlock(text).status).toBe('ok');
  });

  it('refuses a payload over the size bound', () => {
    expect(() => writeGradeMapBlock(withManifest, payload(1_300_000))).toThrow(GradeMapBlockError);
  }, 60_000);

  it('does not count toward the manifest size or the draft fingerprint', () => {
    const text = writeGradeMapBlock(withManifest, payload(40_000));
    expect(manifestPrologueBytes(text)).toBe(manifestPrologueBytes(withManifest));
    expect(bareOf(text, manifest.createdAt)).toBe(bareOf(withManifest, manifest.createdAt));
  });

  it('parses to the same pieces with and without the block', async () => {
    const parse = (text: string) =>
      parseSheets([{ name: 'card6.dxf', open: async () => bufOf(text) }], {
        unit: 'auto',
        tol: 0.03,
        tolChain: 0.05,
      });
    const plain = await parse(withManifest);
    const blocked = await parse(writeGradeMapBlock(withManifest, payload(40_000)));
    expect(blocked.pieces).toEqual(plain.pieces);
    expect(blocked.warnings).toEqual(plain.warnings);
    expect(blocked.failedFiles).toBe(plain.failedFiles);
    const bare = await parse(raw);
    const bareBlocked = await parse(writeGradeMapBlock(raw, payload(1_000)));
    expect(bare.pieces.length).toBeGreaterThan(0);
    expect(bareBlocked.pieces).toEqual(bare.pieces);
    expect(bareBlocked.warnings).toEqual(bare.warnings);
  });
});
