// PRINT COMPOSITION: quantities, extra, duplex or simplex, which colours, and the zip. It prints the
// card as it stands on the screen behind it, including what autosave has not sent yet. What holds it
// is one word in the head with the action next to it; the detail lives in the editor.
import { useProductionRuns } from 'components/managers/production-runs/components/useProductionRuns';
import { notify } from 'lib/stores/store';
import { useMemo, useState, type JSX } from 'react';
import {
  Button,
  CheckboxCommon,
  Chip,
  ChipRow,
  ConfirmationModal,
  EmptyCell,
  Input,
  Select,
  Text,
} from 'ui';
import {
  ownFileFor,
  type ArtworkChoice,
} from '../components/composition-label/composition-artwork-model';
import { useShaper } from '../components/composition-label/use-composition-label';
import type { ArtworkFile } from '../components/sewn-label-model';
import { adaptRuns, type CareLabelData } from './adapter';
import { isBlocking } from './holes';
import type { ManifestColorway } from './manifest';
import { loadOwnFiles, planOwnFiles } from './own-files';
import { planPrint } from './pages';
import { printGate, printSource, runCaption, type PrintReason } from './print-gate';
import { buildPrintJob, compositionsOf, planAll } from './print-job';
import { computeQuantities, emptyGrid, fromRun, toQty, type QtyGrid } from './quantities';
import { collectReadiness } from './readiness';
import { clampOverage, effectiveQrTemplate, useCareLabelPrefs } from './use-care-label-prefs';

const MANUAL = 'manual';

const FIX_WORD: Record<PrintReason, string> = {
  'no file': 'choose file',
  'no text': 'edit text',
  'no data': 'reload',
  'no fonts': 'reload',
};

