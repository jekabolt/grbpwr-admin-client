// F7 probe — fabrics + atomic card apply (08-CONTRACT §4.3, 09-CARD-CONTRACT K1 items 7–11).
//   A  fabric words: lining / interfacing / rib / … in EN DE RU FR ES IT NL PL SV DA NO FI
//   B  cut lists read from the corpus instructions (polupalto, r4454, palto) vs truth
//   C  polupalto-like import on a real CLO DXF: fast path → F5 specs → proposeFabrics (labels, cut
//      layout, AI hints) → planScopes → writeAndGate per scope → buildDraft; BOM with interlining,
//      without it, without lining (refused), unsorted lines by section
//   D  applyDraft with a fake upload service + fake form: one DXF per scope, aliases keyed by scope,
//      fused flags, lining not bound to the shell piece, failure on the 2nd upload → zero writes
//      (orphan listed), re-apply → zero writes, existing MIRRORED piece → IDENTICAL point write
//   E  every garment CLO DXF of the corpus: main + lining (pockets) through writeAndGate
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as blockCode from 'components/managers/tech-card/components/nesting/block-code';
import { readDxf, segmentDxf, dxfFastPath } from 'lib/pattern-import/adapters/dxf';
import { extractPdf, DEFAULT_EXTRACT_OPTS, setPdfjsLoader } from 'lib/pattern-import/adapters/pdf';
import type { PdfjsModule } from 'lib/pattern-import/adapters/pdf';
import { type CardBlockRules, writeAndGate } from 'lib/pattern-import/gate';
import { buildPieceSpecsDetailed, detectAllowance } from 'lib/pattern-import/semantics';
import { proposeSizeMap } from 'lib/pattern-import/sizes/map';
import { readManifest } from 'lib/pattern-import/manifest';
import {
  PURPOSE,
  SECTION,
  fabricKindsIn,
  fusedSeeds,
  linesOf,
  planScopes,
  proposeFabricsDetailed,
  readCutLists,
} from 'lib/pattern-import/fabrics';
import { buildDraft, readsBack, type DraftCardContext } from 'lib/pattern-import/fabrics/draft';
import {
  followUpTargets,
  initialRows,
  retryRows,
  runFollowUp,
  type FollowUpRow,
} from 'lib/pattern-import/fabrics/followup';
import {
  applyDraft,
  planFormWrites,
  scopeKeyOf,
  type LiveCard,
} from 'lib/pattern-import/fabrics/apply';
import type {
  CardDraft,
  CardSize,
  ConversionManifest,
  DraftScope,
  DraftScopeTarget,
  FabricAssignment,
  GateReport,
  IRText,
  ManifestSize,
  ManifestSource,
  PieceSpec,
  PtMm,
  Seed,
  SemanticsInput,
  SizeMap,
} from 'lib/pattern-import/types';

const rules: CardBlockRules = blockCode;
const REPO = process.env.PATIMPORT_REPO ?? process.cwd();
const CORPUS =
  process.env.PATIMPORT_CORPUS ??
  '/Users/jekabolt/go/src/github.com/jekabolt/tmp/plans/pdf-to-dxf/corpus/';
const REPORTS =
  process.env.PATIMPORT_REPORTS ??
  '/Users/jekabolt/go/src/github.com/jekabolt/tmp/plans/pdf-to-dxf/reports/';
setPdfjsLoader(
  () =>
    import(
      pathToFileURL(path.resolve(REPO, 'node_modules/pdfjs-dist/legacy/build/pdf.mjs')).href
    ) as Promise<PdfjsModule>,
);

