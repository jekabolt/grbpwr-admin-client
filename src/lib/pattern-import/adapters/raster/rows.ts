// RASTER · row-by-row decoders for an image pdf.js drops for its size (big-image.ts). Memory is
// one band of rows, never the image: a baseline JPEG is entropy-decoded MCU row by MCU row (the
// inverse DCT runs only on blocks inside the requested window, and decoding stops below it); a
// Flate (or unfiltered) image is inflated as a stream and cancelled below the window. Both run in
// the worker and in node probes alike (DecompressionStream, no canvas).
//
// Supported: JPEG baseline / extended Huffman (SOF0/SOF1), 8-bit, 1 or 3 components, any
// sampling, restart intervals, one interleaved scan; Flate / none with predictor 1, 2 or ≥ 10,
// 8 bits (1–3 colours) or 1 bit gray. Anything else is named by `RowsUnsupported` and the file is
// refused as before — never decoded wrong.

export class RowsUnsupported extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'RowsUnsupported';
  }
}

export type RowSink = (y: number, row: Uint8Array) => void;

export interface RowSource {
  readonly width: number;
  readonly height: number;
  readonly channels: 1 | 3;
  /** Rows y0 ≤ y < y1, each cut to x0 ≤ x < x1, in order. */
  read(y0: number, y1: number, x0: number, x1: number, sink: RowSink): Promise<void>;
}

// ── JPEG ─────────────────────────────────────────────────────────────────────────────────────

const ZIGZAG = new Int32Array([
  0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20,
  13, 6, 7, 14, 21, 28, 35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51, 58, 59, 52,
  45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63,
]);

/** cos table for the separable inverse DCT: C[x·8 + u] = c(u)/2 · cos((2x+1)uπ/16). */
const IDCT = (() => {
  const t = new Float32Array(64);
  for (let x = 0; x < 8; x++)
    for (let u = 0; u < 8; u++)
      t[x * 8 + u] = (u === 0 ? Math.SQRT1_2 : 1) * 0.5 * Math.cos(((2 * x + 1) * u * Math.PI) / 16);
  return t;
})();

type Huff = { lut: Uint16Array; maxcode: Int32Array; valptr: Int32Array; mincode: Int32Array; vals: Uint8Array };

function buildHuff(counts: Uint8Array, vals: Uint8Array): Huff {
  const lut = new Uint16Array(512); // 9-bit lookahead: (len << 8) | symbol, 0 = slow path
  const maxcode = new Int32Array(18).fill(-1);
  const valptr = new Int32Array(17);
  const mincode = new Int32Array(17);
  let code = 0;
  let k = 0;
  for (let len = 1; len <= 16; len++) {
    const n = counts[len - 1];
    if (n) {
      valptr[len] = k;
      mincode[len] = code;
      for (let i = 0; i < n; i++, k++, code++) {
        if (len <= 9) {
          const shift = 9 - len;
          for (let f = 0; f < 1 << shift; f++) lut[(code << shift) | f] = (len << 8) | vals[k];
        }
      }
      maxcode[len] = code - 1;
    }
    code <<= 1;
  }
  maxcode[17] = 0x7fffffff;
  return { lut, maxcode, valptr, mincode, vals };
}

type Comp = {
  id: number;
  h: number;
  v: number;
  tq: number;
  dc: Huff | null;
  ac: Huff | null;
  /** Blocks per line in the band (MCUs per line × h). */
  bpl: number;
  band: Uint8Array;
  pred: number;
};

/** The entropy decoder's state at the start of an MCU row (to resume a later window there). */
type Checkpoint = { pos: number; buf: number; cnt: number; pad: number; preds: number[]; mcu: number };

export class JpegRows implements RowSource {
  readonly width: number;
  readonly height: number;
  readonly channels: 1 | 3;
  private readonly comps: Comp[] = [];
  private readonly q: Int32Array[] = [];
  private readonly hmax: number;
  private readonly vmax: number;
  private readonly mcusX: number;
  private readonly mcusY: number;
  private readonly restart: number;
  private readonly scanAt: number;
  private readonly ycc: boolean;
  private readonly checkpoints: (Checkpoint | undefined)[];
  // bit reader
  private pos = 0;
  private buf = 0;
  private cnt = 0;
  /** Zero bits fed after the data's marker / end (the lowest `pad` bits of `buf`). */
  private pad = 0;
  private marker = false;

