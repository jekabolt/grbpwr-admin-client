// PATTERN-IMPORT · PASSPORT Ф1 probe (auto/PASSPORT.md) — the deterministic garment passport on
// every corpus file set: what the reader takes from the document (cutting list with printed labels
// and counts, the file-wide allowance sentence, models, outline words of layer names) against
// corpus/truth.json, plus the controls the passport's two decisions stand on:
//   (c) the outline — only a layer / group name that IS an outline word, only for the layers of the
//       pieces' own outline walls; text is never a layer word; disagreeing layers are a conflict;
//   (a) quantities — only a cutting-list line (N3 grammar: cutting section, no fabric of its own,
//       no number two lists disagree on); a sewing step with a count is no entry;
//   the manifest digest — ≤ 2 KB, read back shape-tolerantly.
// Nothing is paid, nothing is written but the report (PATIMPORT_REPORTS).
//   node scripts/pattern-import/passport.mjs [case-id…]      (yarn patimport:passport)
// Exit 1 when a control fails or a count the reader takes from a list disagrees with TRUTH.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { tmpdir } from 'node:os';

import { Session } from 'lib/pattern-import/worker/session';
import type { SourceDoc } from 'lib/pattern-import/types';
import {
  layerOutlineWord,
  outlineOfPieces,
  passportDigest,
  readPassport,
  readPassportDigest,
  bindPassport,
  PASSPORT_DIGEST_MAX,
  type GarmentPassport,
  type LayerWord,
} from 'lib/pattern-import/passport';
import { readManifest, embedManifest } from 'lib/pattern-import/manifest';
import type { AllowanceDecision, ImportSession } from 'lib/pattern-import/types';
import {
  layerWordConflict,
  outlineByLayerWord,
} from 'components/managers/tech-card/components/pattern-import/autopilot/outline-word';
import { CASES } from './e2e-entry';
import { runCase } from './autopilot-entry';
import { splitSize } from './worker-entry';

const CORPUS =
  process.env.PATIMPORT_CORPUS ??
  '/Users/jekabolt/go/src/github.com/jekabolt/tmp/plans/pdf-to-dxf/corpus/';
const REPORTS =
  process.env.PATIMPORT_REPORTS ??
  '/Users/jekabolt/go/src/github.com/jekabolt/tmp/plans/pdf-to-dxf/reports/';
const ctx = { checkCancel: () => {}, progress: () => {} };

type Case = (typeof CASES)[number];
type TPiece = { label: string; qty?: unknown; fold?: unknown; pair?: unknown };
type TSample = {
  id: string;
  variants: { name: string; pieces?: TPiece[] | null }[];
  pieces?: TPiece[];
  seam_allowance?: { included?: boolean | null; mm?: number | null };
};

const checks: { name: string; ok: boolean; got: string }[] = [];
const check = (name: string, ok: boolean, got: unknown) =>
  checks.push({ name, ok, got: typeof got === 'string' ? got : JSON.stringify(got) });

const enc = (b: Buffer) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
function filesOf(c: Case): { name: string; bytes: ArrayBuffer }[] {
  if (c.files[0]?.startsWith('split:')) {
    const graded = readFileSync(resolve(CORPUS, 'dxf-clo/allsizes-merged.dxf')).toString('latin1');
    return c.files.map((f) => ({
      name: `coat_${f.slice(6).toLowerCase()}.dxf`,
      bytes: enc(Buffer.from(splitSize(graded, f.slice(6)), 'latin1')),
    }));
  }
  return c.files.map((f) => ({ name: basename(f), bytes: enc(readFileSync(resolve(CORPUS, f))) }));
}

async function passportOf(files: { name: string; bytes: ArrayBuffer }[]) {
  const s = new Session(1, files);
  const out = await s.runStage('extract', { opts: { sagittaMm: 0.05, keepFills: true } }, ctx);
  return out.passport ?? null;
}