export function PrintCompositionModal({
  techCardId,
  data,
  files,
  choice,
  onClose,
  onChooseFile,
  onEditText,
}: {
  techCardId: number;
  data: CareLabelData | null;
  files: readonly ArtworkFile[];
  choice: ArtworkChoice;
  onClose: () => void;
  onChooseFile: () => void;
  onEditText: () => void;
}): JSX.Element {
  const { shaper, failed } = useShaper();
  const { prefs, update } = useCareLabelPrefs(techCardId);
  const runsQuery = useProductionRuns(techCardId, '', 0, false, true);
  const runs = useMemo(() => adaptRuns(runsQuery.data?.runs ?? []), [runsQuery.data]);

  const [manualOn, setManualOn] = useState(false);
  const [manual, setManual] = useState<QtyGrid>({});
  const [unticked, setUnticked] = useState<ReadonlySet<number>>(new Set());
  const [building, setBuilding] = useState(false);
  const [saved, setSaved] = useState('');

  const mode = prefs.mode;
  const colorways = useMemo(() => data?.colorways ?? [], [data]);
  const sizes = useMemo(() => data?.sizes ?? [], [data]);
  const colorwayIds = useMemo(() => colorways.map((c) => c.id), [colorways]);
  const sizeIds = useMemo(() => sizes.map((s) => s.id), [sizes]);

  const compositions = useMemo(() => (data ? compositionsOf(data) : null), [data]);
  const plan = useMemo(
    () =>
      shaper && data && compositions
        ? planAll(shaper, data, compositions, mode, data.label.qr)
        : null,
    [shaper, data, compositions, mode],
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
  const excluded = useMemo(
    () => colorwayIds.filter((id) => unticked.has(id) || gate.blocked.has(id)),
    [colorwayIds, unticked, gate.blocked],
  );

  const source = printSource(prefs.source, runs, manualOn);
  const run = source === 'manual' ? null : source;
  const base = useMemo<QtyGrid>(() => {
    if (run) return fromRun(run, colorwayIds, sizeIds);
    return source === 'manual' ? manual : emptyGrid(colorwayIds, sizeIds);
  }, [run, source, manual, colorwayIds, sizeIds]);
  const quantities = useMemo(
    () =>
      computeQuantities({
        base,
        colorways: colorways.map((c) => ({ id: c.id, label: c.baseSku || c.colourName })),
        sizeIds,
        overagePct: prefs.overagePct,
        mode: prefs.mode,
        excluded,
        run,
        plans: plan?.sets ?? null,
      }),
    [base, colorways, sizeIds, prefs, excluded, run, plan],
  );
  const total = Object.values(quantities.rowTotals).reduce((sum, n) => sum + n, 0);
  const isOff = (id: number) => excluded.includes(id);
  const rowBase = (id: number) => sizeIds.reduce((sum, s) => sum + toQty(base[id]?.[s]), 0);

  const download = async (): Promise<void> => {
    if (!data || !shaper || !compositions || building) return;
    setBuilding(true);
    try {
      const copies = (cw: number, size: number) =>
        ownFileFor(files, cw, size) ? 0 : quantities.cells[cw]?.[size] ?? 0;
      const made = colorwayIds.filter((c) => sizeIds.some((s) => copies(c, s) > 0));
      const set = planPrint(
        shaper,
        buildPrintJob({
          data,
          compositions,
          mode,
          qr: data.label.qr,
          colorwayIds: made,
          copies,
        }),
      );
      const block = set.holes.find(isBlocking);
      if (block) throw new Error(block.message);
      const planned = planOwnFiles({ files, data, cells: quantities.cells });
      if (set.files.length === 0 && planned.length === 0) {
        throw new Error('nothing to put into the zip');
      }
      // Warnings are about what the generator makes: a colour of own files only has none.
      const ownOnly = new Set(colorwayIds.filter((c) => !made.includes(c) && !isOff(c)));
      const final = collectReadiness({
        data,
        excluded: [...excluded, ...ownOnly],
        prefs: data.label.qr,
        layoutHoles: plan?.layoutHoles,
        quantityHoles: quantities.holes.filter((h) => h.code !== 'nothing-to-export'),
        zeroColorways: quantities.zeroColorways,
        fontsFailed: failed,
      });
      const warnings = [...final.warnings, ...set.holes.filter((h) => h.level === 'warn')]
        .filter((h) => !(h.ref.colorwayId !== undefined && ownOnly.has(h.ref.colorwayId)))
        .filter((h, i, all) => all.findIndex((x) => x.message === h.message) === i);
      const manifestCws = new Map<number, ManifestColorway>(
        colorways.map((c) => [c.id, { baseSku: c.baseSku, colour: c.colourName }]),
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
        colorways: manifestCws,
        qrTemplate: effectiveQrTemplate(data.label.qr),
        adminUrl: `${window.location.origin}/tech-cards/${techCardId}`,
        warnings,
        own,
      });
      saveBlob(zip.bytes, zip.name);
      setSaved(zip.name);
    } catch (e) {
      notify({
        sev: 'error',
        subject: 'CARE LABELS',
        text: 'zip not built',
        detail: e instanceof Error ? e.message : String(e),
        action: { label: 'retry', onClick: () => void download() },
      });
    } finally {
      setBuilding(false);
    }
  };

  const fix = () => {
    if (gate.reason === 'no file') onChooseFile();
    else if (gate.reason === 'no text') onEditText();
    else window.location.reload();
  };

  const setCell = (colorway: number, size: number, value: string) =>
    setManual((grid) => ({
      ...grid,
      [colorway]: { ...(grid[colorway] ?? {}), [size]: toQty(value) },
    }));

  return (
    <ConfirmationModal
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      onConfirm={() => void download()}
      title='Print composition'
      headerActions={
        gate.reason ? (
          <>
            <Text
              size='micro'
              variant='errorLabel'
              component='span'
              className='whitespace-nowrap uppercase'
              data-print-reason={gate.reason}
            >
              ! {gate.reason}
            </Text>
            <Button type='button' variant='underline' size='xs' data-print-fix='' onClick={fix}>
              {FIX_WORD[gate.reason]}
            </Button>
          </>
        ) : null
      }
      confirmLabel={building ? 'building…' : 'download zip'}
      confirmDisabled={total === 0 || building || !shaper}
      closeOnConfirm={false}
      footerHint={saved || undefined}
    >
      <div className='flex flex-col gap-3' data-print-composition=''>
        <div className='flex flex-wrap items-end gap-x-6 gap-y-2'>
          <label className='flex flex-col gap-1'>
            <Text size='micro' variant='label' component='span' className='uppercase'>
              quantities
            </Text>
            <Select
              name='print-quantities'
              className='min-w-44'
              value={run ? String(run.id) : MANUAL}
              items={[
                ...runs.map((r) => ({ value: String(r.id), label: runCaption(r) })),
                { value: MANUAL, label: MANUAL },
              ]}
              onValueChange={(v: string) => {
                setManualOn(v === MANUAL);
                if (v !== MANUAL) update({ source: { runId: Number(v) } });
              }}
            />
          </label>
          <label className='flex flex-col gap-1'>
            <Text size='micro' variant='label' component='span' className='uppercase'>
              extra, %
            </Text>
            <Input
              name='print-extra'
              type='number'
              min={0}
              max={100}
              className='w-16'
              placeholder='5'
              data-print-extra=''
              value={prefs.overagePct}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                update({ overagePct: clampOverage(Number(e.target.value)) })
              }
            />
          </label>
          <div className='flex flex-col gap-1'>
            <Text size='micro' variant='label' component='span' className='uppercase'>
              print
            </Text>
            <ChipRow>
              {(['duplex', 'simplex'] as const).map((m) => (
                <Chip
                  key={m}
                  nonForm
                  pressed={mode === m}
                  selected={mode === m}
                  data-print-mode={m}
                  onClick={() => update({ mode: m })}
                >
                  {m}
                </Chip>
              ))}
            </ChipRow>
          </div>
        </div>

        {!data ? (
          <Text size='micro' variant='label' className='animate-pulse'>
            loading…
          </Text>
        ) : (
          <div className='overflow-x-auto'>
            <table className='w-full border-collapse text-micro tabular-nums'>
              <thead>
                <tr className='border-b border-textColor text-labelColor uppercase'>
                  <th className='py-1 pr-2 text-left font-normal'>colour</th>
                  {sizes.map((s) => (
                    <th key={s.id} className='px-1 py-1 text-right font-normal'>
                      {s.label}
                    </th>
                  ))}
                  <th className='py-1 pl-2 text-right font-normal'>Σ</th>
                </tr>
              </thead>
              <tbody>
                {colorways.map((c) => {
                  const off = isOff(c.id);
                  return (
                    <tr key={c.id} className='border-b border-hairline' data-print-row={c.id}>
                      <td className='py-1 pr-2 whitespace-nowrap'>
                        <label className='flex items-center gap-2 uppercase'>
                          <CheckboxCommon
                            name={`print-colour-${c.id}`}
                            checked={!off}
                            disabled={gate.blocked.has(c.id)}
                            aria-label={c.colourName || c.baseSku}
                            onChange={(on: boolean) =>
                              setUnticked((cur) => {
                                const next = new Set(cur);
                                if (on) next.delete(c.id);
                                else next.add(c.id);
                                return next;
                              })
                            }
                          />
                          {c.colourName || c.baseSku}
                        </label>
                      </td>
                      {sizes.map((s) => (
                        <td
                          key={s.id}
                          className='px-1 py-1 text-right'
                          data-print-cell={`${c.id}:${s.id}`}
                        >
                          {off ? (
                            <EmptyCell />
                          ) : run ? (
                            toQty(base[c.id]?.[s.id])
                          ) : (
                            <Input
                              name={`print-qty-${c.id}-${s.id}`}
                              type='number'
                              min={0}
                              className='ml-auto w-14 text-right'
                              aria-label={`${c.colourName} ${s.label}`}
                              placeholder='0'
                              value={toQty(base[c.id]?.[s.id]) || ''}
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                setCell(c.id, s.id, e.target.value)
                              }
                            />
                          )}
                        </td>
                      ))}
                      <td className='py-1 pl-2 text-right'>
                        {off ? <EmptyCell /> : rowBase(c.id)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className='border-t border-textColor'>
                  <td className='py-1 pr-2' colSpan={sizes.length + 1}>
                    with extra
                  </td>
                  <td className='py-1 pl-2 text-right' data-print-total={total}>
                    {total}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </ConfirmationModal>
  );
}
