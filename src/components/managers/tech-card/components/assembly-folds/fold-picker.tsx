import type { PieceGeom, Pt2 } from 'lib/assembly-skeleton/types';
import { seamPieceOf } from 'lib/assembly-skeleton/geometry';
import {
  foldedOutline,
  foldHints,
  type FoldHint,
  type FoldSource,
  type PleatKind,
  type StoredFold,
} from 'lib/folds';
import { grainRotation } from 'lib/pom/upright';
import { cn } from 'lib/utility';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Button, Chip, ChipRow } from 'ui';
import { pieceRefKey } from '../piece-block-refs';
import type { FoundPiece } from '../nesting/dxf-geometry';
import {
  defaultSide,
  detectPleatFans,
  foldGroupsOf,
  openHints,
  pieceView,
  PICK_KINDS,
  pleatDirectionRows,
  ptsAttr,
  rowsOfChoice,
  rowsOfPleat,
  type FoldGroup,
  type PickKind,
  type PleatFan,
} from './fold-model';
import { FAINT, GREY, HatchDef, INK, PAPER, PICK, PliesSvg, SectionSvg } from './fold-picture';
import { foldStepBlocked, stepOfFold, useFoldStep } from './fold-step';
import { useFoldRows } from './folds-store';
import { useFoldWrites } from './use-fold-writes';

type Shapes = ReadonlyMap<string, FoundPiece | null> | null | undefined;

const PICTURE_W = 240;
const PICTURE_H = 320;
const PICTURE_PAD = 16;
const r1 = (value: number) => value.toFixed(1);
const PLEAT_DIRECTIONS: readonly { kind: PleatKind; glyph: string; label: string }[] = [
  { kind: 'pleat_l', glyph: '←', label: 'pleat left' },
  { kind: 'pleat', glyph: '·', label: 'pleat even' },
  { kind: 'pleat_r', glyph: '→', label: 'pleat right' },
];

export type PieceRead = {
  geom: PieceGeom;
  deg: number;
  inner: Pt2[][];
  groups: FoldGroup[];
  hints: FoldHint[];
  rows: StoredFold[];
  maxSeq: number;
};

type PickerLine = {
  id: string;
  line: [Pt2, Pt2];
  source: FoldSource;
  group?: FoldGroup;
  pleatGroup?: FoldGroup;
  pending?: boolean;
};

type Snap = { mm: Pt2; px: Pt2; notch: boolean };

export function usePieceReads(
  pieces: readonly PieceGeom[],
  shapes: Shapes,
  grainDeg: ReadonlyMap<string, number> | undefined,
  innerLines?: ReadonlyMap<string, readonly Pt2[][]>,
): PieceRead[] {
  const rows = useFoldRows();
  return useMemo(
    () =>
      pieces
        .filter((geom) => geom.rs.length >= 3)
        .map((geom) => {
          const found = shapes?.get(pieceRefKey(geom.pieceKey)) ?? null;
          const dto = found
            ? seamPieceOf(found.layers?.length ? found.layers : [found.piece]) ?? found.piece
            : null;
          const deg = grainDeg?.get(geom.pieceKey) ?? (dto ? grainRotation(dto) : 0);
          const inner = [...(innerLines?.get(geom.pieceKey) ?? [])];
          const { groups } = foldGroupsOf(geom, rows, deg, inner, { staleToo: true });
          let hints: FoldHint[] = [];
          if (dto) {
            try {
              hints = foldHints(
                {
                  pieceKey: geom.pieceKey,
                  name: geom.name,
                  piece: dto,
                  piecesPerGarment: 1,
                  cutSymmetry: null,
                  cloth: null,
                  fused: false,
                },
                geom,
                { grainDeg: deg, innerLines: inner },
              );
            } catch {
              hints = [];
            }
          }
          const own = rows.filter(
            (row) => row.pieceKey.toUpperCase() === geom.pieceKey.toUpperCase(),
          );
          return {
            geom,
            deg,
            inner,
            groups,
            hints: openHints(hints, groups),
            rows: own,
            maxSeq: own.reduce((max, row) => Math.max(max, row.seq), 0),
          };
        }),
    [pieces, shapes, grainDeg, innerLines, rows],
  );
}