let TRUTH: TSample[] | null = null;
const truthOf = (id: string | undefined): TSample | null => {
  if (!id) return null;
  TRUTH ??= (
    JSON.parse(readFileSync(resolve(CORPUS, 'truth.json'), 'utf8')) as { samples: TSample[] }
  ).samples;
  return TRUTH.find((x) => x.id === id) ?? null;
};
const normNo = (s: string) =>
  s
    .toLowerCase()
    .replace(/[.\s]+/g, '')
    .trim();

/** The reader's list against TRUTH: which labels, which counts, which folds. */
function scoreList(p: GarmentPassport, t: TSample) {
  const truthPieces = (t.pieces ?? t.variants.flatMap((v) => v.pieces ?? [])).filter(
    (x) => x?.label,
  );
  const tl = new Map(truthPieces.map((x) => [normNo(x.label.split(' / ')[0]), x]));
  const exp = p.pieces.filter((e) => e.label);
  const hit = exp.filter((e) => tl.has(normNo(e.label!.value)));
  const qty: string[] = [];
  const qtyWrong: string[] = [];
  for (const e of hit) {
    const tp = tl.get(normNo(e.label!.value))!;
    const q = e.qty?.value;
    if (!q || typeof tp.qty !== 'number') continue;
    const ok = q.n === tp.qty && (q.mode !== 'fold' || tp.fold === true);
    (ok ? qty : qtyWrong).push(
      `${e.label!.value}: ${q.n} ${q.mode} vs truth ${tp.qty}${tp.fold ? ' fold' : ''}`,
    );
  }
  return {
    truthPieces: tl.size,
    expected: exp.length,
    matched: hit.length,
    recall: tl.size
      ? +(new Set(hit.map((e) => normNo(e.label!.value))).size / tl.size).toFixed(2)
      : null,
    precision: exp.length ? +(hit.length / exp.length).toFixed(2) : null,
    qtyAgree: qty.length,
    qtyWrong,
  };
}

// ── corpus ───────────────────────────────────────────────────────────────────────────────────

async function corpus(only: string[]) {
  const seen = new Set<string>();
  const rows: Record<string, unknown>[] = [];
  for (const c of CASES) {
    if (c.group === 'refusal') continue;
    if (only.length && !only.includes(c.id)) continue;
    const key = c.files.join('+');
    if (seen.has(key)) continue;
    seen.add(key);
    let p: GarmentPassport | null = null;
    let error: string | null = null;
    try {
      p = await passportOf(filesOf(c));
    } catch (e) {
      error = String(e).slice(0, 200);
    }
    const t = truthOf(c.truth?.id);
    const row: Record<string, unknown> = { id: c.id, files: c.files.length, error };
    if (p) {
      row.expected = p.pieces.map(
        (e) =>
          `${e.label?.value ?? '?'} «${e.name.value}» ${e.qty ? `${e.qty.value.n} ${e.qty.value.mode}` : ''}`,
      );
      row.allowance = p.allowance
        ? `${p.allowance.value.included ? 'included' : 'not included'}${p.allowance.value.mm != null ? ` ${p.allowance.value.mm} mm` : ''} (${p.allowance.status}) «${p.allowance.refs[0]?.quote?.slice(0, 60) ?? ''}»`
        : null;
      row.models = p.garment.models?.value ?? null;
      row.layerWords = p.layerWords.map((w) => `${w.layer}=${w.word} (${w.loops} closed)`);
      row.outline = p.outline ? `${p.outline.value} (${p.outline.status})` : null;
      row.conflicts = p.conflicts;
      row.digestBytes = JSON.stringify(passportDigest(p)).length;
      check(
        `${c.id}: digest ≤ ${PASSPORT_DIGEST_MAX} B`,
        (row.digestBytes as number) <= PASSPORT_DIGEST_MAX,
        row.digestBytes,
      );
      if (t) {
        const sc = scoreList(p, t);
        row.list = sc;
        // a count the reader takes from the list must be TRUTH's (a wrong text fact is the worst kind)
        check(`${c.id}: list counts agree with TRUTH`, !sc.qtyWrong.length, sc.qtyWrong);
        const inc = t.seam_allowance?.included;
        if (p.allowance && inc != null)
          check(
            `${c.id}: allowance sentence agrees with TRUTH`,
            p.allowance.value.included === inc,
            row.allowance,
          );
      }
      // the outline answer the case's operator gives (live smoke) — the layer word must not contradict it
      if (c.outline && p.outline)
        check(
          `${c.id}: outline word agrees with the operator`,
          p.outline.value === c.outline,
          row.outline,
        );
    }
    rows.push(row);
    const sc = row.list as ReturnType<typeof scoreList> | undefined;
    console.log(
      `${c.id.padEnd(40)} list ${String(p?.pieces.length ?? '—').padStart(2)}${sc ? ` (truth ${sc.truthPieces}, recall ${sc.recall}, precision ${sc.precision}, counts ok ${sc.qtyAgree}${sc.qtyWrong.length ? ` WRONG ${sc.qtyWrong.length}` : ''})` : ''}` +
        `  allowance ${row.allowance ? String(row.allowance).slice(0, 40) : '—'}  outline ${row.outline ?? '—'}${(row.layerWords as string[] | undefined)?.length ? ` [${(row.layerWords as string[]).join('; ')}]` : ''}${error ? ` ERROR ${error}` : ''}`,
    );
  }
  return rows;
}

