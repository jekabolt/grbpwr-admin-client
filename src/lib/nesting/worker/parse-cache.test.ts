import { describe, expect, it } from 'vitest';
import type { ParseOpts, PieceDTO } from '../types';
import { packPieces, unpackPieces } from './piece-transfer';
import {
  ParseCache,
  parseCacheKey,
  type ParseCacheMetadata,
  type ParseCacheRecord,
  type ParseCacheStorage,
} from './parse-cache';
import {
  mergeParsedSheets,
  parseCachedSources,
  type CachedParsedSheet,
} from './parse-cached-sources';
import type { ParsedSheets } from './parse-files';

class MemoryStorage<T> implements ParseCacheStorage<T> {
  readonly values = new Map<string, T>();
  readonly recency = new Map<string, ParseCacheMetadata>();
  failRead = false;
  failWrite = false;
  failTouch = false;

  async read(key: string): Promise<ParseCacheRecord<T> | undefined> {
    if (this.failRead) throw new Error('read unavailable');
    const value = this.values.get(key);
    if (value === undefined) return undefined;
    return { value: structuredClone(value), bytes: this.recency.get(key)?.bytes ?? 1 };
  }

  async touch(metadata: ParseCacheMetadata): Promise<void> {
    if (this.failTouch) throw new Error('touch unavailable');
    this.recency.set(metadata.key, { ...metadata });
  }

  async write(metadata: ParseCacheMetadata, value: T): Promise<void> {
    if (this.failWrite) throw new Error('write unavailable');
    this.values.set(metadata.key, structuredClone(value));
    this.recency.set(metadata.key, { ...metadata });
  }

  async metadata(): Promise<ParseCacheMetadata[]> {
    return [...this.recency.values()].map((entry) => ({ ...entry }));
  }

  async remove(keys: readonly string[]): Promise<void> {
    for (const key of keys) {
      this.values.delete(key);
      this.recency.delete(key);
    }
  }
}

const opts: ParseOpts = { unit: 'auto', tol: 0.02, tolChain: 0.05 };

describe('DXF parse cache', () => {
  it('keys by URL, every parse option, and parser build', () => {
    const base = parseCacheKey('https://files/a.dxf', opts, 'release-a');
    expect(parseCacheKey('https://files/a.dxf', opts, 'release-a')).toBe(base);
    expect(parseCacheKey('https://files/b.dxf', opts, 'release-a')).not.toBe(base);
    expect(parseCacheKey('https://files/a.dxf', { ...opts, tol: 0.03 }, 'release-a')).not.toBe(
      base,
    );
    expect(parseCacheKey('https://files/a.dxf', opts, 'release-b')).not.toBe(base);
  });

  it('touches hits and evicts the least recently used files to the byte cap', async () => {
    const storage = new MemoryStorage<string>();
    let now = 1;
    const cache = new ParseCache(storage, 8, () => now++);
    await cache.write('a', 'A', 4);
    await cache.write('b', 'B', 4);
    expect(await cache.read('a')).toBe('A');
    await cache.write('c', 'C', 4);
    expect([...storage.values.keys()].sort()).toEqual(['a', 'c']);
  });

  it('treats storage failures as misses and keeps a hit when only its touch fails', async () => {
    const storage = new MemoryStorage<string>();
    const cache = new ParseCache(storage, 8);
    storage.failWrite = true;
    await expect(cache.write('a', 'A', 4)).resolves.toBeUndefined();
    expect(storage.values.size).toBe(0);
    storage.failWrite = false;
    await cache.write('a', 'A', 4);
    storage.failRead = true;
    await expect(cache.read('a')).resolves.toBeUndefined();
    storage.failRead = false;
    storage.failTouch = true;
    await expect(cache.read('a')).resolves.toBe('A');
  });

  it('does not store a single entry larger than the whole cache', async () => {
    const storage = new MemoryStorage<string>();
    const cache = new ParseCache(storage, 8);
    await cache.write('large', 'value', 9);
    expect(storage.values.size).toBe(0);
  });

  it('caches complete files independently and never stores a failed download', async () => {
    const storage = new MemoryStorage<CachedParsedSheet>();
    const cache = new ParseCache(storage, 1024 * 1024);
    const sources = [
      { name: 'good.dxf', url: 'https://files/good.dxf' },
      { name: 'missing.dxf', url: 'https://files/missing.dxf' },
    ];
    const opened: string[] = [];
    const open = async (source: (typeof sources)[number]) => {
      opened.push(source.url);
      if (source.url.includes('missing')) throw new Error('download failed');
      return new TextEncoder().encode('0\nEOF\n').buffer;
    };

    const first = await parseCachedSources(sources, opts, 'release', cache, open);
    const second = await parseCachedSources(sources, opts, 'release', cache, open);

    expect(first.sourceIndices).toEqual([0]);
    expect(first.downloadFailedIndices).toEqual([1]);
    expect(second.sourceIndices).toEqual([0]);
    expect(second.downloadFailedIndices).toEqual([1]);
    expect(opened).toEqual([
      'https://files/good.dxf',
      'https://files/missing.dxf',
      'https://files/missing.dxf',
    ]);
    expect(storage.values.size).toBe(1);
  });
});

