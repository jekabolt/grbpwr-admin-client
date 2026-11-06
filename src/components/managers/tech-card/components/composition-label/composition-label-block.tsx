import { useQueryClient } from '@tanstack/react-query';
import type { common_AdminColorwayRef, common_TechCard } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { useSizeOrdering } from 'components/managers/model/components/use-size-systems';
import { useProductionRuns } from 'components/managers/production-runs/components/useProductionRuns';
import { techCardKeys } from 'components/managers/tech-cards/components/useTechCardQuery';
import { SECTION } from 'constants/routes';
import { notify } from 'lib/stores/store';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type JSX,
  type ReactNode,
} from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { useSearchParams } from 'react-router-dom';
import {
  Button,
  Close,
  HeaderWarnings,
  Input,
  Row,
  RowTotal,
  Section,
  Select,
  Text,
  UndoRow,
  ViewSwitch,
} from 'ui';
import {
  adaptRuns,
  colorwayFullKey,
  type CareLabelColorway,
  type CareLabelData,
} from '../../care-labels/adapter';
import { overrideRowsOf, type OverrideFiber } from '../../care-labels/composition-override';
import type { PartComposition } from '../../care-labels/composition-resolver';
import { LABEL_PART_NAME, LABEL_PARTS, type PrintedPart } from '../../care-labels/label-parts';
import { COMPANY_ADDRESS } from '../../care-labels/layout';
import { PrintCompositionModal } from '../../care-labels/print-modal';
import { printGate, printSource } from '../../care-labels/print-gate';
import { computeQuantities, emptyGrid, fromRun } from '../../care-labels/quantities';
import { useCareLabelPrefs } from '../../care-labels/use-care-label-prefs';
import { useLabelDictionary } from '../../care-labels/use-label-dictionary';
import { setCareLabel, setCareLabelColorway, upsertGarmentLabel } from '../form-writers';
import type { FormGarmentLabel } from '../labels-schema';
import type { TechCardFormData } from '../schema';
import { COMPOSITION_LABEL_KEY, isCompositionLabel, type ArtworkFile } from '../sewn-label-model';
import { bornLabelFacts } from '../sewn-label-row';
import { useUndoHistory } from '../undo-history';
import { useTechCardStaging } from '../useTechCardStaging';
import { wireInt } from '../wire-int';
import { CareSymbolsRow } from './care-symbols-row';
import { ChooseFileModal } from './choose-file-modal';
import type { ArtworkCellRef } from './composition-artwork';
import {
  artworkChoice,
  filesAfterChoice,
  filesWithOwn,
  filesWithoutOwn,
  oneFileOf,
  ownFileFor,
  type ArtworkChoice,
} from './composition-artwork-model';
import {
  CompositionLabelPreview,
  type CompositionPreviewData,
  type LabelOrientation,
} from './composition-label-preview';
import { colourNameOverride, fibersToForm, linesOverride } from './label-lines';
import { addressLines } from './label-summary';
import { stageCountryWrites } from './made-in';
import { useCompositionLabel } from './use-composition-label';

const EMPTY_PICKS: ReadonlyMap<number, string> = new Map();
const ALL_FILE: ArtworkCellRef = { colorwayId: 0, sizeId: 0 };
type EditablePart = Exclude<PrintedPart, 'NOTE'>;