export function FoldPicker({
  read,
  cardId,
  frozen,
  size,
  stepIndex,
  onClose,
}: {
  read: PieceRead;
  cardId: number | undefined;
  frozen: boolean;
  size: string;
  /** The step this picker is open on. */
  stepIndex?: number;
  onClose: () => void;
}) {
  const choosing = useRef(false);
  const writes = useFoldWrites(cardId, frozen);
  const foldStep = useFoldStep();
  const { geom, deg, inner, groups, hints, rows } = read;
  const [drawing, setDrawing] = useState<{ p1: Pt2 | null } | null>(null);
  const [pending, setPending] = useState<{ line: [Pt2, Pt2]; source: FoldSource } | null>(null);
  const [hovered, setHovered] = useState<string[]>([]);
  const [chosenPleat, setChosenPleat] = useState<string | null>(null);
  const [live, setLive] = useState<Pt2 | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    rootRef.current?.focus({ preventScroll: true });
  }, []);

  const lines = useMemo<PickerLine[]>(
    () =>
      sortPickerLines([
        ...groups.flatMap((group): PickerLine[] =>
          group.kind === 'pleat'
            ? group.flat.map((fold, index) => ({
                id: `saved:${group.rows.map((row) => row.foldKey).join(':')}:${index}`,
                line: [fold.a, fold.b] as [Pt2, Pt2],
                source: group.rows[index]?.source ?? group.source,
                pleatGroup: group,
              }))
            : [
                {
                  id: `saved:${group.rows.map((row) => row.foldKey).join(':')}`,
                  line: group.line,
                  source: group.source,
                  group,
                },
              ],
        ),
        ...hints.map((hint) => ({
          id: `hint:${hint.id}`,
          line: hint.lineMm,
          source: hint.source,
        })),
        ...(pending
          ? [{ id: 'pending', line: pending.line, source: pending.source, pending: true }]
          : []),
      ]),
    [groups, hints, pending],
  );
  const pleatFans = useMemo(() => detectPleatFans(lines), [lines]);
  const brokenPleats = useMemo(
    () =>
      groups.filter(
        (group) =>
          group.kind === 'pleat' &&
          !group.complete &&
          !pleatFans.some((fan) => fan.lines.some((line) => line.pleatGroup === group)),
      ),
    [groups, pleatFans],
  );

  const view = useMemo(
    () => pieceView(geom, deg, { w: PICTURE_W, h: PICTURE_H, pad: PICTURE_PAD }),
    [deg, geom],
  );

  const folded = useMemo(() => {
    const shape = foldedOutline(
      geom.rs,
      groups.flatMap((group) => group.flat),
    );
    const polys = shape.plies.map((ply) => ply.poly);
    const foldedView = pieceView(
      geom,
      deg,
      { w: PICTURE_W, h: PICTURE_H, pad: PICTURE_PAD },
      polys.length ? polys : [geom.rs],
    );
    return { shape, view: foldedView };
  }, [deg, geom, groups]);

  const resetDrawing = () => {
    setDrawing(null);
    setPending(null);
    setLive(null);
  };

  const svgPoint = (event: { clientX: number; clientY: number }): Pt2 | null => {
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return null;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const transformed = point.matrixTransform(matrix.inverse());
    return [transformed.x, transformed.y];
  };

  const snapAt = (point: Pt2): Snap | null => {
    let best: Snap | null = null;
    let bestDistance = 16;
    for (const index of geom.notchIdx) {
      const at = view.toPx(geom.rs[index]);
      const distance = Math.hypot(at[0] - point[0], at[1] - point[1]);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = { mm: geom.rs[index], px: at, notch: true };
      }
    }
    if (best) return best;
    const contour = geom.rs.map(view.toPx);
    bestDistance = 14;
    for (let index = 0; index < contour.length; index++) {
      const a = contour[index];
      const b = contour[(index + 1) % contour.length];
      const delta: Pt2 = [b[0] - a[0], b[1] - a[1]];
      const lengthSquared = delta[0] ** 2 + delta[1] ** 2 || 1;
      const t = Math.max(
        0,
        Math.min(1, ((point[0] - a[0]) * delta[0] + (point[1] - a[1]) * delta[1]) / lengthSquared),
      );
      const at: Pt2 = [a[0] + delta[0] * t, a[1] + delta[1] * t];
      const distance = Math.hypot(at[0] - point[0], at[1] - point[1]);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = { mm: view.fromPx(at), px: at, notch: false };
      }
    }
    return best;
  };

  const onCanvasClick = (event: ReactMouseEvent<SVGSVGElement>) => {
    if (!drawing || frozen) return;
    const point = svgPoint(event);
    const snapped = point ? snapAt(point) : null;
    if (!snapped) return;
    if (!drawing.p1) {
      setDrawing({ p1: snapped.mm });
      return;
    }
    if (Math.hypot(snapped.mm[0] - drawing.p1[0], snapped.mm[1] - drawing.p1[1]) <= 5) return;
    setPending({ line: [drawing.p1, snapped.mm], source: 'owner' });
    setDrawing(null);
    setLive(null);
  };

  const onCanvasMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (drawing) setLive(svgPoint(event));
  };

  /** A fold belongs to the step it was picked on, unless that breaks the piece's fold order. */
  const linkToStep = (
    saved: readonly StoredFold[],
    target: number | null | undefined,
    currentRows: readonly StoredFold[] = rows,
  ) => {
    if (target === null || target === undefined) return;
    const foldKeys = saved.map((row) => row.foldKey);
    const others = currentRows.filter((row) => !foldKeys.includes(row.foldKey));
    const blocked = saved.some((row) =>
      foldStepBlocked(foldStep.operations, [...others, row], row.foldKey, target),
    );
    if (!blocked) foldStep.assign(foldKeys, target);
  };

  const choose = async (line: PickerLine, kind: PickKind) => {
    // A second click before the first write lands would save the same line twice.
    if (frozen || choosing.current) return;
    choosing.current = true;
    try {
      await applyChoice(line, kind);
    } finally {
      choosing.current = false;
    }
  };

  const applyChoice = async (line: PickerLine, kind: PickKind) => {
    if (!line.group) {
      const saved = rowsOfChoice(
        geom,
        { line: line.line, side: defaultSide(geom, line.line), kind, source: line.source },
        { seq: read.maxSeq + 1, grainDeg: deg, anchoredSize: size },
      );
      setPending(null);
      setDrawing(null);
      setLive(null);
      if (saved?.length && (await writes.upsert(saved))) linkToStep(saved, stepIndex);
      return;
    }

    const group = line.group;
    if (group.kind === 'pleat') return;
    if (group.kind === kind) {
      // The same kind on a stale fold confirms it on today's pattern (a fresh fingerprint).
      if (group.stale && !(await writes.upsert(group.rows))) return;
      // A fold saved before folds linked by themselves stays flat on the print until it has a step.
      if (group.rows.every((row) => stepOfFold(foldStep.operations, row.foldKey) === null))
        linkToStep(group.rows, stepIndex);
      return;
    }
    const sameCount = (kind === 'double') === (group.kind === 'double');
    const saved = rowsOfChoice(
      geom,
      { line: group.line, side: group.side, kind, source: group.source },
      {
        seq: sameCount ? group.rows[0].seq : read.maxSeq + 1,
        grainDeg: deg,
        keys: sameCount ? group.rows.map((row) => row.foldKey) : undefined,
        anchoredSize: size,
      },
    );
    if (!saved?.length) return;
    if (sameCount) {
      if (await writes.upsert(saved)) {
        if (saved.every((row) => stepOfFold(foldStep.operations, row.foldKey) === null))
          linkToStep(saved, stepIndex);
      }
      return;
    }
    const oldKeys = group.rows.map((row) => row.foldKey);
    const oldStep = oldKeys
      .map((foldKey) => stepOfFold(foldStep.operations, foldKey))
      .find((step) => step !== null);
    if (!(await writes.remove(group.rows))) return;
    foldStep.assign(oldKeys, null);
    if (await writes.upsert(saved)) {
      if (oldStep !== undefined && oldStep !== null)
        foldStep.assign(
          saved.map((row) => row.foldKey),
          oldStep,
        );
      else linkToStep(saved, stepIndex);
    }
  };

  const swap = async (line: PickerLine) => {
    const group = line.group;
    if (!group || group.kind === 'pleat' || frozen) return;
    const saved = rowsOfChoice(
      geom,
      {
        line: group.line,
        side: group.side === 1 ? -1 : 1,
        kind: group.kind,
        source: group.source,
      },
      {
        seq: group.rows[0].seq,
        grainDeg: deg,
        keys: group.rows.map((row) => row.foldKey),
        anchoredSize: size,
      },
    );
    if (saved?.length) await writes.upsert(saved);
  };

  const remove = async (line: PickerLine) => {
    if (!line.group || frozen) return;
    const foldKeys = line.group.rows.map((row) => row.foldKey);
    if (!(await writes.remove(line.group.rows))) return;
    foldStep.assign(foldKeys, null);
  };

  const removeGroup = async (group: FoldGroup) => {
    if (frozen) return;
    const foldKeys = group.rows.map((row) => row.foldKey);
    if (!(await writes.remove(group.rows))) return;
    foldStep.assign(foldKeys, null);
  };

  const removeGroups = async (removed: readonly FoldGroup[]) => {
    const ownRows = [
      ...new Map(removed.flatMap((group) => group.rows).map((row) => [row.foldKey, row])).values(),
    ];
    if (!ownRows.length || frozen || !(await writes.remove(ownRows))) return;
    foldStep.assign(
      ownRows.map((row) => row.foldKey),
      null,
    );
  };

  const activePleat = (fan: PleatFan): FoldGroup | null => {
    const group = fan.lines[0].pleatGroup;
    return group?.complete && fan.lines.every((line) => line.pleatGroup === group) ? group : null;
  };

  const choosePleat = async (fan: PleatFan) => {
    if (frozen || choosing.current) return;
    choosing.current = true;
    try {
      const active = activePleat(fan);
      if (active) {
        setChosenPleat(active.rows[0]?.foldKey ?? null);
        if (active.stale && !(await writes.upsert(active.rows))) return;
        if (active.rows.every((row) => stepOfFold(foldStep.operations, row.foldKey) === null))
          linkToStep(active.rows, stepIndex);
        return;
      }
      const replacedGroups = [
        ...new Set(
          fan.lines.flatMap((line) =>
            line.group && line.group.kind !== 'pleat'
              ? [line.group]
              : line.pleatGroup
                ? [line.pleatGroup]
                : [],
          ),
        ),
      ];
      const replaced = replacedGroups.flatMap((group) => group.rows);
      const replacedKeys = new Set(replaced.map((row) => row.foldKey));
      const oldStep = replaced
        .map((row) => stepOfFold(foldStep.operations, row.foldKey))
        .find((step) => step !== null);
      const insertSeq = replaced.length
        ? Math.min(...replaced.map((row) => row.seq))
        : read.maxSeq + 1;
      const saved = rowsOfPleat(geom, fan, {
        seq: insertSeq,
        grainDeg: deg,
        anchoredSize: size,
      });
      if (!saved?.length) return;
      const shifted = replaced.length
        ? rows.flatMap((row) => {
            if (replacedKeys.has(row.foldKey) || row.seq < insertSeq) return [];
            const removedBefore = replaced.filter((old) => old.seq <= row.seq).length;
            const seq = row.seq + 3 - removedBefore;
            return seq === row.seq ? [] : [{ ...row, seq }];
          })
        : [];
      const shiftedByKey = new Map(shifted.map((row) => [row.foldKey, row]));
      const effectiveRows = [
        ...rows
          .filter((row) => !replacedKeys.has(row.foldKey))
          .map((row) => shiftedByKey.get(row.foldKey) ?? row),
        ...saved,
      ];
      if (replaced.length) {
        if (!(await writes.remove(replaced))) return;
        foldStep.assign(
          replaced.map((row) => row.foldKey),
          null,
        );
      }
      if (!(await writes.upsert([...saved, ...shifted]))) return;
      setChosenPleat(saved[0].foldKey);
      if (oldStep !== undefined && oldStep !== null)
        foldStep.assign(
          saved.map((row) => row.foldKey),
          oldStep,
        );
      else linkToStep(saved, stepIndex, effectiveRows);
    } finally {
      choosing.current = false;
    }
  };

  const choosePleatKind = async (group: FoldGroup, kind: PleatKind) => {
    if (frozen || choosing.current) return;
    setChosenPleat(group.rows[0]?.foldKey ?? null);
    if (group.pleatKind === kind) return;
    choosing.current = true;
    try {
      await writes.upsert(pleatDirectionRows(group, kind));
    } finally {
      choosing.current = false;
    }
  };

  const hoveredPleat = pleatFans
    .filter((fan) => fan.lines.some((line) => hovered.includes(line.id)))
    .map(activePleat)
    .find((group) => group);
  const sectionPleat =
    hoveredPleat ??
    groups.find((group) => group.complete && group.rows.some((row) => row.foldKey === chosenPleat));

  const liveSnap = drawing && live ? snapAt(live) : null;

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      className='@container pt-3 focus:outline-none'
      data-fold-picker={geom.name}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        if (drawing || pending) resetDrawing();
        else onClose();
      }}
    >
      <div className='flex min-w-0 flex-col items-start gap-4.5 @2xl:flex-row'>
        <div className='grid min-w-0 grid-cols-2 gap-2.5 w-full @2xl:w-1/2 @2xl:max-w-130 @2xl:shrink-0'>
          <div className='h-50 min-w-0 overflow-hidden border border-borderColor bg-bgColor @2xl:h-80'>
            <svg
              ref={svgRef}
              viewBox={`0 0 ${PICTURE_W} ${PICTURE_H}`}
              preserveAspectRatio='xMidYMid meet'
              role='img'
              aria-label={`${geom.name} fold lines`}
              className={cn(
                'block size-full select-none',
                drawing && 'cursor-crosshair touch-none',
              )}
              onClick={onCanvasClick}
              onPointerMove={onCanvasMove}
              onPointerLeave={() => setLive(null)}
            >
              <polygon
                points={ptsAttr(view, geom.rs)}
                fill={PAPER}
                stroke={INK}
                strokeWidth={2}
                strokeLinejoin='round'
              />
              {inner.map((polyline, index) => (
                <polyline
                  key={index}
                  points={ptsAttr(view, polyline)}
                  fill='none'
                  stroke={FAINT}
                  strokeWidth={1}
                  pointerEvents='none'
                />
              ))}
              {lines.map((line, index) => (
                <FoldLineSvg
                  key={line.id}
                  line={line}
                  number={index + 1}
                  hovered={hovered.includes(line.id)}
                  view={view}
                />
              ))}
              <PieceName piece={geom} view={view} />
              {drawing && (
                <g pointerEvents='none'>
                  {drawing.p1 && (
                    <>
                      <circle
                        cx={r1(view.toPx(drawing.p1)[0])}
                        cy={r1(view.toPx(drawing.p1)[1])}
                        r={4}
                        fill={PICK}
                      />
                      {(liveSnap || live) && (
                        <line
                          x1={r1(view.toPx(drawing.p1)[0])}
                          y1={r1(view.toPx(drawing.p1)[1])}
                          x2={r1((liveSnap?.px ?? live!)[0])}
                          y2={r1((liveSnap?.px ?? live!)[1])}
                          stroke={PICK}
                          strokeWidth={2}
                          strokeDasharray={liveSnap ? undefined : '4 4'}
                        />
                      )}
                    </>
                  )}
                  {liveSnap && (
                    <>
                      <circle
                        cx={r1(liveSnap.px[0])}
                        cy={r1(liveSnap.px[1])}
                        r={liveSnap.notch ? 7 : 5}
                        fill='none'
                        stroke={PICK}
                        strokeWidth={2}
                      />
                      {liveSnap.notch && (
                        <circle cx={r1(liveSnap.px[0])} cy={r1(liveSnap.px[1])} r={2} fill={PICK} />
                      )}
                    </>
                  )}
                </g>
              )}
            </svg>
          </div>
          <div className='h-50 min-w-0 overflow-hidden border border-borderColor bg-bgColor @2xl:h-80'>
            <svg
              viewBox={`0 0 ${PICTURE_W} ${PICTURE_H}`}
              preserveAspectRatio='xMidYMid meet'
              role='img'
              aria-label={`${geom.name} folded`}
              className='block size-full'
            >
              <HatchDef />
              <PliesSvg
                v={folded.view}
                piece={geom}
                plies={folded.shape.plies}
                pleats={folded.shape.pleats}
              />
              {folded.shape.creases.map((crease, index) => {
                const a = folded.view.toPx(crease[0]);
                const b = folded.view.toPx(crease[1]);
                return (
                  <line
                    key={index}
                    x1={r1(a[0])}
                    y1={r1(a[1])}
                    x2={r1(b[0])}
                    y2={r1(b[1])}
                    stroke={INK}
                    strokeWidth={2}
                    pointerEvents='none'
                  />
                );
              })}
              <PieceName
                piece={geom}
                view={folded.view}
                points={folded.shape.plies.flatMap((ply) => ply.poly)}
              />
            </svg>
          </div>
          {sectionPleat && (
            <div className='col-start-2 min-w-0' data-fold-pleat-section=''>
              <SectionSvg piece={geom} groups={[sectionPleat]} big />
            </div>
          )}
        </div>

        <div className='w-full min-w-0 flex-1'>
          <div className='divide-y divide-hairline'>
            {pleatFans.map((fan) => {
              const group = activePleat(fan);
              const partialGroups = [
                ...new Set(
                  fan.lines.flatMap((line) =>
                    line.pleatGroup && line.pleatGroup !== group ? [line.pleatGroup] : [],
                  ),
                ),
              ];
              const numbers = fan.lines
                .map((line) => lines.indexOf(line) + 1)
                .filter((number) => number > 0)
                .sort((a, b) => a - b);
              const ids = fan.lines.map((line) => line.id);
              return (
                <div
                  key={`pleat:${ids.join(':')}`}
                  className='group border-b border-textColor py-2 hover:bg-pageBg focus-within:bg-pageBg'
                  data-fold-pleat={numbers.join('-')}
                  onPointerEnter={() => setHovered(ids)}
                  onPointerLeave={() => setHovered([])}
                  onFocus={() => setHovered(ids)}
                  onBlur={() => setHovered([])}
                >
                  <div className='flex min-h-7 flex-wrap items-center gap-1.5'>
                    <span className='flex gap-0.5'>
                      {numbers.map((number) => (
                        <span
                          key={number}
                          className='grid size-4.5 place-items-center border border-textColor text-nano tabular-nums'
                        >
                          {number}
                        </span>
                      ))}
                    </span>
                    <Chip
                      selected={!!group}
                      pressed={!!group}
                      disabled={frozen}
                      onClick={() => void choosePleat(fan)}
                      className='gap-1.5 border-textColor px-2.5 py-1.5 active:translate-y-px'
                      data-fold-kind='pleat'
                    >
                      <PleatFanIcon />
                      pleat
                    </Chip>
                    {group &&
                      PLEAT_DIRECTIONS.map(({ kind, glyph, label }) => (
                        <Chip
                          key={kind}
                          selected={group.pleatKind === kind}
                          pressed={group.pleatKind === kind}
                          disabled={frozen}
                          aria-label={label}
                          onClick={() => void choosePleatKind(group, kind)}
                          className='border-textColor px-2.5 py-1.5 active:translate-y-px'
                          data-fold-pleat-dir={kind}
                        >
                          {glyph}
                        </Chip>
                      ))}
                    {(group || partialGroups.length > 0) && (
                      <Button
                        variant='underline'
                        size='xs'
                        disabled={frozen}
                        onClick={() =>
                          void (group ? removeGroup(group) : removeGroups(partialGroups))
                        }
                        className='ml-auto hover:text-textColor active:translate-y-px'
                        data-fold-remove=''
                      >
                        remove
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
            {brokenPleats.map((group) => {
              const numbers = group.flat
                .map((fold) =>
                  lines.findIndex(
                    (line) =>
                      line.pleatGroup === group &&
                      line.line[0] === fold.a &&
                      line.line[1] === fold.b,
                  ),
                )
                .map((index) => index + 1)
                .filter((number) => number > 0);
              const ids = lines.filter((line) => line.pleatGroup === group).map((line) => line.id);
              return (
                <div
                  key={`broken:${group.rows.map((row) => row.foldKey).join(':')}`}
                  className='group border-b border-textColor py-2 hover:bg-pageBg focus-within:bg-pageBg'
                  data-fold-pleat='broken'
                  onPointerEnter={() => setHovered(ids)}
                  onPointerLeave={() => setHovered([])}
                  onFocus={() => setHovered(ids)}
                  onBlur={() => setHovered([])}
                >
                  <div className='flex min-h-7 flex-wrap items-center gap-1.5'>
                    {numbers.map((number) => (
                      <span
                        key={number}
                        className='grid size-4.5 place-items-center border border-textColor text-nano tabular-nums'
                      >
                        {number}
                      </span>
                    ))}
                    <Chip
                      selected
                      pressed
                      disabled
                      className='gap-1.5 border-textColor px-2.5 py-1.5'
                    >
                      <PleatFanIcon />
                      pleat
                    </Chip>
                    <Button
                      variant='underline'
                      size='xs'
                      disabled={frozen}
                      onClick={() => void removeGroup(group)}
                      className='ml-auto hover:text-textColor active:translate-y-px'
                      data-fold-remove=''
                    >
                      remove
                    </Button>
                  </div>
                </div>
              );
            })}
            {lines.map((line, index) => {
              if (line.pleatGroup) return null;
              const kind = line.group?.kind ?? null;
              return (
                <div
                  key={line.id}
                  className='group py-2 hover:bg-pageBg'
                  data-fold-row={index + 1}
                  onPointerEnter={() => setHovered([line.id])}
                  onPointerLeave={() => setHovered([])}
                  onFocus={() => setHovered([line.id])}
                  onBlur={() => setHovered([])}
                >
                  <div className='flex min-h-7 flex-wrap items-center gap-1.5'>
                    <span className='grid size-4.5 place-items-center border border-textColor text-nano tabular-nums'>
                      {index + 1}
                    </span>
                    <ChipRow className='min-w-0 flex-1'>
                      {PICK_KINDS.map((pickKind) => (
                        <Chip
                          key={pickKind}
                          selected={kind === pickKind}
                          pressed={kind === pickKind}
                          disabled={frozen}
                          onClick={() => void choose(line, pickKind)}
                          className='active:translate-y-px'
                          data-fold-kind={pickKind}
                        >
                          {pickKind}
                        </Chip>
                      ))}
                    </ChipRow>
                    {line.group && (
                      <span className='pointer-events-none ml-auto flex basis-full justify-end gap-2 opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 sm:basis-auto [@media(pointer:coarse)]:pointer-events-auto [@media(pointer:coarse)]:opacity-100'>
                        <Button
                          variant='underline'
                          size='xs'
                          disabled={frozen}
                          onClick={() => void swap(line)}
                          className='hover:text-textColor active:translate-y-px'
                          data-fold-swap=''
                        >
                          swap
                        </Button>
                        <Button
                          variant='underline'
                          size='xs'
                          disabled={frozen}
                          onClick={() => void remove(line)}
                          className='hover:text-textColor active:translate-y-px'
                          data-fold-remove=''
                        >
                          remove
                        </Button>
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className='pt-2.5'>
            {drawing || pending ? (
              <Button
                variant='underline'
                size='xs'
                onClick={resetDrawing}
                className='hover:text-warning active:translate-y-px'
              >
                cancel
              </Button>
            ) : (
              <Button
                variant='underline'
                size='xs'
                disabled={frozen}
                onClick={() => setDrawing({ p1: null })}
                className='hover:text-textColor active:translate-y-px'
                data-fold-line=''
              >
                + line
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PleatFanIcon() {
  return (
    <svg
      width={14}
      height={14}
      viewBox='0 0 14 14'
      aria-hidden='true'
      className='shrink-0 fill-none stroke-current'
    >
      <path d='M7 13 2 1M7 13V1M7 13l5-12' strokeWidth={1.5} />
    </svg>
  );
}

function FoldLineSvg({
  line,
  number,
  hovered,
  view,
}: {
  line: PickerLine;
  number: number;
  hovered: boolean;
  view: ReturnType<typeof pieceView>;
}) {
  const a = view.toPx(line.line[0]);
  const b = view.toPx(line.line[1]);
  const end = a[1] <= b[1] ? a : b;
  const x = Math.max(10, Math.min(PICTURE_W - 10, end[0]));
  const y = Math.max(10, Math.min(PICTURE_H - 10, end[1] + 8));
  const solid = !!line.group || line.pending;
  const color = hovered || line.pending ? PICK : solid ? INK : GREY;
  return (
    <g pointerEvents='none'>
      <line
        x1={r1(a[0])}
        y1={r1(a[1])}
        x2={r1(b[0])}
        y2={r1(b[1])}
        stroke={color}
        strokeWidth={solid || hovered ? 2.5 : 1.25}
        strokeDasharray={solid ? undefined : '5 4'}
      />
      <rect x={r1(x - 8)} y={r1(y - 8)} width={16} height={16} fill={PAPER} stroke={INK} />
      <text
        x={r1(x)}
        y={r1(y)}
        textAnchor='middle'
        dominantBaseline='central'
        className='fill-textColor text-nano'
      >
        {number}
      </text>
    </g>
  );
}

function PieceName({
  piece,
  view,
  points = piece.rs,
}: {
  piece: PieceGeom;
  view: ReturnType<typeof pieceView>;
  points?: readonly Pt2[];
}) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of points.length ? points : piece.rs) {
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  const center = view.toPx([(x0 + x1) / 2, (y0 + y1) / 2]);
  return (
    <text
      x={r1(center[0])}
      y={r1(center[1])}
      textAnchor='middle'
      dominantBaseline='central'
      className='fill-labelColor text-nano uppercase'
      pointerEvents='none'
    >
      {piece.name}
    </text>
  );
}

function sortPickerLines(lines: PickerLine[]): PickerLine[] {
  const rank = ({ line }: PickerLine): [number, number, number] => {
    const dx = line[1][0] - line[0][0];
    const dy = line[1][1] - line[0][1];
    const vertical = Math.abs(dy) >= Math.abs(dx);
    const x = (line[0][0] + line[1][0]) / 2;
    const y = (line[0][1] + line[1][1]) / 2;
    return [vertical ? 0 : 1, vertical ? x : y, vertical ? y : x];
  };
  return [...lines].sort((a, b) => {
    const ar = rank(a);
    const br = rank(b);
    return ar[0] - br[0] || ar[1] - br[1] || ar[2] - br[2];
  });
}