  /** `colorTransform`: the PDF's /DecodeParms /ColorTransform when given. */
  constructor(
    private readonly d: Uint8Array,
    colorTransform?: number,
  ) {
    if (d[0] !== 0xff || d[1] !== 0xd8) throw new RowsUnsupported('the JPEG data has no start marker');
    let p = 2;
    const dcT: Huff[] = [];
    const acT: Huff[] = [];
    let frame = false;
    let adobe: number | null = null;
    let restart = 0;
    let width = 0;
    let height = 0;
    for (;;) {
      while (p < d.length && d[p] !== 0xff) p++;
      while (p < d.length && d[p] === 0xff) p++;
      if (p >= d.length) throw new RowsUnsupported('the JPEG data ends before its scan');
      const m = d[p++];
      if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7) || m === 0x01) continue;
      const len = (d[p] << 8) | d[p + 1];
      const seg = p + 2;
      const end = p + len;
      if (len < 2 || end > d.length) throw new RowsUnsupported('a JPEG segment runs past the data');
      if (m === 0xc0 || m === 0xc1) {
        if (d[seg] !== 8) throw new RowsUnsupported(`${d[seg]}-bit JPEG samples`);
        height = (d[seg + 1] << 8) | d[seg + 2];
        width = (d[seg + 3] << 8) | d[seg + 4];
        const n = d[seg + 5];
        if (n !== 1 && n !== 3) throw new RowsUnsupported(`a JPEG with ${n} components`);
        for (let k = 0; k < n; k++) {
          const b = seg + 6 + 3 * k;
          const h = d[b + 1] >> 4;
          const v = d[b + 1] & 15;
          if (h < 1 || h > 4 || v < 1 || v > 4) throw new RowsUnsupported('JPEG sampling factors');
          this.comps.push({ id: d[b], h, v, tq: d[b + 2] & 3, dc: null, ac: null, bpl: 0, band: new Uint8Array(0), pred: 0 });
        }
        frame = true;
      } else if (m >= 0xc2 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        throw new RowsUnsupported(
          m === 0xc2 ? 'a progressive JPEG' : m === 0xc3 ? 'a lossless JPEG' : 'an arithmetic-coded or hierarchical JPEG',
        );
      } else if (m === 0xdb) {
        for (let b = seg; b < end; ) {
          const pq = d[b] >> 4;
          const tq = d[b] & 15;
          const t = new Int32Array(64);
          for (let k = 0; k < 64; k++)
            t[k] = pq ? (d[b + 1 + 2 * k] << 8) | d[b + 2 + 2 * k] : d[b + 1 + k];
          this.q[tq & 3] = t;
          b += 1 + (pq ? 128 : 64);
        }
      } else if (m === 0xc4) {
        for (let b = seg; b < end; ) {
          const tc = d[b] >> 4;
          const th = d[b] & 15;
          const counts = d.subarray(b + 1, b + 17);
          let n = 0;
          for (let k = 0; k < 16; k++) n += counts[k];
          const t = buildHuff(counts, d.subarray(b + 17, b + 17 + n));
          (tc ? acT : dcT)[th & 3] = t;
          b += 17 + n;
        }
      } else if (m === 0xdd) {
        restart = (d[seg] << 8) | d[seg + 1];
      } else if (m === 0xee && d[seg] === 0x41 && d[seg + 1] === 0x64 && d[seg + 4] === 0x65) {
        adobe = d[seg + 11]; // "Adobe": transform flag
      } else if (m === 0xda) {
        if (!frame) throw new RowsUnsupported('a JPEG scan before its frame header');
        const ns = d[seg];
        if (ns !== this.comps.length)
          throw new RowsUnsupported('a JPEG whose components are in separate scans');
        for (let k = 0; k < ns; k++) {
          // the MCU's blocks come in scan order — read here in frame order, so they must agree
          const c = this.comps[k];
          if (c.id !== d[seg + 1 + 2 * k])
            throw new RowsUnsupported('a JPEG scan that orders its components unlike its frame');
          c.dc = dcT[d[seg + 2 + 2 * k] >> 4] ?? null;
          c.ac = acT[d[seg + 2 + 2 * k] & 15] ?? null;
          if (!c.dc || !c.ac || !this.q[c.tq]) throw new RowsUnsupported('a JPEG table is missing');
        }
        const ss = d[seg + 1 + 2 * ns];
        const se = d[seg + 2 + 2 * ns];
        const a = d[seg + 3 + 2 * ns];
        if (ss !== 0 || se !== 63 || a !== 0) throw new RowsUnsupported('a JPEG spectral selection');
        this.scanAt = end;
        break;
      } else if (m === 0xd9) throw new RowsUnsupported('the JPEG data ends before its scan');
      p = end;
    }
    if (!width || !height) throw new RowsUnsupported('a JPEG without its size (DNL)');
    this.width = width;
    this.height = height;
    this.restart = restart;
    this.hmax = Math.max(...this.comps.map((c) => c.h));
    this.vmax = Math.max(...this.comps.map((c) => c.v));
    this.mcusX = Math.ceil(width / (8 * this.hmax));
    this.mcusY = Math.ceil(height / (8 * this.vmax));
    for (const c of this.comps) {
      c.bpl = this.mcusX * c.h;
      c.band = new Uint8Array(c.bpl * 8 * c.v * 8);
    }
    this.channels = this.comps.length === 1 ? 1 : 3;
    // pdf.js / libjpeg: the PDF's ColorTransform wins, then Adobe's flag, then component ids R G B
    const rgbIds = this.comps.length === 3 && this.comps.map((c) => c.id).join() === '82,71,66';
    this.ycc =
      this.comps.length === 3 &&
      (colorTransform !== undefined ? colorTransform !== 0 : adobe !== null ? adobe !== 0 : !rgbIds);
    this.checkpoints = new Array(this.mcusY);
  }

  private fill(): void {
    while (this.cnt <= 24) {
      let b = 0;
      if (!this.marker && this.pos < this.d.length) {
        b = this.d[this.pos];
        if (b === 0xff) {
          const n = this.d[this.pos + 1];
          if (n === 0) this.pos += 2;
          else {
            this.marker = true; // a marker: feed zeros, do not consume it
            b = 0;
            this.pad += 8;
          }
        } else this.pos++;
      } else {
        this.marker = true;
        this.pad += 8;
      }
      this.buf = ((this.buf << 8) | b) >>> 0;
      this.cnt += 8;
    }
  }

  /** Bits consumed past the real data (a cut-short or damaged stream): refused, never decoded. */
  private overrun(): never {
    throw new RowsUnsupported('the JPEG data ends early (damaged data)');
  }

  private bits(n: number): number {
    if (this.cnt < n) this.fill();
    this.cnt -= n;
    if (this.cnt < this.pad) this.overrun();
    const v = (this.buf >>> this.cnt) & ((1 << n) - 1);
    this.buf &= this.cnt ? (1 << this.cnt) - 1 : 0;
    return v;
  }

  private sym(t: Huff): number {
    if (this.cnt < 16) this.fill();
    const e = t.lut[(this.buf >>> (this.cnt - 9)) & 511];
    if (e) {
      this.cnt -= e >> 8;
      if (this.cnt < this.pad) this.overrun();
      this.buf &= this.cnt ? (1 << this.cnt) - 1 : 0;
      return e & 255;
    }
    for (let len = 10; len <= 16; len++) {
      const code = (this.buf >>> (this.cnt - len)) & ((1 << len) - 1);
      if (code <= t.maxcode[len]) {
        this.cnt -= len;
        if (this.cnt < this.pad) this.overrun();
        this.buf &= this.cnt ? (1 << this.cnt) - 1 : 0;
        return t.vals[t.valptr[len] + code - t.mincode[len]];
      }
    }
    throw new RowsUnsupported('a JPEG Huffman code that is not in its table (damaged data)');
  }

  private static extend(v: number, s: number): number {
    return v < 1 << (s - 1) ? v - (1 << s) + 1 : v;
  }

  /** Decode one block into `coef` (natural order, dequantized); returns whether any AC ≠ 0. */
  private block(c: Comp, coef: Float32Array, keep: boolean): boolean {
    const q = this.q[c.tq];
    const t = this.sym(c.dc!);
    const diff = t ? JpegRows.extend(this.bits(t), t) : 0;
    c.pred += diff;
    if (keep) {
      coef.fill(0);
      coef[0] = c.pred * q[0];
    }
    let ac = false;
    const act = c.ac!;
    for (let k = 1; k < 64; ) {
      const rs = this.sym(act);
      const s = rs & 15;
      const r = rs >> 4;
      if (!s) {
        if (r !== 15) break;
        k += 16;
        continue;
      }
      k += r;
      if (k > 63) throw new RowsUnsupported('a JPEG block runs past 64 coefficients (damaged data)');
      const v = JpegRows.extend(this.bits(s), s);
      if (keep) {
        coef[ZIGZAG[k]] = v * q[k];
        ac = true;
      }
      k++;
    }
    return ac;
  }

  private static idct(coef: Float32Array, ac: boolean, out: Uint8Array, at: number, stride: number, tmp: Float32Array): void {
    if (!ac) {
      const v = coef[0] / 8 + 128;
      const b = v <= 0 ? 0 : v >= 255 ? 255 : Math.round(v);
      for (let y = 0; y < 8; y++) out.fill(b, at + y * stride, at + y * stride + 8);
      return;
    }
    // rows: tmp[v·8 + x] = Σu C[x,u]·F[v,u]
    for (let v = 0; v < 8; v++) {
      const r = v * 8;
      for (let x = 0; x < 8; x++) {
        let s = 0;
        const cx = x * 8;
        for (let u = 0; u < 8; u++) s += IDCT[cx + u] * coef[r + u];
        tmp[r + x] = s;
      }
    }
    for (let y = 0; y < 8; y++) {
      const cy = y * 8;
      const o = at + y * stride;
      for (let x = 0; x < 8; x++) {
        let s = 128;
        for (let v = 0; v < 8; v++) s += IDCT[cy + v] * tmp[v * 8 + x];
        out[o + x] = s <= 0 ? 0 : s >= 255 ? 255 : Math.round(s);
      }
    }
  }

  private seek(row: number): number {
    // the nearest checkpoint at or before the row, else the scan's start
    for (let r = row; r > 0; r--) {
      const cp = this.checkpoints[r];
      if (cp) {
        this.pos = cp.pos;
        this.buf = cp.buf;
        this.cnt = cp.cnt;
        this.pad = cp.pad;
        this.marker = false;
        this.comps.forEach((c, k) => (c.pred = cp.preds[k]));
        return r;
      }
    }
    this.pos = this.scanAt;
    this.buf = 0;
    this.cnt = 0;
    this.pad = 0;
    this.marker = false;
    for (const c of this.comps) c.pred = 0;
    return 0;
  }

  /** After every `restart` MCUs: byte-align and read exactly the expected RSTn marker. */
  private restartAt(mcu: number): void {
    this.buf = 0;
    this.cnt = 0;
    this.pad = 0;
    this.marker = false;
    const d = this.d;
    let p = this.pos;
    while (d[p] === 0xff && d[p + 1] === 0xff) p++; // fill bytes before a marker
    const want = 0xd0 + ((mcu / this.restart - 1) & 7);
    if (d[p] !== 0xff || d[p + 1] !== want)
      throw new RowsUnsupported('a JPEG restart marker is missing or out of order (damaged data)');
    this.pos = p + 2;
    for (const c of this.comps) c.pred = 0;
  }

  async read(y0: number, y1: number, x0: number, x1: number, sink: RowSink): Promise<void> {
    const mcuH = 8 * this.vmax;
    const mcuW = 8 * this.hmax;
    const r0 = Math.floor(y0 / mcuH);
    const r1 = Math.min(this.mcusY, Math.ceil(y1 / mcuH));
    const mx0 = Math.floor(x0 / mcuW);
    const mx1 = Math.ceil(x1 / mcuW);
    const coef = new Float32Array(64);
    const tmp = new Float32Array(64);
    const nc = this.comps.length;
    const outW = x1 - x0;
    const row = new Uint8Array(outW * this.channels);
    // per component: source column of every output column
    const colOf = this.comps.map((c) => {
      const a = new Int32Array(outW);
      for (let x = 0; x < outW; x++) a[x] = Math.floor(((x0 + x) * c.h) / this.hmax);
      return a;
    });
    let r = this.seek(r0);
    let mcu = r * this.mcusX;
    for (; r < r1; r++) {
      if (!this.checkpoints[r])
        this.checkpoints[r] = { pos: this.pos, buf: this.buf, cnt: this.cnt, pad: this.pad, preds: this.comps.map((c) => c.pred), mcu };
      // the data's end (EOI, or no bytes) before an MCU row starts: it was cut short — padding
      // bits would decode as a plausible grey image, so it is refused instead
      if (this.marker && !(this.d[this.pos + 1] >= 0xd0 && this.d[this.pos + 1] <= 0xd7))
        throw new RowsUnsupported('the JPEG data ends early (damaged data)');
      const inside = r >= r0;
      for (let mx = 0; mx < this.mcusX; mx++, mcu++) {
        if (this.restart && mcu > 0 && mcu % this.restart === 0) this.restartAt(mcu);
        const keep = inside && mx >= mx0 && mx < mx1;
        for (const c of this.comps) {
          const stride = c.bpl * 8;
          for (let by = 0; by < c.v; by++)
            for (let bx = 0; bx < c.h; bx++) {
              const ac = this.block(c, coef, keep);
              if (keep)
                JpegRows.idct(coef, ac, c.band, by * 8 * stride + (mx * c.h + bx) * 8, stride, tmp);
            }
        }
      }
      if (!inside) continue;
      // the band's image rows inside the window
      const ya = Math.max(y0, r * mcuH);
      const yb = Math.min(y1, (r + 1) * mcuH, this.height);
      for (let y = ya; y < yb; y++) {
        const yy = y - r * mcuH;
        if (nc === 1) {
          const c = this.comps[0];
          const base = Math.floor((yy * c.v) / this.vmax) * c.bpl * 8;
          const cm = colOf[0];
          for (let x = 0; x < outW; x++) row[x] = c.band[base + cm[x]];
        } else {
          const [a, b, e] = this.comps;
          const ba = Math.floor((yy * a.v) / this.vmax) * a.bpl * 8;
          const bb = Math.floor((yy * b.v) / this.vmax) * b.bpl * 8;
          const be = Math.floor((yy * e.v) / this.vmax) * e.bpl * 8;
          const [ca, cb, ce] = colOf;
          for (let x = 0; x < outW; x++) {
            const Y = a.band[ba + ca[x]];
            const Cb = b.band[bb + cb[x]];
            const Cr = e.band[be + ce[x]];
            let R = Y;
            let G = Cb;
            let B = Cr;
            if (this.ycc) {
              R = Y + 1.402 * (Cr - 128);
              G = Y - 0.344136 * (Cb - 128) - 0.714136 * (Cr - 128);
              B = Y + 1.772 * (Cb - 128);
            }
            const o = x * 3;
            row[o] = R <= 0 ? 0 : R >= 255 ? 255 : R;
            row[o + 1] = G <= 0 ? 0 : G >= 255 ? 255 : G;
            row[o + 2] = B <= 0 ? 0 : B >= 255 ? 255 : B;
          }
        }
        sink(y, row);
      }
    }
  }
}

