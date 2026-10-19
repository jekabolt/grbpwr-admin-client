// RASTER lane probe entry: one PDF through the raster adapter (guarded pdf.js, as the worker),
// numbers for bigraster.mjs — pages, time, peak RSS, windows / resample factors, calibrations.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { extractRasterPdfDetailed, setRasterPdfjsLoader } from 'lib/pattern-import/adapters/raster';
import { guardPdfjs } from 'lib/pattern-import/worker/pdf-guard';
import type { PdfjsModule } from 'lib/pattern-import/adapters/pdf';

const LEGACY = pathToFileURL(
  resolve(process.env.PATIMPORT_REPO ?? process.cwd(), 'node_modules/pdfjs-dist/legacy/build/pdf.mjs'),
).href;
setRasterPdfjsLoader(() => (import(LEGACY) as Promise<PdfjsModule>).then((m) => guardPdfjs(m)));

import { inflateSync } from 'node:zlib';
import { pdfImageStreams } from 'lib/pattern-import/adapters/budget';
import { FlateRows, JpegRows } from 'lib/pattern-import/adapters/raster/rows';

/**
 * --verify: every oversized image's rows (rows.ts) against a reference decoder over the whole
 * image — pdf.js' JpegImage for DCT, node zlib for Flate — mean / max absolute difference per
 * sample on 3 windows (top-left, middle, bottom-right), plus a resumed read (checkpoints).
 */
async function verify(bytes: ArrayBuffer): Promise<unknown[]> {
  const u = new Uint8Array(bytes);
  const out: unknown[] = [];
  const { images } = pdfImageStreams(bytes);
  for (const r of images) {
    if (!r.width || !r.height || r.width * r.height <= (Number(process.env.VERIFY_MIN) || 18e6)) continue;
    const data = u.subarray(r.data[0], r.data[1]);
    const W = r.width;
    const H = r.height;
    let ref: Uint8Array;
    let src: JpegRows | FlateRows;
    let ch: number;
    if (r.filters?.[0] === 'DCTDecode') {
      const dec = (await import(
        pathToFileURL(resolve(process.env.PATIMPORT_REPO ?? process.cwd(), 'node_modules/pdfjs-dist/image_decoders/pdf.image_decoders.mjs')).href
      )) as { JpegImage: new (o: object) => { parse(d: Uint8Array): void; getData(o: object): Uint8Array } };
      const j = new dec.JpegImage({});
      j.parse(data);
      ref = j.getData({ width: W, height: H, forceRGB: false, isSourcePDF: true });
      src = new JpegRows(data);
    } else {
      ref = new Uint8Array(inflateSync(data));
      src = new FlateRows(data, W, H, { filter: 'flate', colors: 3, bpc: 8, predictor: 1 });
    }
    ch = src.channels;
    const wins = [
      [0, 0, 1500, 1500],
      [Math.floor(W / 2) - 700, Math.floor(H / 2) - 700, Math.floor(W / 2) + 701, Math.floor(H / 2) + 703],
      [W - 1333, H - 1201, W, H],
      [Math.floor(W / 2) - 700, Math.floor(H / 2) - 700, Math.floor(W / 2) + 701, Math.floor(H / 2) + 703],
    ];
    for (const [x0, y0, x1, y1] of wins) {
      let sum = 0;
      let n = 0;
      let mx = 0;
      let rows = 0;
      const t = performance.now();
      await src.read(y0, y1, x0, x1, (y, row) => {
        rows++;
        const base = (y * W + x0) * ch;
        for (let k = 0; k < row.length; k++) {
          const dv = Math.abs(row[k] - ref[base + k]);
          sum += dv;
          n++;
          if (dv > mx) mx = dv;
        }
      });
      out.push({ img: `${W}x${H}`, f: r.filters?.[0], win: [x0, y0, x1, y1], rows, mean: +(sum / n).toFixed(3), max: mx, ms: Math.round(performance.now() - t) });
    }
  }
  return out;
}

const peakMb = () => Math.round((process.resourceUsage().maxRSS * 1024) / 1e6);

export async function main(args: string[]): Promise<number> {
  const [file, maxArg, pagesArg] = args;
  const b = readFileSync(file);
  const bytes = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  const t0 = performance.now();
  const pageMs: number[] = [];
  let last = t0;
  const out: Record<string, unknown> = { file };
  if (maxArg === 'verify') {
    out.verify = await verify(bytes);
    out.peakRssMb = peakMb();
    console.log(JSON.stringify(out));
    return 0;
  }
  try {
    const r = await extractRasterPdfDetailed(
      { id: '0', name: file.split('/').pop()!, bytes },
      {
        sagittaMm: 0.05,
        keepFills: true,
        ...(pagesArg ? { pages: pagesArg.split(',').map(Number) } : {}),
      },
      {
        ...(maxArg && maxArg !== '-' ? { maxPixels: Number(maxArg) } : {}),
        progress: () => {
          const now = performance.now();
          pageMs.push(Math.round(now - last));
          last = now;
          (globalThis as { gc?: () => void }).gc?.();
        },
      },
    );
    out.ok = true;
    out.pages = r.doc.pages.length;
    out.paths = r.doc.pages.reduce((a, p) => a + p.paths.length, 0);
    out.rasters = r.doc.pages.map((p) =>
      p.rasters.map((x) => ({
        px: `${x.widthPx}x${x.heightPx}`,
        dpi: Math.round(x.dpi),
        src: x.source
          ? { full: `${x.source.widthPx}x${x.source.heightPx}`, win: x.source.window, scale: +x.source.scale.toFixed(4) }
          : null,
      })),
    );
    out.calib = r.calibrations.map((c) => ({
      m: c.method,
      side: c.square ? c.square : null,
      a: [c.affine.a, c.affine.b, c.affine.c, c.affine.d].map((v) => +v.toFixed(5)),
    }));
    out.warnings = r.doc.warnings.slice(0, 6);
  } catch (e) {
    out.ok = false;
    out.error = `${(e as Error).name}: ${(e as Error).message}`;
  }
  out.ms = Math.round(performance.now() - t0);
  out.pageMs = pageMs;
  out.peakRssMb = peakMb();
  console.log(JSON.stringify(out));
  return 0;
}
