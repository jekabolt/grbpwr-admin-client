import { useSizeOrdering } from 'components/managers/model/components/use-size-systems';
import { useProductionRuns } from 'components/managers/production-runs/components/useProductionRuns';
import { notify } from 'lib/stores/store';
import { useEffect, useMemo, useState, type ChangeEvent, type JSX } from 'react';
import {
  Button,
  CheckboxCommon,
  ConfirmationModal,
  DataTable,
  EmptyCell,
  HeaderWarnings,
  Input,
  Placeholder,
  Row,
  Select,
  Text,
  TotalRow,
  ViewSwitch,
} from 'ui';
import type { ArtworkCellRef } from '../components/composition-label/composition-artwork';
import {
  ownFileFor,
  type ArtworkChoice,
} from '../components/composition-label/composition-artwork-model';
import { useShaper } from '../components/composition-label/use-composition-label';
import type { ArtworkFile } from '../components/sewn-label-model';
import { adaptRuns, type CareLabelData } from './adapter';
import { isBlocking } from './holes';
import type { LabelOrientation } from './layout';
import type { ManifestColorway } from './manifest';
import { loadOwnFiles, planOwnFiles } from './own-files';
import { planPrint } from './pages';
import { printGate, printSource, runCaption, type PrintReason } from './print-gate';
import { buildPrintJob, compositionsOf, planAll } from './print-job';
import { computeQuantities, emptyGrid, fromRun, toQty, type QtyGrid } from './quantities';
import { collectReadiness } from './readiness';
import { clampOverage, effectiveQrTemplate, useCareLabelPrefs } from './use-care-label-prefs';

const MANUAL = 'manual';
const ALL_FILE: ArtworkCellRef = { colorwayId: 0, sizeId: 0 };

const FIX_LABEL: Record<PrintReason, string> = {
  'no file': 'Choose file',
  'no text': 'Fix text',
  'no data': 'Reload',
  'no fonts': 'Reload',
};

type PrintCompositionModalProps = {
  techCardId: number;
  data: CareLabelData | null;
  files: readonly ArtworkFile[];
  choice: ArtworkChoice;
  orientation: LabelOrientation;
  onTotalChange: (total: number) => void;
  onClose: () => void;
  onChooseFile: (cell: ArtworkCellRef) => void;
  onFixText: () => void;
};

