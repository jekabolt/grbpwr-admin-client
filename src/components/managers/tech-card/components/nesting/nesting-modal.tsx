// Раскладка (nesting) modal: DXF выкройки одного размера → детали → авто-раскладка на
// полосе ткани в web worker'е. Расчётный инструмент, который теперь умеет ПЕРСИСТИТЬ
// результат: «сохранить раскладку» пишет маркер (tech_card_marker) с самодостаточной
// геометрией, и костинг читает расход на единицу. `view` открывает сохранённый маркер без
// воркера и без DXF. Файл лениво импортируется из patterns-field, так что
// dxf-parser/clipper2-js/воркер живут только в чанке раскладки.
import { useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import type { common_TechCardMarker } from 'api/proto-http/admin';
import { techCardKeys } from 'components/managers/tech-cards/components/useTechCardQuery';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import CheckboxCommon from 'ui/components/checkbox';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Input from 'ui/components/input';
import { Pill } from 'ui/components/pill';
import Selector from 'ui/components/selector';
import { Stat, StatGrid } from 'ui/components/stat-grid';
import Text from 'ui/components/text';
import { parseDecimalNumber } from 'utils/decimal';
import type { NestConfig, NestResult, PieceDTO, Unit } from 'lib/nesting/types';
import { NEST_DEFAULTS } from 'lib/nesting/types';
import { renderLayoutDxf } from 'lib/nesting/render/dxf';
import { renderLayoutSvg } from 'lib/nesting/render/svg';
import { buildMarkerLayout, dec, exportFileName, markerToView, type MarkerBomLine } from './marker-io';
import { useNesting, type NestingFile } from './use-nesting';

type PieceSel = Record<number, { checked: boolean; qty: number }>;

function PieceThumb({ piece }: { piece: PieceDTO }) {
  const path = useMemo(() => {
    const s = 30 / Math.max(piece.bboxW, piece.bboxH, 1e-6);
    return piece.poly.map((p) => `${(p.x * s).toFixed(1)},${(30 - p.y * s).toFixed(1)}`).join(' ');
  }, [piece]);
  return (
    <svg viewBox='-1 -1 32 32' className='h-8 w-8 shrink-0 border border-borderColor bg-bgColor'>
      <polygon points={path} fill='none' stroke='currentColor' strokeWidth='1' />
    </svg>
  );
}

function numOr(v: string, fallback: number): number {
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) ? n : fallback;
}