// ── harness ─────────────────────────────────────────────────────────────────────────────────
type Row = { section: string; what: string; ok: boolean; detail: string };
const rows: Row[] = [];
let section = '';
const ck = (ok: boolean, what: string, detail = '') => {
  rows.push({ section, what, ok, detail });
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${detail ? `  — ${detail}` : ''}`);
  return ok;
};
const head = (s: string) => {
  section = s;
  console.log(`\n${s}`);
};
const failing = (r: GateReport) =>
  r.checks
    .filter((c) => !c.ok && c.severity === 'block')
    .map((c) => `${c.id}:${c.blocks.slice(0, 3).join(',')}`);
const ab = (p: string) => {
  const b = fs.readFileSync(p);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};
const sameSet = <T>(a: Iterable<T>, b: Iterable<T>) => {
  const x = new Set(a);
  const y = new Set(b);
  return x.size === y.size && [...x].every((v) => y.has(v));
};
const json: Record<string, unknown> = {};

// ── fixtures ────────────────────────────────────────────────────────────────────────────────
let textId = 900000;
/** A text line of an instruction page (page frame mm, y-up). */
function pageText(text: string, x: number, y: number, page = 0, font = 3): IRText {
  return {
    id: textId++,
    text,
    anchor: { x, y },
    bbox: { minX: x, minY: y, maxX: x + text.length * font * 0.5, maxY: y + font },
    fontSizeMm: font,
    rotationDeg: 0,
    layer: null,
    src: { file: '9', page, op: 0, sub: 0 },
  };
}
/** Lines top → bottom, one column. */
const page = (lines: string[], p = 0, x = 20) =>
  lines.map((l, i) => pageText(l, x, 270 - i * 5, p));

const CARD5: CardSize[] = ['xs', 's', 'm', 'l', 'xl'].map((n, rank) => ({
  sizeId: 500 + rank,
  name: `${n}_${44 + rank * 2}ta_m`,
  token: n.toUpperCase(),
  rank,
}));

const T = (
  scopeKey: string,
  fabricPurpose: string,
  label: string,
  sections: string[],
  bomLineKey = '',
): DraftScopeTarget => ({
  scopeKey,
  fabricPurpose,
  bomLineKey,
  label,
  isInterlining: sections.includes(SECTION.interlining),
  sections,
});
const MAIN = T(PURPOSE.main, PURPOSE.main, 'main fabric · Loden', [SECTION.fabric], 'L-MAIN');
const LINING = T(PURPOSE.lining, PURPOSE.lining, 'lining · Cupro', [SECTION.lining], 'L-LIN');
const INTER = T(
  PURPOSE.interfacing,
  PURPOSE.interfacing,
  'interlining · G785',
  [SECTION.interlining],
  'L-INT',
);
const CONTRAST = T(
  PURPOSE.contrast,
  PURPOSE.contrast,
  'contrast · rib knit 1x1',
  [SECTION.fabric],
  'L-RIB',
);

// ═════════════════════════════════════════════════════════════════════════════════════════
export async function main(): Promise<number> {
  // ── A ───────────────────────────────────────────────────────────────────────────────────
  head('A  fabric words (labels on pieces, 12 languages)');
  const words: [string, string][] = [
    ['lining', 'lining'],
    ['Vorderteil (Futter)', 'lining'],
    ['ПОДКЛАДКА', 'lining'],
    ['из подкладочной ткани', 'lining'],
    ['forro', 'lining'],
    ['foder', 'lining'],
    ['vuori', 'lining'],
    ['doublure', 'lining'],
    ['voering', 'lining'],
    ['podszewka', 'lining'],
    ['fodera', 'lining'],
    ['interfacing', 'interfacing'],
    ['Einlage', 'interfacing'],
    ['дублерин', 'interfacing'],
    ['прокладка', 'interfacing'],
    ['entretela', 'interfacing'],
    ['triplure', 'interfacing'],
    ['флизелин', 'interfacing'],
    ['клеевой ткани', 'interfacing'],
    ['mellanlägg', 'interfacing'],
    ['rib knit', 'rib'],
    ['Bündchen', 'rib'],
    ['рибана', 'rib'],
    ['Rippenstrickstoff', 'rib'],
    ['кашкорсе', 'rib'],
    ['tricot côtelé', 'rib'],
    ['Volumenvlies', 'insulation'],
    ['утеплитель', 'insulation'],
    ['Garniturstoff', 'contrast'],
    ['Taschenfutter', 'pocketing'],
    ['Oberstoff', 'main'],
    ['основная ткань', 'main'],
  ];
  for (const [t, want] of words) {
    const got = fabricKindsIn(t)[0]?.kind ?? null;
    ck(got === want, `«${t}» → ${want}`, got === want ? '' : `got ${got}`);
  }
  for (const t of [
    'Ärmelbündchen',
    'ribbon',
    'Stoffbruch',
    'Taschenbeutel',
    'сетка 1 см',
    'Vorderteil',
  ])
    ck(
      !fabricKindsIn(t).some((h) => h.kind === 'rib' || h.kind === 'lining' || h.kind === 'mesh'),
      `«${t}» is not lining / rib / mesh`,
      fabricKindsIn(t)
        .map((h) => h.kind)
        .join(','),
    );

  // ── B ───────────────────────────────────────────────────────────────────────────────────
  head('B  cut lists read from the corpus instructions');
  const corpusLists: Record<string, unknown> = {};
  const want: Record<string, { pages: number[]; expect: Record<string, string[]> }> = {
    // truth.json: lining 19–23 (Futterteile), rib knit 17–18 («Garniturstoff» = contrast cloth = rib;
    // the page clips «Rippen…», so the prose reads contrast — both go to the contrast purpose)
    polupalto: {
      pages: [0, 1, 2, 3],
      expect: { lining: ['19', '20', '21', '22', '23'], 'rib|contrast': ['17', '18'] },
    },
    // instructions p.2: main 1–11, lining 1, 2, 3, 6, 7, 11
    r4454: {
      pages: [0, 1, 2, 3],
      expect: {
        main: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11'],
        lining: ['1', '2', '3', '6', '7', '11'],
      },
    },
    // «Раскрой: Из шерстяного сукна: 21…27», «Из подкладочной ткани: деталь 21 … 22 … 23–25»
    palto: {
      pages: [0, 1, 2],
      expect: {
        main: ['21', '22', '23', '24', '25', '26', '27'],
        lining: ['21', '22', '23', '24', '25'],
      },
    },
  };
  for (const [id, w] of Object.entries(want)) {
    const full = path.join(CORPUS, 'pdf', `${id}.pdf`);
    if (!fs.existsSync(full)) {
      ck(false, `${id}: corpus file missing`);
      continue;
    }
    const doc = await extractPdf(
      { id: '0', name: `${id}.pdf`, bytes: ab(full) },
      { ...DEFAULT_EXTRACT_OPTS, pages: w.pages },
    );
    const texts = doc.pages.flatMap((p) => p.texts);
    const lists = readCutLists(linesOf(texts, (t) => `${t.src.file}:${t.src.page}`));
    const byKind: Record<string, string[]> = {};
    for (const l of lists) byKind[l.kind] = [...new Set([...(byKind[l.kind] ?? []), ...l.pieces])];
    corpusLists[id] = lists.map((l) => ({
      kind: l.kind,
      how: l.how,
      label: l.label,
      pieces: l.pieces,
      widthCm: l.widthCm,
    }));
    for (const [kind, nums] of Object.entries(w.expect)) {
      const got = kind.split('|').flatMap((k) => byKind[k] ?? []);
      const miss = nums.filter((n) => !got.includes(n));
      ck(
        !miss.length,
        `${id}: ${kind} lists ${nums.join(',')}`,
        miss.length ? `missing ${miss.join(',')} · got ${got.join(',')}` : `got ${got.join(',')}`,
      );
    }
    console.log(
      `        ${lists.map((l) => `${l.kind}/${l.how}[${l.pieces.join(',')}]«${l.label.slice(0, 40)}»`).join('\n        ')}`,
    );
  }
  json.corpusLists = corpusLists;

  // ── C ───────────────────────────────────────────────────────────────────────────────────
  head('C  polupalto-like import on a real CLO DXF (fast path → F5 → fabrics → writeAndGate)');
  const DXF = path.join(CORPUS, 'dxf-clo', 'Allsizes_with_notches.dxf');
  const read = await readDxf(
    { id: '0', name: path.basename(DXF), bytes: ab(DXF) },
    { sagittaMm: 0.05, keepFills: true },
  );
  const fp = dxfFastPath(read, segmentDxf(read));
  const sizeMap = proposeSizeMap(fp.run, CARD5);
  const idOfSeed = new Map<number, string>();
  {
    const d0 = buildPieceSpecsDetailed(semInput(fp, sizeMap, {}));
    for (const p of d0.output.pieces) idOfSeed.set(p.seed, p.identity);
  }
  const seedOf = (identity: string) => [...idOfSeed].find(([, id]) => id === identity)![0];
  const S = {
    BP: seedOf('BP'),
    FP_R: seedOf('FP_R'),
    SL_R: seedOf('SL_R'),
    SL_L: seedOf('SL_L'),
    BP_1: seedOf('BP_1'),
    CLR_3: seedOf('CLR_3'),
    FP_L: seedOf('FP_L'),
    BP_2: seedOf('BP_2'),
    CLR_4: seedOf('CLR_4'),
  };
  // piece numbers as printed: 1 BP · 2 FP_R · 3 SL_R · 4 SL_L · 5 BP_1 · 6 CLR_3 · 7 FP_L · 8 BP_2 · 9 CLR_4
  const numberOf = new Map<number, string>(
    Object.values(S).map((seed, i) => [seed, String(i + 1)]),
  );
  // the instructions page, the way Burda / dbortik print it
  const INSTR = [
    ...page(
      [
        'Zuschnitt / Раскрой:',
        '1 Rückenteil',
        '2 Vorderteil',
        '3 Ärmel',
        '4 Ärmel',
        '6 Oberkragen',
        '7 Vorderteil',
        'Nähen Sie mit kleinen Stichen, bügeln Sie alle Nähte auseinander.',
        'Die Kanten versäubern, Saum umbügeln und von Hand annähen jetzt.',
        'Alle Zugaben auf die linke Stoffseite übertragen und zuschneiden.',
        'Die Ärmel einsetzen, dabei die Markierungen aufeinander stecken.',
        'FUTTER • LINING • ПОДКЛАДКА 140 cm',
        '1 Rückenteil',
        '2 Vorderteil',
        '7 Vorderteil',
      ],
      0,
    ),
    ...page(
      [
        'EINLAGE • INTERFACING • ДУБЛЕРИН',
        '6 Oberkragen',
        'Die Einlage laut Zeichnung aufbügeln, dann die Schnittkonturen übertragen.',
        'Bügeln Sie mit mittlerer Temperatur ohne Dampf, Teil abkühlen lassen.',
        'Nach dem Abkühlen die Teile vorsichtig vom Bügelbrett nehmen bitte.',
        'Die Kanten der Einlage dürfen nicht über die Naht hinausragen hier.',
        'GARNITURSTOFF: Teil 9 aus Rippenstrickstoff zuschneiden.',
      ],
      1,
    ),
  ];
  // a label printed inside BP_2: «ПОДКЛАДКА» → lining only
  const LABEL = pageText('СПИНКА ПОДКЛАДКА', 0, 0, 0, 6);
  // the AI's call for BP_1, where the sheet says nothing: main + interlining
  const AI = [{ seed: S.BP_1, fabrics: [PURPOSE.main, PURPOSE.interfacing], confidence: 0.9 }];

  const V1 = [MAIN, LINING, INTER, CONTRAST];
  const r1 = await runImport(fp, sizeMap, V1, {
    instr: INSTR,
    label: { seed: S.BP_2, text: LABEL },
    numberOf,
    ai: AI,
  });
  const scopeSeeds = (a: FabricAssignment, t: DraftScopeTarget) =>
    (a.byPurpose[t.scopeKey] ?? []).map((x) => idOfSeed.get(x)!).sort();
  ck(
    sameSet(scopeSeeds(r1.a, MAIN), ['BP', 'FP_R', 'SL_R', 'SL_L', 'BP_1', 'CLR_3', 'FP_L']),
    'V1 main ← shell list + unlisted + AI (BP_1); BP_2 (lining label) and CLR_4 (rib) not main',
    scopeSeeds(r1.a, MAIN).join(','),
  );
  ck(
    sameSet(scopeSeeds(r1.a, LINING), ['BP', 'FP_R', 'FP_L', 'BP_2']),
    'V1 lining ← lining list (1, 2, 7) + label «ПОДКЛАДКА» (BP_2)',
    scopeSeeds(r1.a, LINING).join(','),
  );
  ck(
    sameSet(scopeSeeds(r1.a, INTER), ['CLR_3', 'BP_1']),
    'V1 interlining ← Einlage list (6) + AI (BP_1)',
    scopeSeeds(r1.a, INTER).join(','),
  );
  ck(
    sameSet(scopeSeeds(r1.a, CONTRAST), ['CLR_4']),
    'V1 contrast ← rib knit «Garniturstoff: Teil 9 aus Rippenstrickstoff»',
    scopeSeeds(r1.a, CONTRAST).join(','),
  );
  ck(!r1.problems.length, 'V1 no blocking problem', r1.problems.map((p) => p.message).join(' | '));
  ck(
    r1.scopes.length === 4 && new Set(r1.scopes.map((s) => s.target.scopeKey)).size === 4,
    'V1 → 4 DXFs, one per scope',
    r1.scopes.map((s) => s.target.scopeKey.replace('TECH_CARD_BOM_PURPOSE_', '')).join(' '),
  );
  for (const s of r1.scopes)
    ck(
      r1.gate[s.target.scopeKey].passed,
      `V1 ${s.target.label}: gate G1–G13 passes`,
      `${s.manifest.blocks.length} blocks · ${failing(r1.gate[s.target.scopeKey]).join(' ') || 'all block checks ok'}`,
    );
  const lin = r1.scopes.find((s) => s.target.scopeKey === LINING.scopeKey)!;
  ck(
    sameSet(lin.identities, ['LIN_BP', 'LIN_FP_L', 'LIN_FP_R', 'LIN_BP_2']),
    'V1 lining file: identities renamed LIN_…, never spelled like the shell',
    lin.identities.join(','),
  );
  const mainScope = r1.scopes.find((s) => s.target.scopeKey === MAIN.scopeKey)!;
  for (const s of r1.scopes) {
    const m = readManifest(s.dxfText)!;
    ck(
      m.scope.fabricPurpose === s.target.fabricPurpose &&
        m.scope.bomLineKey === s.target.bomLineKey &&
        !!m.gate,
      `V1 ${s.target.label}: manifest scope = the card scope, gate embedded`,
      `${m.scope.fabricPurpose}/${m.scope.bomLineKey}`,
    );
  }
  const fusedIn = (sc: DraftScope) =>
    sc.manifest.pieces
      .filter((p) => p.fused)
      .map((p) => p.identity)
      .sort();
  ck(
    sameSet(fusedIn(mainScope), ['BP_1', 'CLR_3']),
    'V1 manifest: interlining pieces carry fused in the shell file',
    fusedIn(mainScope).join(','),
  );
  json.v1 = r1.scopes.map((s) => ({
    scope: s.target.scopeKey,
    identities: s.identities,
    blocks: s.manifest.blocks.length,
    gate: r1.gate[s.target.scopeKey].passed,
  }));

  // the draft: card pieces, aliases, fused
  const card0: DraftCardContext = { techCardId: 7, existingPieces: [], styleLabel: 'FW26 · 7142' };
  let n = 0;
  const mint = () => `K${String(++n).padStart(25, '0')}`;
  const d1 = buildDraft({ scopes: r1.scopes }, card0, { mintKey: mint });
  const pieceByName = new Map(d1.pieces.map((p) => [p.name, p]));
  ck(
    sameSet(
      d1.pieces.map((p) => p.name),
      ['BP', 'FP', 'SL', 'BP_1', 'CLR_3', 'LIN_BP', 'LIN_FP', 'LIN_BP_2', 'CLR_4'],
    ),
    'V1 card pieces: pairs → one piece, lining → its own LIN_ piece, interlining → the shell piece',
    d1.pieces.map((p) => `${p.name}×${p.piecesPerGarment}${p.fused ? ' fused' : ''}`).join(', '),
  );
  ck(
    pieceByName.get('FP')?.piecesPerGarment === 2 &&
      pieceByName.get('SL')?.piecesPerGarment === 2 &&
      pieceByName.get('LIN_FP')?.piecesPerGarment === 2,
    'V1 pairs ×2 (both hands drawn, IDENTICAL)',
    '',
  );
  ck(
    d1.pieces.every((p) => p.cutSymmetry === 'TECH_CARD_PIECE_CUT_SYMMETRY_IDENTICAL'),
    'V1 every piece IDENTICAL (D1′)',
  );
  ck(
    !!pieceByName.get('CLR_3')?.fused &&
      !!pieceByName.get('BP_1')?.fused &&
      d1.pieces.filter((p) => p.fused).length === 2,
    'V1 fused = exactly the interlining pieces',
    d1.pieces
      .filter((p) => p.fused)
      .map((p) => `${p.name}/${p.fusingMode}`)
      .join(','),
  );
  const aliasOf = (scopeKey: string, block: string) =>
    d1.aliases.find((a) => a.scopeKey === scopeKey && a.blockName === block);
  ck(
    aliasOf(INTER.scopeKey, 'CLR_3')?.pieceLineKey ===
      aliasOf(MAIN.scopeKey, 'CLR_3')?.pieceLineKey,
    'V1 interlining CLR_3 binds the SAME piece as the shell CLR_3 (K1 item 11)',
  );
  ck(
    aliasOf(LINING.scopeKey, 'LIN_FP_L')?.pieceLineKey !==
      aliasOf(MAIN.scopeKey, 'FP_L')?.pieceLineKey &&
      aliasOf(LINING.scopeKey, 'LIN_FP_L')?.pieceLineKey === pieceByName.get('LIN_FP')?.lineKey,
    'V1 lining LIN_FP_L binds LIN_FP, not the shell FP',
  );
  const perScope = new Map<string, number>();
  for (const a of d1.aliases) perScope.set(a.scopeKey, (perScope.get(a.scopeKey) ?? 0) + 1);
  ck(
    perScope.get(MAIN.scopeKey) === 7 &&
      perScope.get(LINING.scopeKey) === 4 &&
      perScope.get(INTER.scopeKey) === 2 &&
      perScope.get(CONTRAST.scopeKey) === 1,
    'V1 aliases per scope: main 7, lining 4, interlining 2, contrast 1',
    [...perScope].map(([k, v]) => `${k.replace('TECH_CARD_BOM_PURPOSE_', '')} ${v}`).join(' · '),
  );
  ck(
    new Set(d1.aliases.map((a) => `${a.scopeKey}|${a.blockName.toLowerCase()}`)).size ===
      d1.aliases.length,
    'V1 aliases unique per (scope, block)',
  );
  ck(
    d1.scopes.every((s) => /^fw26-7142-[a-z]+-[0-9a-f]{8}\.dxf$/.test(s.filename)),
    'V1 file names <style>-<purpose>-<fingerprint>.dxf',
    d1.scopes.map((s) => s.filename).join(' '),
  );
  json.v1draft = {
    pieces: d1.pieces,
    aliases: d1.aliases,
    files: d1.scopes.map((s) => s.filename),
  };

  // V2: no interlining in the BOM → no interlining file, the pieces carry `fused`
  const V2 = [MAIN, LINING, CONTRAST];
  const r2 = await runImport(fp, sizeMap, V2, {
    instr: INSTR,
    label: { seed: S.BP_2, text: LABEL },
    numberOf,
    ai: AI,
  });
  ck(
    r2.scopes.length === 3 && !r2.scopes.some((s) => s.target.scopeKey === INTER.scopeKey),
    'V2 (no interlining in BOM) → 3 DXFs, none for interlining',
    r2.scopes.map((s) => s.target.label).join(' · '),
  );
  ck(
    !r2.a.interliningInBom &&
      sameSet(
        [...fusedSeeds(r2.a, V2)].map((x) => idOfSeed.get(x)!),
        ['CLR_3', 'BP_1'],
      ),
    'V2 fused flag ← the interlining proposal (decision 14)',
    [...fusedSeeds(r2.a, V2)].map((x) => idOfSeed.get(x)).join(','),
  );
  const m2 = r2.scopes.find((s) => s.target.scopeKey === MAIN.scopeKey)!;
  ck(
    sameSet(fusedIn(m2), ['BP_1', 'CLR_3']),
    'V2 manifest: CLR_3, BP_1 fused in the shell file',
    fusedIn(m2).join(','),
  );
  const d2 = buildDraft({ scopes: r2.scopes }, card0, { mintKey: mint });
  ck(
    d2.pieces
      .filter((p) => p.fused)
      .map((p) => p.name)
      .sort()
      .join(',') === 'BP_1,CLR_3',
    'V2 draft: fused pieces BP_1, CLR_3 (fusing mode FULL)',
    d2.pieces
      .filter((p) => p.fused)
      .map((p) => p.fusingMode)
      .join(','),
  );
  ck(
    r2.scopes.every((s) => r2.gate[s.target.scopeKey].passed),
    'V2 every file passes the gate',
  );

  // V3: main only → lining and rib refused, never dropped silently
  const V3 = [MAIN];
  const r3 = await runImport(fp, sizeMap, V3, {
    instr: INSTR,
    label: { seed: S.BP_2, text: LABEL },
    numberOf,
    ai: AI,
  });
  const refusedIds = (r3.a.refused ?? [])
    .flatMap((r) => r.seeds.map((x) => idOfSeed.get(x)!))
    .sort();
  ck(
    (r3.a.refused ?? []).some(
      (r) => r.purpose === PURPOSE.lining && /no lining line/.test(r.reason),
    ) && (r3.a.refused ?? []).some((r) => r.purpose === PURPOSE.contrast),
    'V3 (main only): lining + rib refused with a reason',
    (r3.a.refused ?? []).map((r) => `${r.label}: ${r.reason.slice(0, 60)}…`).join(' | '),
  );
  ck(
    r3.problems.length > 0 &&
      r3.scopes.length === 0 &&
      sameSet(
        r3.problems.flatMap((p) => p.seeds.map((x) => idOfSeed.get(x)!)),
        ['BP_2', 'CLR_4'],
      ),
    'V3 blocks the write on the lining-only BP_2 and the rib-only CLR_4 (no silent drop)',
    r3.problems.map((p) => p.message.slice(0, 70)).join(' | '),
  );
  ck(
    refusedIds.includes('FP_L') &&
      sameSet(scopeSeeds(r3.a, MAIN), ['BP', 'FP_R', 'SL_R', 'SL_L', 'BP_1', 'CLR_3', 'FP_L']),
    'V3 the shell copies stay in main; their lining copies are listed as refused',
    refusedIds.join(','),
  );
  const r3b = await runImport(fp, sizeMap, V3, {
    instr: INSTR,
    label: { seed: S.BP_2, text: LABEL },
    numberOf,
    ai: AI,
    operator: (a) => ({
      ...a,
      byPurpose: {
        ...a.byPurpose,
        [MAIN.scopeKey]: [...(a.byPurpose[MAIN.scopeKey] ?? []), S.BP_2, S.CLR_4],
      },
    }),
  });
  ck(
    !r3b.problems.length && r3b.scopes.length === 1 && r3b.gate[MAIN.scopeKey].passed,
    'V3 operator ticks BP_2 + CLR_4 into main → one DXF, gate passes',
    `${r3b.scopes[0]?.identities.length} identities`,
  );

  // V4: an UNSORTED card (no purposes): scopes are BOM lines, told apart by section and name
  const U1 = T('L-1', '', 'fabric · Loden', [SECTION.fabric], 'L-1');
  const U2 = T('L-2', '', 'lining · Cupro', [SECTION.lining], 'L-2');
  const U3 = T('L-3', '', 'interlining · G785', [SECTION.interlining], 'L-3');
  const U4 = T('L-4', '', 'fabric · Rib 1x1', [SECTION.fabric], 'L-4');
  const V4 = [U1, U2, U3, U4];
  const r4 = await runImport(fp, sizeMap, V4, {
    instr: INSTR,
    label: { seed: S.BP_2, text: LABEL },
    numberOf,
    ai: AI,
  });
  ck(
    sameSet(
      r4.scopes.map((s) => s.target.scopeKey),
      ['L-1', 'L-2', 'L-3', 'L-4'],
    ) &&
      sameSet(scopeSeeds(r4.a, U4), ['CLR_4']) &&
      sameSet(scopeSeeds(r4.a, U2), ['BP', 'FP_R', 'FP_L', 'BP_2']),
    'V4 unsorted lines: main → «Loden», lining → lining line, interlining → interlining line, rib → «Rib 1x1»',
    `${r4.scopes.map((s) => `${s.target.scopeKey}:${s.identities.join('+')}`).join(' ')} · problems ${r4.problems.map((p) => p.message).join(' | ')} · L4 ${scopeSeeds(r4.a, U4).join(',')} · L2 ${scopeSeeds(r4.a, U2).join(',')}`,
  );
  ck(
    r4.scopes.every(
      (s) =>
        readManifest(s.dxfText)!.scope.fabricPurpose === '' &&
        readManifest(s.dxfText)!.scope.bomLineKey === s.target.scopeKey,
    ),
    'V4 unsorted scope binding = the BOM line (no purpose), as bindingForScope writes it',
  );

  // duplicate identity inside one scope blocks with a reason
  {
    const pieces = r1.sem.pieces.map((p) =>
      p.seed === S.BP_2 ? { ...p, identity: 'LIN_BP', code: 'LIN_BP' } : p,
    );
    const pr = planScopes(pieces, r1.a, V1);
    ck(
      pr.problems.some((p) => p.kind === 'duplicate' && p.identity === 'LIN_BP'),
      'a lining-labelled piece named LIN_BP + the shell BP ticked lining → duplicate LIN_BP blocks',
      pr.problems.map((p) => p.message).join(' | '),
    );
  }

  // ── D ───────────────────────────────────────────────────────────────────────────────────
  head('D  applyDraft: fake upload service + fake form');
  const MIRRORED = 'TECH_CARD_PIECE_CUT_SYMMETRY_MIRRORED';
  const initial = (): LiveCard => ({
    patterns: [],
    // the card already has the shell front «FP» bound to FP_L in main, cut MIRRORED ×2 by hand
    pieces: [
      { lineKey: 'P-FP', name: 'FP', piecesPerGarment: 2, cutSymmetry: MIRRORED, fused: false },
      { lineKey: 'P-PCK', name: 'pocket bag', piecesPerGarment: 2, cutSymmetry: '', fused: false },
    ],
    aliases: [
      { fabricPurpose: PURPOSE.main, bomLineKey: '', blockName: 'FP_L', pieceLineKey: 'P-FP' },
      { fabricPurpose: PURPOSE.pocketing, bomLineKey: '', blockName: 'PB', pieceLineKey: 'P-PCK' },
    ],
  });
  const cardOf = (live: LiveCard): DraftCardContext => ({
    techCardId: 7,
    existingPieces: live.pieces.map((p) => ({
      lineKey: p.lineKey ?? '',
      name: p.name ?? '',
      cutSymmetry: p.cutSymmetry,
      piecesPerGarment: p.piecesPerGarment,
      fused: p.fused,
      fusingMode: p.fusingMode,
    })),
    existingAliases: live.aliases.map((a) => ({
      scopeKey: scopeKeyOf(a),
      blockName: a.blockName ?? '',
      pieceLineKey: a.pieceLineKey ?? '',
    })),
    existingPatterns: live.patterns.map((p) => ({
      scopeKey: scopeKeyOf(p),
      filename: p.filename ?? '',
      url: p.url ?? '',
    })),
    styleLabel: 'FW26 · 7142',
  });
  const fakeForm = (live: LiveCard) => {
    const log: string[] = [];
    const state = structuredClone(live) as LiveCard;
    const setPath = (p: string, v: unknown) => {
      log.push(p);
      const parts = p.split('.');
      const root = parts[0] === 'pieceDxfAliases' ? 'aliases' : (parts[0] as 'patterns' | 'pieces');
      if (parts.length === 1) (state as Record<string, unknown>)[root] = structuredClone(v);
      else (state[root] as unknown as Record<string, unknown>[])[+parts[1]][parts[2]] = v;
    };
    return { state, log, read: () => structuredClone(state), write: setPath };
  };
  const fakeUpload = (failAt: number | null) => {
    const calls: string[] = [];
    return {
      calls,
      upload: async (f: { filename: string; text: string }) => {
        calls.push(f.filename);
        if (failAt != null && calls.length === failAt)
          throw new Error('UploadPattern: 503 storage unavailable');
        return {
          url: `https://cdn.test/${f.filename}`,
          filename: f.filename,
          sizeBytes: f.text.length,
        };
      },
    };
  };

  // D1 — failure on the 2nd upload → nothing written
  {
    const live = initial();
    const form = fakeForm(live);
    const up = fakeUpload(2);
    const draft = buildDraft({ scopes: r1.scopes }, cardOf(live), { mintKey: mint });
    const res = await applyDraft(draft, {
      upload: up.upload,
      read: form.read,
      write: form.write,
      storageSizeId: 501,
    });
    ck(
      !res.ok && up.calls.length === 2,
      '2nd upload fails → ok:false after exactly 2 attempts',
      res.ok ? 'ok' : `${res.failedScope}: ${res.message}`,
    );
    ck(
      form.log.length === 0 && JSON.stringify(form.state) === JSON.stringify(live),
      'zero form writes, the card is byte-identical',
    );
    ck(
      !res.ok && res.uploaded.length === 1,
      'the one file that landed is listed as an orphan',
      !res.ok ? res.uploaded.map((u) => u.filename).join(',') : '',
    );
  }
  // D2 — success: ordered batch, lining not bound to the shell piece, MIRRORED → IDENTICAL
  let afterFirst: LiveCard;
  {
    const live = initial();
    const form = fakeForm(live);
    const up = fakeUpload(null);
    const draft = buildDraft({ scopes: r1.scopes }, cardOf(live), { mintKey: mint });
    const fp0 = draft.pieces.find((p) => p.name === 'FP')!;
    ck(
      fp0.existingLineKey === 'P-FP' && fp0.basis === 'alias',
      'draft: the shell FP reuses the card piece bound to FP_L (alias)',
      `${fp0.existingLineKey} by ${fp0.basis}`,
    );
    const lin0 = draft.pieces.find((p) => p.name === 'LIN_FP')!;
    ck(
      lin0.existingLineKey === null && lin0.lineKey !== 'P-FP',
      'draft: the lining LIN_FP is a NEW piece, not the shell FP',
      lin0.lineKey,
    );
    const upd = draft.pieceUpdates.find((u) => u.lineKey === 'P-FP');
    ck(
      !!upd && upd.cutSymmetry.endsWith('IDENTICAL') && /both hands/.test(upd.reason),
      'draft: existing MIRRORED FP → IDENTICAL with the reason',
      upd?.reason ?? '',
    );
    const progress: string[] = [];
    let saved = '';
    const res = await applyDraft(
      draft,
      {
        upload: up.upload,
        read: form.read,
        write: form.write,
        storageSizeId: 501,
        save: async (why) => {
          saved = why;
          return 'ok';
        },
      },
      (p) => progress.push(`${p.scopeKey.replace('TECH_CARD_BOM_PURPOSE_', '')}:${p.state}`),
    );
    ck(res.ok && up.calls.length === 4, 'all 4 files uploaded first', up.calls.join(' '));
    ck(
      form.log[0] === 'patterns' &&
        form.log[1] === 'pieces' &&
        form.log[form.log.length - 1] === 'pieceDxfAliases' &&
        form.log.slice(2, -1).every((p) => /^pieces\.\d+\./.test(p)),
      'one ordered batch: patterns → pieces → pieces.N.* point writes → pieceDxfAliases',
      form.log.join(' → '),
    );
    ck(
      saved === 'pattern-import' && res.ok && res.save === 'ok',
      'then the card save (autosave flush) — the only transaction',
      saved,
    );
    const st = form.state;
    ck(
      st.patterns.length === 4 &&
        st.patterns.every((p) => p.sizeId === 501 && (p.lineKey ?? '').length === 26),
      'patterns +4 rows, storage size id, minted line keys',
    );
    ck(
      sameSet(
        st.patterns.map((p) => scopeKeyOf(p)),
        V1.map((t) => t.scopeKey),
      ),
      'each row bound to its scope (fabricPurpose / bomLineKey as bindingForScope)',
    );
    const fpIdx = st.pieces.findIndex((p) => p.lineKey === 'P-FP');
    ck(
      st.pieces[fpIdx].cutSymmetry?.endsWith('IDENTICAL') === true &&
        form.log.includes(`pieces.${fpIdx}.cutSymmetry`),
      'existing FP: point write cutSymmetry → IDENTICAL (no root rewrite of it)',
    );
    ck(
      st.pieces.length === 2 + 8,
      'pieces: 2 existing + 8 created (FP reused)',
      st.pieces.map((p) => p.name).join(','),
    );
    const al = (scope: string, block: string) =>
      st.aliases.find((a) => scopeKeyOf(a) === scope && a.blockName === block)?.pieceLineKey;
    ck(
      al(MAIN.scopeKey, 'FP_L') === 'P-FP' && al(MAIN.scopeKey, 'FP_R') === 'P-FP',
      'aliases: shell FP_L + FP_R → the existing FP',
    );
    const linKey = al(LINING.scopeKey, 'LIN_FP_L');
    ck(
      !!linKey &&
        linKey !== 'P-FP' &&
        st.pieces.find((p) => p.lineKey === linKey)?.name === 'LIN_FP',
      'aliases: lining LIN_FP_L → LIN_FP, NOT the shell FP piece',
    );
    ck(al(PURPOSE.pocketing, 'PB') === 'P-PCK', "another scope's alias rides through untouched");
    ck(
      st.pieces
        .filter((p) => p.fused)
        .map((p) => p.name)
        .sort()
        .join(',') === 'BP_1,CLR_3',
      'card pieces fused: BP_1, CLR_3',
    );
    afterFirst = st;
    json.applied = {
      log: form.log,
      progress,
      patterns: st.patterns,
      aliases: st.aliases,
      pieces: st.pieces,
    };
  }
  // D3 — re-applying the same import (written again later) changes nothing
  {
    const form = fakeForm(afterFirst);
    const up = fakeUpload(null);
    const again = await runImport(fp, sizeMap, V1, {
      instr: INSTR,
      label: { seed: S.BP_2, text: LABEL },
      numberOf,
      ai: AI,
      now: new Date(86400000),
    });
    ck(
      again.scopes[0].manifest.createdAt !== r1.scopes[0].manifest.createdAt,
      're-run: a new write (another creation time)',
    );
    const draft = buildDraft({ scopes: again.scopes }, cardOf(afterFirst), { mintKey: mint });
    ck(
      draft.scopes.every((s) => !!s.alreadyOnCard),
      'draft: every file recognised as already on the card (fingerprint)',
      draft.scopes.map((s) => s.filename).join(' '),
    );
    ck(
      draft.pieces.every((p) => !!p.existingLineKey) && draft.pieceUpdates.length === 0,
      'draft: every piece reuses its card piece, no updates',
      `${draft.pieces.filter((p) => p.existingLineKey).length}/${draft.pieces.length}`,
    );
    const res = await applyDraft(draft, {
      upload: up.upload,
      read: form.read,
      write: form.write,
      storageSizeId: 501,
    });
    ck(
      res.ok && up.calls.length === 0 && form.log.length === 0 && res.writes === 0,
      're-apply = zero uploads, zero form writes',
      res.ok ? `reused ${res.reused?.length}` : res.message,
    );
    ck(
      JSON.stringify(form.state) === JSON.stringify(afterFirst),
      'the card is byte-identical after the re-apply',
    );
    // the wizard writes R12 (AAMA): its header prints the creation date and time too
    const r12a = await runImport(fp, sizeMap, V1, {
      instr: INSTR,
      label: { seed: S.BP_2, text: LABEL },
      numberOf,
      ai: AI,
      dialect: 'r12',
      now: new Date(0),
    });
    const r12b = await runImport(fp, sizeMap, V1, {
      instr: INSTR,
      label: { seed: S.BP_2, text: LABEL },
      numberOf,
      ai: AI,
      dialect: 'r12',
      now: new Date(86400000 * 3 + 3600000 * 5),
    });
    const fa = buildDraft({ scopes: r12a.scopes }, card0, { mintKey: mint }).scopes.map(
      (s) => s.filename,
    );
    const fb = buildDraft({ scopes: r12b.scopes }, card0, { mintKey: mint }).scopes.map(
      (s) => s.filename,
    );
    ck(
      fa.join() === fb.join() && r12a.scopes.every((s) => r12a.gate[s.target.scopeKey].passed),
      'R12: the same import written on another day keeps its file names (fingerprint ignores the header date)',
      fa.join(' '),
    );
    // and the planner alone, with the first draft against the applied card
    const z = planFormWrites(
      buildDraft({ scopes: r1.scopes }, cardOf(afterFirst), { mintKey: mint }),
      afterFirst,
      [],
      { storageSizeId: 501, mintKey: mint },
    );
    ck(z.writes.length === 0, 'planFormWrites(first draft, applied card) = 0 writes');
  }
  // D4 — a draft built before an operator added the same lining piece by hand still binds by name
  {
    const live = initial();
    const draft = buildDraft({ scopes: r1.scopes }, cardOf(live), { mintKey: mint });
    live.pieces.push({
      lineKey: 'P-LIN',
      name: 'LIN_FP',
      piecesPerGarment: 2,
      cutSymmetry: 'TECH_CARD_PIECE_CUT_SYMMETRY_IDENTICAL',
    });
    const z = planFormWrites(draft, live, [], { storageSizeId: 501, mintKey: mint });
    const aliases = (z.writes.find((w) => w.path === 'pieceDxfAliases')?.value ?? []) as {
      blockName?: string;
      pieceLineKey?: string;
    }[];
    ck(
      aliases.find((a) => a.blockName === 'LIN_FP_L')?.pieceLineKey === 'P-LIN' && z.created === 7,
      'apply re-resolves against the live form: a LIN_FP added meanwhile is reused, not duplicated',
      `created ${z.created}`,
    );
  }

  // ── F ───────────────────────────────────────────────────────────────────────────────────
  head('F  re-import (replace / add / vanished / zero-diff) + the follow-up after the save (MF-C)');
  {
    // the card after the first import; the parse read each of our sheets' manifests (by url)
    const manifestByUrl = new Map<string, ConversionManifest>();
    const firstDraft = buildDraft({ scopes: r1.scopes }, cardOf(initial()), { mintKey: mint });
    for (const sc of firstDraft.scopes)
      manifestByUrl.set(`https://cdn.test/${sc.filename}`, sc.manifest);
    const withManifests = (live: LiveCard, on = true): DraftCardContext => {
      const c = cardOf(live);
      return {
        ...c,
        existingPatterns: live.patterns.map((p) => ({
          scopeKey: scopeKeyOf(p),
          filename: p.filename ?? '',
          url: p.url ?? '',
          lineKey: p.lineKey ?? '',
          name: p.name ?? '',
          manifest: on ? manifestByUrl.get(p.url ?? '') ?? null : null,
        })),
      };
    };
    // the pattern maker re-draws: CLR_3 is no longer cut from the main fabric (still interlining)
    const r2 = await runImport(fp, sizeMap, V1, {
      instr: INSTR,
      label: { seed: S.BP_2, text: LABEL },
      numberOf,
      ai: AI,
      operator: (a) => ({
        ...a,
        byPurpose: {
          ...a.byPurpose,
          [MAIN.scopeKey]: (a.byPurpose[MAIN.scopeKey] ?? []).filter((x) => x !== S.CLR_3),
        },
      }),
    });
    const mainRow0 = afterFirst.patterns.find((p) => scopeKeyOf(p) === MAIN.scopeKey)!;
    const d2 = buildDraft({ scopes: r2.scopes }, withManifests(afterFirst), { mintKey: mint });
    const m2 = d2.scopes.find((x) => x.target.scopeKey === MAIN.scopeKey)!;
    ck(
      !m2.alreadyOnCard && m2.replaces?.lineKey === mainRow0.lineKey,
      'F1 changed main file → replaces the previous import row of that scope (by lineKey)',
      `${m2.replaces?.matchedBy} · ${m2.replaces?.filename}`,
    );
    ck(
      d2.scopes
        .filter((x) => x.target.scopeKey !== MAIN.scopeKey)
        .every((x) => !!x.alreadyOnCard && !x.replaces),
      'F1 unchanged scopes: already on the card, no replace offered',
    );
    ck(
      (m2.vanished ?? []).map((v) => v.blockName).join() === 'CLR_3' &&
        m2.vanished![0].pieceName === 'CLR_3',
      'F1 vanished in main: CLR_3 (its main link), named by its card piece',
      JSON.stringify(m2.vanished),
    );
    ck(m2.readsBack === true, 'F1 the new file reads back (G1) → removal may be offered');
    const g1Fail: ConversionManifest = {
      ...m2.manifest,
      gate: {
        ...m2.manifest.gate!,
        checks: m2.manifest.gate!.checks.map((c) =>
          c.id === 'G1-roundtrip' ? { ...c, ok: false } : c,
        ),
      },
    };
    ck(!readsBack(g1Fail), 'F1 G1 failed → readsBack false (removal not offered)');

    // F2 replace (default)
    const form = fakeForm(afterFirst);
    const up = fakeUpload(null);
    const saves: string[] = [];
    const res = await applyDraft(d2, {
      upload: up.upload,
      read: form.read,
      write: form.write,
      storageSizeId: 501,
      save: async () => {
        saves.push('save');
        return 'ok';
      },
    });
    const st = form.state;
    const row = st.patterns.find((p) => p.lineKey === mainRow0.lineKey)!;
    ck(
      res.ok && up.calls.length === 1 && st.patterns.length === afterFirst.patterns.length,
      'F2 replace: 1 upload, no new row (patterns stay ' + afterFirst.patterns.length + ')',
      up.calls.join(' '),
    );
    ck(
      row.url === `https://cdn.test/${m2.filename}` &&
        row.filename === m2.filename &&
        row.name === mainRow0.name &&
        row.fabricPurpose === mainRow0.fabricPurpose &&
        row.bomLineKey === mainRow0.bomLineKey &&
        row.sizeId === mainRow0.sizeId &&
        row.version === 0 &&
        st.patterns.indexOf(row) === afterFirst.patterns.indexOf(mainRow0),
      'F2 the row keeps lineKey, name, binding, slot and place; new url/filename, version 0',
    );
    ck(
      res.ok && res.replaced?.length === 1 && res.replaced[0].oldUrl === mainRow0.url,
      'F2 result lists the replaced row (old → new url)',
    );
    ck(
      st.aliases.some((a) => scopeKeyOf(a) === MAIN.scopeKey && a.blockName === 'CLR_3') &&
        st.pieces.length === afterFirst.pieces.length,
      'F2 vanished CLR_3: main link and piece NOT deleted by apply',
    );
    ck(
      saves.length === 1 && form.log[0] === 'patterns',
      'F2 one batch (patterns first) then one save',
    );

    // F3 re-applying the same changed import on the replaced card: zero diff
    {
      const f3 = fakeForm(st);
      const up3 = fakeUpload(null);
      manifestByUrl.set(`https://cdn.test/${m2.filename}`, m2.manifest);
      const d3 = buildDraft({ scopes: r2.scopes }, withManifests(st), { mintKey: mint });
      const r3 = await applyDraft(d3, {
        upload: up3.upload,
        read: f3.read,
        write: f3.write,
        storageSizeId: 501,
      });
      ck(
        d3.scopes.every((x) => !!x.alreadyOnCard && !x.replaces) &&
          r3.ok &&
          r3.writes === 0 &&
          up3.calls.length === 0 &&
          JSON.stringify(f3.state) === JSON.stringify(st),
        'F3 re-apply of the same import after a replace = zero uploads, zero writes',
      );
      ck(!!r3.ok && followUpTargets(d3, r3) === null, 'F3 zero-diff re-apply starts no follow-up');
    }

    // F4 add as another sheet: the old row stays, a second sheet in the scope
    {
      const f4 = fakeForm(afterFirst);
      const d4 = {
        ...d2,
        scopes: d2.scopes.map((x) => (x.replaces ? { ...x, sheetMode: 'add' as const } : x)),
      };
      const r4 = await applyDraft(d4, {
        upload: fakeUpload(null).upload,
        read: f4.read,
        write: f4.write,
        storageSizeId: 501,
      });
      const mains = f4.state.patterns.filter((p) => scopeKeyOf(p) === MAIN.scopeKey);
      ck(
        r4.ok &&
          !r4.replaced &&
          f4.state.patterns.length === afterFirst.patterns.length + 1 &&
          mains.length === 2 &&
          mains.some((p) => p.url === mainRow0.url),
        'F4 add: old main row intact + a second main row',
      );
    }
    // F5 a foreign sheet (no manifest) is never replaced
    {
      const d5 = buildDraft({ scopes: r2.scopes }, withManifests(afterFirst, false), {
        mintKey: mint,
      });
      ck(
        d5.scopes.every((x) => !x.replaces && (x.vanished ?? []).length === 0),
        'F5 sheets without a manifest: no replace offered, nothing listed as vanished',
      );
    }
    // F6 the row was removed in the form after the wizard read the card → the file is added
    {
      const live = structuredClone(afterFirst) as LiveCard;
      live.patterns = live.patterns.filter((p) => p.lineKey !== mainRow0.lineKey);
      const f6 = fakeForm(live);
      const r6 = await applyDraft(d2, {
        upload: fakeUpload(null).upload,
        read: f6.read,
        write: f6.write,
        storageSizeId: 501,
      });
      ck(
        r6.ok &&
          !r6.replaced &&
          f6.state.patterns.length === live.patterns.length + 1 &&
          f6.state.patterns.some((p) => p.url === `https://cdn.test/${m2.filename}`),
        'F6 replaced row gone from the live form → the new file is appended, nothing lost',
      );
    }

    // F7 follow-up: only after save 'ok' and when something was written
    ck(
      res.ok && (followUpTargets(d2, res) ?? []).length === d2.scopes.length,
      'F7 save ok + writes → follow-up targets every scope',
    );
    ck(
      followUpTargets(d2, { ...(res as Extract<typeof res, { ok: true }>), save: 'error' }) ===
        null &&
        followUpTargets(d2, { ok: false, failedScope: 'x', message: 'y', uploaded: [] }) === null,
      'F7 save not ok / apply failed → no follow-up',
    );
    ck(
      (followUpTargets(d2, res) ?? []).every((t) => t.cutLayer === '1'),
      'F7 every target measures on the manifest cut layer 1',
    );
    // F8 order with fake services; the areas call failing is a warning, not a rollback
    {
      const log: string[] = [...saves];
      const before = JSON.stringify(form.state);
      const targets = followUpTargets(d2, res)!;
      const short = (k: string) => k.replace('TECH_CARD_BOM_PURPOSE_', '');
      let rows: FollowUpRow[] = initialRows(targets);
      const updates: number[] = [];
      rows = await runFollowUp(
        rows,
        {
          areas: async (t) => {
            log.push(`areas:${short(t.scopeKey)}`);
            if (t.scopeKey === LINING.scopeKey) return { ok: false, reason: 'server 503' };
            if (t.scopeKey === CONTRAST.scopeKey) throw new Error('network down');
            return { ok: true, detail: 'ok' };
          },
          sizeIndex: async (t) => {
            log.push(`index:${short(t.scopeKey)}`);
            return { ok: true, detail: 'ok' };
          },
        },
        (r) => updates.push(r.length),
      );
      const expect = [
        'save',
        ...targets.flatMap((t) => [`areas:${short(t.scopeKey)}`, `index:${short(t.scopeKey)}`]),
      ];
      ck(
        log.join() === expect.join(),
        'F8 order: card save → per scope areas → size index, sequential',
        log.join(' → '),
      );
      const lin = rows.find((r) => r.scopeKey === LINING.scopeKey)!;
      const con = rows.find((r) => r.scopeKey === CONTRAST.scopeKey)!;
      ck(
        lin.areas.state === 'failed' &&
          lin.areas.detail === 'server 503' &&
          lin.sizeIndex.state === 'ok' &&
          con.areas.state === 'failed' &&
          /network down/.test(con.areas.detail),
        'F8 areas failure / throw → a failed cell with the reason; the index still runs',
      );
      ck(
        JSON.stringify(form.state) === before && saves.length === 1,
        'F8 a follow-up failure writes nothing back: no rollback, no second save',
      );
      // retry only the failed cells
      const again: string[] = [];
      const retried = await runFollowUp(retryRows(rows), {
        areas: async (t) => {
          again.push(`areas:${short(t.scopeKey)}`);
          return { ok: true, detail: 'ok' };
        },
        sizeIndex: async (t) => {
          again.push(`index:${short(t.scopeKey)}`);
          return { ok: true, detail: 'ok' };
        },
      });
      ck(
        again.sort().join() === ['areas:CONTRAST', 'areas:LINING'].join() &&
          retried.every((r) => r.areas.state === 'ok' && r.sizeIndex.state === 'ok'),
        'F8 retry re-runs only the failed cells',
        again.join(' '),
      );
      json.followUp = { log, rows };
    }
  }

  // ── E ───────────────────────────────────────────────────────────────────────────────────
  head('E  every garment CLO DXF: main + lining copies through writeAndGate');
  const eRows: unknown[] = [];
  for (const f of fs
    .readdirSync(path.join(CORPUS, 'dxf-clo'))
    .filter((x) => x.toLowerCase().endsWith('.dxf'))
    .sort()) {
    const rd = await readDxf(
      { id: '0', name: f, bytes: ab(path.join(CORPUS, 'dxf-clo', f)) },
      { sagittaMm: 0.05, keepFills: true },
    );
    const seg = segmentDxf(rd);
    if (!seg.presegmented) {
      eRows.push({ file: f, presegmented: false });
      continue;
    }
    const fpx = dxfFastPath(rd, seg);
    const smx = proposeSizeMap(fpx.run, CARD5);
    const d = buildPieceSpecsDetailed(semInput(fpx, smx, {}));
    if (!d.output.pieces.length) {
      eRows.push({ file: f, pieces: 0 });
      continue;
    }
    const seeds = [...new Set(d.output.pieces.map((p) => p.seed))];
    // the operator: everything main; the front / back / first piece also in lining
    const linSeeds = seeds.filter((sd) =>
      /^(FP|BP)\b|^FP_|^BP$/.test(d.output.pieces.find((p) => p.seed === sd)!.identity),
    );
    const a: FabricAssignment = {
      byPurpose: {
        [MAIN.scopeKey]: seeds,
        [LINING.scopeKey]: linSeeds.length ? linSeeds : seeds.slice(0, 1),
      },
      interliningInBom: false,
      proposals: [],
    };
    const plan = planScopes(d.output.pieces, a, [MAIN, LINING]);
    const res: Record<string, string> = {};
    let ok = !plan.problems.length;
    for (const sp of plan.scopes) {
      const g = await writeAndGate(
        {
          techCardId: 7,
          scope: sp.target,
          pieces: sp.specs,
          sizes: sizesOf(smx),
          source: SRC(f, fpx.run.encoding),
          generator: 'patimport:fabrics',
          dialect: 'r2000',
        },
        {
          rules,
          sizeTokens: tokensOf(smx),
          wallsOf: (id, r) => d.wallsOf(sp.sourceOf[id] ?? id, r),
          now: () => new Date(0),
        },
      );
      res[sp.target.scopeKey.replace('TECH_CARD_BOM_PURPOSE_', '')] = g.report.passed
        ? `✓ ${g.detail.plan.blocks.length} blocks`
        : `✗ ${failing(g.report).join(' ')}`;
      ok &&= g.report.passed;
    }
    ck(
      ok,
      `${f}: main + lining files pass the gate`,
      Object.entries(res)
        .map(([k, v]) => `${k} ${v}`)
        .join(' · ') + (plan.problems.length ? ` · ${plan.problems[0].message}` : ''),
    );
    eRows.push({ file: f, ...res });
  }
  json.e = eRows;

  // ── report ────────────────────────────────────────────────────────────────────────────
  const bad = rows.filter((r) => !r.ok);
  console.log(`\n${rows.length - bad.length}/${rows.length} ok`);
  fs.mkdirSync(REPORTS, { recursive: true });
  fs.writeFileSync(
    path.join(REPORTS, 'F7-20261009.json'),
    JSON.stringify({ rows, ...json }, null, 2),
  );
  return bad.length ? 1 : 0;
}

