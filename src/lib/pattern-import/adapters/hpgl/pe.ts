// F12 · HP-GL/2 PE (Polyline Encoded) decoder.
//
// Body grammar (HP-GL/2 reference, same reading as GhostPCL `pgpoly.c`):
//   flags  `:` pen select (next value) · `<` next coordinate pair is a pen-up move ·
//          `>` fractional bits (next value) · `=` next pair is absolute · `7` 7-bit mode
//   values little-endian digit strings. 8-bit (base 64): digit chars 63–126 (v = c−63),
//          terminal digit chars 191–254 (v = c−191). 7-bit (base 32): 63–94 (c−63),
//          terminal 95–126 (c−95). Chars ≤ 32 and 127 are ignored.
//   sign   decoded = v odd ? −(v>>1) : v>>1 — applies to every value (pen, frac, coordinates).
//   coords pairs, relative to the current point unless `=`, divided by 2^fracBits.

export type PeOp =
  | { k: 'pen'; pen: number }
  | { k: 'move'; x: number; y: number; abs: boolean }
  | { k: 'draw'; x: number; y: number; abs: boolean };

export class PeError extends Error {}

export function decodePe(body: string): PeOp[] {
  const ops: PeOp[] = [];
  let sevenBit = false;
  let frac = 0;
  let i = 0;
  const n = body.length;

  const readValue = (): number => {
    let value = 0;
    let mul = 1;
    for (;;) {
      if (i >= n) throw new PeError('value runs past the end of PE');
      const ch = body.charCodeAt(i++) & 0xff;
      const c7 = ch & 127;
      if (c7 <= 32 || c7 === 127) continue;
      if (sevenBit) {
        const v = ch - 63;
        if (v < 0 || v > 63) throw new PeError(`bad 7-bit digit ${ch}`);
        value += (v & 31) * mul;
        mul *= 32;
        if (v & 32) break;
      } else {
        const v = ch - 63;
        if (v < 0 || v > 191 || (v > 63 && v < 128)) throw new PeError(`bad 8-bit digit ${ch}`);
        value += (v & 63) * mul;
        mul *= 64;
        if (v & 128) break;
      }
    }
    return value % 2 === 1 ? -(value - 1) / 2 : value / 2;
  };

  let penUpNext = false;
  let absNext = false;
  while (i < n) {
    const ch = body.charCodeAt(i) & 0xff;
    const c7 = ch & 127;
    if (c7 <= 32 || c7 === 127) {
      i++;
      continue;
    }
    if (ch === 0x3a /* : */) {
      i++;
      ops.push({ k: 'pen', pen: readValue() });
      continue;
    }
    if (ch === 0x3c /* < */) {
      i++;
      penUpNext = true;
      continue;
    }
    if (ch === 0x3e /* > */) {
      i++;
      frac = readValue();
      if (Math.abs(frac) > 26) throw new PeError(`fractional bits ${frac}`);
      continue;
    }
    if (ch === 0x3d /* = */) {
      i++;
      absNext = true;
      continue;
    }
    if (ch === 0x37 /* 7 */) {
      i++;
      sevenBit = true;
      continue;
    }
    if (ch < 63) throw new PeError(`unexpected byte ${ch}`);
    const div = Math.pow(2, frac);
    const x = readValue() / div;
    const y = readValue() / div;
    ops.push({ k: penUpNext ? 'move' : 'draw', x, y, abs: absNext });
    penUpNext = false;
    absNext = false;
  }
  return ops;
}