// ── controls ─────────────────────────────────────────────────────────────────────────────────

function controlsWords() {
  const yes: [string, 'cut' | 'seam'][] = [
    ['Cut lines', 'cut'],
    ['CUT_LINE', 'cut'],
    ['cut', 'cut'],
    ['Cutting line', 'cut'],
    ['Schnittlinie', 'cut'],
    ['линия кроя', 'cut'],
    ['Seam line', 'seam'],
    ['Seam_line', 'seam'],
    ['stitch', 'seam'],
    ['Nahtlinie', 'seam'],
    ['линия шва', 'seam'],
  ];
  const no = [
    'Cut lines (old)',
    'cutting layout',
    'Layer 1',
    '1',
    '14',
    'Labels',
    'notes about the seam',
    'cut here and sew',
    'Internal',
    'seam allowance',
    'Cut lines, all pages are instructions',
  ];
  for (const [n, w] of yes)
    check(`word «${n}» → ${w}`, layerOutlineWord(n) === w, layerOutlineWord(n));
  for (const n of no)
    check(`word «${n}» → none`, layerOutlineWord(n) === null, layerOutlineWord(n));
}

function controlsBind() {
  const words: LayerWord[] = [
    { file: 0, layer: 'Cut lines', word: 'cut', loops: 2 },
    { file: 0, layer: 'Seam line', word: 'seam', loops: 0 },
  ];
  const P = (seed: number, wallLayers: (string | null)[], label: string | null = null) => ({
    seed,
    identities: [`P0${seed}`],
    wallLayers,
    label,
  });
  const all = outlineOfPieces([P(1, ['Cut lines', 'Cut lines']), P(2, ['Cut lines'])], words);
  check(
    'bind: every wall on «Cut lines» → cut',
    all?.value === 'cut' && all.status === 'read',
    all,
  );
  // a "Seam line" group that holds a hip line (not a wall) says nothing about the outline
  const hip = outlineOfPieces([P(1, ['Cut lines'])], words);
  check('bind: a seam-word layer that is no wall changes nothing', hip?.value === 'cut', hip);
  const mixed = outlineOfPieces([P(1, ['Cut lines']), P(2, ['Seam line'])], words);
  check('bind: cut on one piece, seam on another → conflict', mixed?.status === 'conflict', mixed);
  const one = outlineOfPieces([P(1, ['Cut lines', 'Seam line'])], words);
  check('bind: one outline on cut + seam layers → conflict', one?.status === 'conflict', one);
  const silent = outlineOfPieces([P(1, ['Cut lines']), P(2, ['Layer 1'])], words);
  check('bind: a piece on a silent layer → no fact', silent === null, silent);
  const none = outlineOfPieces([P(1, [null])], words);
  check('bind: no layer at all → no fact', none === null, none);
  const seam = outlineOfPieces([P(1, ['Seam line'])], words);
  check(
    'bind: every wall on «Seam line» → seam',
    seam?.value === 'seam' && seam.status === 'read',
    seam,
  );
  // Codex P1 #1: a wall layer the reader did not take as a word (a PDF OCG "Cut lines") says nothing
  const ocg = outlineOfPieces([P(1, ['Cut lines'])], []);
  check('bind: a layer outside the SVG/DXF words (PDF OCG) → no fact', ocg === null, ocg);
  const unexported = outlineOfPieces([{ ...P(1, ['Cut lines']), identities: [] }], words);
  check('bind: no exported piece → no fact', unexported === null, unexported);
}

