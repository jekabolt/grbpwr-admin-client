// F17 · Files that are not drawings we read, told apart so the refusal says what to export.
// Magic bytes first, then a ZIP's directory listing (names only — the central directory is read,
// no entry is inflated), then the extension. Pure and worker-safe.

import type { UnsupportedCode } from './errors';
import { dwgRelease } from './errors';

export type NativeRefusal = { refusal: UnsupportedCode; why: string };

/** Extension → refusal, for files whose content gives no readable signature (vendor binaries). */
const NATIVE_EXT: Record<string, UnsupportedCode> = {
  dwg: 'dwg',
  zprj: 'clo-native',
  zpac: 'clo-native',
  avt: 'clo-native',
  zfab: 'clo-native',
  pce: 'gerber-accumark',
  rul: 'gerber-accumark',
  mdl: 'cad-model-mdl',
  iba: 'lectra-modaris',
  vet: 'lectra-modaris',
  pds: 'optitex-native',
  mrk: 'optitex-native',
  val: 'valentina-pattern',
  sm2d: 'valentina-pattern',
  vit: 'valentina-measurements',
  vst: 'valentina-measurements',
  smis: 'valentina-measurements',
  smms: 'valentina-measurements',
  doc: 'office-document',
  docx: 'office-document',
  xls: 'office-document',
  xlsx: 'office-document',
  ppt: 'office-document',
  pptx: 'office-document',
  odt: 'office-document',
  ods: 'office-document',
  odp: 'office-document',
  pages: 'office-document',
  numbers: 'office-document',
  heic: 'image-unsupported',
  heif: 'image-unsupported',
  psd: 'image-unsupported',
  zip: 'zip-archive',
};

/** Refusal from the file NAME alone (before reading) — for the files step's "read as" column.
 * null = an extension we either read or do not know. */
export function refusalForName(name: string): UnsupportedCode | null {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return m ? NATIVE_EXT[m[1].toLowerCase()] ?? null : null;
}

const has = (u: Uint8Array, sig: number[], at = 0) =>
  u.length >= at + sig.length && sig.every((b, i) => u[at + i] === b);

/**
 * Entry names of a ZIP from its central directory (EOCD found in the last 64 KiB + 22 bytes;
 * ZIP64 locator honoured when the 32-bit fields are saturated). null = not a parseable ZIP.
 * Reads at most `max` names; never inflates anything.
 */