describe('packed piece hand-over', () => {
  it('round-trips every PieceDTO field without changing a coordinate', () => {
    const pieces: PieceDTO[] = [
      {
        id: 7,
        name: 'front',
        blockName: 'FRONT_M',
        layer: '14',
        grain: [
          {
            layer: '7',
            angleDeg: 91.25,
            lengthCm: 12.5,
            a: { x: -1.25, y: 2.5 },
            b: { x: 3.75, y: -4.5 },
          },
        ],
        displayGrain: {
          layer: '7',
          a: { x: Number.MIN_VALUE, y: Number.MAX_SAFE_INTEGER },
          b: { x: -0, y: Math.PI },
        },
        inner: [{ layer: '4', closed: false, pts: [{ x: 1 / 3, y: -7 / 9 }] }],
        source: 'sheet.dxf',
        fileIndex: 2,
        poly: [
          { x: 0, y: 0 },
          { x: 10.125, y: 0 },
          { x: 0, y: 20.25 },
        ],
        bboxW: 10.125,
        bboxH: 20.25,
        areaCm2: 102.515625,
        originX: -100.25,
        originY: 5.75,
        manifest: {
          techCardId: 61,
          identity: 'FRONT',
          size: 'M',
          sizeId: 3,
          cardName: 'FRONT',
          pairHand: null,
          pairOf: null,
          unfolded: false,
          halfFold: false,
          cutLayer: '14',
          seamLayer: '1',
          grainLayer: '7',
          cutAllowanceCm: 1,
        },
        fold: { kind: 'unit', halfAreaCm2: 51.2578125 },
      },
    ];
    expect(unpackPieces(packPieces(pieces))).toEqual(pieces);
  });
});

function parsed(piece: PieceDTO | null, failedFiles = 0): ParsedSheets {
  return {
    pieces: piece ? [piece] : [],
    detectedUnit: 'cm',
    warnings: failedFiles ? ['bad.dxf: broken'] : [],
    failedFiles,
    skippedBlocks: 0,
    blockNames: piece?.blockName ? [piece.blockName] : [],
    manifests: [null],
    manifestDistrust: [null],
  };
}

describe('per-file parse merge', () => {
  it('remints global ids and keeps failed downloaded files in the file index', () => {
    const first: PieceDTO = {
      id: 1,
      name: 'piece 1',
      blockName: '',
      source: 'a.dxf',
      fileIndex: 0,
      poly: [{ x: 0, y: 0 }],
      bboxW: 0,
      bboxH: 0,
      areaCm2: 0,
    };
    const third: PieceDTO = { ...first, name: 'piece 1', source: 'c.dxf' };
    const merged = mergeParsedSheets([parsed(first), parsed(null, 1), parsed(third)]);
    expect(merged.pieces.map(({ id, name, fileIndex }) => ({ id, name, fileIndex }))).toEqual([
      { id: 1, name: 'piece 1', fileIndex: 0 },
      { id: 2, name: 'piece 2', fileIndex: 2 },
    ]);
    expect(merged.failedFiles).toBe(1);
    expect(merged.manifests).toEqual([null, null, null]);
  });
});