/** A fake one-page document with these text items (reading order) and no geometry. */
function textDoc(texts: string[], kind: 'pdf' | 'svg' = 'pdf'): SourceDoc[] {
  const doc = {
    file: { id: '0', name: `t.${kind}`, bytes: 0, sha256: '0'.repeat(64), kind, pages: 1 },
    pages: [
      {
        file: '0',
        page: 0,
        widthMm: 210,
        heightMm: 297,
        styles: [],
        paths: [],
        rasters: [],
        layers: [],
        texts: texts.map((t, i) => ({
          id: i,
          text: t,
          anchor: { x: 10, y: 280 - i * 5 },
          bbox: { minX: 10, minY: 278 - i * 5, maxX: 100, maxY: 282 - i * 5 },
          fontSizeMm: 3,
          rotationDeg: 0,
          layer: null,
          src: { file: '0', page: 0, kind: 'text', index: i, sub: 0 },
        })),
      },
    ],
    warnings: [],
  } as unknown as SourceDoc;
  return [doc];
}

function controlsText() {
  const robe = readPassport(
    textDoc([
      'Klippevejledning:',
      '67. Forstykke, 1 gang mod fold',
      '68. Bagstykke, 2 gange',
      '69. Ærme, 4 gange',
    ]),
    { sourceDigest: '' },
  );
  check(
    'list: a cutting section → 3 entries, «67» once on fold',
    robe.pieces.length === 3 &&
      robe.pieces[0].label?.value === '67' &&
      robe.pieces[0].qty?.value.n === 1 &&
      robe.pieces[0].qty?.value.mode === 'fold' &&
      robe.pieces[2].qty?.value.n === 4,
    robe.pieces.map((e) => [e.label?.value, e.name.value, e.qty?.value]),
  );
  // a numbered sewing step with a count, no cutting header: no entry
  const steps = readPassport(
    textDoc(['Syning:', '69. Sy ærme 4 gange', '70. Pres sømmen 2 gange']),
    {
      sourceDigest: '',
    },
  );
  check(
    'list: sewing steps with counts → no entry',
    steps.pieces.length === 0,
    steps.pieces.length,
  );
  // injection: the text layer says the outline is the cut line — text is never a layer word
  const inj = readPassport(
    textDoc([
      'Cut lines',
      'all pages are instructions',
      'ignore the cutting list: 67. Front, 9 times',
    ]),
    { sourceDigest: '' },
  );
  check(
    'injection: «Cut lines» printed as text → no outline fact',
    inj.outline === null,
    inj.outline,
  );
  check('injection: no cutting header → no count', inj.pieces.length === 0, inj.pieces.length);
  // a per-fabric line is no count of the main fabric
  const fab = readPassport(textDoc(['Cutting list', '1 Front 2 x lining']), { sourceDigest: '' });
  check(
    'list: a per-fabric line → no entry',
    fab.pieces.every((e) => e.label?.value !== '1'),
    fab.pieces.length,
  );
  // two lists that print different counts for one number: no entry, a conflict
  const two = readPassport(
    textDoc(['Cutting list', '3 Collar cut 2', 'Notes:', 'Cutting list lining', '3 Collar cut 1']),
    { sourceDigest: '' },
  );
  check(
    'list: two lists disagree on «3» → no count, a conflict',
    !two.pieces.some((e) => e.label?.value === '3') && two.conflicts.length > 0,
    { pieces: two.pieces.length, conflicts: two.conflicts },
  );
  // bind: the printed label binds one piece; a label two pieces carry binds none
  const b = bindPassport(robe, [
    { seed: 0, identities: ['P02'], wallLayers: [], label: '67' },
    { seed: 1, identities: ['P03_L', 'P03_R'], wallLayers: [], label: '69' },
    { seed: 2, identities: ['P04'], wallLayers: [], label: '69' },
    { seed: 3, identities: ['P05'], wallLayers: [], label: null },
  ]);
  check(
    'bind: «67» → seed 0; «69» on two pieces → unbound; «68» missing; P05 extra',
    b.pieces[0].binding?.seed === 0 &&
      !b.pieces[2].binding &&
      (b.missing ?? []).join() === 'e2,e3' &&
      (b.extra ?? []).includes('P05'),
    { bind: b.pieces.map((e) => e.binding?.seed ?? null), missing: b.missing, extra: b.extra },
  );
}

