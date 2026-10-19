// Stage 2 · SHEET — the tiles put back together. Residuals are VISIBLE (Codex C6) on the drawing:
// a tile that does not close is outlined blue with its number, a weak registration is a blue seam.
// The panel is one line ("44 pages joined ✓"); it asks only when tiles are missing, refused or
// do not close — accept, or fix the layout (a rows × columns picker). Missing pages lead with a
// map of the page cells, the empty ones dashed '?'. Any page on the sheet can be removed by hand
// (click it → [remove page]: the files step's own page-role edit, undone from the panel). Seams,
// votes and loop numbers are diagnostics.
import { useMemo, useState } from 'react';
import { holeAutoEvidence } from 'lib/pattern-import/assemble/holes';
import type { GridOverride, MissingCell, PagePose, BoxMm } from 'lib/pattern-import/types';
import { PATIMPORT } from 'lib/pattern-import/types';
import { cn } from 'lib/utility';
import { Button, CalloutBox, Chip, DataTable, GroupLabel, Row, Text, EmptyCell } from 'ui';
import type { CardContext } from '../client';
import { SHEET_INK, SheetViewport, vy } from '../sheet-viewport';
import type { ImportSessionApi } from '../use-import-session';
import {
  DebugFold,
  Field,
  Fold,
  NativeSelect,
  NumberField,
  Panel,
  SplitStage,
  ask,
  fmtMm,
  useAnsweredAndGo,
} from '../ui-bits';
import { SheetCleanRows, roleEdit } from './files-clean';

/** The coach's how (THE ASK CONTRACT, ui-bits) when the grid by hand is the answer. */
const GRID_HINT = 'pick rows × columns of the printed layout';

const keyOf = (p: { file: string; page: number }) => `${p.file}:${p.page}`;
/** The inline [remove page] on the canvas carries this key prefix (SheetViewport picks by key). */
const RM = 'rm|';
/** The role a page removed from the sheet by hand gets (the files step's set-aside). */
const REMOVED = 'blank' as const;

/** "p3–17" (pages are 0-based; several files: "2/p3–17 …"). */
function pageSpan(pages: readonly { file: string; page: number }[]): string {
  const byFile = new Map<string, number[]>();
  for (const p of pages) byFile.set(p.file, [...(byFile.get(p.file) ?? []), p.page + 1]);
  return [...byFile]
    .map(([f, ps]) => {
      const lo = Math.min(...ps);
      const hi = Math.max(...ps);
      return `${byFile.size > 1 ? `${Number(f) + 1}/` : ''}p${lo}${hi > lo ? `–${hi}` : ''}`;
    })
    .join(' ');
}

/** One SVG path for the whole preview: thousands of <polyline>s would make pan and zoom crawl. */
function pathData(arrays: readonly Float32Array[]): string {
  const parts: string[] = [];
  for (const a of arrays) {
    if (a.length < 4) continue;
    let d = `M${a[0].toFixed(1)} ${(-a[1]).toFixed(1)}`;
    for (let i = 2; i < a.length; i += 2) d += `L${a[i].toFixed(1)} ${(-a[i + 1]).toFixed(1)}`;
    parts.push(d);
  }
  return parts.join('');
}

