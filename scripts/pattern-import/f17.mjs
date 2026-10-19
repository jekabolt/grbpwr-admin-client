#!/usr/bin/env node
// PATTERN-IMPORT · F17 — actionable refusals for native CAD and other unreadable files, plus the
// binary-DXF route. Writes synthetic fixtures (fake headers / ZIP listings — no vendor samples
// exist here) to corpus/synthetic/f17/, then asserts for each: sniff route or refusal code, the
// operator message (what it is + the export instruction), that `pickExtractor` throws the same
// typed `UnsupportedFormat`, and that the worker's `toWireError` carries that message unchanged
// (`{code:'unsupported-format', message}` — what the wizard shows).
//   node scripts/pattern-import/f17.mjs        (exit 1 on any failure)
// Binary-DXF round-trip parity lives in `dxf.mjs` (section 3c).
import { build as esbuild } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { deflateRawSync } from 'node:zlib';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const CORPUS =
  process.env.PATIMPORT_CORPUS ??
  '/Users/jekabolt/go/src/github.com/jekabolt/tmp/plans/pdf-to-dxf/corpus/';
const PLAN = resolve(CORPUS, '..');
const OUT = resolve(CORPUS, 'synthetic/f17');
mkdirSync(OUT, { recursive: true });

const outfile = resolve(tmpdir(), `f17-${process.pid}.mjs`);
await esbuild({
  entryPoints: [resolve(HERE, 'f17-entry.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile,
  logLevel: 'warning',
  absWorkingDir: REPO,
  alias: {
    lib: resolve(REPO, 'src/lib'),
    components: resolve(REPO, 'src/components'),
    utils: resolve(REPO, 'src/utils'),
  },
});
const m = await import(pathToFileURL(outfile).href);

let bad = 0;
const checks = [];
const ck = (ok, what, d = '') => {
  if (!ok) bad++;
  checks.push({ ok: !!ok, what, d });
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${d ? `  — ${d}` : ''}`);
};
const ab = (buf) => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const B = (s) => Buffer.from(s, 'latin1');

// ── fixture writers (independent of the adapters) ────────────────────────────────────────────
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (b) => {
  let c = 0xffffffff;
  for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
/** A real ZIP (deflate for bodies > 64 B, stored otherwise): local headers + central directory. */
function zip(entries) {
  const locals = [];
  const central = [];
  let off = 0;
  for (const [name, body0] of entries) {
    const body = Buffer.isBuffer(body0) ? body0 : Buffer.from(body0);
    const deflate = body.length > 64;
    const data = deflate ? deflateRawSync(body) : body;
    const nm = Buffer.from(name, 'utf8');
    const crc = crc32(body);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0x0800, 6);
    lh.writeUInt16LE(deflate ? 8 : 0, 8);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(data.length, 18);
    lh.writeUInt32LE(body.length, 22);
    lh.writeUInt16LE(nm.length, 26);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt16LE(deflate ? 8 : 0, 10);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(data.length, 20);
    ch.writeUInt32LE(body.length, 24);
    ch.writeUInt16LE(nm.length, 28);
    ch.writeUInt32LE(off, 42);
    locals.push(lh, nm, data);
    central.push(ch, nm);
    off += 30 + nm.length + data.length;
  }
  const cd = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cd, eocd]);
}
/** Deterministic noise (a vendor binary body). */
const noise = (n, seed = 7) => {
  const b = Buffer.alloc(n);
  let x = seed;
  for (let i = 0; i < n; i++) {
    x = (x * 1103515245 + 12345) >>> 0;
    b[i] = x >>> 24;
  }
  return b;
};
const OLE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const dwg = (ver) =>
  Buffer.concat([B(ver), Buffer.alloc(5), Buffer.from([0x00, 0x1f]), noise(400)]);
const xml = (body) => B(`<?xml version="1.0" encoding="UTF-8"?>\n${body}\n`);
const DXF = readFileSync(resolve(PLAN, 'k2-work/golden-min.dxf'));
let binDxf = null;
try {
  binDxf = readFileSync(resolve(OUT, 'golden-min.binary-r2000.dxf'));
} catch {
  // written by `yarn patimport:dxf` (section 3c) — that probe runs first in CI order or not at all
}

// [file name, bytes, expectation]; expectation: { refusal, says: [phrases] } or { route }
const AAMA = 'AAMA/ASTM DXF';
const FIX = [
  ['drawing-2018.dwg', dwg('AC1032'), { refusal: 'dwg', says: ['DWG', 'AutoCAD 2018+', 'DXF'] }],
  [
    'drawing-2000.dwg',
    dwg('AC1015'),
    { refusal: 'dwg', says: ['AutoCAD 2000', 'export it as DXF'] },
  ],
  ['no-extension-dwg', dwg('AC1018'), { refusal: 'dwg', says: ['AutoCAD 2004'] }],
  [
    'jacket.zprj',
    zip([
      ['project.xml', '<clo/>'],
      ['avatar/female.avt', noise(200)],
      ['pattern.bin', noise(300)],
    ]),
    { refusal: 'clo-native', says: ['CLO 3D', '.zprj', AAMA] },
  ],
  [
    'jacket-binary.zprj',
    Buffer.concat([B('CLO\0'), noise(512)]),
    { refusal: 'clo-native', says: ['CLO'] },
  ],
  ['coat.zpac', noise(700, 3), { refusal: 'clo-native', says: ['.zpac'] }],
  ['female_v2.avt', noise(300, 4), { refusal: 'clo-native', says: ['avatar'] }],
  [
    'denim.zfab',
    zip([
      ['fabric.json', '{}'],
      ['texture.png', noise(100)],
    ]),
    { refusal: 'clo-native', says: ['fabric'] },
  ],
  [
    'clo-files.zip',
    zip([
      ['jacket.zprj', noise(120)],
      ['denim.zfab', noise(90)],
    ]),
    { refusal: 'clo-native', says: ['CLO'], why: '1 × .zprj' },
  ],
  [
    'accumark-storage.zip',
    zip([
      ['STYLE01/STYLE01.mdl', noise(120)],
      ['STYLE01/FRONT.pce', noise(400)],
      ['STYLE01/BACK.pce', noise(400)],
      ['STYLE01/GRADE.rul', noise(200)],
    ]),
    { refusal: 'gerber-accumark', says: ['Gerber AccuMark', AAMA, '.plt/.cut'], why: '2 × .pce' },
  ],
  ['FRONT.pce', noise(300, 9), { refusal: 'gerber-accumark', says: ['AccuMark'] }],
  ['GRADE.rul', noise(300, 10), { refusal: 'gerber-accumark', says: ['AccuMark'] }],
  [
    'model.mdl',
    noise(300, 11),
    { refusal: 'cad-model-mdl', says: ['Lectra Modaris or Gerber AccuMark', AAMA] },
  ],
  ['sleeve.iba', noise(300, 12), { refusal: 'lectra-modaris', says: ['Lectra Modaris', AAMA] }],
  ['variant.vet', noise(300, 13), { refusal: 'lectra-modaris', says: ['Modaris'] }],
  [
    'modaris-export.zip',
    zip([
      ['M1.mdl', noise(80)],
      ['FRONT.iba', noise(80)],
      ['M1.vet', noise(80)],
    ]),
    { refusal: 'lectra-modaris', says: ['Modaris'] },
  ],
  [
    'shirt.pds',
    Buffer.concat([OLE, noise(1024, 14)]),
    { refusal: 'optitex-native', says: ['Optitex', '.pds', AAMA] },
  ],
  ['shirt.mrk', noise(500, 15), { refusal: 'optitex-native', says: ['marker'] }],
  [
    'dress.val',
    xml(
      '<pattern>\n <version>0.9.2</version>\n <unit>cm</unit>\n <draw name="dress">\n  <calculation/>\n </draw>\n</pattern>',
    ),
    { refusal: 'valentina-pattern', says: ['Valentina / Seamly2D', 'parametric', 'DXF'] },
  ],
  [
    'dress.sm2d',
    xml('<pattern>\n <version>0.6.0</version>\n <draw name="dress"/>\n</pattern>'),
    { refusal: 'valentina-pattern', says: ['Seamly2D'] },
  ],
  [
    'renamed-pattern.xml',
    xml('<pattern>\n <draw name="a"><calculation/></draw>\n</pattern>'),
    { refusal: 'valentina-pattern', says: ['parametric'] },
  ],
  [
    'me.vit',
    xml('<vit>\n <version>0.3.3</version>\n <body-measurements/>\n</vit>'),
    { refusal: 'valentina-measurements', says: ['measurements', 'not a pattern'] },
  ],
  [
    'size-chart.vst',
    xml('<vst>\n <version>0.4.4</version>\n</vst>'),
    { refusal: 'valentina-measurements', says: ['measurements'] },
  ],
  [
    'me.smis',
    xml('<smis>\n <version>0.3.3</version>\n</smis>'),
    { refusal: 'valentina-measurements', says: ['measurements'] },
  ],
  [
    'spec.docx',
    zip([
      ['[Content_Types].xml', '<Types/>'],
      ['_rels/.rels', '<Relationships/>'],
      ['word/document.xml', '<w:document/>'],
    ]),
    {
      refusal: 'office-document',
      says: ['office document', 'PDF at 100% scale'],
      why: 'Word document',
    },
  ],
  [
    'size-chart.xlsx',
    zip([
      ['[Content_Types].xml', '<Types/>'],
      ['xl/workbook.xml', '<workbook/>'],
    ]),
    { refusal: 'office-document', says: ['office document'], why: 'Excel workbook' },
  ],
  [
    'notes.odt',
    zip([
      ['mimetype', 'application/vnd.oasis.opendocument.text'],
      ['content.xml', '<office:document-content/>'],
    ]),
    { refusal: 'office-document', says: ['OpenDocument'], why: 'OpenDocument' },
  ],
  [
    'legacy.doc',
    Buffer.concat([OLE, noise(1024, 16)]),
    { refusal: 'office-document', says: ['Word'] },
  ],
  [
    'legacy-no-ext',
    Buffer.concat([OLE, noise(1024, 17)]),
    { refusal: 'office-document', says: ['Word'], why: 'legacy Office' },
  ],
  [
    'photo.heic',
    Buffer.concat([Buffer.from([0, 0, 0, 0x18]), B('ftypheic'), Buffer.alloc(12), noise(200)]),
    { refusal: 'image-unsupported', says: ['PNG, JPG or TIFF'], why: 'HEIF/HEIC' },
  ],
  [
    'layers.psd',
    Buffer.concat([B('8BPS'), Buffer.from([0, 1]), noise(300)]),
    { refusal: 'image-unsupported', says: ['image format'], why: 'Photoshop' },
  ],
  [
    'pattern-files.zip',
    zip([
      ['jacket/jacket.dxf', DXF],
      ['jacket/instructions.pdf', B('%PDF-1.7\n')],
      ['readme.txt', 'hi'],
    ]),
    { refusal: 'zip-archive', says: ['Unzip it'], why: '1 × .dxf, 1 × .pdf' },
  ],
  [
    'misc.zip',
    zip([
      ['a.txt', 'x'],
      ['b/c.bin', noise(90)],
    ]),
    { refusal: 'zip-archive', says: ['ZIP archive'], why: 'no pattern files' },
  ],
  ['empty.zip', zip([]), { refusal: 'zip-archive', says: ['ZIP'], why: 'empty archive' }],
  [
    'postscript.eps',
    B(
      '%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 100 100\nnewpath 0 0 moveto 100 100 lineto stroke\n%%EOF\n',
    ),
    { refusal: 'eps-postscript', says: ['PDF'] },
  ],
  [
    'illustrator8.ai',
    B('%!PS-Adobe-2.0\n%%Creator: Adobe Illustrator(TM) 8.0\n%AI5_FileFormat 4.0\n%%EOF\n'),
    { refusal: 'ai-postscript', says: ['PDF compatibility'] },
  ],
  // content wins over a vendor extension: these are read, not refused
  ['actually-dxf.mdl', DXF, { route: 'dxf' }],
  ['gerber-plot.cut', B('IN;SP1;PU0,0;PD4000,0,4000,4000,0,4000,0,0;PU;SP0;\n'), { route: 'hpgl' }],
  [
    'actually-pdf.pds',
    B('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n'),
    { route: 'pdf' },
  ],
  ...(binDxf ? [['golden-binary.dxf', binDxf, { route: 'dxf' }]] : []),
];

console.log('# F17 refusal fixtures');
for (const [name, bytes] of FIX) writeFileSync(resolve(OUT, name), bytes);

const stubPdf = async (f) => ({
  file: { id: f.id, name: f.name, kind: 'pdf' },
  pages: [],
  warnings: [],
});
const stubAll = { pdf: stubPdf, dxf: stubPdf, hpgl: stubPdf, svg: stubPdf, raster: stubPdf };
const report = { date: new Date().toISOString(), fixtures: {} };

for (const [name, , exp] of FIX) {
  const bytes = readFileSync(resolve(OUT, name)); // round-trip through disk: what the probe asserts is what is on disk
  const sn = m.sniffFormat(ab(bytes), name);
  if (exp.route) {
    ck(
      sn.route === exp.route,
      `${name} → read by ${exp.route}`,
      sn.route ?? `refused ${sn.refusal}: ${sn.why}`,
    );
    report.fixtures[name] = { route: sn.route, why: sn.why };
    continue;
  }
  ck(
    sn.route === null && sn.refusal === exp.refusal,
    `${name} → refused ${exp.refusal}`,
    sn.route ? `routed ${sn.route}` : `${sn.refusal} (${sn.why})`,
  );
  if (exp.why) ck(sn.why?.includes(exp.why), `${name}: detail names ${exp.why}`, sn.why);
  // what the worker session builds (session.ts: new UnsupportedFormat(sn.refusal, sn.why).message)
  const msg = new m.UnsupportedFormat(sn.refusal ?? 'unknown-format', sn.why).message;
  const hint = m.refusalHint(exp.refusal);
  const missing = exp.says.filter((p) => !msg.includes(p));
  ck(
    missing.length === 0,
    `${name}: message says ${exp.says.map((s) => `“${s}”`).join(', ')}`,
    missing.length ? `missing ${missing.join(', ')} in: ${msg}` : msg,
  );
  ck(
    msg.includes(hint) && hint.length > 20,
    `${name}: message carries the export instruction`,
    hint,
  );
  // pickExtractor throws the same typed refusal; the wire keeps the message
  let thrown = null;
  try {
    m.pickExtractor(ab(bytes), name, stubAll);
  } catch (e) {
    thrown = e;
  }
  ck(
    m.isUnsupportedFormat(thrown) && thrown.code === exp.refusal && thrown.hint === hint,
    `${name}: pickExtractor throws UnsupportedFormat{code:${exp.refusal}, hint}`,
    thrown ? `${thrown.name} ${thrown.code}` : 'no throw',
  );
  const w = m.toWireError(thrown);
  ck(
    w.code === 'unsupported-format' && w.message === thrown.message,
    `${name}: wire {unsupported-format, message with hint}`,
    w.code,
  );
  report.fixtures[name] = { refusal: sn.refusal, why: sn.why, message: msg };
}

// ── encrypted PDF: decided by the reader (owner-only encryption still opens) ────────────────
console.log('\n# password-protected PDF');
{
  const enc = B(
    '%PDF-1.6\n1 0 obj\n<</Type/Catalog/Pages 2 0 R>>\nendobj\n4 0 obj\n<</Filter/Standard/V 4/R 4/Length 128/O(x)/U(y)/P -1340>>\nendobj\ntrailer\n<</Root 1 0 R/Encrypt 4 0 R/Size 5>>\n%%EOF\n',
  );
  writeFileSync(resolve(OUT, 'password.pdf'), enc);
  const sn = m.sniffFormat(ab(enc), 'password.pdf');
  ck(
    sn.route === 'pdf' && sn.encrypted === true,
    'password.pdf → pdf route, /Encrypt noticed',
    `${sn.route} ${sn.why}`,
  );
  const pwd = async () => {
    const e = new Error('No password given');
    e.name = 'PasswordException';
    throw e;
  };
  let thrown = null;
  try {
    await m.pickExtractor(ab(enc), 'password.pdf', { pdf: pwd })(
      { id: '0', name: 'password.pdf', bytes: ab(enc) },
      {},
    );
  } catch (e) {
    thrown = e;
  }
  ck(
    m.isUnsupportedFormat(thrown) &&
      thrown.code === 'pdf-password' &&
      /password-protected/.test(thrown.message) &&
      /without security/.test(thrown.message),
    'pdf.js PasswordException → UnsupportedFormat pdf-password with the instruction',
    thrown?.message,
  );
  ck(
    m.toWireError(thrown).code === 'unsupported-format',
    'password refusal → wire unsupported-format',
    m.toWireError(thrown).message,
  );
  // owner-password-only PDF: the reader opens it, nothing is refused
  const ok = await m.pickExtractor(ab(enc), 'restricted.pdf', { pdf: stubPdf })(
    { id: '0', name: 'restricted.pdf', bytes: ab(enc) },
    {},
  );
  ck(
    ok && Array.isArray(ok.pages),
    'owner-only encrypted PDF that opens is not refused',
    'stub read',
  );
  // other reader errors pass through untouched
  let other = null;
  try {
    await m.pickExtractor(ab(enc), 'x.pdf', {
      pdf: async () => {
        throw new Error('Invalid PDF structure');
      },
    })({ id: '0', name: 'x.pdf', bytes: ab(enc) }, {});
  } catch (e) {
    other = e;
  }
  ck(
    other && !m.isUnsupportedFormat(other) && other.message === 'Invalid PDF structure',
    'other PDF errors are not relabelled',
    other?.message,
  );
}

// ── ZIP directory reader edge cases ─────────────────────────────────────────────────────────
console.log('\n# ZIP central directory');
{
  const z = zip([
    ['a/b.pce', noise(5000)],
    ['ü.dxf', 'x'],
  ]);
  const names = m.zipEntryNames(new Uint8Array(z));
  ck(
    JSON.stringify(names) === JSON.stringify(['a/b.pce', 'ü.dxf']),
    'names read from the central directory (UTF-8)',
    JSON.stringify(names),
  );
  const withComment = Buffer.concat([z.subarray(0, z.length - 2), Buffer.from([5, 0]), B('hello')]);
  ck(
    m.zipEntryNames(new Uint8Array(withComment))?.length === 2,
    'EOCD found behind an archive comment',
  );
  ck(
    m.zipEntryNames(new Uint8Array(z.subarray(0, z.length - 30))) === null,
    'truncated ZIP (no EOCD) → null, no throw',
  );
  const sn = m.sniffFormat(ab(z.subarray(0, z.length - 30)), 'broken.zip');
  ck(
    sn.route === null && sn.refusal === 'zip-archive',
    'truncated ZIP still refused as zip-archive',
    sn.why,
  );
  const big = zip(Array.from({ length: 3000 }, (_, i) => [`p/${i}.txt`, 'x']));
  const t0 = performance.now();
  const n = m.zipEntryNames(new Uint8Array(big))?.length;
  ck(
    n === 3000 && performance.now() - t0 < 500,
    '3000-entry directory listed fast',
    `${n} in ${Math.round(performance.now() - t0)} ms`,
  );
}

// ── name-only refusal (files step, before reading) ──────────────────────────────────────────
console.log('\n# refusalForName');
for (const [n, code] of [
  ['A.ZPRJ', 'clo-native'],
  ['x.pds', 'optitex-native'],
  ['x.mdl', 'cad-model-mdl'],
  ['x.dwg', 'dwg'],
  ['x.vit', 'valentina-measurements'],
  ['x.docx', 'office-document'],
  ['x.zip', 'zip-archive'],
  ['x.dxf', null],
  ['x.plt', null],
  ['noext', null],
]) {
  const got = m.refusalForName(n);
  ck(got === code, `refusalForName(${n}) = ${code}`, String(got));
}

// ── DWG through the DXF adapter too (a .dxf that is really a DWG) ─────────────────────────────
{
  let e = null;
  try {
    await m.readDxf(
      { id: '0', name: 'fake.dxf', bytes: ab(dwg('AC1027')) },
      { sagittaMm: 0.05, keepFills: true },
    );
  } catch (x) {
    e = x;
  }
  ck(
    m.isDxfImportError(e) &&
      e.kind === 'dwg' &&
      /AutoCAD 2013/.test(e.message) &&
      e.hint &&
      e.message.includes(e.hint),
    'DXF adapter: DWG → typed dwg with release + export instruction',
    e?.message,
  );
  ck(
    m.toWireError(e).code === 'unsupported-format' && m.toWireError(e).message === e.message,
    'DWG → wire unsupported-format, message unchanged',
  );
}

const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
mkdirSync(resolve(PLAN, 'reports'), { recursive: true });
report.checks = checks;
writeFileSync(resolve(PLAN, `reports/F17-${stamp}.json`), JSON.stringify(report, null, 2));
console.log(bad ? `\n${bad} FAILED of ${checks.length}` : `\nall ${checks.length} ok`);
process.exit(bad ? 1 : 0);