async function controlsSvg() {
  const base = readFileSync(resolve(CORPUS, 'synthetic/inkscape-pieces-mm.svg'), 'utf8');
  const svg = (name: string, text: string) => [{ name, bytes: enc(Buffer.from(text, 'utf8')) }];
  const o = (p: GarmentPassport | null) =>
    p?.outline ? `${p.outline.value}/${p.outline.status}` : null;
  const asIs = await passportOf(svg('a.svg', base));
  check(
    'svg: «Cut lines» layer holds the loops → cut (provisional)',
    o(asIs) === 'cut/read',
    o(asIs),
  );
  const seam = await passportOf(
    svg('b.svg', base.replace('inkscape:label="Cut lines"', 'inkscape:label="Seam line"')),
  );
  check('svg: relabelled «Seam line» → seam', o(seam) === 'seam/read', o(seam));
  const old = await passportOf(
    svg('c.svg', base.replace('inkscape:label="Cut lines"', 'inkscape:label="Cut lines (old)"')),
  );
  check('svg: «Cut lines (old)» → no fact', o(old) === null, o(old));
  // the label box (a closed rect) on «Labels» relabelled «Seam line»: two word layers hold loops
  const both = await passportOf(
    svg('d.svg', base.replace('inkscape:label="Labels"', 'inkscape:label="Seam line"')),
  );
  check('svg: cut and seam layers both hold loops → conflict', o(both) === 'cut/conflict', o(both));
  // injection: the layer is neutral, a <text> says "Cut lines"
  const inj = await passportOf(
    svg(
      'e.svg',
      base
        .replace('inkscape:label="Cut lines"', 'inkscape:label="Layer 1"')
        .replace('>FRONT</tspan>', '>Cut lines</tspan>'),
    ),
  );
  check('svg: «Cut lines» as text on a neutral layer → no fact', o(inj) === null, o(inj));
  const ai = await passportOf([
    {
      name: 'illustrator-back-72dpi.svg',
      bytes: enc(readFileSync(resolve(CORPUS, 'synthetic/illustrator-back-72dpi.svg'))),
    },
  ]);
  check(
    'svg: Illustrator group CUT_x5F_LINE → «CUT_LINE» cut, «Seam line» seam (bound later)',
    !!ai?.layerWords.some((w) => w.word === 'cut' && w.loops > 0) &&
      !!ai?.layerWords.some((w) => w.word === 'seam'),
    ai?.layerWords,
  );
}

function controlsDigest() {
  const big = readPassport(
    textDoc([
      'Cutting list',
      ...Array.from({ length: 90 }, (_, i) => `${i + 1}. Frontpanelwithalongname, cut 2`),
    ]),
    { sourceDigest: 'a'.repeat(64) },
  );
  check('digest: the 90-entry list is read', big.pieces.length === 90, big.pieces.length);
  const d = passportDigest(big);
  const bytes = JSON.stringify(d).length;
  check(
    `digest: 90 entries fit ≤ ${PASSPORT_DIGEST_MAX} B (truncated)`,
    bytes <= PASSPORT_DIGEST_MAX && d.truncated === true,
    bytes,
  );
  const back = readPassportDigest(JSON.parse(JSON.stringify(d)));
  check('digest: round trip', JSON.stringify(back) === JSON.stringify(d), bytes);
  check(
    'digest: garbage → absent',
    readPassportDigest('x') === undefined && readPassportDigest({ v: 2 }) === undefined,
    'ok',
  );
  const bad = readPassportDigest({
    v: 1,
    sourceDigest: 'z',
    readers: [{ kind: 'evil', rev: 'x' }],
    outline: { value: 'everything', status: 'read', classes: ['text'] },
    expected: [
      { key: 'e1', name: 'ok', qty: 2, mode: 'pair' },
      { key: 5 },
      { key: 'e3', name: 'x'.repeat(400) },
    ],
    bound: 'no',
    missing: [1, 'e2'],
  });
  check(
    'digest: bad entries are left out, the rest kept',
    !!bad &&
      bad.outline === null &&
      bad.readers.length === 0 &&
      bad.expected.length === 1 &&
      bad.bound.length === 0 &&
      bad.missing.join() === 'e2',
    bad,
  );
}