export function SheetStep({ api }: { api: ImportSessionApi; card?: CardContext }) {
  const { session, inputs, patchInputs } = api;
  const out = session.sheet;
  const busy = !!session.busy;
  const go = useAnsweredAndGo();
  const [picked, setPicked] = useState<string | null>(null);
  /** A page under the pointer, on the canvas or on the map of cells (outlined on both). */
  const [hover, setHover] = useState<string | null>(null);
  const multiFile = new Set(out?.sheet.poses.map((p) => p.file) ?? []).size > 1;
  const fileName = (id: string) => session.files.find((f) => f.id === id)?.name ?? `file ${id}`;
  /** A1, B3 … in the tile grid; with a file-per-size set the file says which drawing. */
  // D6: several tile sheets each number their tiles from A1 — the sheet says which
  const partOf = (p: PagePose) =>
    (out?.sheet.parts?.length ?? 0) > 1
      ? out?.sheet.parts?.find((q) => q.pages.some((x) => x.file === p.file && x.page === p.page))
      : undefined;
  const tileName = (p?: PagePose) =>
    !p
      ? '?'
      : `${partOf(p) ? `s${partOf(p)!.sheet + 1}·` : ''}${multiFile ? `${Number(p.file) + 1}/` : ''}${
          p.row == null || p.col == null
            ? `p${p.page + 1}`
            : `${String.fromCharCode(65 + p.row)}${p.col + 1}`
        }`;
  const first = out?.sheet.poses[0];
  const [grid, setGrid] = useState<GridOverride>(
    inputs.gridOverride ?? {
      rows: Math.max(1, ...(out?.sheet.poses.map((p) => (p.row ?? 0) + 1) ?? [1])),
      cols: Math.max(1, ...(out?.sheet.poses.map((p) => (p.col ?? 0) + 1) ?? [1])),
      stepXMm: Math.round(first?.widthMm ?? 200),
      stepYMm: Math.round(first?.heightMm ?? 287),
      order: 'row-major',
      originPage: { file: first?.file ?? '0', page: first?.page ?? 0 },
    },
  );
  const preview = useMemo(() => (out ? pathData(out.previewPaths) : ''), [out]);
  // A8: what the clean stage set aside, drawn under the line work in the sheet's light grey
  const masked = useMemo(
    () => (out?.clean ? pathData(out.clean.masked.flatMap((m) => m.lines)) : ''),
    [out],
  );
  // Tile sheets of the files (a Burda file carries two; r4454 a main sheet + interfacing) — D6:
  // every one is in the drawing; the hand grid is set on one of them.
  const [gridSheet, setGridSheet] = useState<number>(inputs.sheetIndex);
  /** The layout fold; null = its own rule (open while the layout is the answer). */
  const [gridOpen, setGridOpen] = useState<boolean | null>(null);
  const sheets = useMemo(
    () =>
      [
        ...new Set(
          session.pages.flatMap((p) => (p.cls === 'tile' && p.sheet != null ? [p.sheet] : [])),
        ),
      ].sort((a, b) => a - b),
    [session.pages],
  );
  if (!out) return null;
  const { sheet } = out;
  const worst = Math.max(0, ...sheet.poses.map((p) => p.residualMm));
  const overLimit = worst > PATIMPORT.registrationMaxResidualMm;
  // F2 reports secondBestRatio as second-best / best votes (0 = one clear peak). A seam whose
  // runner-up has more than 1/3 of the winner's votes is ambiguous: drawn blue, needs a look.
  const isWeak = (p: { score: number; secondBestRatio: number }) =>
    p.score > 0 && p.secondBestRatio > 1 / PATIMPORT.registrationMinPeakRatio;
  const weak = sheet.pairs.filter(isWeak);
  const poseOf = (q: { file: string; page: number }) =>
    sheet.poses.find((p) => p.file === q.file && p.page === q.page);
  const tilesIn = (n: number) =>
    session.pages.filter((p) => p.cls === 'tile' && p.sheet === n).length;
  const refused = sheet.refused ?? [];
  const missing = sheet.missing.length;
  /** The layout by hand is the answer: pages left off the grid, or a placement refused. */
  const gridAsks = missing > 0 || refused.length > 0;
  const acceptAsks = overLimit && !inputs.residualsAccepted && !gridAsks;
  const fine = !gridAsks && !overLimit;
  const gridFold = {
    open: gridOpen ?? (gridAsks || !!inputs.gridOverride),
    onOpenChange: setGridOpen,
  };
  const fileLegend = multiFile
    ? [...new Set(sheet.poses.map((p) => p.file))]
        .map((f) => `${Number(f) + 1} = ${fileName(f)}`)
        .join(' · ')
    : '';

  // the grid by hand, the same dispatch whichever control sends it
  const applyGrid = (g: GridOverride) =>
    void api.dispatch({
      type: 'sheet',
      sheet: gridSheet,
      override: {
        ...g,
        // The hand grid starts at the first tile page of THAT sheet, in file order.
        originPage: (() => {
          const t = session.pages.find((p) => p.cls === 'tile' && (p.sheet ?? 0) === gridSheet);
          return { file: t?.file ?? first?.file ?? '0', page: t?.page ?? first?.page ?? 0 };
        })(),
      },
    });

  /**
   * Every committed grid change (page order, page step across / down) is sent as the whole hand
   * grid — the same `sheet` event the rows × cols picker sends. Local state alone looked applied
   * but the assembly never saw it (Codex review 16.10 #4). An unchanged value sends nothing.
   */
  const commitGrid = (p: Partial<GridOverride>) => {
    const g = { ...grid, ...p };
    if (g.order === grid.order && g.stepXMm === grid.stepXMm && g.stepYMm === grid.stepYMm) return;
    setGrid(g);
    applyGrid(g);
  };

  // a page removed by hand = the files step's page-role edit (re-runs clean → scale → assembly)
  const splitKey = (k: string) => {
    const at = k.lastIndexOf(':');
    return { file: k.slice(0, at), page: Number(k.slice(at + 1)) };
  };
  const removePage = (k: string) => {
    const { file, page } = splitKey(k);
    setPicked(null);
    setHover(null);
    void api.dispatch({ type: 'clean', edits: roleEdit(inputs.cleanEdits, file, page, REMOVED) });
  };
  const removed = inputs.cleanEdits.flatMap((e) =>
    'role' in e && e.role === REMOVED ? [{ file: e.file, page: e.page }] : [],
  );
  const restore = (r: { file: string; page: number }) =>
    void api.dispatch({
      type: 'clean',
      edits: roleEdit(inputs.cleanEdits, r.file, r.page, 'tile'),
    });
  const pageWord = (r: { file: string; page: number }) =>
    `page ${r.page + 1}${session.files.length > 1 ? ` of ${fileName(r.file)}` : ''}`;

  // empty cells placed on the sheet: the engine's paper box (UX-HOOKS), else where their row and
  // column are. `gaps` = missing pages (asked), `blanks` = cells accepted as blank pages.
  const step = { w: first?.widthMm ?? 0, h: first?.heightMm ?? 0 };
  const placeCell = <C extends MissingCell>(m: C): (C & { box: BoxMm })[] => {
    if (m.box) return [{ ...m, box: m.box }];
    const same = (p: PagePose) => (partOf(p)?.sheet ?? 0) === (m.sheet ?? 0);
    const inCol = sheet.poses.find((p) => same(p) && p.col === m.col);
    const inRow = sheet.poses.find((p) => same(p) && p.row === m.row);
    if (!inCol || !inRow) return [];
    const x = inCol.toSheet.e;
    const y = inRow.toSheet.f;
    return [{ ...m, box: { minX: x, minY: y, maxX: x + step.w, maxY: y + step.h } }];
  };
  const gaps = sheet.missing.flatMap(placeCell);
  const blanks = (sheet.holes ?? []).flatMap(placeCell);
  /**
   * "they're blank — go on" is a one-click fix (ui-bits ONE-CLICK FIX) only when the engine holds
   * every shown cell blank on its own evidence (UX-HOOKS D5 `holeAutoEvidence`: no drawn line ends
   * in it, AND it lies outside the line work or the printed numbers run without a gap). Otherwise
   * it stays the operator's answer: the ask line coaches to it.
   */
  const blankSure = missing > 0 && sheet.missing.every((m) => !!holeAutoEvidence(m));
  const cutLines = sheet.missing.reduce((a, m) => a + (m.lineEnds ?? 0), 0);
  // the map of cells: one grid per tile sheet, per FILE when the sheet's cells name one (a file
  // per size: the same row/col is a different cell in each file) — nothing collapses
  const groups = cellGroups(
    sheet.poses,
    sheet.missing,
    sheet.holes ?? [],
    (p) => partOf(p)?.sheet ?? 0,
  );
  /** Exactly the missing cells the map shows: what "they're blank" accepts. */
  const shownMissing = groups.flatMap((g) => g.hs);
  const acceptBlank = () => go(api.acceptMissing(shownMissing));
  /** Undo per tile sheet: `cells: []` for THAT sheet only (other sheets keep their answers). */
  const blankSheets = [...new Set(blanks.map((h) => h.sheet))].sort((a, b) => a - b);
  const takeBackBlanks = (k: number) =>
    void api.dispatch({ type: 'sheet-accept-missing', sheet: k, cells: [] });
  const hoverPose = hover ? sheet.poses.find((p) => keyOf(p) === hover) : undefined;
  const hoverHole = hover?.startsWith('?') ? gaps.find((h) => holeKey(h) === hover) : undefined;
  const reveal: BoxMm | null = hoverPose
    ? {
        minX: hoverPose.toSheet.e,
        minY: hoverPose.toSheet.f,
        maxX: hoverPose.toSheet.e + hoverPose.widthMm,
        maxY: hoverPose.toSheet.f + hoverPose.heightMm,
      }
    : hoverHole?.box ?? null;
  // pages the classifier set aside although they hold line work (`status: 'suggest'`; a page the
  // operator set aside himself is never 'suggest'): one of them may be a missing page. A reduced
  // copy of the tiles (an overview) is not one.
  const asideTiles = (session.clean?.dropped ?? []).filter(
    (d) =>
      d.status === 'suggest' &&
      !(d.reducedCopy && d.reducedCopy.matches > 0) &&
      !removed.some((r) => keyOf(r) === keyOf(d)),
  );
  /** Every set-aside page with line work back as a tile page, in one answer. */
  const useAside = () =>
    go(
      api.dispatch({
        type: 'clean',
        edits: asideTiles.reduce((e, d) => roleEdit(e, d.file, d.page, 'tile'), inputs.cleanEdits),
      }),
    );
  /**
   * Bringing the set-aside pages back is THE one-click fix (ui-bits ONE-CLICK FIX) when there are
   * at least as many of them as missing cells: it deletes nothing and re-runs the assembly with
   * them. "they're blank" stays the fix only on the engine's evidence; otherwise the coach.
   */
  const asideFix = asideTiles.length > 0 && asideTiles.length >= missing;
  /** The question, plain: which answer leads decides its words. */
  const missingAsk = `${missing} ${missing === 1 ? 'page' : 'pages'} missing — ${asideTiles.length ? 'set aside?' : 'blank?'}`;
  const pagesWord =
    asideTiles.length > 3
      ? `${asideTiles.length} pages set aside`
      : asideTiles.length === 1
        ? pageWord(asideTiles[0])
        : `pages ${asideTiles.map((d) => d.page + 1).join(', ')}`;

  return (
    <SplitStage
      canvas={
        <Panel
          title='assembled sheet'
          aside={
            <Text
              size='micro'
              variant='label'
              component='span'
              title={[
                'wheel zoom · drag pan',
                fileLegend && `tiles are named file/cell: ${fileLegend}`,
              ]
                .filter(Boolean)
                .join(' — ')}
            >
              {((sheet.bbox.maxX - sheet.bbox.minX) / 10).toFixed(1)} ×{' '}
              {((sheet.bbox.maxY - sheet.bbox.minY) / 10).toFixed(1)} cm
            </Text>
          }
          bodyClassName='p-0 flex flex-col'
        >
          <div className='min-h-0 flex-1'>
            <SheetViewport
              bbox={sheet.bbox}
              reveal={reveal}
              onPick={(k) =>
                k.startsWith(RM) ? removePage(k.slice(RM.length)) : setPicked(k || null)
              }
            >
              {({ unit }) => (
                <>
                  {sheet.poses.map((p) => {
                    const x = p.toSheet.e;
                    const y = p.toSheet.f;
                    const w = p.widthMm;
                    const h = p.heightMm;
                    const on = picked === keyOf(p);
                    const hot = hover === keyOf(p);
                    const bad = p.residualMm > PATIMPORT.registrationMaxResidualMm * 0.66;
                    return (
                      <g
                        key={keyOf(p)}
                        data-key={keyOf(p)}
                        onPointerEnter={() => setHover(keyOf(p))}
                        onPointerLeave={() => setHover((k) => (k === keyOf(p) ? null : k))}
                      >
                        <rect
                          x={x}
                          y={vy(y + h)}
                          width={w}
                          height={h}
                          fill={on ? SHEET_INK.pick : '#ffffff'}
                          fillOpacity={on ? 0.7 : 0}
                          stroke={hot || on ? SHEET_INK.blue : bad ? SHEET_INK.blue : '#d5d5d5'}
                          strokeWidth={hot || on ? 2 : 1}
                          vectorEffect='non-scaling-stroke'
                        />
                        <text
                          x={x + 6}
                          y={vy(y + h - 6) + Math.min(unit * 12, w / 10)}
                          fontSize={Math.min(unit * 12, w / 10)}
                          fill={bad ? SHEET_INK.blue : SHEET_INK.mut}
                        >
                          {tileName(p)}
                          {bad ? ` · ${p.residualMm.toFixed(2)}` : ''}
                        </text>
                      </g>
                    );
                  })}
                  {blanks.map((m) => (
                    <rect
                      key={`b${holeKey(m)}`}
                      pointerEvents='none'
                      x={m.box.minX}
                      y={vy(m.box.maxY)}
                      width={m.box.maxX - m.box.minX}
                      height={m.box.maxY - m.box.minY}
                      fill='none'
                      stroke='#d5d5d5'
                      strokeWidth={1}
                      strokeDasharray='6 4'
                      vectorEffect='non-scaling-stroke'
                    />
                  ))}
                  {gaps.map((m) => {
                    const hot = hover === holeKey(m);
                    return (
                      <g key={holeKey(m)} pointerEvents='none'>
                        <rect
                          x={m.box.minX}
                          y={vy(m.box.maxY)}
                          width={m.box.maxX - m.box.minX}
                          height={m.box.maxY - m.box.minY}
                          fill={SHEET_INK.blue}
                          fillOpacity={hot ? 0.16 : 0.08}
                          stroke={SHEET_INK.blue}
                          strokeWidth={hot ? 3 : 2}
                          strokeDasharray='6 4'
                          vectorEffect='non-scaling-stroke'
                        />
                        <text
                          x={(m.box.minX + m.box.maxX) / 2}
                          y={vy((m.box.minY + m.box.maxY) / 2)}
                          fontSize={Math.min(unit * 28, (m.box.maxX - m.box.minX) / 4)}
                          textAnchor='middle'
                          dominantBaseline='middle'
                          fill={SHEET_INK.blue}
                        >
                          ?
                        </text>
                      </g>
                    );
                  })}
                  {masked && (
                    <path
                      d={masked}
                      pointerEvents='none'
                      fill='none'
                      stroke={SHEET_INK.source}
                      strokeOpacity={0.6}
                      strokeWidth={0.5}
                      vectorEffect='non-scaling-stroke'
                    />
                  )}
                  <path
                    d={preview}
                    pointerEvents='none'
                    fill='none'
                    stroke={SHEET_INK.ink}
                    strokeOpacity={0.7}
                    // Hairlines at every zoom: a stroke in sheet mm turns a 9-metre file-per-size
                    // strip into solid grey at fit.
                    strokeWidth={0.75}
                    vectorEffect='non-scaling-stroke'
                    strokeLinejoin='round'
                  />
                  {weak.map((w, i) => {
                    const a = poseOf(w.from);
                    const b = poseOf(w.to);
                    if (!a || !b) return null;
                    const ax = a.toSheet.e + a.widthMm / 2;
                    const ay = a.toSheet.f + a.heightMm / 2;
                    const bx = b.toSheet.e + b.widthMm / 2;
                    const by = b.toSheet.f + b.heightMm / 2;
                    return (
                      <line
                        key={i}
                        x1={ax}
                        y1={vy(ay)}
                        x2={bx}
                        y2={vy(by)}
                        stroke={SHEET_INK.blue}
                        strokeWidth={Math.min(unit * 3, 3 * (a.widthMm / 200))}
                        strokeDasharray={`${unit * 10} ${unit * 6}`}
                        pointerEvents='none'
                      />
                    );
                  })}
                  {/* the picked page's one action, at the cell (a key the viewport picks) */}
                  {(() => {
                    const p = picked ? sheet.poses.find((q) => keyOf(q) === picked) : undefined;
                    if (!p || busy) return null;
                    const fs = unit * 15;
                    const bw = fs * 8.6;
                    const bh = fs * 1.9;
                    const bx = p.toSheet.e + p.widthMm / 2 - bw / 2;
                    const by = vy(p.toSheet.f + p.heightMm / 2) - bh / 2;
                    return (
                      <g data-key={`${RM}${keyOf(p)}`} className='cursor-pointer' role='button'>
                        <title>
                          take this page off the sheet (it is set aside, like on the files step)
                        </title>
                        <rect
                          x={bx}
                          y={by}
                          width={bw}
                          height={bh}
                          fill='#ffffff'
                          stroke={SHEET_INK.ink}
                          strokeWidth={1}
                          vectorEffect='non-scaling-stroke'
                        />
                        <text
                          x={bx + bw / 2}
                          y={by + bh / 2}
                          fontSize={fs}
                          textAnchor='middle'
                          dominantBaseline='middle'
                          fill={SHEET_INK.ink}
                        >
                          REMOVE PAGE
                        </text>
                      </g>
                    );
                  })()}
                </>
              )}
            </SheetViewport>
          </div>
          <Text size='micro' variant='label' component='p' className='shrink-0 px-2 py-1'>
            {busy && removed.length
              ? 'putting the sheet together again…'
              : 'click a page to remove it'}
          </Text>
        </Panel>
      }
      side={
        <Panel title='registration'>
          <div className='flex flex-col gap-2'>
            {/* the state in one line */}
            <Text size='micro' component='p' className='tabular-nums'>
              {fine
                ? `${sheet.poses.length} pages joined ✓`
                : `${sheet.poses.length} of ${sheet.poses.length + missing} pages joined`}
              {sheets.length > 1 ? ` · ${sheets.length} sheets` : ''}
            </Text>

            {/* the pages taken off by hand, each with its undo */}
            {removed.map((r) => (
              <Text
                key={keyOf(r)}
                size='micro'
                variant='label'
                component='p'
                className='flex items-baseline gap-2'
              >
                {pageWord(r)} removed ·
                <button
                  type='button'
                  disabled={busy}
                  onClick={() => restore(r)}
                  className='underline hover:text-textColor disabled:opacity-50'
                >
                  undo
                </button>
              </Text>
            ))}

            {/* D3: a refused placement has no "accept" — every reason stays in view */}
            {refused.length > 0 && (
              <CalloutBox tone='error' className='py-1'>
                {refused.map((w) => (
                  <Text key={w} size='micro' component='p'>
                    {w}
                  </Text>
                ))}
              </CalloutBox>
            )}

            {/* missing pages: ONE question — the page cells as its picture, then the answers:
                blank pages (UX-HOOKS sheetAcceptMissing, exactly the cells shown) or a page set
                aside brought back. The hand grid stays the fold below. */}
            {missing > 0 && (
              <div data-ask-zone='' data-ask-label={missingAsk} className='flex flex-col gap-2'>
                <Text size='micro' component='p' className='text-warning'>
                  {missingAsk}
                </Text>
                <CellMap
                  groups={groups}
                  label={(g) =>
                    [
                      sheets.length > 1 || (sheet.parts?.length ?? 0) > 1
                        ? `sheet ${g.sheet + 1}`
                        : '',
                      g.file != null && groups.length > 1 ? fileName(g.file) : '',
                    ]
                      .filter(Boolean)
                      .join(' · ')
                  }
                  ratio={first ? first.heightMm / first.widthMm : 1.4}
                  hover={hover}
                  onHover={setHover}
                />
                <div className='flex flex-wrap items-center gap-1'>
                  {asideTiles.length > 0 && (
                    <Chip
                      tone={asideFix ? 'attention' : undefined}
                      disabled={busy}
                      onClick={useAside}
                      title={`read as pattern pages again — set aside with line work: ${asideTiles
                        .map((d) => `${pageWord(d)} (${d.why})`)
                        .join(' · ')}`}
                      {...ask(
                        'sheet-missing',
                        true,
                        asideFix ? 'they hold line work' : 'look at the dashed cells, then answer',
                      )}
                      {...(asideFix ? { 'data-ask-fix': 'sheet-missing' } : {})}
                    >
                      use {pagesWord}
                    </Chip>
                  )}
                  <Chip
                    tone={asideFix ? undefined : 'attention'}
                    disabled={busy}
                    onClick={acceptBlank}
                    title={
                      cutLines
                        ? `${cutLines} drawn line ends run into the dashed ${missing === 1 ? 'cell' : 'cells'} — a piece cut there is asked again on the pieces step`
                        : 'no drawn line runs into the dashed cells'
                    }
                    {...ask(
                      'sheet-missing',
                      true,
                      blankSure
                        ? 'nothing is drawn there'
                        : 'look at the dashed cells, then answer',
                    )}
                    {...(blankSure && !asideFix ? { 'data-ask-fix': 'sheet-missing' } : {})}
                  >
                    {missing === 1 ? "it's blank — go on" : "they're blank — go on"}
                  </Chip>
                </div>
              </div>
            )}

            {/* cells accepted as blank pages: one quiet line per tile sheet, each with its undo */}
            {blankSheets.map((k) => {
              const bs = blanks.filter((h) => h.sheet === k);
              return (
                <Text
                  key={k}
                  size='micro'
                  variant='label'
                  component='p'
                  className='flex items-baseline gap-2'
                  title={bs
                    .map(
                      (h) =>
                        `${h.file != null && session.files.length > 1 ? `${fileName(h.file)} ` : ''}${String.fromCharCode(65 + h.row)}${h.col + 1}: ${h.origin === 'autopilot' ? 'autopilot' : 'you'}`,
                    )
                    .join(' · ')}
                >
                  {blankSheets.length > 1 ? `sheet ${k + 1}: ` : ''}
                  {bs.length} blank {bs.length === 1 ? 'page' : 'pages'} ·
                  <button
                    type='button'
                    disabled={busy}
                    onClick={() => takeBackBlanks(k)}
                    className='underline hover:text-textColor disabled:opacity-50'
                  >
                    undo
                  </button>
                </Text>
              );
            })}

            {overLimit && (
              <div data-ask-zone='' className='flex flex-wrap items-center gap-2'>
                <Text
                  size='micro'
                  component='span'
                  className={inputs.residualsAccepted ? 'text-labelColor' : 'text-warning'}
                >
                  {inputs.residualsAccepted ? '' : '! '}
                  {weak.length
                    ? `${weak.length} blue ${weak.length === 1 ? 'seam' : 'seams'} · `
                    : ''}
                  {fmtMm(worst)} (limit {PATIMPORT.registrationMaxResidualMm})
                </Text>
                <Chip
                  tone={inputs.residualsAccepted ? undefined : 'attention'}
                  selected={inputs.residualsAccepted}
                  pressed={inputs.residualsAccepted}
                  onClick={() => patchInputs({ residualsAccepted: !inputs.residualsAccepted })}
                  title='I looked at the blue seams — the drawing runs on across them'
                  {...ask('sheet-accept', acceptAsks, 'check the blue seams, then accept')}
                  {...(acceptAsks ? { 'data-ask-fix': 'sheet-accept' } : {})}
                >
                  accept {fmtMm(worst)}
                </Chip>
              </div>
            )}

            {/* the sheet offer asks only when no blocker does: the blocker's answer wins the coach */}
            {out.clean && <SheetCleanRows api={api} clean={out.clean} askOn={!api.blocker} />}
          </div>

          {/* the layout by hand: the coach's zone when pages are missing or the placement is refused */}
          <div
            data-ask-zone=''
            data-ask-hint={GRID_HINT}
            {...(missing > 0
              ? {
                  'data-ask-label': missingAsk,
                }
              : {})}
          >
            <Fold label='fix the layout' ask={gridAsks ? 'sheet-grid' : undefined} {...gridFold}>
              <div className='flex flex-col gap-2'>
                {sheets.length > 1 && (
                  <Field label='layout of sheet'>
                    <NativeSelect
                      value={String(gridSheet)}
                      onChange={(v) => setGridSheet(Number(v))}
                      options={sheets.map((n) => ({
                        value: String(n),
                        label: `sheet ${n + 1} · ${tilesIn(n)} tiles`,
                      }))}
                    />
                  </Field>
                )}
                <OrderPick
                  value={grid.order}
                  disabled={busy}
                  onChange={(order) => commitGrid({ order })}
                />
                <LayoutPick
                  rows={grid.rows}
                  cols={grid.cols}
                  disabled={busy}
                  askOn={gridAsks}
                  onPick={(rows, cols) => {
                    const g = { ...grid, rows, cols };
                    setGrid(g);
                    applyGrid(g);
                  }}
                />
                <Fold label='page size' className='mt-0'>
                  <div className='grid grid-cols-2 gap-2'>
                    <Field label='across, mm'>
                      <NumberField
                        value={grid.stepXMm}
                        min={1}
                        disabled={busy}
                        onCommit={(v) => v != null && commitGrid({ stepXMm: v })}
                      />
                    </Field>
                    <Field label='down, mm'>
                      <NumberField
                        value={grid.stepYMm}
                        min={1}
                        disabled={busy}
                        onCommit={(v) => v != null && commitGrid({ stepYMm: v })}
                      />
                    </Field>
                  </div>
                </Fold>
                {inputs.gridOverride && (
                  <Button
                    variant='underline'
                    size='xs'
                    className='self-start text-labelColor hover:text-textColor'
                    onClick={() => void api.dispatch({ type: 'sheet', sheet: 0 })}
                  >
                    back to detected
                  </Button>
                )}
              </div>
            </Fold>
          </div>

          <DebugFold>
            {sheets.length > 1 && (
              <DataTable>
                <thead>
                  <tr>
                    <th data-align='left'>sheet</th>
                    <th>tiles</th>
                    <th>pages</th>
                    <th>worst</th>
                  </tr>
                </thead>
                <tbody>
                  {(sheet.parts ?? []).map((p) => (
                    <tr key={p.sheet}>
                      <td data-align='left'>sheet {p.sheet + 1}</td>
                      <td>{p.pages.length}</td>
                      <td>{pageSpan(p.pages)}</td>
                      <td
                        className={
                          p.maxResidualMm > PATIMPORT.registrationMaxResidualMm || p.missing
                            ? 'text-error'
                            : undefined
                        }
                      >
                        {fmtMm(p.maxResidualMm)}
                        {p.missing ? ` · ${p.missing} missing` : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            )}
            <Row label='tiles placed' value={sheet.poses.length} />
            <Row label='missing tiles' value={missing || <EmptyCell />} />
            <Row label='worst loop closure' value={fmtMm(worst)} />
            <Row label='limit' value={fmtMm(PATIMPORT.registrationMaxResidualMm, 1)} />
            {sheet.overview && (
              <Row
                label='overview page'
                value={`p. ${sheet.overview.page + 1} · drawn at 1 : ${sheet.overview.factor.toFixed(2)}`}
              />
            )}
            {sheet.warnings.length > 0 && (
              <div className='mt-1 max-h-40 overflow-y-auto'>
                {sheet.warnings.map((w) => (
                  <Text key={w} size='micro' variant='label' component='p'>
                    {w}
                  </Text>
                ))}
              </div>
            )}
            <GroupLabel>tile seams</GroupLabel>
            <DataTable>
              <thead>
                <tr>
                  <th>seam</th>
                  <th data-align='left'>method</th>
                  <th>votes</th>
                  <th title='votes of the runner-up offset / votes of the winner: 0 = one clear answer'>
                    2nd / best
                  </th>
                </tr>
              </thead>
              <tbody>
                {sheet.pairs
                  .filter(
                    (p) => picked == null || keyOf(p.from) === picked || keyOf(p.to) === picked,
                  )
                  .map((p, i) => {
                    const a = poseOf(p.from);
                    const b = poseOf(p.to);
                    const low = isWeak(p);
                    return (
                      <tr key={i}>
                        <td>
                          {tileName(a)} → {tileName(b)}
                        </td>
                        <td data-align='left'>{p.method}</td>
                        <td>{p.score}</td>
                        <td className={low ? 'text-warning' : undefined}>
                          {low ? '! ' : ''}
                          {p.score > 0 ? p.secondBestRatio.toFixed(2) : <EmptyCell />}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </DataTable>
          </DebugFold>
        </Panel>
      }
    />
  );
}

type Hole = { row: number; col: number; sheet?: number; file?: string };
const holeKey = (m: Hole) =>
  `?${m.sheet ?? 0}:${m.row}:${m.col}${m.file != null ? `:${m.file}` : ''}`;

type CellGroup = {
  key: string;
  sheet: number;
  /** Set when the sheet's cells name a file (a file per size): this grid is that file's. */
  file?: string;
  ps: PagePose[];
  hs: MissingCell[];
  bs: Hole[];
};

/**
 * The map's grids: one per tile sheet; a sheet whose missing / blank cells name a file (a file per
 * size) is split per file, so two files' cells at the same row/col never fall on one square. Every
 * missing cell lands in exactly one group (a cell without a file joins its sheet's file-less grid).
 */
function cellGroups(
  poses: readonly PagePose[],
  holes: readonly MissingCell[],
  blanks: readonly Hole[],
  partOf: (p: PagePose) => number,
): CellGroup[] {
  const sheetsOf = [
    ...new Set([
      ...poses.map(partOf),
      ...holes.map((h) => h.sheet ?? 0),
      ...blanks.map((h) => h.sheet ?? 0),
    ]),
  ].sort((a, b) => a - b);
  const placed = poses.filter((p) => p.row != null && p.col != null);
  const out: CellGroup[] = [];
  for (const n of sheetsOf) {
    const ps = placed.filter((p) => partOf(p) === n);
    const hs = holes.filter((h) => (h.sheet ?? 0) === n);
    const bs = blanks.filter((h) => (h.sheet ?? 0) === n);
    const perFile = [...hs, ...bs].some((h) => h.file != null);
    if (!perFile) {
      out.push({ key: `${n}`, sheet: n, ps, hs, bs });
      continue;
    }
    const files = [
      ...new Set([
        ...ps.map((p) => p.file),
        ...hs.flatMap((h) => (h.file != null ? [h.file] : [])),
        ...bs.flatMap((h) => (h.file != null ? [h.file] : [])),
      ]),
    ].sort();
    for (const f of files)
      out.push({
        key: `${n}:${f}`,
        sheet: n,
        file: f,
        ps: ps.filter((p) => p.file === f),
        hs: hs.filter((h) => h.file === f),
        bs: bs.filter((h) => h.file === f),
      });
    const loose = { hs: hs.filter((h) => h.file == null), bs: bs.filter((h) => h.file == null) };
    if (loose.hs.length || loose.bs.length) out.push({ key: `${n}:-`, sheet: n, ps, ...loose });
  }
  return out.filter((g) => g.hs.length || g.bs.length || g.ps.length);
}

/**
 * The sheet as page cells, one small grid per group (`cellGroups`): a placed page = its page
 * number, an empty cell the drawing runs into = dashed '?', a cell accepted as a blank page =
 * dashed, empty. Hovering a cell outlines that page on the canvas.
 */
function CellMap({
  groups,
  label,
  ratio,
  hover,
  onHover,
}: {
  groups: readonly CellGroup[];
  label: (g: CellGroup) => string;
  ratio: number;
  hover: string | null;
  onHover: (k: string | null) => void;
}) {
  return (
    <div className='flex flex-wrap items-start gap-3'>
      {groups.map((g) => {
        const { ps, hs, bs } = g;
        const rows = Math.max(
          1,
          ...ps.map((p) => p.row! + 1),
          ...hs.map((h) => h.row + 1),
          ...bs.map((h) => h.row + 1),
        );
        const cols = Math.max(
          1,
          ...ps.map((p) => p.col! + 1),
          ...hs.map((h) => h.col + 1),
          ...bs.map((h) => h.col + 1),
        );
        // fit the map in ~300 × 320 px, cells keep the page's proportion
        let w = Math.min(30, 300 / cols);
        let h = w * ratio;
        if (h * rows > 320) {
          h = 320 / rows;
          w = h / ratio;
        }
        const cell = new Map<string, React.ReactNode>();
        for (const p of ps) {
          const k = keyOf(p);
          cell.set(
            `${p.row},${p.col}`,
            <div
              key={k}
              onPointerEnter={() => onHover(k)}
              onPointerLeave={() => onHover(null)}
              title={`page ${p.page + 1}`}
              className={cn(
                'flex items-center justify-center border text-micro tabular-nums',
                hover === k
                  ? 'border-warning bg-bgZebra text-textColor'
                  : 'border-borderColor bg-bgColor text-labelColor',
              )}
              style={{ gridRow: p.row! + 1, gridColumn: p.col! + 1 }}
            >
              {p.page + 1}
            </div>,
          );
        }
        for (const m of bs) {
          if (cell.has(`${m.row},${m.col}`)) continue;
          cell.set(
            `${m.row},${m.col}`,
            <div
              key={`b${holeKey(m)}`}
              title={`row ${m.row + 1}, column ${m.col + 1}: blank page`}
              className='border border-dashed border-borderColor'
              style={{ gridRow: m.row + 1, gridColumn: m.col + 1 }}
            />,
          );
        }
        for (const m of hs) {
          const k = holeKey(m);
          cell.set(
            `${m.row},${m.col}`,
            <div
              key={k}
              onPointerEnter={() => onHover(k)}
              onPointerLeave={() => onHover(null)}
              title={`row ${m.row + 1}, column ${m.col + 1}: no page`}
              className={cn(
                'flex items-center justify-center border border-dashed border-warning text-micro text-warning',
                hover === k && 'bg-bgZebra',
              )}
              style={{ gridRow: m.row + 1, gridColumn: m.col + 1 }}
            >
              ?
            </div>,
          );
        }
        const name = label(g);
        return (
          <div key={g.key} className='flex flex-col gap-1'>
            {name && (
              <Text
                size='micro'
                variant='label'
                component='span'
                className='max-w-[300px] truncate'
              >
                {name}
              </Text>
            )}
            <div
              className='grid gap-px'
              style={{
                gridTemplateColumns: `repeat(${cols}, ${w}px)`,
                gridTemplateRows: `repeat(${rows}, ${h}px)`,
              }}
              aria-label={`page cells${name ? ` of ${name}` : ''}`}
            >
              {[...cell.values()]}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Page order as two pictograms: → along the rows, ↓ down the columns. */
function OrderPick({
  value,
  onChange,
  disabled,
}: {
  value: GridOverride['order'];
  onChange: (v: GridOverride['order']) => void;
  disabled?: boolean;
}) {
  const opts = [
    {
      v: 'row-major' as const,
      glyph: '→',
      word: 'by rows',
      title: 'pages run along the rows: A1 A2 A3 … B1',
    },
    {
      v: 'col-major' as const,
      glyph: '↓',
      word: 'by columns',
      title: 'pages run down the columns: A1 B1 C1 … A2',
    },
  ];
  return (
    <div role='radiogroup' aria-label='page order' className='flex gap-2'>
      {opts.map((o) => (
        <Chip
          key={o.v}
          role='radio'
          aria-checked={value === o.v}
          selected={value === o.v}
          disabled={disabled}
          onClick={() => onChange(o.v)}
          title={o.title}
        >
          {o.glyph} {o.word}
        </Chip>
      ))}
    </div>
  );
}

/**
 * Rows × columns like a table-size picker: hover marks the block, a click applies it. The detected
 * (or last applied) layout stays outlined while nothing is hovered.
 */
function LayoutPick({
  rows,
  cols,
  disabled,
  askOn,
  onPick,
}: {
  rows: number;
  cols: number;
  disabled: boolean;
  askOn: boolean;
  onPick: (rows: number, cols: number) => void;
}) {
  const [at, setAt] = useState<{ r: number; c: number } | null>(null);
  const R = Math.max(rows + 2, 12);
  const C = Math.max(cols + 2, 8);
  const shown = at ?? { r: rows, c: cols };
  return (
    <div className='flex flex-col gap-1'>
      <div
        className='grid w-max gap-[2px]'
        style={{ gridTemplateColumns: `repeat(${C}, 12px)` }}
        onPointerLeave={() => setAt(null)}
        role='grid'
        aria-label='rows and columns of the printed layout'
      >
        {Array.from({ length: R * C }, (_, i) => {
          const r = Math.floor(i / C) + 1;
          const c = (i % C) + 1;
          const inBlock = r <= shown.r && c <= shown.c;
          const isDetected = r === rows && c === cols;
          return (
            <button
              key={i}
              type='button'
              disabled={disabled}
              onPointerEnter={() => setAt({ r, c })}
              onFocus={() => setAt({ r, c })}
              onClick={() => onPick(r, c)}
              aria-label={`${r} rows × ${c} columns`}
              {...(isDetected ? ask('sheet-grid', askOn, GRID_HINT) : {})}
              className={cn(
                'size-3 border focus-visible:outline focus-visible:outline-1 focus-visible:outline-textColor disabled:cursor-not-allowed',
                inBlock ? 'border-textColor bg-textColor' : 'border-borderColor bg-bgColor',
                !at && isDetected && 'border-warning bg-warning',
              )}
            />
          );
        })}
      </div>
      <Text size='micro' variant='label' component='p' className='tabular-nums'>
        {shown.r} × {shown.c} pages · {at ? 'click to apply' : 'as found — click a size to apply'}
      </Text>
    </div>
  );
}
