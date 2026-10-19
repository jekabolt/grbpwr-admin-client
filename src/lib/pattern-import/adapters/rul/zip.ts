// RUL · a ZIP that carries exactly one base DXF and one text RUL (an AAMA/ASTM export packed by the
// CAD or by the operator) → the two files. Anything else in a ZIP keeps its F17 refusal. Bounded:
// the entry list comes from the central directory (no inflating), the two entries are inflated
// only when their declared sizes fit, and the inflated sizes are checked against what was declared.

import { unzipSync } from 'fflate';
import { zipEntryNames } from '../sniff/native';
import { looksLikeRul } from './parse';

/** At most this many bytes inflated from one ZIP (the DXF and the RUL together). */
export const RUL_ZIP_MAX_BYTES = 64 * 1024 * 1024;

export type ZipPair = {
  dxf: { name: string; bytes: ArrayBuffer };
  rul: { name: string; bytes: ArrayBuffer };
};

const ext = (n: string) => /\.([a-z0-9]+)$/i.exec(n)?.[1].toLowerCase() ?? '';
const junk = (n: string) => n.endsWith('/') || /(^|\/)(__MACOSX\/|\.)/.test(n);
const READABLE = new Set([
  'dxf',
  'pdf',
  'plt',
  'hpgl',
  'hpg',
  'cut',
  'svg',
  'ai',
  'png',
  'jpg',
  'jpeg',
  'tif',
  'tiff',
  'rul',
]);
const NATIVE = new Set(['pce', 'mdl', 'iba', 'vet', 'pds', 'zprj', 'zpac']);

/**
 * The DXF + RUL inside a ZIP, or null when the ZIP is not exactly that (no RUL, several DXF or
 * RUL, other pattern files, CAD storage files, a binary .rul) — the caller then refuses it as F17
 * does. Throws only when the archive claims a pair but is damaged or too large to open.
 */
export function zipRulPair(bytes: ArrayBuffer): ZipPair | null {
  const u = new Uint8Array(bytes);
  if (!(u[0] === 0x50 && u[1] === 0x4b)) return null;
  const names = zipEntryNames(u);
  if (!names) return null;
  const files = names.filter((n) => !junk(n));
  const dxf = files.filter((n) => ext(n) === 'dxf');
  const rul = files.filter((n) => ext(n) === 'rul');
  if (dxf.length !== 1 || rul.length !== 1) return null;
  if (files.some((n) => NATIVE.has(ext(n)))) return null; // AccuMark / Modaris storage
  if (files.some((n) => READABLE.has(ext(n)) && n !== dxf[0] && n !== rul[0])) return null;
  let declared = 0;
  const want = new Set([dxf[0], rul[0]]);
  let out: Record<string, Uint8Array>;
  try {
    out = unzipSync(u, {
      filter: (f) => {
        if (!want.has(f.name)) return false;
        declared += f.originalSize;
        if (declared > RUL_ZIP_MAX_BYTES)
          throw new Error(`the DXF and RUL inside are larger than ${RUL_ZIP_MAX_BYTES >> 20} MB`);
        return true;
      },
    });
  } catch (e) {
    throw new Error(`the ZIP could not be opened: ${e instanceof Error ? e.message : String(e)}`);
  }
  const d = out[dxf[0]];
  const r = out[rul[0]];
  if (!d || !r) throw new Error('the ZIP lists a DXF and a RUL but they could not be read');
  const ab = (x: Uint8Array) => x.slice().buffer as ArrayBuffer;
  if (!looksLikeRul(ab(r))) return null; // an AccuMark binary .rul: not ours to read
  const base = (n: string) => n.split('/').pop() ?? n;
  return { dxf: { name: base(dxf[0]), bytes: ab(d) }, rul: { name: base(rul[0]), bytes: ab(r) } };
}
