import { fetchMediaBlob } from 'lib/features/media-blob';

/**
 * ═══ THE PICTURE'S OWN ORIENTATION, READ FROM ITS BYTES (G-03 Codex r2 MAJOR) ═════════════════════
 *
 * The editor paints on the picture AS THE BROWSER SHOWS IT, and the browser applies the file's EXIF
 * Orientation (`image-orientation: from-image`, the default — and `none` is ignored for a cross-origin
 * picture, so it cannot be switched off here). The server reads no EXIF anywhere (`bucket/convert.go`
 * decodes with `image/jpeg`, `png`, `webp`): the stored size, the compressed copy it derives and the
 * pixels it crops and masks are the file's RAW grid. So a file whose tag says anything but «as stored»
 * is shown in another grid than the one the zone lands on — turned (5–8), or mirrored or upside down
 * (2–4) — and the zone would be painted by the server somewhere else, and charged.
 *
 * The r1 fix guessed it from the shown proportion against the stored one; that cannot see a square
 * picture turned, nor a 180°, and it refused a slightly-cropped copy that was not turned at all. So the
 * tag itself is read: the SHOWN file is fetched (`fetchMediaBlob`: direct, then the media proxy) and
 * its EXIF parsed — JPEG APP1, PNG `eXIf`, WebP `EXIF`, the three formats stored verbatim. Its tag is
 * the whole answer: a copy the server derived carries no EXIF and is shown in its raw grid, which is
 * the stored grid; a verbatim file carries its tag, and the browser obeys it.
 */

/** «As stored» — the one orientation whose shown grid is the server's grid. */
export const ORIENTATION_AS_STORED = 1;

/** The shown picture's orientation: a tag (1–8), still being read, or not readable at all. */
export type PictureOrientation = number | 'reading' | 'unknown';

/** Whether the browser shows this file in another grid than the one the server paints on. */
export const orientationMoves = (orientation: number): boolean =>
  orientation >= 2 && orientation <= 8;

/**
 * THE EXIF ORIENTATION OF AN IMAGE FILE — 1 when the file states none (or is not JPEG, PNG or WebP),
 * the tag's value (1–8) when it does. Never throws; a truncated or malformed block reads as none.
 */
export function exifOrientation(bytes: Uint8Array): number {
  try {
    const tiff = exifBlock(bytes);
    return tiff ? tiffOrientation(tiff) : ORIENTATION_AS_STORED;
  } catch {
    return ORIENTATION_AS_STORED;
  }
}

const ascii = (b: Uint8Array, at: number, n: number): string =>
  String.fromCharCode(...b.subarray(at, at + n));

/** The TIFF block holding the EXIF of a JPEG, PNG or WebP file, or null when there is none. */
function exifBlock(b: Uint8Array): Uint8Array | null {
  // JPEG: SOI, then marker segments until the scan; the EXIF is an APP1 «Exif\0\0».
  if (b[0] === 0xff && b[1] === 0xd8) {
    let at = 2;
    while (at + 4 <= b.length) {
      if (b[at] !== 0xff) return null;
      const marker = b[at + 1];
      if (marker === 0xff) {
        at++; // fill byte
        continue;
      }
      if (marker === 0xda || marker === 0xd9) return null; // the scan, the end: no EXIF before them
      const len = (b[at + 2] << 8) | b[at + 3];
      if (len < 2) return null;
      if (marker === 0xe1 && ascii(b, at + 4, 6) === 'Exif\0\0')
        return b.subarray(at + 10, at + 2 + len);
      at += 2 + len;
    }
    return null;
  }
  // PNG: signature, then length · type · data · crc chunks; `eXIf` is a bare TIFF block.
  if (ascii(b, 1, 3) === 'PNG' && b[0] === 0x89) {
    let at = 8;
    while (at + 8 <= b.length) {
      const len = ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0;
      const type = ascii(b, at + 4, 4);
      if (type === 'eXIf') return b.subarray(at + 8, at + 8 + len);
      if (type === 'IEND') return null;
      at += 12 + len;
    }
    return null;
  }
  // WebP: RIFF · size · WEBP, then fourcc · little-endian size · data (padded to even) chunks.
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') {
    let at = 12;
    while (at + 8 <= b.length) {
      const type = ascii(b, at, 4);
      const len = (b[at + 4] | (b[at + 5] << 8) | (b[at + 6] << 16) | (b[at + 7] << 24)) >>> 0;
      if (type === 'EXIF') {
        const data = b.subarray(at + 8, at + 8 + len);
        // Some writers keep JPEG's «Exif\0\0» in front of the TIFF block.
        return ascii(data, 0, 6) === 'Exif\0\0' ? data.subarray(6) : data;
      }
      at += 8 + len + (len & 1);
    }
    return null;
  }
  return null;
}