function useLabelCountries() {
  const { dictionary } = useLabelDictionary();
  return useMemo(
    () =>
      (dictionary?.countries ?? [])
        .filter((country) => !!country.code)
        .map((country) => ({
          code: country.code!.toUpperCase(),
          name: country.name || country.code!,
          active: country.active !== false,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [dictionary?.countries],
  );
}

function swatchHex(ref: common_AdminColorwayRef | undefined): string | undefined {
  const value = (ref?.devHex || ref?.colours?.[0]?.hex || '').trim();
  if (!/^#?[0-9a-f]{6}$/i.test(value)) return undefined;
  return value.startsWith('#') ? value : `#${value}`;
}

function FieldRow({ label, children, top }: { label: string; children: ReactNode; top?: boolean }) {
  return (
    <Row
      label={
        <Text
          component='span'
          size='control'
          variant='label'
          tracking='label'
          className='uppercase'
        >
          {label}
        </Text>
      }
      value={<span className='flex min-w-0 flex-1 flex-wrap items-center gap-1.5'>{children}</span>}
      className={
        top
          ? 'min-h-11 flex-col items-stretch gap-1.5 py-2 sm:grid sm:grid-cols-[120px_minmax(0,1fr)] sm:items-start [&>span:last-child]:shrink'
          : 'min-h-11 flex-col items-stretch gap-1.5 py-2 sm:grid sm:grid-cols-[120px_minmax(0,1fr)] sm:items-center [&>span:last-child]:shrink'
      }
    />
  );
}

function partsFor(
  data: CareLabelData | null,
  colorway: CareLabelColorway | undefined,
  resolved: readonly PartComposition[],
): OverrideFiber[] {
  if (!data || !colorway) return [];
  return colorway.fiberOverride?.length ? [...colorway.fiberOverride] : overrideRowsOf(resolved);
}

function fibreText(
  rows: readonly OverrideFiber[],
  part: EditablePart,
  data: CareLabelData,
): string {
  return rows
    .filter((row) => row.part === part)
    .map((row) => {
      const fiber = data.fibers.get(row.fiberCode);
      const name = fiber?.translations.en || fiber?.name || row.fiberCode;
      return `${row.pct}% ${name}`;
    })
    .join(' · ');
}

function parseFibres(
  text: string,
  part: EditablePart,
  data: CareLabelData,
): OverrideFiber[] | null {
  const pieces = text
    .split(/\s*(?:,|·)\s*/)
    .map((piece) => piece.trim())
    .filter(Boolean);
  if (pieces.length === 0) return [];
  const rows: OverrideFiber[] = [];
  for (const piece of pieces) {
    const match = piece.match(/^(\d{1,3})\s*%\s+(.+)$/);
    if (!match) return null;
    const pct = Number(match[1]);
    if (!Number.isInteger(pct) || pct < 1 || pct > 100) return null;
    const wanted = match[2].trim().toLowerCase();
    const fiber = [...data.fibers.values()].find(
      (candidate) =>
        candidate.code.toLowerCase() === wanted ||
        candidate.name.toLowerCase() === wanted ||
        candidate.translations.en?.toLowerCase() === wanted,
    );
    if (!fiber) return null;
    rows.push({ part, fiberCode: fiber.code, pct });
  }
  return rows;
}

type PartDraft = { part: EditablePart; text: string; invalid?: boolean };

function CompositionFields({
  data,
  colorway,
  parts,
  disabled,
}: {
  data: CareLabelData | null;
  colorway: CareLabelColorway | undefined;
  parts: readonly PartComposition[];
  disabled: boolean;
}): JSX.Element {
  const { getValues, setValue } = useFormContext<TechCardFormData>();
  const source = useMemo(() => partsFor(data, colorway, parts), [data, colorway, parts]);
  const sourceKey = source.map((row) => `${row.part}:${row.fiberCode}:${row.pct}`).join('|');
  const [rows, setRows] = useState<PartDraft[]>([]);
  const [removed, setRemoved] = useState<{ row: PartDraft; index: number } | null>(null);

  useEffect(() => {
    if (!data) return;
    const shown = LABEL_PARTS.filter(
      (part): part is EditablePart => part !== 'NOTE' && source.some((row) => row.part === part),
    ).map((part) => ({ part, text: fibreText(source, part, data) }));
    setRows(shown);
    setRemoved(null);
    // The serialized source is the reset boundary; object identities change while data loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colorway?.id, sourceKey]);

  const write = (next: PartDraft[]): boolean => {
    if (!data || !colorway) return false;
    const parsed: OverrideFiber[] = [];
    let valid = true;
    const marked = next.map((row) => {
      const fibers = parseFibres(row.text, row.part, data);
      if (fibers === null) {
        valid = false;
        return { ...row, invalid: true };
      }
      parsed.push(...fibers);
      return { ...row, invalid: false };
    });
    setRows(marked);
    if (!valid) return false;
    setCareLabelColorway(getValues, setValue, colorway.id, { fibers: fibersToForm(parsed) });
    return true;
  };

  const unused = LABEL_PARTS.filter(
    (part): part is EditablePart => part !== 'NOTE' && !rows.some((row) => row.part === part),
  );

  if (!data || !colorway) {
    return (
      <Text size='micro' variant='label'>
        No composition
      </Text>
    );
  }

  return (
    <span className='flex w-full flex-col items-start gap-1.5'>
      {rows.map((row, index) => {
        const partOptions = LABEL_PARTS.filter(
          (part): part is EditablePart =>
            part !== 'NOTE' && (part === row.part || !rows.some((entry) => entry.part === part)),
        );
        return (
          <span
            key={row.part}
            className='grid w-full grid-cols-[minmax(0,120px)_minmax(0,220px)_28px] items-center gap-1.5 max-[480px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_28px]'
          >
            <Select
              name={`composition-part-${index}`}
              value={row.part}
              disabled={disabled}
              className='h-7'
              items={partOptions.map((part) => ({ value: part, label: LABEL_PART_NAME[part] }))}
              onValueChange={(value: string) => {
                const next = rows.map((entry, rowIndex) =>
                  rowIndex === index ? { ...entry, part: value as EditablePart } : entry,
                );
                setRows(next);
                write(next);
              }}
            />
            <Input
              name={`composition-fibre-${index}`}
              value={row.text}
              disabled={disabled}
              aria-label={`${LABEL_PART_NAME[row.part]} fibre`}
              aria-invalid={row.invalid || undefined}
              placeholder='100% fibre'
              className='h-7'
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setRows((current) =>
                  current.map((entry, rowIndex) =>
                    rowIndex === index
                      ? { ...entry, text: event.target.value, invalid: false }
                      : entry,
                  ),
                )
              }
              onBlur={() => write(rows)}
            />
            {rows.length > 1 ? (
              <Close
                size='sm'
                disabled={disabled}
                aria-label={`remove ${LABEL_PART_NAME[row.part]}`}
                className='h-7 w-7'
                onClick={() => {
                  const next = rows.filter((_, rowIndex) => rowIndex !== index);
                  setRemoved({ row, index });
                  write(next);
                }}
              />
            ) : (
              <span className='h-7 w-7' />
            )}
          </span>
        );
      })}
      {removed ? (
        <UndoRow
          name={LABEL_PART_NAME[removed.row.part]}
          className='min-h-7 w-full [&_button]:h-7'
          onUndo={() => {
            const next = [...rows];
            next.splice(removed.index, 0, removed.row);
            setRemoved(null);
            write(next);
          }}
          onCommit={() => setRemoved(null)}
        />
      ) : null}
      {unused.length > 0 ? (
        <Button
          type='button'
          variant='secondary'
          size='xs'
          disabled={disabled}
          className='h-7'
          onClick={() => setRows([...rows, { part: unused[0], text: '' }])}
        >
          + Part
        </Button>
      ) : null}
    </span>
  );
}

function AddressField({ data, disabled }: { data: CareLabelData | null; disabled: boolean }) {
  const { getValues, setValue } = useFormContext<TechCardFormData>();
  const shown = addressLines(data).join(' · ');
  const [draft, setDraft] = useState(shown);
  useEffect(() => setDraft(shown), [shown]);
  const commit = () => {
    const next = draft.trim();
    if (next === shown) return;
    setCareLabel(getValues, setValue, {
      addressLines: linesOverride(next.replaceAll(' · ', '\n'), COMPANY_ADDRESS),
    });
  };
  return (
    <Input
      name='composition-address'
      value={draft}
      disabled={disabled}
      aria-label='Address'
      className='h-7 max-w-sm'
      onChange={(event: ChangeEvent<HTMLInputElement>) => setDraft(event.target.value)}
      onBlur={commit}
    />
  );
}

export function CompositionLabelBlock({
  techCard,
  techCardId,
  canEdit,
}: {
  techCard: common_TechCard | undefined;
  techCardId: number | undefined;
  canEdit: boolean;
}) {
  const { getValues, setValue, control } = useFormContext<TechCardFormData>();
  const qc = useQueryClient();
  const staging = useTechCardStaging();
  const countries = useLabelCountries();
  const undoHistory = useUndoHistory();
  const { canWrite } = usePermissions();
  const canStyle = canWrite(SECTION.products);
  const [picks, setPicks] = useState<ReadonlyMap<number, string>>(EMPTY_PICKS);
  const model = useCompositionLabel({ techCard, countryPicks: picks });
  const colorways = model.data?.colorways ?? [];
  const sizes = model.data?.sizes ?? [];
  const [colorwayId, setColorwayId] = useState<number | null>(null);
  const [sizeId, setSizeId] = useState<number | null>(null);
  const colorway = colorways.find((entry) => entry.id === colorwayId) ?? colorways[0];
  const size = sizes.find((entry) => entry.id === sizeId) ?? sizes[0];
  const orientation: LabelOrientation =
    useWatch({ control, name: 'careLabel.orientation' }) === 'horizontal'
      ? 'horizontal'
      : 'vertical';
  const setOrientation = (next: LabelOrientation) =>
    setCareLabel(getValues, setValue, { orientation: next });
  const countryNodes = useRef(new Map<number, HTMLSpanElement>());
  const firstField = useRef<HTMLDivElement>(null);

  const countryName = (code: string) =>
    countries.find((country) => country.code === code)?.name ?? code;
  const titleOf = (id: number) => {
    const entry = colorways.find((candidate) => candidate.id === id);
    return entry?.baseSku || entry?.colourName || `#${id}`;
  };
  const stagedRef = useRef<number[]>([]);
  const lockVersion = wireInt(techCard?.lockVersion);
  useEffect(() => {
    if (!staging || !techCardId) return;
    stagedRef.current = stageCountryWrites({
      staging,
      picks,
      previous: stagedRef.current,
      techCardId,
      lockVersion,
      titleOf,
      countryNameOf: countryName,
      onCommitted: (id) =>
        Promise.all([
          qc.invalidateQueries({ queryKey: colorwayFullKey(id) }),
          qc.invalidateQueries({ queryKey: techCardKeys.detail(techCardId) }),
        ]),
      settle: (id) =>
        setPicks((current) => {
          if (!current.has(id)) return current;
          const next = new Map(current);
          next.delete(id);
          return next;
        }),
    });
    // The labels are render data; picks and the lock move the queue.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staging, picks, techCardId, lockVersion]);
  useEffect(
    () => () => {
      for (const id of stagedRef.current) staging?.unstage(`colourway:${id}:country`);
    },
    [staging],
  );

  const garmentLabels = useWatch({ control, name: 'garmentLabels' }) as
    | FormGarmentLabel[]
    | undefined;
  const files = useMemo(
    () => garmentLabels?.find((row) => isCompositionLabel(row.key))?.files ?? [],
    [garmentLabels],
  );
  const [pending, setPending] = useState<ArtworkChoice | null>(null);
  const choice = artworkChoice(files, pending);
  const writeFiles = (edit: (current: readonly ArtworkFile[]) => ArtworkFile[]) => {
    const live = ((getValues('garmentLabels') ?? []) as FormGarmentLabel[]).find((row) =>
      isCompositionLabel(row.key),
    );
    const next = edit(live?.files ?? []) as NonNullable<FormGarmentLabel['files']>;
    undoHistory.cut('label-upload');
    upsertGarmentLabel(
      getValues,
      setValue,
      COMPOSITION_LABEL_KEY,
      live ? { files: next } : { ...bornLabelFacts(COMPOSITION_LABEL_KEY), files: next },
      { keepBare: true },
    );
  };
  const pickChoice = (next: ArtworkChoice) => {
    setPending(next);
    if (filesAfterChoice(files, next).length === files.length) return;
    writeFiles((current) => filesAfterChoice(current, next));
  };
  const clearFile = ({ colorwayId: clearColorwayId, sizeId: clearSizeId }: ArtworkCellRef) => {
    setPending(choice);
    writeFiles((current) => filesWithoutOwn(current, clearColorwayId, clearSizeId));
  };
  const [choosing, setChoosing] = useState<ArtworkCellRef | null>(null);
  const openChooser = (cell: ArtworkCellRef) => {
    if (!canWrite(SECTION.files)) {
      notify({ sev: 'error', subject: '', text: '', bad: 'no files access' });
      return;
    }
    setChoosing(cell);
  };

  const parts =
    model.readiness?.colorways.find((entry) => entry.colorwayId === colorway?.id)?.composition
      .parts ?? [];
  const preview: CompositionPreviewData = { colorway, size, parts };
  const fileCell =
    choice === 'one' ? ALL_FILE : { colorwayId: colorway?.id ?? 0, sizeId: size?.id ?? 0 };
  const previewFile =
    choice === 'one'
      ? oneFileOf(files)
      : colorway && size
        ? ownFileFor(files, colorway.id, size.id)
        : undefined;

  const nameValue = colorway?.colourName ?? '';
  const setName = (value: string) => {
    if (!colorway) return;
    setCareLabelColorway(getValues, setValue, colorway.id, {
      colourName: colourNameOverride(value, colorway.colourNameDerived),
    });
  };

  const missingCountries = colorways.filter((entry) => !entry.countryCode);
  const focusCountry = (id: number) => {
    setColorwayId(id);
    requestAnimationFrame(() => {
      const node = countryNodes.current.get(id);
      node?.scrollIntoView({ block: 'center' });
      node?.querySelector<HTMLElement>('[role=combobox]')?.focus();
    });
  };

  const gate = model.readiness
    ? printGate({
        choice,
        files,
        readiness: model.readiness,
        colorwayIds: colorways.map((entry) => entry.id),
        sizeIds: sizes.map((entry) => entry.id),
      })
    : null;
  const ready = colorways.filter((entry) => !gate?.blocked.has(entry.id)).length;

  const { prefs } = useCareLabelPrefs(techCardId);
  const runsQuery = useProductionRuns(techCardId ?? 0, '', 0, false, !!techCardId);
  const runs = useMemo(() => adaptRuns(runsQuery.data?.runs ?? []), [runsQuery.data]);
  const source = printSource(prefs.source, runs, false);
  const run = source === 'manual' ? null : source;
  const orderSizes = useSizeOrdering();
  const orderedSizeIds = orderSizes(sizes.map((entry) => entry.id));
  const base = run
    ? fromRun(
        run,
        colorways.map((entry) => entry.id),
        orderedSizeIds,
      )
    : emptyGrid(
        colorways.map((entry) => entry.id),
        orderedSizeIds,
      );
  const summary = computeQuantities({
    base,
    colorways: colorways.map((entry) => ({
      id: entry.id,
      label: entry.baseSku || entry.colourName,
    })),
    sizeIds: orderedSizeIds,
    overagePct: prefs.overagePct,
    mode: prefs.mode,
    excluded: gate ? [...gate.blocked] : [],
    run,
    plans: model.plan?.sets ?? null,
  });
  const calculatedTotal = summary.labelsA + (summary.labelsB ?? 0);
  const [modalTotal, setModalTotal] = useState<number | null>(null);

  const [printing, setPrinting] = useState(false);
  const [params, setParams] = useSearchParams();
  const askedToPrint = params.get('print') === '1';
  useEffect(() => {
    if (!askedToPrint) return;
    setPrinting(true);
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete('print');
        return next;
      },
      { replace: true },
    );
  }, [askedToPrint, setParams]);

  return (
    <Section
      title='composition label'
      action={
        <HeaderWarnings
          items={missingCountries.map((entry) => ({
            text: `${entry.colourName || entry.baseSku}: no country ›`,
            error: true,
            action: { label: 'Choose country', onClick: () => focusCountry(entry.id) },
          }))}
        />
      }
      className='w-full'
    >
      <div className='grid min-w-0 gap-gutter lg:grid-cols-[minmax(0,1fr)_minmax(300px,auto)]'>
        <div ref={firstField} className='min-w-0'>
          <FieldRow label='Artwork'>
            <ViewSwitch
              value={choice === 'built' ? 'built' : 'own'}
              label='Artwork'
              disabled={!canEdit}
              className='[&_[role=radio]]:h-7'
              options={[
                { value: 'built', label: 'Built' },
                { value: 'own', label: 'Own file' },
              ]}
              onChange={(value) =>
                pickChoice(value === 'built' ? 'built' : choice === 'one' ? 'one' : 'cell')
              }
            />
          </FieldRow>
          <FieldRow label='Format'>
            <ViewSwitch
              value={orientation}
              label='Format'
              disabled={!canEdit}
              className='[&_[role=radio]]:h-7'
              options={[
                { value: 'vertical', label: 'Vertical' },
                { value: 'horizontal', label: 'Horizontal' },
              ]}
              onChange={setOrientation}
            />
          </FieldRow>
          {choice === 'built' ? (
            <>
              <FieldRow label='Product'>
                <Input
                  name='composition-product'
                  value={nameValue}
                  disabled={!canEdit || !colorway}
                  aria-label='Product name'
                  className='h-7 min-w-0 flex-1 sm:max-w-60'
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setName(event.target.value)}
                />
                <Input
                  name='composition-code'
                  value={colorway?.baseSku ?? ''}
                  readOnly
                  aria-label='Product code'
                  className='h-7 w-full sm:w-28'
                />
              </FieldRow>
              <FieldRow label='Composition' top>
                <CompositionFields
                  data={model.data}
                  colorway={colorway}
                  parts={parts}
                  disabled={!canEdit}
                />
              </FieldRow>
              <FieldRow label='Care'>
                <CareSymbolsRow disabled={!canEdit || !canStyle} />
              </FieldRow>
              <FieldRow label='Made in' top>
                <span className='grid w-full max-w-md grid-cols-[minmax(0,150px)_minmax(0,200px)] items-center gap-x-2.5 gap-y-1.5 max-[480px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]'>
                  {colorways.map((entry) => {
                    const ref = techCard?.colorways?.find(
                      (candidate) => wireInt(candidate.colorwayId) === entry.id,
                    );
                    const hex = swatchHex(ref);
                    const value = picks.has(entry.id) ? picks.get(entry.id)! : entry.countryCode;
                    const pickable = countries.filter(
                      (country) => country.active || country.code === entry.countryCode,
                    );
                    return (
                      <span key={entry.id} className='contents'>
                        <span className='flex min-w-0 items-center gap-1.5'>
                          <span
                            aria-hidden
                            className={
                              hex
                                ? 'h-3 w-3 shrink-0 border border-textColor'
                                : 'h-3 w-3 shrink-0 border border-dashed border-borderColor'
                            }
                            style={hex ? { backgroundColor: hex } : undefined}
                          />
                          <Text component='span' className='truncate'>
                            {entry.colourName || entry.baseSku}
                          </Text>
                        </span>
                        <span
                          ref={(node) => {
                            if (node) countryNodes.current.set(entry.id, node);
                            else countryNodes.current.delete(entry.id);
                          }}
                        >
                          <Select
                            name={`composition-country-${entry.id}`}
                            value={value}
                            disabled={!canEdit || !techCardId}
                            invalid={!value}
                            placeholder='Pick country'
                            className='h-7'
                            items={[
                              { value: '', label: 'Pick country' },
                              ...pickable.map((country) => ({
                                value: country.code,
                                label: country.name,
                              })),
                            ]}
                            onValueChange={(code: string) =>
                              setPicks((current) => {
                                const next = new Map(current);
                                if (code === entry.countryCode) next.delete(entry.id);
                                else next.set(entry.id, code);
                                return next;
                              })
                            }
                          />
                        </span>
                      </span>
                    );
                  })}
                </span>
              </FieldRow>
              <FieldRow label='Address'>
                <AddressField data={model.data} disabled={!canEdit} />
              </FieldRow>
            </>
          ) : null}
        </div>

        <div className='flex min-w-0 flex-col items-start gap-2.5'>
          {choice === 'built' ? (
            <span className='flex max-w-full flex-wrap gap-1.5'>
              <ViewSwitch
                value={String(colorway?.id ?? '')}
                label='Colourway'
                className='max-w-full flex-wrap [&_[role=radio]]:h-7'
                options={colorways.map((entry) => ({
                  value: String(entry.id),
                  label: `${entry.colourName || entry.baseSku}${entry.countryCode ? '' : ' !'}`,
                }))}
                onChange={(value) => setColorwayId(Number(value))}
              />
              <ViewSwitch
                value={String(size?.id ?? '')}
                label='Size'
                className='max-w-full flex-wrap [&_[role=radio]]:h-7'
                options={sizes.map((entry) => ({ value: String(entry.id), label: entry.label }))}
                onChange={(value) => setSizeId(Number(value))}
              />
            </span>
          ) : null}
          <CompositionLabelPreview
            data={model.data}
            preview={preview}
            logoUrl={model.logoUrl}
            choice={choice}
            file={previewFile}
            orientation={orientation}
            canEdit={canEdit}
            onChooseFile={() => openChooser(fileCell)}
            onClearFile={() => clearFile(fileCell)}
          />
        </div>
      </div>

      <RowTotal
        label={
          <Text
            component='span'
            size='micro'
            variant='label'
            tracking='label'
            className='uppercase'
          >
            {ready} of {colorways.length} colours ready · {modalTotal ?? calculatedTotal} labels
          </Text>
        }
        value={
          <Button
            type='button'
            variant='main'
            size='sm'
            className='h-7'
            disabled={!techCardId}
            onClick={() => setPrinting(true)}
          >
            Print labels
          </Button>
        }
        className='items-center pt-2'
      />

      {choosing ? (
        <ChooseFileModal
          onClose={() => setChoosing(null)}
          onChosen={(file) =>
            writeFiles((current) => filesWithOwn(current, { ...choosing, ...file }))
          }
        />
      ) : null}
      {printing && techCardId ? (
        <PrintCompositionModal
          techCardId={techCardId}
          data={model.data}
          files={files}
          choice={choice}
          orientation={orientation}
          logoUrl={model.logoUrl}
          initialColorwayId={colorway?.id}
          initialSizeId={size?.id}
          onTotalChange={setModalTotal}
          onClose={() => setPrinting(false)}
          onChooseFile={(cell) => {
            setPrinting(false);
            openChooser(cell);
          }}
          onFixText={() => {
            setPrinting(false);
            requestAnimationFrame(() =>
              firstField.current
                ?.querySelector<HTMLElement>('input, button, [role=radio]')
                ?.focus(),
            );
          }}
        />
      ) : null}
    </Section>
  );
}
