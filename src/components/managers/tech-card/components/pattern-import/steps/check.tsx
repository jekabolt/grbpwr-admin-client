// Step 8 · CHECK — the gate (08-CONTRACT §5), per DXF: thirteen checks, blocking vs warning, each
// naming the blocks it failed and the step where the answer lives. Beside it, the pieces drawn
// by the card's OWN sheet component (nesting/piece-sheet.tsx) under their block names — what the
// card will see once the files land, not a second opinion about it.
// Owner 16.10: the card's preview on the LEFT (the block a failing check names selected, in its
// size), the one question on the RIGHT — a failing check, its blocks, its door (fix in <step>, or
// the report when no step fixes it); "next check" walks the others. No check has a one-click fix
// (every door leaves the step), so the ask line coaches. The passing ones fold into one count
// line; warnings, what the files leave out and every other blocking check are the header's
// `! N warnings`; values and limits are each check's tooltip; the run time is diagnostics.
import { useContext, useMemo, useState } from 'react';
import type {
  DraftScope,
  GateCheck,
  GateCheckId,
  PieceSpec,
  WizardStep,
} from 'lib/pattern-import/types';
import type { PieceDTO } from 'lib/nesting/types';
import { Button } from 'ui/components/button';
import { Chip, ChipRow } from 'ui/components/chip';
import { DataTable } from 'ui/components/data-table';
import { HeaderWarnings, type HeaderWarning } from 'ui/components/header-warnings';
import { Pill } from 'ui/components/pill';
import { Row } from 'ui/components/row';
import Text from 'ui/components/text';
import { PieceSheet } from '../../nesting/piece-sheet';
import type { ImportSessionApi } from '../use-import-session';
import { STEPS } from '../use-import-session';
import { plural } from '../stages';
import { DebugFold, Fold, Panel, SplitStage, ask, fmtBytes } from '../ui-bits';
import { focusFromGate, type PieceFocus } from '../piece-focus';
import { DroppedLabels, leftOut } from './not-in-file';

const CHECK: Record<GateCheckId, { what: string; fix: WizardStep | null }> = {
  'G1-roundtrip': { what: 'reads back through the card parser', fix: null },
  'G2-square': { what: '100 mm probe square', fix: null },
  'G3-coverage': { what: 'cut line follows the drawn walls', fix: 'pieces' },
  'G4-hausdorff': { what: 'distance to the drawn walls', fix: 'pieces' },
  'G5-features': { what: 'notches, drills, one grainline', fix: 'meaning' },
  'G6-offset': { what: 'allowance offset is clean', fix: 'meaning' },
  'G7-overview': { what: 'matches the overview page', fix: 'scale' },
  'G8-monotone': { what: 'area grows with size', fix: 'pieces' },
  'G9-sizes': { what: 'block sizes = card sizes', fix: 'sizes' },
  'G10-uni': { what: 'no UNI conflicts', fix: 'sizes' },
  'G11-grammar': { what: 'block names pass the grammar', fix: 'meaning' },
  'G12-pair': { what: '_R mirrors _L', fix: 'meaning' },
  'G13-manifest': { what: 'manifest complete', fix: 'fabrics' },
  'G14-prologue': { what: 'manifest fits in front of the drawing', fix: null },
  'G15-derived': { what: 'closed gaps land on drawn lines and stay short', fix: 'pieces' },
  // A8 safety net: nothing in the wizard removes lines inside a piece yet — the note says why
  'G16-glyphs': { what: 'no lettering or watermark inside the pieces', fix: null },
  'G18-grain-source': { what: 'grainline not read from lettering', fix: 'meaning' },
  'G19-chrome': {
    what: 'no cut line traced around a registration mark or tile chrome',
    fix: 'files',
  },
  'G20-nested-piece': { what: 'no piece drawn inside another piece', fix: 'pieces' },
  'G21-continuity': {
    what: 'a size closed through another line keeps its proof (the line, the rule, the check)',
    fix: 'pieces',
  },
  'G22-identity': { what: "each size lies on its own size line (the key's pen)", fix: 'sizes' },
  'G24-one-piece': { what: 'one outline holds one piece', fix: 'pieces' },
  'G23-sheets': {
    what: 'every tile sheet of the file is in the export — no piece left out, twice or in halves',
    fix: 'pieces',
  },
};