/** Tag 0x0112 of IFD0 in a TIFF block (either byte order); 1 when it is absent or out of range. */
function tiffOrientation(t: Uint8Array): number {
  const order = ascii(t, 0, 2);
  if (order !== 'II' && order !== 'MM') return ORIENTATION_AS_STORED;
  const little = order === 'II';
  const u16 = (at: number) => {
    if (at + 2 > t.length) throw new RangeError('short');
    return little ? t[at] | (t[at + 1] << 8) : (t[at] << 8) | t[at + 1];
  };
  const u32 = (at: number) => {
    if (at + 4 > t.length) throw new RangeError('short');
    return little
      ? (t[at] | (t[at + 1] << 8) | (t[at + 2] << 16) | (t[at + 3] << 24)) >>> 0
      : ((t[at] << 24) | (t[at + 1] << 16) | (t[at + 2] << 8) | t[at + 3]) >>> 0;
  };
  if (u16(2) !== 42) return ORIENTATION_AS_STORED;
  const ifd = u32(4);
  const count = u16(ifd);
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12;
    if (u16(entry) !== 0x0112) continue;
    // SHORT (type 3), one value, stored in the first two bytes of the value field.
    const value = u16(entry + 2) === 3 ? u16(entry + 8) : 0;
    return value >= 1 && value <= 8 ? value : ORIENTATION_AS_STORED;
  }
  return ORIENTATION_AS_STORED;
}

const read = new Map<string, Promise<number>>();

/** How long reading the shown file may take before it counts as unreadable (G-03 Codex r3 MAJOR). */
export const ORIENTATION_DEADLINE_MS = 15_000;

/** The file could not be read in time: the fetch is aborted and the retouch refused (not guessed). */
export class OrientationTimeout extends Error {
  constructor(ms: number) {
    super(`the picture's file did not arrive in ${Math.round(ms / 1000)} s`);
    this.name = 'OrientationTimeout';
  }
}

/**
 * The orientation of the file at `url`, read once per address for the page's life. Rejects when the
 * file cannot be fetched at all (the caller refuses the retouch rather than guess); a failure is not
 * remembered, so the next open asks again.
 *
 * ⚠ THE READ HAS A DEADLINE (G-03 Codex r3 MAJOR). `fetch` has none: a direct fetch or a proxy that
 * never answered held the picture on «checking the picture…», and — the pending promise being cached
 * — every reopen waited on the same dead request until a reload. After `deadlineMs` the fetch is
 * aborted, the read rejects (the editor says the file could not be read) and the entry is dropped,
 * so closing and reopening the editor reads again.
 */
export function orientationOf(url: string, deadlineMs = ORIENTATION_DEADLINE_MS): Promise<number> {
  let got = read.get(url);
  if (!got) {
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    got = Promise.race([
      fetchMediaBlob(url, abort.signal)
        .then((blob) => blob.arrayBuffer())
        .then((buf) => exifOrientation(new Uint8Array(buf))),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new OrientationTimeout(deadlineMs));
          abort.abort();
        }, deadlineMs);
      }),
    ]).finally(() => clearTimeout(timer));
    read.set(url, got);
    const mine = got;
    got.catch(() => {
      if (read.get(url) === mine) read.delete(url);
    });
  }
  return got;
}