// ── pipeline helpers (what the worker's sizes → semantics → fabrics → write stages do) ─────
type Fast = ReturnType<typeof dxfFastPath>;
function semInput(
  f: Fast,
  map: SizeMap,
  overrides: SemanticsInput['pieceOverrides'],
  sheet = f.sheet,
  families = f.families,
): SemanticsInput {
  return {
    sheet,
    set: f.chains,
    run: f.run,
    sizeMap: map,
    families,
    fileAllowance: f.allowance ?? detectAllowance(f.sheet, f.families, f.chains),
    pieceOverrides: overrides,
    operatorGrain: {},
  };
}
const sizesOf = (map: SizeMap): ManifestSize[] =>
  map.entries.flatMap((e) =>
    e.card
      ? [
          {
            token: e.card.token,
            sizeId: e.card.sizeId,
            name: e.card.name,
            sourceLabel: e.source.label,
            rank: e.source.rank,
          },
        ]
      : [],
  );
const tokensOf = (map: SizeMap) =>
  new Set(
    [
      ...map.entries.flatMap((e) => (e.card ? [e.card.token] : [])),
      ...map.unmapped.map((c) => c.token),
    ].map((t) => t.toLowerCase()),
  );
const SRC = (name: string, enc: ManifestSource['sizeEncoding']): ManifestSource => ({
  files: [{ name, sha256: '0'.repeat(64), bytes: 0, kind: 'dxf', pages: 1 }],
  scale: { method: 'declared', factor: 1, measuredMm: null, declaredMm: null },
  sheet: { pages: 1, method: 'single', maxResidualMm: 0 },
  sizeEncoding: enc,
  variant: null,
});