/**
 * G9's second report (the card derives no size WITHOUT the manifest — a single-size file, a rare
 * size) is a note about the card's fallback, not about this file. On a run that passes it only
 * read as a problem with a "fix in sizes" link that fixes nothing (FLY-final copy 14).
 */
const isG9Fallback = (c: GateCheck) => c.id === 'G9-sizes' && c.severity === 'warn';

export function CheckStep({
  api,
  onFixInPieces,
}: {
  api: ImportSessionApi;
  /** "fix in pieces": the pieces step with the named blocks selected and the reason (M1). */
  onFixInPieces?: (f: PieceFocus) => void;
}) {
  const { session } = api;
  const scopes = session.draft?.scopes ?? [];
  const [key, setKey] = useState<string | null>(scopes[0]?.target.scopeKey ?? null);
  const scope = scopes.find((s) => s.target.scopeKey === key) ?? scopes[0];
  const report = scope ? session.gate[scope.target.scopeKey] : undefined;
  const tokens = scope?.manifest.sizes.map((s) => s.token) ?? [];
  const [token, setToken] = useState<string | null>(null);
  // the block the operator picked, kept only for the question it was picked on
  const [pick, setPick] = useState<{ q: string | null; b: string | null } | null>(null);
  // the failing check shown as the question (one at a time, "next" walks them)
  const [at, setAt] = useState(0);

  const specs = useMemo(
    () => (session.semantics?.pieces ?? []).filter((p) => scope?.identities.includes(p.identity)),
    [session.semantics, scope],
  );

  const { labels } = useContext(DroppedLabels);

  const blocking = (r = report) => r?.checks.filter((c) => !c.ok && c.severity === 'block') ?? [];
  const failing = blocking();
  const active = failing.length ? failing[Math.min(at, failing.length - 1)] : null;
  const qKey = active ? `${scope?.target.scopeKey}:${active.id}:${active.blocks.join(',')}` : null;
  // the left preview shows the first block the question names, in that block's size
  const blockSize = (b: string) =>
    tokens.find((t) => b.toLowerCase().endsWith(`_${t.toLowerCase()}`)) ?? null;
  const askedBlock = active?.blocks[0] ?? null;
  const picked = pick && pick.q === qKey ? pick.b : askedBlock?.toLowerCase() ?? null;
  const size =
    token && tokens.includes(token)
      ? token
      : (askedBlock && blockSize(askedBlock)) ?? tokens[Math.floor(tokens.length / 2)] ?? null;
  const dtos = useMemo(() => (size ? piecesForCard(specs, size) : []), [specs, size]);

  if (!scopes.length)
    return (
      <Panel title='check'>
        <Text size='micro' variant='label'>
          nothing was written — no fabric scope has pieces
        </Text>
      </Panel>
    );

  const quiet = (c: GateCheck) => !!report?.passed && isG9Fallback(c);
  const warns = report?.checks.filter((c) => !c.ok && c.severity === 'warn' && !quiet(c)) ?? [];
  const fix = (c: GateCheck, to: WizardStep) => {
    const f = to === 'pieces' && onFixInPieces ? focusFromGate(c, CHECK[c.id].what, specs) : null;
    if (f) onFixInPieces!(f);
    else void api.dispatch({ type: 'back', to });
  };
  const stepWord = (to: WizardStep) => STEPS.find((s) => s.id === to)?.label ?? to;
  // a check that passes, or the G9 single-size note on a passing run: one count line
  const passing = report?.checks.filter((c) => c.ok || quiet(c)) ?? [];
  const limitOf = (c: GateCheck) =>
    c.value != null ? `${c.value}${c.threshold != null ? ` · limit ${c.threshold}` : ''}` : '';

  // what is true but blocks nothing: the header's `! N warnings`, each text the door to its fix
  const left = leftOut(api, labels);
  const warnings: HeaderWarning[] = [
    ...warns.map((c): HeaderWarning => {
      const to = CHECK[c.id].fix;
      return {
        text: `${CHECK[c.id].what}${c.note ? ` — ${c.note}` : ''}${c.blocks.length ? ` (${c.blocks.join(', ')})` : ''}`,
        action: to ? { label: `fix in ${stepWord(to)}`, onClick: () => fix(c, to) } : undefined,
      };
    }),
    // FLY-final M2: what the written files leave out must be seen before the download
    ...left.pieces.map(
      (p): HeaderWarning => ({
        text: `not in this file: ${p.what} (${p.why})`,
        action: {
          label: 'back to pieces',
          onClick: () => void api.dispatch({ type: 'back', to: 'pieces' }),
        },
      }),
    ),
    ...(left.sizes.length
      ? [
          {
            text: `not in this file: card ${left.sizes.length === 1 ? 'size' : 'sizes'} ${left.sizes.join(', ')} (no source)`,
            action: {
              label: 'back to sizes',
              onClick: () => void api.dispatch({ type: 'back', to: 'sizes' as WizardStep }),
            },
          },
        ]
      : []),
    // every blocking check stays readable here, the one asked now included (its note, its blocks)
    ...failing
      .filter((c) => c !== active)
      .map(
        (c): HeaderWarning => ({
          text: `${c.id.split('-')[0]} ${CHECK[c.id].what} — blocks the export${c.note ? ` · ${c.note}` : ''}`,
          error: true,
        }),
      ),
  ];

  /** One check as a row of the passing fold / the diagnostics table. */
  const checkRow = (c: GateCheck, i: number, full: boolean) => {
    const meta = CHECK[c.id];
    return (
      <tr
        key={`${c.id}-${i}`}
        title={[c.note, limitOf(c)].filter(Boolean).join(' · ') || undefined}
      >
        <td className='whitespace-nowrap'>{c.id.split('-')[0]}</td>
        <td data-align='left'>{meta.what}</td>
        {full && (
          <>
            <td data-align='left'>
              {c.ok ? (
                <Pill tone='ok'>ok</Pill>
              ) : quiet(c) ? (
                <Pill tone='mut' title={c.note}>
                  note
                </Pill>
              ) : c.severity === 'block' ? (
                <Pill tone='warn'>blocks export</Pill>
              ) : (
                <Pill tone='attention'>warning</Pill>
              )}
            </td>
            <td>{c.value ?? '—'}</td>
            <td className='text-labelColor'>{c.threshold ?? '—'}</td>
          </>
        )}
      </tr>
    );
  };

  const activeFix = active ? CHECK[active.id].fix : null;
  const question = active ? `${active.id.split('-')[0]} fails: ${CHECK[active.id].what}` : null;

  return (
    <SplitStage
      sideWidth={380}
      canvas={
        <Panel
          title='what the card will see'
          bodyClassName='flex flex-col gap-2'
          aside={
            <ChipRow>
              {tokens.map((t) => (
                <Chip key={t} quiet selected={t === size} onClick={() => setToken(t)}>
                  {t}
                </Chip>
              ))}
            </ChipRow>
          }
        >
          {scope && <ScopeSummary scope={scope} />}
          {dtos.length > 0 && (
            <PieceSheet
              pieces={dtos}
              keyOf={(p) => (p.blockName ?? '').toLowerCase()}
              markOf={() => 'mapped'}
              labelOf={(p) => p.blockName ?? p.name}
              selectedKey={picked}
              onPick={(k) => setPick({ q: qKey, b: k === picked ? null : k })}
              grainLayer='7'
              innerLayers={new Set(['14'])}
            />
          )}
        </Panel>
      }
      side={
        <Panel
          title='check'
          bodyClassName='flex flex-col gap-2'
          aside={<HeaderWarnings items={warnings} />}
        >
          {scopes.length > 1 && (
            <span data-ask-zone=''>
              <ChipRow>
                {scopes.map((s) => {
                  const bad = blocking(session.gate[s.target.scopeKey]).length;
                  const here = s.target.scopeKey === scope?.target.scopeKey;
                  return (
                    <Chip
                      // this file's own failing checks answer first; another file's chip only
                      // when this one is clean
                      {...ask(
                        'check-scope',
                        !!bad && !here && !failing.length,
                        'open the file whose checks block',
                      )}
                      key={s.target.scopeKey}
                      quiet
                      selected={here}
                      tone={bad ? 'error' : 'default'}
                      title={s.target.label}
                      onClick={() => {
                        setKey(s.target.scopeKey);
                        setAt(0);
                      }}
                    >
                      {bad ? '! ' : ''}
                      {s.filename}
                    </Chip>
                  );
                })}
              </ChipRow>
            </span>
          )}
          {scope && report && (
            <>
              {active && question ? (
                <>
                  <Text size='micro' variant='label' component='p'>
                    question {Math.min(at, failing.length - 1) + 1} of {failing.length}
                  </Text>
                  {/* the failing check and its doors: the coach's zone */}
                  <div
                    data-ask-zone=''
                    data-ask-label={question}
                    data-testid='check-question'
                    className='flex min-w-0 flex-col gap-2'
                  >
                    <Text
                      size='micro'
                      component='p'
                      title={
                        [active.note, limitOf(active)].filter(Boolean).join(' · ') || undefined
                      }
                    >
                      {question}
                    </Text>
                    {active.blocks.length > 0 && (
                      <span className='flex flex-wrap gap-1'>
                        {active.blocks.map((b) => (
                          <Chip
                            key={b}
                            quiet
                            selected={picked === b.toLowerCase()}
                            title='show it on the left'
                            onClick={() => {
                              setPick({ q: qKey, b: b.toLowerCase() });
                              const t = blockSize(b);
                              if (t) setToken(t);
                            }}
                          >
                            {b}
                          </Chip>
                        ))}
                      </span>
                    )}
                    <span className='flex flex-col items-stretch gap-1.5'>
                      {activeFix && (
                        // a door back, not a fix: the answer is given on that step (coached)
                        <Button
                          {...ask('check-fix', 'open the step that fixes it')}
                          variant='secondary'
                          size='xs'
                          title={
                            activeFix === 'pieces' && active.blocks.length
                              ? `opens pieces with ${active.blocks.length === 1 ? active.blocks[0] : `${active.blocks.length} blocks`} selected`
                              : undefined
                          }
                          onClick={() => fix(active, activeFix)}
                        >
                          fix in {stepWord(activeFix)}
                        </Button>
                      )}
                      <Button
                        // no step fixes it (round trip, probe square, …): the report is the door
                        {...ask(
                          'check-report',
                          !activeFix,
                          'no step fixes it — download the report',
                        )}
                        variant='secondary'
                        size='xs'
                        title='saves a JSON file: versions, file names, sizes and checksums, the gate and your answers; never the files themselves'
                        onClick={api.downloadReport}
                      >
                        download report
                      </Button>
                      {failing.length > 1 && (
                        <Button
                          variant='underline'
                          size='xs'
                          className='text-labelColor hover:text-textColor'
                          onClick={() =>
                            setAt((i) => (Math.min(i, failing.length - 1) + 1) % failing.length)
                          }
                        >
                          next check
                        </Button>
                      )}
                    </span>
                  </div>
                </>
              ) : (
                <Text size='micro' variant='label' component='p'>
                  passes ✓
                </Text>
              )}
              {passing.length > 0 && (
                <Fold label={`${plural(passing.length, 'check')} pass`}>
                  <DataTable>
                    <tbody>{passing.map((c, i) => checkRow(c, i, false))}</tbody>
                  </DataTable>
                </Fold>
              )}
              <DebugFold>
                <Text size='micro' variant='label' component='p'>
                  {report.durationMs} ms
                </Text>
                <DataTable>
                  <thead>
                    <tr>
                      <th>check</th>
                      <th data-align='left'>what</th>
                      <th data-align='left'>result</th>
                      <th>value</th>
                      <th>limit</th>
                    </tr>
                  </thead>
                  {/* the gate may report one id twice (G9: the block check + the card-split warning) */}
                  <tbody>{report.checks.map((c, i) => checkRow(c, i, true))}</tbody>
                </DataTable>
              </DebugFold>
            </>
          )}
        </Panel>
      }
    />
  );
}