// ── Flate / unfiltered ───────────────────────────────────────────────────────────────────────

export type FlateParams = {
  /** 'flate' (zlib or raw deflate) or 'none'. */
  filter: 'flate' | 'none';
  colors: 1 | 3;
  bpc: 1 | 8;
  /** 1 = none, 2 = TIFF, ≥ 10 = PNG (per-row filter byte). */
  predictor: number;
};

export class FlateRows implements RowSource {
  readonly channels: 1 | 3;
  private readonly rowBytes: number;
  private readonly bpp: number;

  constructor(
    private readonly d: Uint8Array,
    readonly width: number,
    readonly height: number,
    private readonly p: FlateParams,
  ) {
    if (p.bpc === 1 && p.colors !== 1) throw new RowsUnsupported('a 1-bit colour image');
    if (p.predictor !== 1 && p.predictor !== 2 && p.predictor < 10)
      throw new RowsUnsupported(`predictor ${p.predictor}`);
    if (p.predictor === 2 && p.bpc !== 8) throw new RowsUnsupported('a TIFF predictor on 1-bit data');
    this.channels = p.colors;
    this.rowBytes = Math.ceil((width * p.colors * p.bpc) / 8);
    this.bpp = Math.max(1, Math.ceil((p.colors * p.bpc) / 8));
  }