async function runImport(
  f: Fast,
  map: SizeMap,
  bom: DraftScopeTarget[],
  o: {
    instr: IRText[];
    label: { seed: number; text: IRText };
    numberOf: Map<number, string>;
    ai: { seed: number; fabrics: string[]; confidence: number }[];
    operator?: (a: FabricAssignment) => FabricAssignment;
    now?: Date;
    dialect?: 'r12' | 'r2000';
  },
) {
  // the label sits inside its piece (every size), the numbers are the seeds' own texts
  const sheet = { ...f.sheet, texts: [...f.sheet.texts, o.label.text] };
  const families = f.families.map((fam) =>
    fam.seed === o.label.seed
      ? {
          ...fam,
          candidates: fam.candidates.map((c) => ({
            ...c,
            textsInside: [...c.textsInside, o.label.text.id],
          })),
        }
      : fam,
  );
  const seeds: Seed[] = f.seeds.map((sd) => ({
    ...sd,
    origin: 'text',
    text: o.numberOf.has(sd.id)
      ? pageText(o.numberOf.get(sd.id)!, sd.at.x, sd.at.y, 0, 12)
      : undefined,
  }));
  const d0 = buildPieceSpecsDetailed(semInput(f, map, {}, sheet, families));
  const prop = proposeFabricsDetailed({
    texts: sheet.texts,
    families,
    seeds,
    bom,
    pageTexts: o.instr,
    aiHints: o.ai,
    identities: d0.output.pieces.map((p) => ({ seed: p.seed, identity: p.identity })),
  });
  const a = o.operator ? o.operator(prop.assignment) : prop.assignment;
  // `fused` is a PieceSpec field: semantics re-runs with it (the wizard's `write` event does this)
  const fused = fusedSeeds(a, bom);
  const overrides: SemanticsInput['pieceOverrides'] = {};
  for (const p of d0.output.pieces) overrides[p.seed] = { fused: fused.has(p.seed) };
  const d = buildPieceSpecsDetailed(semInput(f, map, overrides, sheet, families));
  const plan = planScopes(d.output.pieces, a, bom);
  const scopes: DraftScope[] = [];
  const gate: Record<string, GateReport> = {};
  if (!plan.problems.length)
    for (const sp of plan.scopes) {
      const g = await writeAndGate(
        {
          techCardId: 7,
          scope: sp.target,
          pieces: sp.specs,
          sizes: sizesOf(map),
          source: SRC(path.basename(DXF_NAME), f.run.encoding),
          generator: 'patimport:fabrics',
          dialect: o.dialect ?? 'r2000',
        },
        {
          rules,
          sizeTokens: tokensOf(map),
          wallsOf: (id, r) => d.wallsOf(sp.sourceOf[id] ?? id, r),
          now: () => o.now ?? new Date(0),
        },
      );
      scopes.push({
        target: sp.target,
        filename: '',
        name: '',
        dxfText: g.dxfText,
        manifest: g.detail.manifest,
        identities: [...new Set(g.detail.plan.blocks.map((b) => b.identity))],
      });
      gate[sp.target.scopeKey] = g.report;
    }
  return { prop, a, sem: d.output, problems: plan.problems, scopes, gate };
}
const DXF_NAME = 'Allsizes_with_notches.dxf';
const _unused: PtMm | PieceSpec | CardDraft | null = null;
void _unused;