/** One line per file; the manifest's make-up is diagnostics. */
function ScopeSummary({ scope }: { scope: DraftScope }) {
  const m = scope.manifest;
  const bytes = new Blob([scope.dxfText]).size;
  const pairs = m.pieces.filter((p) => p.pairHand === 'L').length;
  return (
    <div>
      <Text size='micro' variant='label' component='p' title={scope.target.label}>
        {scope.filename} · {plural(m.blocks.length, 'block')} · {fmtBytes(bytes)}
      </Text>
      <DebugFold className='mt-1'>
        <Row label='fabric scope' value={scope.target.label} />
        <Row label='blocks' value={blockSum(m.blocks)} />
        <Row label='pairs as _L + _R' value={pairs || '—'} />
        <Row
          label='layers'
          value='1 cut (final) · 14 seam · 7 grain · 4 notch · 8 internal'
          className='[&>span:first-child]:shrink-0 [&>span:last-child]:shrink [&>span:last-child]:text-right'
        />
      </DebugFold>
    </div>
  );
}

/**
 * "82 blocks · 10 pieces × 8 sizes + 2 one-size": blocks grouped by how many sizes each piece is
 * written in. "12 pieces × 8 sizes" was wrong whenever a piece is one-size (UNI) — copy 8.
 */
function blockSum(blocks: readonly { identity: string }[]): string {
  const per = new Map<string, number>();
  for (const b of blocks) per.set(b.identity, (per.get(b.identity) ?? 0) + 1);
  const bySizes = new Map<number, number>();
  for (const n of per.values()) bySizes.set(n, (bySizes.get(n) ?? 0) + 1);
  const parts = [...bySizes]
    .sort((a, b) => b[0] - a[0])
    .map(([sizes, pieces]) =>
      sizes === 1
        ? `${pieces} one-size`
        : `${pieces} ${pieces === 1 ? 'piece' : 'pieces'} × ${sizes} sizes`,
    );
  return `${blocks.length} = ${parts.join(' + ')}`;
}