  async read(y0: number, y1: number, x0: number, x1: number, sink: RowSink): Promise<void> {
    const png = this.p.predictor >= 10;
    const stride = this.rowBytes + (png ? 1 : 0);
    const prev = new Uint8Array(this.rowBytes);
    const cur = new Uint8Array(this.rowBytes);
    const out = new Uint8Array((x1 - x0) * this.channels);
    let y = 0;
    let fill = 0;
    let filterType = 0;
    const stop = Math.min(y1, this.height);
    const take = (chunk: Uint8Array): boolean => {
      let i = 0;
      while (i < chunk.length && y < stop) {
        if (png && fill === 0 && filterType < 0) {
          filterType = chunk[i++];
          continue;
        }
        const n = Math.min(this.rowBytes - fill, chunk.length - i);
        cur.set(chunk.subarray(i, i + n), fill);
        fill += n;
        i += n;
        if (fill === this.rowBytes) {
          this.unfilter(cur, prev, png ? filterType : -1);
          if (y >= y0) {
            this.cut(cur, out, x0, x1);
            sink(y, out);
          }
          prev.set(cur);
          fill = 0;
          filterType = -1;
          y++;
        }
      }
      return y >= stop;
    };
    filterType = png ? -1 : 0;
    if (this.p.filter === 'none') {
      take(this.d.subarray(0, Math.min(this.d.length, stride * stop)));
    } else {
      const zlib = (this.d[0] & 0x0f) === 8 && ((this.d[0] << 8) | this.d[1]) % 31 === 0;
      const stream = new Blob([this.d as BlobPart])
        .stream()
        .pipeThrough(new DecompressionStream(zlib ? 'deflate' : 'deflate-raw'));
      const reader = stream.getReader();
      // inflated to its end (the checksum included) even past the window: a bit error inside
      // the window shows only there, and an image that does not inflate cleanly is not read
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          if (y < stop) take(value);
        }
      } catch (e) {
        throw new RowsUnsupported(`the image data does not inflate (${(e as Error).message})`);
      } finally {
        void reader.cancel().catch(() => undefined);
      }
    }
    if (y < stop) throw new RowsUnsupported(`the image data ends at row ${y} of ${this.height} (damaged data)`);
  }

  private unfilter(cur: Uint8Array, prev: Uint8Array, t: number): void {
    const n = cur.length;
    const bpp = this.bpp;
    if (t < 0) {
      if (this.p.predictor === 2) for (let i = bpp; i < n; i++) cur[i] = (cur[i] + cur[i - bpp]) & 255;
      return;
    }
    switch (t) {
      case 0:
        return;
      case 1:
        for (let i = bpp; i < n; i++) cur[i] = (cur[i] + cur[i - bpp]) & 255;
        return;
      case 2:
        for (let i = 0; i < n; i++) cur[i] = (cur[i] + prev[i]) & 255;
        return;
      case 3:
        for (let i = 0; i < n; i++) cur[i] = (cur[i] + (((i >= bpp ? cur[i - bpp] : 0) + prev[i]) >> 1)) & 255;
        return;
      case 4:
        for (let i = 0; i < n; i++) {
          const a = i >= bpp ? cur[i - bpp] : 0;
          const b = prev[i];
          const c = i >= bpp ? prev[i - bpp] : 0;
          const pa = Math.abs(b - c);
          const pb = Math.abs(a - c);
          const pc = Math.abs(a + b - 2 * c);
          cur[i] = (cur[i] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
        }
        return;
      default:
        throw new RowsUnsupported(`PNG row filter ${t} (damaged data)`);
    }
  }

  private cut(cur: Uint8Array, out: Uint8Array, x0: number, x1: number): void {
    if (this.p.bpc === 8) {
      out.set(cur.subarray(x0 * this.channels, x1 * this.channels));
      return;
    }
    for (let x = x0; x < x1; x++) out[x - x0] = (cur[x >> 3] >> (7 - (x & 7))) & 1 ? 255 : 0;
  }
}