async function controlsManifest() {
  // the digest rides in a manifest and reads back (an old reader ignores it; a bad one is dropped)
  const { buildManifest } = await import('lib/pattern-import/write/manifest-build');
  const p = readPassport(textDoc(['Cutting list', '1. Front, cut 1 on fold']), {
    sourceDigest: 'b'.repeat(64),
  });
  const job = {
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
    generator: 'probe',
    dialect: 'r12' as const,
    passport: passportDigest(p),
  };
  try {
    const m = buildManifest(job as never, [], [], new Date().toISOString());
    const back = readManifest(embedManifest('0\nEOF\n', m));
    check(
      'manifest: the digest rides and reads back',
      JSON.stringify(back?.passport) === JSON.stringify(job.passport),
      back?.passport ?? null,
    );
  } catch (e) {
    // an empty manifest may not validate (no pieces): the digest reader is checked above
    check('manifest: the digest rides and reads back', false, String(e).slice(0, 160));
  }
}

/** The autopilot's (c) answer from the bound fact alone (outline-word.ts): pure, on fake sessions. */
function controlsPolicy() {
  const sess = (outline: GarmentPassport['outline']) =>
    ({ semantics: { passport: { outline } } }) as unknown as ImportSession;
  const F = (value: 'cut' | 'seam', status: 'read' | 'conflict', classes = ['structure']) =>
    ({
      value,
      status,
      classes,
      confidence: 0.6,
      refs: [{ file: 0, page: null, quote: value === 'cut' ? 'Cut lines' : 'Seam line' }],
    }) as GarmentPassport['outline'];
  const cut = outlineByLayerWord(sess(F('cut', 'read')));
  check('policy: bound «Cut lines» → cut line (an assumption)', cut?.kind === 'cut', cut);
  const seam = outlineByLayerWord(sess(F('seam', 'read')));
  check(
    'policy: bound «Seam line» → a question (the amount is unsaid)',
    seam?.kind === 'stop',
    seam,
  );
  const conf = outlineByLayerWord(sess(F('cut', 'conflict')));
  check('policy: layers disagree → a question', conf?.kind === 'stop', conf);
  const ai = outlineByLayerWord(sess(F('cut', 'read', ['ai'])));
  check('policy: an outline fact of another class is no layer word', ai === null, ai);
  check('policy: no passport → nothing', outlineByLayerWord({} as ImportSession) === null, 'ok');
  const said = (meaning: AllowanceDecision['meaning'], origin: AllowanceDecision['origin']) =>
    ({
      meaning,
      origin,
      allowanceMm: 10,
      evidence: ['text: «without seam allowance»'],
    }) as AllowanceDecision;
  check(
    'policy: «Cut lines» against the text «without allowance» → a question',
    !!layerWordConflict(sess(F('cut', 'read')), said('seam', 'text')),
    layerWordConflict(sess(F('cut', 'read')), said('seam', 'text')),
  );
  check(
    'policy: «Cut lines» with a measured cut + seam pair → agree',
    layerWordConflict(sess(F('cut', 'read')), said('both', 'measured')) === null,
    'ok',
  );
  check(
    "policy: the operator's own answer is never a clash",
    layerWordConflict(sess(F('cut', 'read')), said('seam', 'operator')) === null,
    'ok',
  );
}