export function zipEntryNames(u: Uint8Array, max = 5000): string[] | null {
  const dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
  let eocd = -1;
  for (let i = u.length - 22; i >= Math.max(0, u.length - 22 - 0xffff); i--) {
    if (u[i] === 0x50 && u[i + 1] === 0x4b && u[i + 2] === 0x05 && u[i + 3] === 0x06) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  let count = dv.getUint16(eocd + 10, true);
  let cdOff = dv.getUint32(eocd + 16, true);
  if ((count === 0xffff || cdOff === 0xffffffff) && eocd >= 20) {
    const loc = eocd - 20; // ZIP64 end-of-central-directory locator
    if (has(u, [0x50, 0x4b, 0x06, 0x07], loc)) {
      const z64 = Number(dv.getBigUint64(loc + 8, true));
      if (z64 + 56 <= u.length && has(u, [0x50, 0x4b, 0x06, 0x06], z64)) {
        count = Number(dv.getBigUint64(z64 + 32, true));
        cdOff = Number(dv.getBigUint64(z64 + 48, true));
      }
    }
  }
  const names: string[] = [];
  const dec = new TextDecoder('utf-8');
  let p = cdOff;
  for (let k = 0; k < count && names.length < max; k++) {
    if (p + 46 > u.length || !has(u, [0x50, 0x4b, 0x01, 0x02], p)) break;
    const nLen = dv.getUint16(p + 28, true);
    const xLen = dv.getUint16(p + 30, true);
    const cLen = dv.getUint16(p + 32, true);
    if (p + 46 + nLen > u.length) break;
    names.push(dec.decode(u.subarray(p + 46, p + 46 + nLen)));
    p += 46 + nLen + xLen + cLen;
  }
  return names;
}

const extOf = (n: string) => /\.([a-z0-9]+)$/i.exec(n)?.[1].toLowerCase() ?? '';

/** What a ZIP holds → the refusal that tells the operator what to do with it. */
export function classifyZip(names: string[], ext: string): NativeRefusal {
  const exts = new Map<string, number>();
  for (const n of names) {
    if (n.endsWith('/')) continue;
    const e = extOf(n);
    if (e) exts.set(e, (exts.get(e) ?? 0) + 1);
  }
  const list = (keys: string[]) =>
    keys
      .filter((k) => exts.has(k))
      .map((k) => `${exts.get(k)} × .${k}`)
      .join(', ');
  const any = (keys: string[]) => keys.some((k) => exts.has(k));

  // The container's own extension wins when it names a vendor format (CLO files are ZIPs).
  const byExt = NATIVE_EXT[ext];
  if (byExt && byExt !== 'zip-archive' && byExt !== 'office-document')
    return { refusal: byExt, why: `.${ext} file` };

  if (names.includes('[Content_Types].xml') || names.includes('mimetype')) {
    const kind = names.some((n) => n.startsWith('word/'))
      ? 'Word document'
      : names.some((n) => n.startsWith('xl/'))
        ? 'Excel workbook'
        : names.some((n) => n.startsWith('ppt/'))
          ? 'PowerPoint deck'
          : names.includes('mimetype')
            ? 'OpenDocument file'
            : null;
    if (kind) return { refusal: 'office-document', why: kind };
  }
  if (any(['zprj', 'zpac', 'avt', 'zfab']))
    return {
      refusal: 'clo-native',
      why: `ZIP of CLO files: ${list(['zprj', 'zpac', 'avt', 'zfab'])}`,
    };
  if (any(['pce', 'rul']))
    return {
      refusal: 'gerber-accumark',
      why: `AccuMark export: ${list(['pce', 'mdl', 'rul', 'mrk', 'ord'])}`,
    };
  if (any(['iba', 'vet']))
    return {
      refusal: 'lectra-modaris',
      why: `ZIP of Modaris files: ${list(['mdl', 'iba', 'vet'])}`,
    };
  if (any(['pds']))
    return { refusal: 'optitex-native', why: `ZIP of Optitex files: ${list(['pds', 'mrk'])}` };
  if (any(['mdl'])) return { refusal: 'cad-model-mdl', why: `ZIP of models: ${list(['mdl'])}` };
  if (any(['val', 'sm2d']))
    return { refusal: 'valentina-pattern', why: `ZIP of ${list(['val', 'sm2d'])}` };
  const readable = [
    'dxf',
    'pdf',
    'plt',
    'hpgl',
    'cut',
    'svg',
    'ai',
    'png',
    'jpg',
    'jpeg',
    'tif',
    'tiff',
  ];
  if (any(readable)) return { refusal: 'zip-archive', why: `inside: ${list(readable)}` };
  return {
    refusal: 'zip-archive',
    why: names.length ? `${names.length} entries, no pattern files` : 'empty archive',
  };
}

/**
 * Native CAD / office / image containers by magic, ZIP listing, XML root and extension.
 * Called by `sniffFormat` only AFTER every format we read failed to match, so a DXF renamed
 * `.mdl` is still read as DXF. null = nothing recognised (the caller says `unknown-format`).
 */
export function classifyNative(u: Uint8Array, ext: string, head: string): NativeRefusal | null {
  // DWG: "AC10xx" (R13+ also AC1xxx) at offset 0.
  const dwg = /^AC1\d{3}/.exec(head);
  if (dwg && (u.length < 7 || u[6] === 0 || /^AC10\d\d/.test(head)))
    return { refusal: 'dwg', why: `DWG ${dwgRelease(dwg[0])}` };

  // ZIP (local header, or an empty archive's EOCD).
  if (has(u, [0x50, 0x4b, 0x03, 0x04]) || has(u, [0x50, 0x4b, 0x05, 0x06])) {
    const names = zipEntryNames(u);
    if (names) return classifyZip(names, ext);
    return { refusal: NATIVE_EXT[ext] ?? 'zip-archive', why: 'ZIP without a readable directory' };
  }

  // OLE compound file (legacy .doc/.xls/.ppt; several CAD vendors use it too).
  if (has(u, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) {
    const byExt = NATIVE_EXT[ext];
    return {
      refusal: byExt ?? 'office-document',
      why: byExt ? `.${ext} (OLE compound file)` : 'OLE compound file (legacy Office)',
    };
  }

  // Images the raster adapter does not decode.
  if (
    head.slice(4, 8) === 'ftyp' &&
    /^(heic|heix|hevc|heim|heis|mif1|msf1|avif)/.test(head.slice(8, 12))
  )
    return { refusal: 'image-unsupported', why: `HEIF/HEIC (${head.slice(8, 12)})` };
  if (head.startsWith('8BPS')) return { refusal: 'image-unsupported', why: 'Photoshop PSD' };

  // Valentina / Seamly2D XML: <pattern> (.val/.sm2d), <vit>/<vst>/<smis>/<smms> (measurements).
  const root = /^\s*(?:<\?xml[^>]*\?>\s*)?(?:<!--[\s\S]*?-->\s*)*<([a-z0-9]+)[\s>]/i.exec(
    head.startsWith('\xef\xbb\xbf') ? head.slice(3) : head,
  )?.[1];
  if (root) {
    const r = root.toLowerCase();
    if (r === 'pattern' && (ext === 'val' || ext === 'sm2d' || /<draw\b|<calculation\b/.test(head)))
      return { refusal: 'valentina-pattern', why: `<pattern> XML (.${ext || 'no extension'})` };
    if (r === 'vit' || r === 'vst' || r === 'smis' || r === 'smms')
      return { refusal: 'valentina-measurements', why: `<${r}> XML` };
  }

  // Vendor binaries with no signature we can rely on: the extension decides.
  const byExt = NATIVE_EXT[ext];
  if (byExt) return { refusal: byExt, why: `.${ext} file` };
  return null;
}