export function NestingModal({
  files,
  sizeLabel,
  onClose,
  techCardId,
  sizeId,
  bomLines,
  view,
  canEdit = true,
  savedSizeIds,
  season,
  styleNumber,
}: {
  files: NestingFile[] | null; // null = closed (nest mode)
  sizeLabel?: string;
  onClose: () => void;
  // Server context for «сохранить раскладку». Absent = compute-only (the save button hides).
  techCardId?: number;
  sizeId?: number;
  // The card's fabric BOM lines (slot select of the save dialog).
  bomLines?: MarkerBomLine[];
  // A stored marker to DISPLAY: no worker, no DXF fetch — geometry comes from the blob.
  // Editing a stored layout is Ф5; this mode is view + export.
  view?: common_TechCardMarker | null;
  // Mirrors MarkersSection's delete gate: RBAC write + not released. Default true keeps
  // compute-only embeddings working.
  canEdit?: boolean;
  // The sizes the SERVER knows (a size added to the form but never saved cannot take a
  // marker — the backend validates against the stored range).
  savedSizeIds?: number[];
  // Filename context: осмысленные имена экспортов (SEASON-STYLE-размер-…).
  season?: string;
  styleNumber?: string;
}) {
  const { parse, run, start, stop, resetRun, unitOverride, setUnitOverride } = useNesting(files);
  const viewData = useMemo(() => (view ? markerToView(view) : null), [view]);

  const [widthCm, setWidthCm] = useState<number>(NEST_DEFAULTS.fabricWidthCm);
  // Raw keystrokes; the min-clamp lands on BLUR (clamping per keystroke makes 90 unreachable
  // — typing «9» snaps to 10).
  const [widthRaw, setWidthRaw] = useState<string | null>(null);
  const [targetCm, setTargetCm] = useState<number | ''>('');
  const [gapCm, setGapCm] = useState<number>(NEST_DEFAULTS.gapCm);
  const [marginCm, setMarginCm] = useState<number>(NEST_DEFAULTS.edgeMarginCm);
  const [crossGrain, setCrossGrain] = useState<boolean>(NEST_DEFAULTS.allowCrossGrain);
  const [budgetS, setBudgetS] = useState<number>(NEST_DEFAULTS.timeBudgetMs / 1000);
  const [sel, setSel] = useState<PieceSel>({});
  // Комплектов: every selected piece's qty is multiplied by this — «10 изделий» is one
  // field, not fifteen per-piece edits.
  const [setsN, setSetsN] = useState<number>(1);

  const pieces = parse.phase === 'ready' ? parse.pieces : [];
  const usable = widthCm - 2 * marginCm;

  // Cross-strip span in the allowed rotations; a piece that fits nowhere is auto-unchecked.
  const fitsWidth = useMemo(() => {
    const m = new Map<number, boolean>();
    for (const p of pieces) {
      const spans = crossGrain ? [p.bboxH, p.bboxW] : [p.bboxH];
      m.set(p.id, Math.min(...spans) <= usable + 1e-9);
    }
    return m;
  }, [pieces, usable, crossGrain]);

  // (Re)seed the selection whenever a parse lands.
  useEffect(() => {
    if (parse.phase !== 'ready') return;
    const next: PieceSel = {};
    for (const p of parse.pieces) next[p.id] = { checked: true, qty: 1 };
    setSel(next);
  }, [parse]);

  const running = run.phase === 'running';
  const stopping = running && run.stopping;
  const result: NestResult | null =
    run.phase === 'done' ? run.result : run.phase === 'running' ? run.best : null;

  // A result computed for other parameters is stale — drop it the moment they change
  // (inputs are disabled while running, so this can only fire against a done run).
  useEffect(() => {
    resetRun();
  }, [widthCm, gapCm, marginCm, crossGrain, sel, setsN, resetRun]);

  const target = targetCm === '' ? undefined : targetCm;

  // What the right pane shows: the live run in nest mode, the stored geometry in view mode.
  const displayPieces = viewData ? viewData.pieces : pieces;
  const displayResult = viewData ? viewData.result : result;
  const displayWidth = viewData ? viewData.widthCm : widthCm;
  const displayTarget = viewData ? viewData.targetCm : target;

  // Live preview renders simplified contours (every coalesced frame re-parses the SVG);
  // the finished layout renders exact — that's also what «скачать SVG» exports.
  const svg = useMemo(
    () =>
      displayResult
        ? renderLayoutSvg(
            displayResult,
            displayPieces,
            displayWidth,
            displayTarget,
            run.phase === 'running' ? 0.05 : 0,
          )
        : null,
    [displayResult, displayPieces, displayWidth, displayTarget, run.phase],
  );

  const checkedCount = pieces.filter((p) => sel[p.id]?.checked && fitsWidth.get(p.id)).length;
  // Total instances that will actually be nested: Σ qty × комплекты over the selection.
  const instanceCount = pieces
    .filter((p) => sel[p.id]?.checked && fitsWidth.get(p.id))
    .reduce((s, p) => s + Math.max(1, Math.round(sel[p.id]?.qty ?? 1)) * setsN, 0);

  // Source-file groups for the per-fabric one-click filter (each fabric is its own DXF).
  const sources = useMemo(() => {
    const m = new Map<string, PieceDTO[]>();
    for (const p of pieces) {
      if (!m.has(p.source)) m.set(p.source, []);
      m.get(p.source)!.push(p);
    }
    return [...m.entries()];
  }, [pieces]);

  const startRun = () => {
    if (parse.phase !== 'ready') return;
    const config: NestConfig = {
      pieces: pieces
        .filter((p) => sel[p.id]?.checked && fitsWidth.get(p.id))
        .map((p) => ({ pieceId: p.id, quantity: Math.max(1, Math.round(sel[p.id]?.qty ?? 1)) * setsN })),
      fabricWidthCm: widthCm,
      targetLengthCm: target,
      gapCm,
      edgeMarginCm: marginCm,
      allowCrossGrain: crossGrain,
      timeBudgetMs: budgetS * 1000,
      rdpEpsCm: NEST_DEFAULTS.rdpEpsCm,
    };
    start(parse.parseId, config);
  };

  const downloadTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (downloadTimer.current != null) window.clearTimeout(downloadTimer.current);
    },
    [],
  );
  // A degraded marker (unreadable blob → summary only) has no geometry to export: the
  // buttons would emit a STRIP-rectangle-only file that a plotter would happily cut.
  const viewDegraded =
    viewData != null &&
    (viewData.pieces.length === 0 || viewData.result.placements.length === 0);
  // Осмысленное имя файла: SEASON-STYLE-размер-ткань-маркер (пустые части опускаются).
  const fileParts = (): Array<string | undefined> => {
    if (viewData) {
      return [season, styleNumber, sizeLabel, view?.summary?.bomItemName, view?.summary?.name];
    }
    const fabric =
      slot?.name ||
      ((files ?? []).length === 1 ? (files ?? [])[0].name : undefined);
    return [season, styleNumber, sizeLabel, fabric];
  };
  const download = (content: string, mime: string, ext: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = exportFileName(fileParts(), ext);
    a.click();
    // Deferred: Safari/Firefox may not have started the download when click() returns.
    downloadTimer.current = window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };
  const downloadSvg = () => {
    if (svg && !viewDegraded) download(svg, 'image/svg+xml', 'svg');
  };
  // Plotter export: R12 DXF of the finished layout, true contours, cm.
  const dxfReady = (viewData != null && !viewDegraded) || run.phase === 'done';
  const downloadDxf = () => {
    if (!dxfReady || !displayResult) return;
    download(renderLayoutDxf(displayResult, displayPieces, displayWidth), 'application/dxf', 'dxf');
  };

  const verdict =
    displayResult && displayTarget != null
      ? displayResult.usedLengthCm <= displayTarget &&
        displayResult.placedCount === displayResult.totalCount
        ? { ok: true, text: `влезает · запас ${(displayTarget - displayResult.usedLengthCm).toFixed(1)} см` }
        : { ok: false, text: `не влезает · нужно ${displayResult.usedLengthCm.toFixed(1)} см` }
      : null;

  // ── «сохранить раскладку» (Ф4б) ────────────────────────────────────────────────────────
  const qc = useQueryClient();
  const { showMessage } = useSnackBarStore();
  const [saveOpen, setSaveOpen] = useState(false);
  const [markerName, setMarkerName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [slotKey, setSlotKey] = useState('');
  const [saving, setSaving] = useState(false);

  // A slot added in the UI but never saved (id 0) cannot be linked — the server resolves
  // bom_line_key against SAVED rows and would reject the whole marker after a paid nest.
  const fabricLines = (bomLines ?? []).filter((b) => b.id > 0);
  const unsavedSlots = (bomLines ?? []).length - fabricLines.length;
  const slot = fabricLines.find((b) => b.lineKey === slotKey);
  // The prefill follows the chosen slot until the operator edits the name by hand.
  const defaultName = `${sizeLabel ?? ''}${sizeLabel ? ' · ' : ''}${slot?.name?.trim() || `${widthCm} см`}`;
  const nameValue = nameTouched ? markerName : [...defaultName].slice(0, 191).join('');
  const slotWidth = slot ? parseDecimalNumber(slot.fabricWidth) : NaN;
  const widthMismatch = Number.isFinite(slotWidth) && slotWidth > 0 && Math.abs(slotWidth - widthCm) > 0.5;

  // A failed source fetch means the run nested a SUBSET: placed==total holds (the missing
  // pieces never parsed), but the marker would read as a clean complete norm. Block save.
  const fetchFailed =
    parse.phase === 'ready' && parse.warnings.some((w) => w.includes('не удалось скачать'));
  const sizeUnsaved = savedSizeIds != null && sizeId != null && !savedSizeIds.includes(sizeId);
  const canSave =
    !viewData &&
    canEdit &&
    !fetchFailed &&
    !sizeUnsaved &&
    run.phase === 'done' &&
    run.result.placedCount === run.result.totalCount &&
    run.result.placements.length > 0 &&
    !!techCardId &&
    !!sizeId;

  async function saveMarker() {
    if (!canSave || run.phase !== 'done' || parse.phase !== 'ready' || !techCardId || !sizeId) return;
    const name = nameValue.trim();
    if (!name) return;
    setSaving(true);
    try {
      const perSetQty = new Map<number, number>();
      for (const p of pieces) {
        const s = sel[p.id];
        if (s?.checked) perSetQty.set(p.id, Math.max(1, Math.round(s.qty)));
      }
      const urlBySource = new Map((files ?? []).map((f) => [f.name, f.url]));
      const layout = buildMarkerLayout({
        pieces,
        perSetQty,
        urlBySource,
        result: run.result,
        unit: unitOverride === 'auto' ? parse.detectedUnit : unitOverride,
        config: { targetLengthCm: target, rdpEpsCm: NEST_DEFAULTS.rdpEpsCm, timeBudgetMs: budgetS * 1000 },
        tol: NEST_DEFAULTS.tol,
        tolChain: NEST_DEFAULTS.tolChain,
        parseWarnings: parse.warnings,
      });
      await adminService.SaveTechCardMarker({
        id: 0,
        techCardId,
        marker: {
          sizeId,
          name,
          source: 'auto',
          bomLineKey: slotKey,
          fabricWidthCm: dec(widthCm),
          gapCm: dec(gapCm),
          edgeMarginCm: dec(marginCm),
          allowCrossGrain: crossGrain,
          sets: setsN,
          usedLengthCm: dec(run.result.usedLengthCm),
          efficiencyPct: dec(run.result.efficiency * 100),
          placedCount: run.result.placedCount,
          totalCount: run.result.totalCount,
          layout,
        },
      });
      showMessage('маркер сохранён — расход виден в костинге', 'success');
      qc.invalidateQueries({ queryKey: techCardKeys.detail(techCardId) });
      // marker_count rides the list rows too.
      qc.invalidateQueries({ queryKey: techCardKeys.lists() });
      setSaveOpen(false);
      setNameTouched(false);
      setMarkerName('');
      setSlotKey('');
    } catch (e) {
      showMessage(e instanceof Error && e.message ? e.message : 'не удалось сохранить маркер', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ConfirmationModal
      open={files != null || view != null}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      onConfirm={onClose}
      title={
        viewData
          ? `маркер — ${view?.summary?.name ?? ''}`
          : `раскладка DXF${sizeLabel ? ` — ${sizeLabel}` : ''}`
      }
      width='lg'
      hideActions
    >
      <div className='flex flex-col gap-2.5 lg:flex-row'>
        {/* Left rail: material + run parameters, then the recognized piece list.
            A stored marker has nothing to configure — the rail collapses to its piece list. */}
        <div className={viewData ? 'hidden' : 'w-full shrink-0 space-y-2.5 lg:w-[300px]'}>
          <div className='grid grid-cols-2 gap-1.5'>
            <label className='space-y-0.5'>
              <Text size='nano' variant='label' component='span'>
                ширина полотна, см
              </Text>
              <Input
                name='nest-width'
                type='number'
                value={widthRaw ?? String(widthCm)}
                min={10}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setWidthRaw(e.target.value)}
                onBlur={() => {
                  setWidthCm(Math.max(10, numOr(widthRaw ?? '', widthCm)));
                  setWidthRaw(null);
                }}
                disabled={running}
              />
            </label>
            <label className='space-y-0.5'>
              <Text size='nano' variant='label' component='span'>
                целевая длина, см
              </Text>
              <Input
                name='nest-target'
                type='number'
                value={targetCm}
                placeholder='без цели'
                min={0}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  const v = e.target.value.trim();
                  setTargetCm(v === '' ? '' : Math.max(0, numOr(v, 0)));
                }}
                disabled={running}
              />
            </label>
            <label className='space-y-0.5'>
              <Text size='nano' variant='label' component='span'>
                зазор, см
              </Text>
              <Input
                name='nest-gap'
                type='number'
                value={gapCm}
                min={0}
                step={0.1}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setGapCm(Math.max(0, numOr(e.target.value, gapCm)))
                }
                disabled={running}
              />
            </label>
            <label className='space-y-0.5'>
              <Text size='nano' variant='label' component='span'>
                отступ от кромки, см
              </Text>
              <Input
                name='nest-margin'
                type='number'
                value={marginCm}
                min={0}
                step={0.5}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setMarginCm(Math.max(0, numOr(e.target.value, marginCm)))
                }
                disabled={running}
              />
            </label>
            <label className='space-y-0.5'>
              <Text size='nano' variant='label' component='span'>
                комплектов, шт
              </Text>
              <Input
                name='nest-sets'
                type='number'
                value={setsN}
                min={1}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setSetsN(Math.max(1, Math.round(numOr(e.target.value, setsN))))
                }
                disabled={running}
              />
            </label>
          </div>

          <div className='flex flex-wrap items-center gap-x-3 gap-y-1.5'>
            <label className='flex cursor-pointer items-center gap-1.5'>
              <CheckboxCommon
                name='nest-crossgrain'
                checked={crossGrain}
                onChange={(c: boolean) => setCrossGrain(c)}
                disabled={running}
              />
              <Text size='micro' component='span'>
                разрешить поворот 90°
              </Text>
            </label>
            <Selector
              label='время'
              compact
              value={budgetS}
              options={[
                { value: 5, label: '5 с' },
                { value: 20, label: '20 с' },
                { value: 60, label: '60 с' },
              ]}
              onChange={(v: string | number) => setBudgetS(Number(v))}
              disabled={running}
            />
            <Selector
              label='юниты DXF'
              compact
              value={unitOverride}
              options={[
                {
                  value: 'auto',
                  // The detected unit stays visible even on 'авто' — a file whose header
                  // lies about units is caught by the operator seeing «авто (см)» on a
                  // sleeve that should be in mm.
                  label:
                    parse.phase === 'ready'
                      ? `авто (${parse.detectedUnit === 'mm' ? 'мм' : parse.detectedUnit === 'cm' ? 'см' : 'дюймы'})`
                      : 'авто',
                },
                { value: 'mm', label: 'мм' },
                { value: 'cm', label: 'см' },
                { value: 'in', label: 'дюймы' },
              ]}
              onChange={(v: string | number) => setUnitOverride(String(v) as Unit)}
              disabled={running || parse.phase === 'loading'}
            />
          </div>

          {parse.phase === 'ready' && unitOverride !== 'auto' && unitOverride !== parse.detectedUnit && (
            <Text size='nano' variant='label'>
              файл заявляет {parse.detectedUnit === 'mm' ? 'мм' : parse.detectedUnit === 'cm' ? 'см' : 'дюймы'} — выбран ручной override
            </Text>
          )}

          {parse.phase === 'loading' && (
            <Text size='micro' variant='label'>
              загрузка и разбор DXF…
            </Text>
          )}
          {parse.phase === 'error' && <CalloutBox tone='error'>{parse.message}</CalloutBox>}
          {parse.phase === 'ready' && parse.warnings.length > 0 && (
            <CalloutBox tone='note' className='max-h-24 space-y-0.5 overflow-y-auto'>
              {parse.warnings.map((w, i) => (
                <Text key={i} size='nano' component='p'>
                  {w}
                </Text>
              ))}
            </CalloutBox>
          )}

          {/* One chip per source DXF: each fabric is its own file, so «выбрать одну ткань»
              must be one click, not fifteen. Indeterminate = partially selected. */}
          {sources.length > 1 && (
            <div className='space-y-1'>
              {sources.map(([source, ps]) => {
                const fitting = ps.filter((p) => fitsWidth.get(p.id));
                const checkedN = fitting.filter((p) => sel[p.id]?.checked).length;
                const state: boolean | 'indeterminate' =
                  fitting.length > 0 && checkedN === fitting.length
                    ? true
                    : checkedN > 0
                      ? 'indeterminate'
                      : false;
                return (
                  <label key={source} className='flex cursor-pointer items-center gap-1.5'>
                    <CheckboxCommon
                      name={`nest-src-${source}`}
                      checked={state}
                      disabled={running || fitting.length === 0}
                      className='[&>span[data-state=indeterminate]]:opacity-40'
                      onChange={(c: boolean) =>
                        setSel((m) => {
                          const next = { ...m };
                          for (const p of fitting) {
                            next[p.id] = { checked: c, qty: m[p.id]?.qty ?? 1 };
                          }
                          return next;
                        })
                      }
                    />
                    <Text size='micro' component='span' className='min-w-0 flex-1 truncate'>
                      файл: {source}
                    </Text>
                    <Text size='nano' variant='label' component='span' className='shrink-0'>
                      {checkedN}/{ps.length} дет.
                    </Text>
                  </label>
                );
              })}
            </div>
          )}

          {/* Piece list: checkbox · thumb · name · размеры · qty. */}
          {pieces.length > 0 && (
            <div className='max-h-[46vh] space-y-1 overflow-y-auto border border-borderColor p-1.5'>
              <div className='flex items-center justify-between'>
                <Text size='nano' variant='label'>
                  детали: {pieces.length} · выбрано {checkedCount}
                  {setsN > 1 || instanceCount !== checkedCount
                    ? ` · к раскладке: ${instanceCount}`
                    : ''}
                </Text>
                <button
                  type='button'
                  className='text-nano uppercase underline hover:opacity-70'
                  onClick={() => {
                    const next: PieceSel = {};
                    for (const p of pieces) {
                      next[p.id] = { checked: !!fitsWidth.get(p.id), qty: sel[p.id]?.qty ?? 1 };
                    }
                    setSel(next);
                  }}
                >
                  выбрать все
                </button>
              </div>
              {pieces.map((p) => {
                const fits = fitsWidth.get(p.id) ?? false;
                const s = sel[p.id] ?? { checked: false, qty: 1 };
                return (
                  <div key={p.id} className='flex items-center gap-1.5'>
                    <CheckboxCommon
                      name={`nest-piece-${p.id}`}
                      checked={s.checked && fits}
                      disabled={!fits || running}
                      onChange={(c: boolean) => setSel((m) => ({ ...m, [p.id]: { ...s, checked: c } }))}
                    />
                    <PieceThumb piece={p} />
                    <div className='min-w-0 flex-1'>
                      <Text size='micro' component='p' className='truncate'>
                        {p.name}
                      </Text>
                      <Text size='nano' variant='label' component='p'>
                        {p.bboxW.toFixed(1)} × {p.bboxH.toFixed(1)} см
                      </Text>
                    </div>
                    {!fits && <Pill tone='warn'>шире полотна</Pill>}
                    <Input
                      name={`nest-qty-${p.id}`}
                      type='number'
                      value={s.qty}
                      min={1}
                      disabled={!fits || running}
                      className='w-12 shrink-0 px-1 py-0 text-micro'
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setSel((m) => ({ ...m, [p.id]: { ...s, qty: Math.max(1, Math.round(numOr(e.target.value, 1))) } }))
                      }
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right pane: the strip to scale + stats. */}
        <div className='min-w-0 flex-1 space-y-2'>
          {svg ? (
            <div
              className='max-h-[56vh] w-full overflow-auto border border-borderColor bg-bgColor [&_svg]:h-auto [&_svg]:w-full'
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          ) : (
            <div className='flex h-[40vh] items-center justify-center border border-borderColor bg-bgColor'>
              <Text size='micro' variant='label'>
                {running
                  ? 'считаем раскладку…'
                  : pieces.length > 0
                    ? 'выберите детали и нажмите «запустить»'
                    : '—'}
              </Text>
            </div>
          )}

          {displayResult && (
            <StatGrid min={120}>
              <Stat label='использовано' value={`${displayResult.usedLengthCm.toFixed(1)} см`} />
              <Stat
                label='эффективность'
                value={`${(displayResult.efficiency * 100).toFixed(1)} %`}
                sub={`ткань ${displayWidth} см`}
              />
              <Stat
                label='размещено'
                value={`${displayResult.placedCount}/${displayResult.totalCount}`}
                tone={displayResult.placedCount === displayResult.totalCount ? undefined : 'down'}
              />
              {viewData && view?.summary && (
                <Stat
                  label='расход / ед'
                  value={`${(displayResult.usedLengthCm / Math.max(1, view.summary.sets ?? 1)).toFixed(1)} см`}
                  sub={`комплектов: ${view.summary.sets ?? 1}`}
                />
              )}
              {verdict && (
                <Stat
                  label='вердикт'
                  value={<Pill tone={verdict.ok ? 'ok' : 'warn'}>{verdict.ok ? 'влезает' : 'не влезает'}</Pill>}
                  sub={verdict.text}
                />
              )}
              {!viewData && (
                <Stat
                  label='поколение'
                  value={String(displayResult.generation)}
                  sub={`${(displayResult.elapsedMs / 1000).toFixed(1)} с${run.phase === 'done' && run.stopped ? ' · остановлено' : ''}`}
                />
              )}
            </StatGrid>
          )}
          {displayResult && displayResult.warnings.length > 0 && (
            <CalloutBox tone='note'>
              {displayResult.warnings.map((w, i) => (
                <Text key={i} size='nano' component='p'>
                  {w}
                </Text>
              ))}
            </CalloutBox>
          )}

          {/* Footer: own actions (the shell's are hidden). */}
          <div className='flex flex-wrap items-center justify-end gap-1.5 border-t border-hairline pt-2'>
            {running && run.nfp && (
              <Text size='nano' variant='label' className='mr-auto'>
                подготовка геометрии {run.nfp.done}/{run.nfp.total}
              </Text>
            )}
            {running && !run.nfp && run.best && (
              <Text size='nano' variant='label' className='mr-auto'>
                поколение {run.generation} · лучшая длина {run.best.usedLengthCm.toFixed(1)} см
              </Text>
            )}
            {!viewData && (
              <>
                <Button
                  type='button'
                  variant='main'
                  disabled={parse.phase !== 'ready' || checkedCount === 0 || running}
                  onClick={startRun}
                >
                  запустить
                </Button>
                <Button type='button' variant='secondary' disabled={!running || stopping} onClick={stop}>
                  {stopping ? 'останавливаем…' : 'стоп'}
                </Button>
                <Button
                  type='button'
                  variant='secondary'
                  disabled={!canSave}
                  title={
                    canSave
                      ? 'сохранить маркер в тех-карту — расход уйдёт в костинг'
                      : !canEdit
                        ? 'нет прав на изменение карточки, либо она released'
                        : fetchFailed
                          ? 'часть DXF не скачалась — раскладка неполная, такой маркер занизил бы расход'
                          : sizeUnsaved
                            ? 'размер добавлен, но карточка не сохранена — сначала сохраните карточку'
                            : 'сохранить можно завершённую раскладку, в которую поместились все детали'
                  }
                  onClick={() => setSaveOpen(true)}
                >
                  сохранить раскладку
                </Button>
              </>
            )}
            <Button
              type='button'
              variant='secondary'
              disabled={!svg || running || viewDegraded}
              title={viewDegraded ? 'геометрия маркера нечитаема — доступна только сводка' : undefined}
              onClick={downloadSvg}
            >
              скачать SVG
            </Button>
            <Button
              type='button'
              variant='secondary'
              disabled={!dxfReady}
              title={
                viewDegraded
                  ? 'геометрия маркера нечитаема — доступна только сводка'
                  : 'DXF R12 для реза — контуры на слое CUT, кромка STRIP, подписи LABELS'
              }
              onClick={downloadDxf}
            >
              скачать DXF
            </Button>
            <Button type='button' variant='secondary' onClick={onClose}>
              закрыть
            </Button>
          </div>
        </div>
      </div>

      {/* Save dialog: name + BOM fabric slot. Nested Radix dialogs portal independently. */}
      <ConfirmationModal
        open={saveOpen}
        onOpenChange={(o) => {
          if (!o && !saving) setSaveOpen(false);
        }}
        onConfirm={saveMarker}
        onCancel={() => {
          if (!saving) setSaveOpen(false);
        }}
        title='сохранить раскладку как маркер'
        confirmLabel={saving ? 'сохраняем…' : 'сохранить'}
        confirmDisabled={saving || !nameValue.trim()}
        closeOnConfirm={false}
      >
        <div className='space-y-2'>
          <label className='block space-y-0.5'>
            <Text size='nano' variant='label' component='span'>
              название маркера
            </Text>
            <Input
              name='marker-name'
              value={nameValue}
              maxLength={191}
              autoComplete='off'
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                setNameTouched(true);
                setMarkerName(e.target.value);
              }}
            />
          </label>
          <label className='block space-y-0.5'>
            <Text size='nano' variant='label' component='span'>
              слот BOM (ткань) — куда пойдёт расход
            </Text>
            <Selector
              label=''
              value={slotKey}
              options={[
                { value: '', label: 'не привязывать' },
                ...fabricLines.map((b) => ({
                  value: b.lineKey,
                  label: `${b.name || 'без названия'}${b.unit ? ` · ${b.unit}` : ''}`,
                })),
              ]}
              onChange={(v: string | number) => setSlotKey(String(v))}
            />
          </label>
          {unsavedSlots > 0 && (
            <Text size='nano' variant='label' component='p'>
              новые слоты BOM появятся здесь после сохранения карточки
            </Text>
          )}
          {widthMismatch && (
            <CalloutBox tone='warning'>
              ширина полотна раскладки ({widthCm} см) отличается от ширины артикула слота (
              {slotWidth} см) — расход будет применим только к этой ширине
            </CalloutBox>
          )}
          {parse.phase === 'ready' && parse.warnings.length > 0 && (
            <CalloutBox tone='note' className='max-h-20 space-y-0.5 overflow-y-auto'>
              <Text size='nano' component='p'>
                предупреждения парсинга сохранятся вместе с маркером:
              </Text>
              {parse.warnings.map((w, i) => (
                <Text key={i} size='nano' component='p'>
                  {w}
                </Text>
              ))}
            </CalloutBox>
          )}
          <Text size='nano' variant='label' component='p'>
            комплектов: {setsN} · расход на единицу:{' '}
            {run.phase === 'done' ? (run.result.usedLengthCm / Math.max(1, setsN)).toFixed(1) : '—'} см
          </Text>
        </div>
      </ConfirmationModal>
    </ConfirmationModal>
  );
}