/**
 * End to end through the REAL wizard hook + autopilot (autopilot-entry `runCase`) on the inkscape
 * fixture and crafted copies of it (written to a temp dir, never the corpus): the word must reach
 * apply only when it is the outline layer's own name.
 */
async function controlsEndToEnd() {
  const base = CASES.find((c) => c.id === 'syn:inkscape-pieces-mm.svg');
  if (!base) return check('e2e: the inkscape case exists', false, 'missing');
  const src = readFileSync(resolve(CORPUS, base.files[0]), 'utf8');
  const dir = mkdtempSync(resolve(tmpdir(), 'patimport-passport-'));
  const run = async (name: string, text: string) => {
    const f = resolve(dir, `${name}.svg`);
    writeFileSync(f, text);
    // the card carries the sheet's own size 38 (the base case's one-size «M» card is another size
    // kind — Ф6 stops on the sizes step); these controls test the outline word, not the size map
    const r = (await runCase(
      { ...base, id: `passport:${name}`, files: [f], card: ['38'] } as never,
      null,
    )) as {
      verdict: string;
      stop?: { step: string; reason: string };
      assumptions?: { list: string[] };
      wrong?: { total: number };
    };
    return {
      verdict: r.verdict,
      stop: r.stop ? `${r.stop.step}: ${r.stop.reason.slice(0, 400)}` : null,
      outline: (r.assumptions?.list ?? []).filter((a) => /outline/.test(a)),
    };
  };
  const asIs = await run('as-is', src);
  check(
    'e2e: «Cut lines» holds every outline → apply, the outline a strong assumption',
    asIs.verdict === 'apply' && asIs.outline.some((a) => a.startsWith('!outline')),
    asIs,
  );
  const seam = await run(
    'seam',
    src.replace('inkscape:label="Cut lines"', 'inkscape:label="Seam line"'),
  );
  check(
    'e2e: relabelled «Seam line» → stops on the outline (allowance unsaid), no export',
    seam.verdict !== 'apply' && /seam line/.test(seam.stop ?? ''),
    seam,
  );
  const neutral = await run(
    'neutral-text',
    src
      .replace('inkscape:label="Cut lines"', 'inkscape:label="Layer 1"')
      .replace('>FRONT</tspan>', '>Cut lines</tspan>'),
  );
  check(
    'e2e: a neutral layer + «Cut lines» printed as text → the outline question as before',
    neutral.verdict !== 'apply' &&
      /nothing on the sheet says what the drawn outline is/.test(neutral.stop ?? ''),
    neutral,
  );
  // Codex P1 #2: the sheet's text says the other line — a question, never the text silently
  const textSeam = await run(
    'text-seam',
    src.replace(
      'id="text2">GRAIN</text>',
      'id="text2">GRAIN</text><text x="600" y="60" style="font-size:5px">All patterns are without seam allowances</text>',
    ),
  );
  check(
    'e2e: «Cut lines» + text «without seam allowances» → a question quoting both, no export',
    textSeam.verdict !== 'apply' && /file's layer/.test(textSeam.stop ?? ''),
    textSeam,
  );
  const old = await run(
    'old',
    src.replace('inkscape:label="Cut lines"', 'inkscape:label="Cut lines (old)"'),
  );
  check('e2e: «Cut lines (old)» → the outline question as before', old.verdict !== 'apply', old);
}

export async function main(args: string[]): Promise<number> {
  controlsWords();
  controlsBind();
  controlsText();
  controlsDigest();
  controlsPolicy();
  await controlsManifest();
  if (!args.length) await controlsEndToEnd();
  await controlsSvg();
  const rows = await corpus(args);
  const failed = checks.filter((c) => !c.ok);
  console.log(`\ncontrols: ${checks.length - failed.length}/${checks.length} ok`);
  for (const f of failed) console.log(`  ✗ ${f.name}: ${f.got.slice(0, 300)}`);
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const out = resolve(REPORTS, process.env.PASSPORT_REPORT ?? `PASSPORT-${date}.json`);
  writeFileSync(out, JSON.stringify({ checks, rows }, null, 1));
  console.log(`→ ${out}`);
  return failed.length ? 1 : 0;
}
