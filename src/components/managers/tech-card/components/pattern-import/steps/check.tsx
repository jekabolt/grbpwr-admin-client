// Step 8 · CHECK — the gate (08-CONTRACT §5), per DXF: thirteen checks, blocking vs warning, each
// naming the blocks it failed and the step where the answer lives. Beside it, the pieces drawn
// by the card's OWN sheet component (nesting/piece-sheet.tsx) under their block names — what the
// card will see once the files land, not a second opinion about it.
import { useMemo, useState } from 'react';
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
import { GroupLabel } from 'ui/components/group-label';
import { Pill } from 'ui/components/pill';
import { Row } from 'ui/components/row';
import Text from 'ui/components/text';
import { PieceSheet } from '../../nesting/piece-sheet';
import type { ImportSessionApi } from '../use-import-session';
import { STEPS } from '../use-import-session';
import { Panel, SplitStage, fmtBytes } from '../ui-bits';
import { focusFromGate, type PieceFocus } from '../piece-focus';
import { NotInFile } from './not-in-file';

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
  'G19-nested-piece': { what: 'no piece drawn inside another piece', fix: 'pieces' },
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
  const size =
    token && tokens.includes(token) ? token : tokens[Math.floor(tokens.length / 2)] ?? null;
  const [picked, setPicked] = useState<string | null>(null);

  const specs = useMemo(
    () => (session.semantics?.pieces ?? []).filter((p) => scope?.identities.includes(p.identity)),
    [session.semantics, scope],
  );
  const dtos = useMemo(() => (size ? piecesForCard(specs, size) : []), [specs, size]);

  if (!scopes.length)
    return (
      <Panel title='check'>
        <Text size='micro' variant='label'>
          nothing was written — no fabric scope has pieces
        </Text>
      </Panel>
    );

  const blocking = (r = report) => r?.checks.filter((c) => !c.ok && c.severity === 'block') ?? [];
  const quiet = (c: GateCheck) => !!report?.passed && isG9Fallback(c);
  const warns = report?.checks.filter((c) => !c.ok && c.severity === 'warn' && !quiet(c)) ?? [];
  const fix = (c: GateCheck, to: WizardStep) => {
    const f = to === 'pieces' && onFixInPieces ? focusFromGate(c, CHECK[c.id].what, specs) : null;
    if (f) onFixInPieces!(f);
    else void api.dispatch({ type: 'back', to });
  };

  return (
    <SplitStage
      sideWidth={520}
      canvas={
        <Panel
          title='gate'
          aside={
            <ChipRow>
              {scopes.map((s) => {
                const bad = blocking(session.gate[s.target.scopeKey]).length;
                return (
                  <Chip
                    key={s.target.scopeKey}
                    quiet
                    selected={s.target.scopeKey === scope?.target.scopeKey}
                    tone={bad ? 'error' : 'default'}
                    onClick={() => setKey(s.target.scopeKey)}
                  >
                    {bad ? '! ' : ''}
                    {s.filename}
                  </Chip>
                );
              })}
            </ChipRow>
          }
        >
          <NotInFile api={api} className='mb-2' />
          {scope && report && (
            <>
              <div className='mb-2 flex flex-wrap items-center gap-2'>
                <Pill tone={report.passed ? 'ok' : 'warn'}>
                  {report.passed ? 'passes' : 'blocked'}
                </Pill>
                <Text size='micro' variant='label' component='span'>
                  {blocking().length} blocking · {warns.length}{' '}
                  {warns.length === 1 ? 'warning' : 'warnings'} · {report.durationMs} ms
                </Text>
                {!report.passed && (
                  <Button
                    variant='underline'
                    size='xs'
                    className='ml-auto whitespace-nowrap text-labelColor hover:text-textColor'
                    title='saves a JSON file: versions, file names, sizes and checksums, the gate and your answers; never the files themselves'
                    onClick={api.downloadReport}
                  >
                    download report
                  </Button>
                )}
              </div>
              <DataTable>
                <thead>
                  <tr>
                    <th>check</th>
                    <th data-align='left'>what</th>
                    <th data-align='left'>result</th>
                    <th>value</th>
                    <th>limit</th>
                    <th data-align='left'>blocks named</th>
                  </tr>
                </thead>
                <tbody>
                  {/* the gate may report one id twice (G9: the block check + the card-split warning) */}
                  {report.checks.map((c, i) => {
                    const meta = CHECK[c.id];
                    return (
                      <tr
                        key={`${c.id}-${i}`}
                        className={!c.ok && c.severity === 'block' ? 'bg-error/5' : undefined}
                      >
                        <td className='whitespace-nowrap'>{c.id.split('-')[0]}</td>
                        <td data-align='left'>
                          {meta.what}
                          {!c.ok && (
                            <Text size='micro' variant='label' component='span' className='block'>
                              {quiet(c)
                                ? 'single-size blocks: the card reads their size from the manifest'
                                : c.note}
                            </Text>
                          )}
                        </td>
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
                          {/* the way to the answer sits under the verdict, in a column that is
                              on screen at 1024 px (it was the last, clipped column) */}
                          {!c.ok && meta.fix && !quiet(c) && (
                            <Button
                              variant='underline'
                              size='xs'
                              className='mt-1 whitespace-nowrap text-labelColor hover:text-textColor'
                              title={
                                meta.fix === 'pieces' && c.blocks.length
                                  ? `opens pieces with ${c.blocks.length === 1 ? c.blocks[0] : `${c.blocks.length} blocks`} selected`
                                  : undefined
                              }
                              onClick={() => fix(c, meta.fix!)}
                            >
                              ← fix in {STEPS.find((s) => s.id === meta.fix)?.label}
                            </Button>
                          )}
                        </td>
                        <td>{c.value ?? '—'}</td>
                        <td className='text-labelColor'>{c.threshold ?? '—'}</td>
                        <td data-align='left'>
                          {c.blocks.length ? (
                            <span className='flex flex-wrap gap-1'>
                              {c.blocks.map((b) => (
                                <button
                                  key={b}
                                  type='button'
                                  className='underline decoration-borderColor hover:decoration-textColor'
                                  onClick={() => setPicked(b.toLowerCase())}
                                >
                                  {b}
                                </button>
                              ))}
                            </span>
                          ) : (
                            <span className='text-labelColor'>—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </DataTable>
            </>
          )}
        </Panel>
      }
      side={
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
              onPick={(k) => setPicked(k === picked ? null : k)}
              grainLayer='7'
              innerLayers={new Set(['14'])}
            />
          )}
        </Panel>
      }
    />
  );
}

function ScopeSummary({ scope }: { scope: DraftScope }) {
  const m = scope.manifest;
  const bytes = new Blob([scope.dxfText]).size;
  const pairs = m.pieces.filter((p) => p.pairHand === 'L').length;
  return (
    <div>
      <Row label='file' value={`${scope.filename} · ${fmtBytes(bytes)}`} />
      <Row label='fabric scope' value={scope.target.label} />
      <Row label='blocks' value={blockSum(m.blocks)} />
      <Row label='pairs as _L + _R' value={pairs || '—'} />
      {/* the value wraps under its own edge instead of running over the label (1024 px) */}
      <Row
        label='layers'
        value='1 cut (final) · 14 seam · 7 grain · 4 notch · 8 internal'
        className='[&>span:first-child]:shrink-0 [&>span:last-child]:shrink [&>span:last-child]:text-right'
      />
      <GroupLabel>manifest</GroupLabel>
      <Text size='micro' variant='label' component='p'>
        embedded as 999 comments: block → piece → card size → scope. the card reads it instead of
        guessing from block names, and does not add the allowance again.
      </Text>
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