/** Specs of one size → PieceDTO (cm, y-up, bbox-normalised) laid out in a row, as the parser would. */
function piecesForCard(specs: PieceSpec[], token: string): PieceDTO[] {
  const out: PieceDTO[] = [];
  // Rows about as wide as the set is tall, so the sheet fills the frame instead of a thin strip.
  const boxes = specs.flatMap((s) =>
    s.sizes.filter((q) => q.sizeToken === token).map((q) => q.bbox),
  );
  const sumArea = boxes.reduce(
    (a, b) => a + ((b.maxX - b.minX) / 10) * ((b.maxY - b.minY) / 10),
    0,
  );
  const rowWidth = Math.max(...boxes.map((b) => (b.maxX - b.minX) / 10), Math.sqrt(sumArea) * 1.8);
  let x = 0;
  let rowTop = 0;
  let rowH = 0;
  specs.forEach((s, i) => {
    const z = s.sizes.find((q) => q.sizeToken === token);
    if (!z) return;
    const b = z.bbox;
    const w = (b.maxX - b.minX) / 10;
    const h = (b.maxY - b.minY) / 10;
    if (x > 0 && x + w > rowWidth) {
      rowTop -= rowH + 4;
      x = 0;
      rowH = 0;
    }
    rowH = Math.max(rowH, h);
    const rel = (p: { x: number; y: number }) => ({
      x: (p.x - b.minX) / 10,
      y: (p.y - b.minY) / 10,
    });
    const origin = { x, y: rowTop - h };
    const abs = (p: { x: number; y: number }) => ({
      x: origin.x + rel(p).x,
      y: origin.y + rel(p).y,
    });
    out.push({
      id: i + 1,
      name: s.displayName,
      blockName: `${s.identity}_${token}`,
      layer: '1',
      source: s.identity,
      poly: z.cut.map(rel),
      bboxW: w,
      bboxH: h,
      areaCm2: z.areaMm2 / 100,
      originX: origin.x,
      originY: origin.y,
      grain: z.grain
        ? [
            {
              layer: '7',
              angleDeg: z.grain.angleDeg,
              lengthCm: Math.hypot(z.grain.b.x - z.grain.a.x, z.grain.b.y - z.grain.a.y) / 10,
              a: abs(z.grain.a),
              b: abs(z.grain.b),
            },
          ]
        : [],
      inner: z.seam ? [{ layer: '14', closed: true, pts: z.seam.map(rel) }] : [],
    });
    x += w + 4;
  });
  return out;
}