export function PrintCompositionModal({
  techCardId,
  data,
  files,
  choice,
  orientation,
  onTotalChange,
  onClose,
  onChooseFile,
  onFixText,
}: PrintCompositionModalProps): JSX.Element {
  const { shaper, failed } = useShaper();
  const { prefs, update } = useCareLabelPrefs(techCardId);
  const runsQuery = useProductionRuns(techCardId, '', 0, false, true);
  const runs = useMemo(() => adaptRuns(runsQuery.data?.runs ?? []), [runsQuery.data]);
  const orderSizes = useSizeOrdering();

  const colorways = useMemo(() => data?.colorways ?? [], [data]);
  const sizes = useMemo(() => {
    const all = data?.sizes ?? [];
    return orderSizes(all.map((size) => size.id)).map((id) => all.find((size) => size.id === id)!);
  }, [data, orderSizes]);
  const colorwayIds = useMemo(() => colorways.map((colorway) => colorway.id), [colorways]);
  const sizeIds = useMemo(() => sizes.map((size) => size.id), [sizes]);

  const compositions = useMemo(() => (data ? compositionsOf(data) : null), [data]);
  const plan = useMemo(
    () =>
      shaper && data && compositions
        ? planAll(shaper, data, compositions, prefs.mode, data.label.qr, orientation)
        : null,
    [shaper, data, compositions, prefs.mode, orientation],
  );
  const wholeCard = useMemo(
    () =>
      data
        ? collectReadiness({
            data,
            excluded: [],
            prefs: data.label.qr,
            layoutHoles: plan?.layoutHoles,
            fontsFailed: failed,
          })
        : null,
    [data, plan, failed],
  );
  const gate = useMemo(
    () =>
      wholeCard
        ? printGate({ choice, files, readiness: wholeCard, colorwayIds, sizeIds })
        : { reason: null, blocked: new Set<number>() },
    [choice, files, wholeCard, colorwayIds, sizeIds],
  );

  const [manualOn, setManualOn] = useState(false);
  const [manual, setManual] = useState<QtyGrid>({});
  const [unticked, setUnticked] = useState<ReadonlySet<number>>(new Set());
  const [building, setBuilding] = useState(false);
  const [saved, setSaved] = useState('');
  const excluded = useMemo(
    () => colorwayIds.filter((id) => unticked.has(id) || gate.blocked.has(id)),
    [colorwayIds, unticked, gate.blocked],
  );
  const source = printSource(prefs.source, runs, manualOn);
  const run = source === MANUAL ? null : source;
  const base = useMemo<QtyGrid>(() => {
    if (run) return fromRun(run, colorwayIds, sizeIds);
    return source === MANUAL ? manual : emptyGrid(colorwayIds, sizeIds);
  }, [run, source, manual, colorwayIds, sizeIds]);
  const quantities = useMemo(
    () =>
      computeQuantities({
        base,
        colorways: colorways.map((entry) => ({
          id: entry.id,
          label: entry.baseSku || entry.colourName,
        })),
        sizeIds,
        overagePct: prefs.overagePct,
        mode: prefs.mode,
        excluded,
        run,
        plans: plan?.sets ?? null,
      }),
    [base, colorways, sizeIds, prefs.overagePct, prefs.mode, excluded, run, plan?.sets],
  );
  const sheetTotal = Object.values(quantities.rowTotals).reduce((sum, value) => sum + value, 0);
  const outputTotal = quantities.labelsA + (quantities.labelsB ?? 0);
  useEffect(() => onTotalChange(outputTotal), [onTotalChange, outputTotal]);

  const isOff = (id: number) => excluded.includes(id);

  const setCell = (colorwayId: number, cellSizeId: number, value: string) =>
    setManual((grid) => ({
      ...grid,
      [colorwayId]: {
        ...(grid[colorwayId] ?? {}),
        [cellSizeId]: toQty(value),
      },
    }));

  const fix = () => {
    // «Нет файла» бывает только у одного файла на всё (print-gate): дверь ведёт к нему.
    if (gate.reason === 'no file') onChooseFile(ALL_FILE);
    else if (gate.reason === 'no text') onFixText();
    else window.location.reload();
  };

  const download = async (): Promise<void> => {
    if (!data || !shaper || !compositions || building) return;
    setBuilding(true);
    try {
      const copies = (colorwayId: number, cellSizeId: number) =>
        ownFileFor(files, colorwayId, cellSizeId)
          ? 0
          : quantities.cells[colorwayId]?.[cellSizeId] ?? 0;
      const generated = colorwayIds.filter((id) =>
        sizeIds.some((idSize) => copies(id, idSize) > 0),
      );
      const set = planPrint(
        shaper,
        buildPrintJob({
          data,
          compositions,
          mode: prefs.mode,
          orientation,
          qr: data.label.qr,
          colorwayIds: generated,
          copies,
        }),
      );
      const block = set.holes.find(isBlocking);
      if (block) throw new Error(block.message);
      const planned = planOwnFiles({ files, data, cells: quantities.cells });
      if (set.files.length === 0 && planned.length === 0) throw new Error('empty export');

      const ownOnly = new Set(colorwayIds.filter((id) => !generated.includes(id) && !isOff(id)));
      const final = collectReadiness({
        data,
        excluded: [...excluded, ...ownOnly],
        prefs: data.label.qr,
        layoutHoles: plan?.layoutHoles,
        quantityHoles: quantities.holes.filter((hole) => hole.code !== 'nothing-to-export'),
        zeroColorways: quantities.zeroColorways,
        fontsFailed: failed,
      });
      const warnings = [...final.warnings, ...set.holes.filter((hole) => hole.level === 'warn')]
        .filter((hole) => !(hole.ref.colorwayId !== undefined && ownOnly.has(hole.ref.colorwayId)))
        .filter(
          (hole, index, all) =>
            all.findIndex((candidate) => candidate.message === hole.message) === index,
        );
      const manifestColorways = new Map<number, ManifestColorway>(
        colorways.map((entry) => [entry.id, { baseSku: entry.baseSku, colour: entry.colourName }]),
      );
      const [own, { buildCareLabelZip, saveBlob }] = await Promise.all([
        loadOwnFiles(planned),
        import('./zip'),
      ]);
      const zip = await buildCareLabelZip({
        shaper,
        set,
        style: data.styleNumber,
        styleName: data.styleName,
        colorways: manifestColorways,
        qrTemplate: effectiveQrTemplate(data.label.qr),
        adminUrl: `${window.location.origin}/tech-cards/${techCardId}`,
        warnings,
        own,
      });
      saveBlob(zip.bytes, zip.name);
      setSaved(zip.name);
    } catch (error) {
      notify({
        sev: 'error',
        subject: 'CARE LABELS',
        text: 'download failed',
        detail: error instanceof Error ? error.message : String(error),
        action: { label: 'retry', onClick: () => void download() },
      });
    } finally {
      setBuilding(false);
    }
  };

  return (
    <ConfirmationModal
      open
      width='lg'
      title='Print labels'
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      onConfirm={() => undefined}
      hideActions
      footerHint={saved || undefined}
      headerActions={
        gate.reason ? (
          <HeaderWarnings
            countOnly
            items={[
              {
                text: gate.reason,
                error: true,
                action: { label: FIX_LABEL[gate.reason], onClick: fix },
              },
            ]}
          />
        ) : null
      }
      footerActions={
        <>
          <Button type='button' variant='secondary' size='sm' className='h-7' onClick={onClose}>
            Cancel
          </Button>
          <Button
            type='button'
            variant='main'
            size='sm'
            className='h-7'
            loading={building}
            disabled={sheetTotal === 0 || !shaper}
            onClick={() => void download()}
          >
            {outputTotal > 0 ? `Download · ${outputTotal}` : 'Download'}
          </Button>
        </>
      }
    >
      <div className='min-w-0' data-print-composition=''>
        <Row
          label={
            <Text size='control' variant='label' tracking='label' className='uppercase'>
              Quantities
            </Text>
          }
          value={
            <Select
              name='print-quantities'
              className='h-7 min-w-44'
              value={run ? String(run.id) : MANUAL}
              items={[
                ...runs.map((entry) => ({ value: String(entry.id), label: runCaption(entry) })),
                { value: MANUAL, label: 'Manual' },
              ]}
              onValueChange={(value: string) => {
                setManualOn(value === MANUAL);
                if (value !== MANUAL) update({ source: { runId: Number(value) } });
              }}
            />
          }
          className='min-h-11 flex-col items-stretch py-2 sm:flex-row sm:items-center [&>span:last-child]:shrink'
        />
        <Row
          label={
            <Text size='control' variant='label' tracking='label' className='uppercase'>
              Print
            </Text>
          }
          value={
            <ViewSwitch
              value={prefs.mode}
              label='Print'
              className='[&_[role=radio]]:h-7'
              options={[
                { value: 'duplex', label: 'Duplex' },
                { value: 'simplex', label: 'Simplex' },
              ]}
              onChange={(mode) => update({ mode })}
            />
          }
          className='min-h-11 items-center py-2'
        />

        {data ? (
          <DataTable variant='grid' className='[&_td]:align-middle'>
            <thead>
              <tr>
                <th data-align='left'>Colour</th>
                {sizes.map((entry) => (
                  <th key={entry.id}>{entry.label}</th>
                ))}
                <th>Qty</th>
              </tr>
            </thead>
            <tbody>
              {colorways.map((entry) => {
                const off = isOff(entry.id);
                const blocked = gate.blocked.has(entry.id);
                return (
                  <tr key={entry.id} data-print-row={entry.id}>
                    <td data-align='left'>
                      <label className='flex min-h-7 items-center gap-1.5'>
                        <CheckboxCommon
                          name={`print-colour-${entry.id}`}
                          checked={!off}
                          disabled={blocked}
                          className='h-7 w-7'
                          aria-label={entry.colourName || entry.baseSku}
                          onChange={(checked: boolean) =>
                            setUnticked((current) => {
                              const next = new Set(current);
                              if (checked) next.delete(entry.id);
                              else next.add(entry.id);
                              return next;
                            })
                          }
                        />
                        <span className='whitespace-nowrap'>
                          {entry.colourName || entry.baseSku}
                        </span>
                      </label>
                    </td>
                    {sizes.map((entrySize) => (
                      <td key={entrySize.id} data-print-cell={`${entry.id}:${entrySize.id}`}>
                        {off ? (
                          <EmptyCell />
                        ) : run ? (
                          toQty(base[entry.id]?.[entrySize.id])
                        ) : (
                          <Input
                            name={`print-qty-${entry.id}-${entrySize.id}`}
                            type='number'
                            min={0}
                            className='ml-auto h-7 w-14 text-right'
                            aria-label={`${entry.colourName} ${entrySize.label}`}
                            placeholder='0'
                            value={toQty(base[entry.id]?.[entrySize.id]) || ''}
                            onChange={(event: ChangeEvent<HTMLInputElement>) =>
                              setCell(entry.id, entrySize.id, event.target.value)
                            }
                          />
                        )}
                      </td>
                    ))}
                    <td>{off ? <EmptyCell /> : quantities.rowTotals[entry.id]}</td>
                  </tr>
                );
              })}
              <TotalRow>
                <td data-align='left'>Total</td>
                {sizes.map((entry) => (
                  <td key={entry.id}>{quantities.colTotals[entry.id]}</td>
                ))}
                <td>{sheetTotal}</td>
              </TotalRow>
            </tbody>
          </DataTable>
        ) : (
          <Placeholder label='Loading' className='h-36 w-full' />
        )}

        <Row
          label={
            <Text size='control' variant='label' tracking='label' className='uppercase'>
              Extra
            </Text>
          }
          value={
            <span className='flex items-center gap-1.5'>
              <Input
                name='print-extra'
                type='number'
                min={0}
                max={100}
                className='h-7 w-16 text-right'
                value={prefs.overagePct}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  update({ overagePct: clampOverage(Number(event.target.value)) })
                }
              />
              <Text component='span' size='micro' variant='label'>
                %
              </Text>
            </span>
          }
          className='min-h-11 items-center py-2'
        />
      </div>
    </ConfirmationModal>
  );
}
