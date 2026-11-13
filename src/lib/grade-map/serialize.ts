// Grade map · deterministic bytes. Canonical JSON of arrays (no object key order to drift), node
// lists flattened to integer arrays, residuals in whole micrometres (rounded up), then deflate-raw
// level 9 (fflate, as the manifest) and base64. The future DXF form is the manifest's: 999 comment
// lines `GRBPWR-GRADEMAP v1z <i>/<n> <chunk>` of at most LINE_MAX characters; only the bytes are
// produced here, nothing writes them into a file yet.

import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';
import type { ContourSignature } from 'lib/pattern-import/types';
import type { GmFile, GmPiece, GmTrack, GmTrackSize, TrackKind, Trust } from './types';

export const GRADEMAP_TAG = 'GRBPWR-GRADEMAP';
export const GRADEMAP_FORM = 'v1z';
/** Chunk length of one comment line (the manifest's `manifestLineMax`). */
export const LINE_MAX = 200;

type TrackTuple = [
  TrackKind,
  string,
  0 | 1,
  Trust,
  string | null,
  number,
  number[],
  ([number, number[], number] | [number, string])[],
];
type PieceTuple = [string, [number, number[]] | null, TrackTuple[]];
type FileJson = { f: string; v: 1; b: string; s: number[]; base: number; p: PieceTuple[] };

const um = (mm: number | undefined) => Math.ceil(Math.max(0, mm ?? 0) * 1000 - 1e-6);
const flat = (pts: readonly [number, number][]) => pts.flatMap(([x, y]) => [x, y]);
const pairs = (xs: readonly number[]): [number, number][] => {
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < xs.length; i += 2) out.push([xs[i], xs[i + 1]]);
  return out;
};

function trackTuple(t: GmTrack): TrackTuple {
  return [
    t.kind,
    t.layer,
    t.closed ? 1 : 0,
    t.trust,
    t.reason ?? null,
    um(t.residualMm),
    flat(t.base),
    t.sizes.map((s) =>
      s.delta ? [s.sizeId, flat(s.delta), um(s.residualMm)] : [s.sizeId, s.refused ?? 'refused'],
    ),
  ];
}

export function canonicalJson(file: GmFile): string {
  const json: FileJson = {
    f: file.format,
    v: file.version,
    b: file.builder,
    s: file.sizes,
    base: file.baseSizeId,
    p: file.pieces.map((p) => [
      p.key,
      p.sig ? [p.sig.dev, p.sig.pts] : null,
      p.tracks.map(trackTuple),
    ]),
  };
  return JSON.stringify(json);
}

function parseJson(text: string): GmFile {
  const j = JSON.parse(text) as FileJson;
  if (j.f !== GRADEMAP_TAG || j.v !== 1)
    throw new Error('grade map: not a GRBPWR-GRADEMAP v1 payload');
  const pieces: GmPiece[] = j.p.map(([key, sig, tracks]) => ({
    key,
    sig: sig ? ({ dev: sig[0], pts: sig[1] } as ContourSignature) : null,
    tracks: tracks.map(([kind, layer, closed, trust, reason, res, base, sizes]) => ({
      kind,
      layer,
      closed: closed === 1,
      trust,
      ...(reason !== null ? { reason } : {}),
      residualMm: res / 1000,
      base: pairs(base),
      sizes: sizes.map(
        (s): GmTrackSize =>
          typeof s[1] === 'string'
            ? { sizeId: s[0], refused: s[1] }
            : {
                sizeId: s[0],
                delta: pairs(s[1]),
                residualMm: (s as [number, number[], number])[2] / 1000,
              },
      ),
    })),
  }));
  return {
    format: 'GRBPWR-GRADEMAP',
    version: 1,
    builder: j.b,
    sizes: j.s,
    baseSizeId: j.base,
    pieces,
  };
}

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    bin += String.fromCharCode(...bytes.subarray(i, Math.min(bytes.length, i + 0x8000)));
  return btoa(bin);
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export type GradeMapBytes = {
  json: string;
  /** UTF-8 JSON size. */
  rawBytes: number;
  /** deflate-raw size. */
  deflatedBytes: number;
  base64: string;
  /** Bytes the 999 comment block would add to a DXF (LF line ends). */
  inFileBytes: number;
};

export function encodeGradeMap(file: GmFile): GradeMapBytes {
  const json = canonicalJson(file);
  const raw = strToU8(json);
  const deflated = deflateSync(raw, { level: 9 });
  const base64 = toBase64(deflated);
  const n = Math.max(1, Math.ceil(base64.length / LINE_MAX));
  let inFile = 0;
  for (let i = 0; i < n; i++) {
    const chunk = base64.slice(i * LINE_MAX, (i + 1) * LINE_MAX);
    inFile += `999\n${GRADEMAP_TAG} ${GRADEMAP_FORM} ${i + 1}/${n} ${chunk}\n`.length;
  }
  return {
    json,
    rawBytes: raw.length,
    deflatedBytes: deflated.length,
    base64,
    inFileBytes: inFile,
  };
}

export function decodeGradeMap(base64: string): GmFile {
  return parseJson(strFromU8(inflateSync(fromBase64(base64))));
}

/** The bytes the DXF block carries (UTF-8 canonical JSON; the block deflates them itself). */
export function gradeMapBytes(file: GmFile): Uint8Array {
  return strToU8(canonicalJson(file));
}

/** A map from the bytes of a DXF block. Throws on anything that is not a v1 map. */
export function gradeMapFromBytes(bytes: Uint8Array): GmFile {
  return parseJson(strFromU8(bytes));
}
