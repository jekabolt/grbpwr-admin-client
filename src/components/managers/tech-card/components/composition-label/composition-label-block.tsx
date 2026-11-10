// COMPOSITION LABEL — отдельный, всегда присутствующий блок вкладки «labels & pkg».
// «Лента и есть форма»: ленты выбранного варианта (колорвей × размер) свёрстаны движком в
// ориентации карточки (`careLabel.orientation`, пусто = вертикальная) — лого, QR, 10 языков,
// штриховка припуска. Каждое напечатанное значение — дверь в свою правку: полоса правки открывается
// под стороной, открыта всегда одна, правка пишет форму сразу (сохраняется вместе с карточкой).
// Свой файл — превью файла вместо лент. Шапка: дыры варианта и колорвеи без страны — клик ведёт к
// двери `MADE IN` на ленте. Страна ставится в одно сохранение карточки (made-in.ts); запись страны
// и выбор варианта принадлежат блоку.
import { useQueryClient } from '@tanstack/react-query';
import type { common_MediaFull, common_TechCard } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { useSizeOrdering } from 'components/managers/model/components/use-size-systems';
import { useProductionRuns } from 'components/managers/production-runs/components/useProductionRuns';
import { techCardKeys } from 'components/managers/tech-cards/components/useTechCardQuery';
import { useWorkshopSettings } from 'components/managers/workshop/useWorkshopSettings';
import { SECTION } from 'constants/routes';
import { notify } from 'lib/stores/store';
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type KeyboardEvent,
  type ReactNode,
  type SetStateAction,
} from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { useSearchParams } from 'react-router-dom';
import {
  Button,
  EmptyCell,
  GroupLabel,
  HeaderWarnings,
  Row,
  RowTotal,
  Section,
  Text,
  ViewSwitch,
  type HeaderWarning,
} from 'ui';
import {
  adaptRuns,
  colorwayFullKey,
  type CareLabelColorway,
  type CareLabelSize,
} from '../../care-labels/adapter';
import { hasCareArtwork } from '../../care-labels/artwork';
import { overrideRowsOf } from '../../care-labels/composition-override';
import { isBlocking, type Hole } from '../../care-labels/holes';
import { LABEL_PART_NAME, type PrintedPart } from '../../care-labels/label-parts';
import {
  COMPANY_ADDRESS,
  L,
  LV,
  QR_CAPTION,
  seamFor,
  textWidth,
  type LabelOrientation,
} from '../../care-labels/layout';
import { previewASides, type PlannedSide } from '../../care-labels/pages';
import { printGate, printSource } from '../../care-labels/print-gate';
import { PrintCompositionModal } from '../../care-labels/print-modal';
import { computeQuantities, emptyGrid, fromRun } from '../../care-labels/quantities';
import type { Readiness } from '../../care-labels/readiness';
import { useCareLabelPrefs } from '../../care-labels/use-care-label-prefs';
import { useLabelDictionary } from '../../care-labels/use-label-dictionary';
import { setCareLabel, setCareLabelColorway, upsertGarmentLabel } from '../form-writers';
import {
  compositionLabelConfirmed,
  compositionLabelSize,
  confirmCompositionLabel,
} from '../label-bom';
import type { FormCareLabel, FormGarmentLabel } from '../labels-schema';
import type { TechCardFormData } from '../schema';
import { COMPOSITION_LABEL_KEY, isCompositionLabel, type ArtworkFile } from '../sewn-label-model';
import { bornLabelFacts } from '../sewn-label-row';
import { useUndoHistory } from '../undo-history';
import { useTechCardStaging } from '../useTechCardStaging';
import { wireInt } from '../wire-int';
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
import { CareSymbolsEditor, LogoEditor, QrEditor } from './doors';
import { DraftInput, DraftLines } from './editable';
import { EditorStrip } from './editor-strip';
import { FibreEditor } from './fibre-editor';
import {
  colourNameOverride,
  fibersFromForm,
  holeLine,
  linesOverride,
  writeComposition,
  type LineKey,
} from './label-lines';
import { addressLines, captionLines, labelSku, qrExample } from './label-summary';
import { stageCountryWrites } from './made-in';
import { MadeInValue } from './made-in-value';
import { OwnFilePreview } from './own-file-preview';
import {
  aBackRegions,
  aFaceRegions,
  bEmptyRegions,
  bRegions,
  PX_PER_MM,
  type Region,
} from './regions';
import { usePublishBuiltRibbons } from './built-ribbons-context';
import { Ribbon, type RegionView, type RibbonSide } from './ribbon';
import { builtRibbonPages } from './ribbon-pages';
import {
  useCompositionLabel,
  useShaper,
  type CompositionLabelModel,
} from './use-composition-label';

const EMPTY_PICKS: ReadonlyMap<number, string> = new Map();
const ALL_FILE: ArtworkCellRef = { colorwayId: 0, sizeId: 0 };

/** Ширина стороны при зуме 1: 100 мм горизонтальной ленты, 30 мм вертикальной. */
const RIBBON_PX = L.W * PX_PER_MM;
const RIBBON_V_PX = LV.W * PX_PER_MM;
/** Просвет между сторонами и поля скамьи (узкий экран — поля уже). */
const GAP = 16;
const BENCH_PAD = 12;
const NARROW_PAD = 8;
/** Уже этого горизонтальная пара мельче натуральной величины — стороны встают одна под другой. */
const TWO_UP_MIN = 2 * RIBBON_PX + GAP + 2 * BENCH_PAD;
/** Колонка вертикальной стороны: все стороны в один ряд, пока колонка не уже минимума. */
const V_COL_MIN = 120;
const V_COL_MAX = 200;

type Country = { code: string; name: string; active: boolean };
type SideModel = RibbonSide & { role: 'face' | 'back'; row: string; regions: Region[] };
type RowModel = { label: string; sides: SideModel[] };
type Open = { side: string; key: string } | null;
/** Просьба шапки открыть дверь строки (`null` — первая дыра с адресом). */
type Jump = { n: number; line: LineKey | null; part?: PrintedPart };

/** Откуда значение, пока его не правили. */
const SOURCE: Record<LineKey, string> = {
  logo: 'from the brand',
  product: 'from the colourway',
  'care-symbols': 'style care · all colourways',
  'care-text': 'from the dictionary',
  'made-in': 'from the colourway',
  composition: 'from the BOM',
  qr: 'storefront link',
  caption: 'from the brand',
  address: 'from the company',
};
const NAME: Record<LineKey, string> = {
  logo: 'logo',
  product: 'colour name',
  'care-symbols': 'care symbols',
  'care-text': 'care text',
  'made-in': 'made in',
  composition: 'composition',
  qr: 'qr link',
  caption: 'back caption',
  address: 'address',
};

const sideName = (key: string) => key.replace('-', ' ');

const isUnavailable = (c: { holes: readonly Hole[] }) =>
  c.holes.some((h) => h.code === 'colorway-unavailable');

function useLabelCountries(): Country[] {
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

/** Дыры варианта: общие и колорвея, без справочных, блокирующие первыми. */
function variantHoles(readiness: Readiness | null, colorwayId: number | undefined): Hole[] {
  if (!readiness) return [];
  const mine =
    colorwayId == null
      ? []
      : readiness.colorways.find((entry) => entry.colorwayId === colorwayId)?.holes ?? [];
  const seen = new Set<string>();
  return [...readiness.global, ...mine]
    .filter((h) => h.level !== 'info')
    .filter((h) => (seen.has(h.message) ? false : (seen.add(h.message), true)))
    .sort((a, b) => Number(isBlocking(b)) - Number(isBlocking(a)));
}

function RowLabel({ children }: { children: ReactNode }) {
  return (
    <Text component='span' size='control' variant='label' tracking='label' className='uppercase'>
      {children}
    </Text>
  );
}

function FieldRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Row
      label={<RowLabel>{label}</RowLabel>}
      value={<span className='flex min-w-0 flex-1 flex-wrap items-center gap-1.5'>{children}</span>}
      className='min-h-11 flex-col items-stretch gap-1.5 py-2 sm:grid sm:grid-cols-[120px_minmax(0,1fr)] sm:items-center [&>span:last-child]:shrink'
    />
  );
}

/** Колорвей и размер варианта — сегменты, как остальные переключатели блока. */
function VariantSwitch({
  colorways,
  sizes,
  colorwayId,
  sizeId,
  flagged,
  onColorway,
  onSize,
}: {
  colorways: readonly CareLabelColorway[];
  sizes: readonly CareLabelSize[];
  colorwayId: number | undefined;
  sizeId: number | undefined;
  flagged: (colorway: CareLabelColorway) => boolean;
  onColorway: (id: number) => void;
  onSize: (id: number) => void;
}) {
  return (
    <div className='flex flex-wrap items-center gap-x-6 gap-y-3 pb-1.5 pt-3.5' data-variant=''>
      <span className='flex min-w-0 max-w-full flex-wrap items-center gap-2'>
        <RowLabel>Colour</RowLabel>
        <ViewSwitch
          value={String(colorwayId ?? '')}
          label='Colour'
          className='max-w-full flex-wrap [&_[role=radio]]:h-7'
          options={colorways.map((entry) => ({
            value: String(entry.id),
            label: `${entry.colourName || entry.baseSku || `#${entry.id}`}${flagged(entry) ? ' !' : ''}`,
          }))}
          onChange={(value) => onColorway(Number(value))}
        />
      </span>
      {sizes.length > 0 ? (
        <span className='flex min-w-0 max-w-full flex-wrap items-center gap-2'>
          <RowLabel>Size</RowLabel>
          <ViewSwitch
            value={String(sizeId ?? '')}
            label='Size'
            className='max-w-full flex-wrap [&_[role=radio]]:h-7'
            options={sizes.map((entry) => ({ value: String(entry.id), label: entry.label }))}
            onChange={(value) => onSize(Number(value))}
          />
        </span>
      ) : null}
    </div>
  );
}

export function CompositionLabelBlock({
  techCard,
  techCardId,
  canEdit,
}: {
  /** Сохранённая карточка (колорвеи, BOM); новая — undefined. */
  techCard: common_TechCard | undefined;
  /** Только у сохранённой карточки есть печать и запись страны. */
  techCardId: number | undefined;
  canEdit: boolean;
}) {
  const { getValues, setValue, control } = useFormContext<TechCardFormData>();
  const qc = useQueryClient();
  const staging = useTechCardStaging();
  const countries = useLabelCountries();
  const undoHistory = useUndoHistory();
  const { canWrite } = usePermissions();

  // ── страна: выбор оператора до сохранения карточки ────────────────────────────────────────
  const [picks, setPicks] = useState<ReadonlyMap<number, string>>(EMPTY_PICKS);
  const [logoHint, setLogoHint] = useState('');
  const model = useCompositionLabel({ techCard, countryPicks: picks, logoUrlHint: logoHint });
  const colorways = model.data?.colorways ?? [];
  const sizes = model.data?.sizes ?? [];
  const orderSizes = useSizeOrdering();
  const orderedSizeIds = orderSizes(sizes.map((entry) => entry.id));
  const orderedSizes = orderedSizeIds
    .map((id) => sizes.find((entry) => entry.id === id))
    .filter((entry): entry is CareLabelSize => !!entry);
  // The LABELS section draws these ribbons on its canvas: first colour with a set, first size.
  const colorwayKey = colorways.map((entry) => entry.id).join(',');
  const sizeKey = orderedSizeIds.join(',');
  const ribbonPages = useMemo(
    () =>
      builtRibbonPages(
        model.plan?.sets,
        colorwayKey ? colorwayKey.split(',').map(Number) : [],
        sizeKey ? sizeKey.split(',').map(Number) : [],
      ),
    [model.plan, colorwayKey, sizeKey],
  );
  usePublishBuiltRibbons(ribbonPages);

  // ── вариант на лентах ─────────────────────────────────────────────────────────────────────
  const [colorwayId, setColorwayId] = useState<number | null>(null);
  const [sizeId, setSizeId] = useState<number | null>(null);
  const colorway = colorways.find((entry) => entry.id === colorwayId) ?? colorways[0];
  const size = orderedSizes.find((entry) => entry.id === sizeId) ?? orderedSizes[0];
  const orientation = model.orientation;
  const setOrientation = (next: LabelOrientation) => {
    setCareLabel(getValues, setValue, { orientation: next });
    const placed = ((getValues('garmentLabels') ?? []) as FormGarmentLabel[]).some((row) =>
      isCompositionLabel(row.key),
    );
    if (placed)
      upsertGarmentLabel(getValues, setValue, COMPOSITION_LABEL_KEY, compositionLabelSize(next), {
        keepBare: true,
      });
  };
  const [jump, setJump] = useState<Jump | null>(null);
  const jumpTo = (line: LineKey | null, part?: PrintedPart) =>
    setJump((current) => ({ n: (current?.n ?? 0) + 1, line, part }));

  const countryName = (code: string) =>
    countries.find((country) => country.code === code)?.name ?? code;
  const titleOf = (id: number) => {
    const entry = colorways.find((candidate) => candidate.id === id);
    return entry?.baseSku || entry?.colourName || `#${id}`;
  };
  // Одна запись в одно сохранение карточки на каждый колорвей с выбранной страной (M-01).
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
  // Снятый блок не оставляет в очереди записей, которых никто не видит.
  useEffect(
    () => () => {
      for (const id of stagedRef.current) staging?.unstage(`colourway:${id}:country`);
    },
    [staging],
  );

  // ── artwork: режим читается из файлов строки ──────────────────────────────────────────────
  const garmentLabels = useWatch({ control, name: 'garmentLabels' }) as
    | FormGarmentLabel[]
    | undefined;
  const bomItems = useWatch({ control, name: 'bomItems' }) as
    | { id?: number; lineKey?: string | null }[]
    | undefined;
  const confirmed = compositionLabelConfirmed(garmentLabels ?? [], bomItems ?? []);
  const files = useMemo(
    () => garmentLabels?.find((row) => isCompositionLabel(row.key))?.files ?? [],
    [garmentLabels],
  );
  const [pending, setPending] = useState<ArtworkChoice | null>(null);
  const choice = artworkChoice(files, pending);
  const built = choice === 'built';
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
    // A choice only ever takes files away: the same length is the same row, nothing to save.
    if (filesAfterChoice(files, next).length === files.length) return;
    writeFiles((current) => filesAfterChoice(current, next));
  };
  // The last own file leaving does not change the mode: the row waits for the next one.
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
  const fileCell =
    choice === 'one' ? ALL_FILE : { colorwayId: colorway?.id ?? 0, sizeId: size?.id ?? 0 };
  const previewFile =
    choice === 'one'
      ? oneFileOf(files)
      : colorway && size
        ? ownFileFor(files, colorway.id, size.id)
        : undefined;

  // ── готовность и количество ───────────────────────────────────────────────────────────────
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

  // ── печать: модалка, в том числе со старого адреса `/care-labels` (`print=1`) ─────────────
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

  // ── шапка: колорвеи без страны и дыры варианта ────────────────────────────────────────────
  const holes = variantHoles(model.readiness, colorway?.id);
  const focusCountry = (id: number) => {
    setColorwayId(id);
    jumpTo('made-in');
  };
  const warnings: HeaderWarning[] = [
    ...colorways
      .filter((entry) => !entry.countryCode && !isUnavailable(entry))
      .map((entry) => ({
        text: `${entry.colourName || entry.baseSku}: no country ›`,
        error: true,
        action: built
          ? { label: 'Choose country', onClick: () => focusCountry(entry.id) }
          : undefined,
      })),
    ...(built
      ? holes
          .filter((h) => h.code !== 'no-country')
          .map((h) => {
            const line = holeLine(h);
            return {
              text: h.message,
              error: isBlocking(h),
              action: line
                ? { label: 'Go to line', onClick: () => jumpTo(line, h.ref.part) }
                : undefined,
            };
          })
      : []),
  ];
  const flagged = (entry: CareLabelColorway) => !entry.countryCode || !!gate?.blocked.has(entry.id);

  return (
    <Section
      title='composition label'
      action={
        <div className='flex items-center gap-3'>
          {canEdit && !confirmed ? (
            <Button
              type='button'
              variant='underline'
              size='xs'
              onClick={() => confirmCompositionLabel(getValues, setValue)}
            >
              confirm
            </Button>
          ) : null}
          <HeaderWarnings items={warnings} />
        </div>
      }
      className='w-full'
    >
      <div className='flex min-w-0 flex-col' data-composition-label=''>
        <FieldRow label='Artwork'>
          <ViewSwitch
            value={built ? 'built' : 'own'}
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
        {choice !== 'one' && colorways.length > 0 ? (
          <VariantSwitch
            colorways={colorways}
            sizes={orderedSizes}
            colorwayId={colorway?.id}
            sizeId={size?.id}
            flagged={flagged}
            onColorway={setColorwayId}
            onSize={setSizeId}
          />
        ) : null}
        {built ? (
          <CompositionEditor
            techCardId={techCardId}
            canEdit={canEdit}
            model={model}
            countries={countries}
            picks={picks}
            setPicks={setPicks}
            setLogoHint={setLogoHint}
            colorway={colorway}
            size={size}
            holes={holes}
            jump={jump}
          />
        ) : (
          <div className='pb-1.5 pt-3.5'>
            <OwnFilePreview
              file={previewFile}
              orientation={orientation}
              canEdit={canEdit}
              onChoose={() => openChooser(fileCell)}
              onClear={() => clearFile(fileCell)}
            />
          </div>
        )}
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
            variant='underline'
            size='xs'
            disabled={!techCardId}
            onClick={() => setPrinting(true)}
          >
            print labels
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
          onTotalChange={setModalTotal}
          onClose={() => setPrinting(false)}
          onChooseFile={(cell) => {
            setPrinting(false);
            openChooser(cell);
          }}
          onFixText={() => {
            setPrinting(false);
            const first = colorways.find((entry) => gate?.blocked.has(entry.id));
            if (first) setColorwayId(first.id);
            if (built) jumpTo(null);
          }}
        />
      ) : null}
    </Section>
  );
}

type EditorProps = {
  techCardId: number | undefined;
  canEdit: boolean;
  model: CompositionLabelModel;
  countries: readonly Country[];
  picks: ReadonlyMap<number, string>;
  setPicks: Dispatch<SetStateAction<ReadonlyMap<number, string>>>;
  setLogoHint: (url: string) => void;
  colorway: CareLabelColorway | undefined;
  size: CareLabelSize | undefined;
  /** Дыры варианта, блокирующие первыми. */
  holes: readonly Hole[];
  jump: Jump | null;
};

/** Ленты выбранного варианта с дверями правки, прямо в блоке. */
function CompositionEditor({
  techCardId,
  canEdit,
  model,
  countries,
  picks,
  setPicks,
  setLogoHint,
  colorway: cw,
  size,
  holes,
  jump,
}: EditorProps) {
  const { getValues, setValue, control } = useFormContext<TechCardFormData>();
  const careLabel = useWatch({ control, name: 'careLabel' }) as FormCareLabel | undefined;
  const { canWrite } = usePermissions();
  const canStyle = canWrite(SECTION.products);
  const { shaper } = useShaper();
  const { data, plan, readiness, orientation } = model;
  const vertical = orientation === 'vertical';
  const colorways = data?.colorways ?? [];

  // ── одна открытая правка; смена варианта закрывает её в ТОМ ЖЕ рендере ─────────────────────
  // Снимаясь, полоса пишет недописанное в тот колорвей, в котором его начали.
  const [open, setOpen] = useState<Open>(null);
  const variant = `${cw?.id ?? 0}|${size?.id ?? 0}|${orientation}`;
  const [seenVariant, setSeenVariant] = useState(variant);
  if (seenVariant !== variant) {
    setSeenVariant(variant);
    setOpen(null);
  }

  // The picker offers active countries only; a stored code still resolves to its name when inactive.
  const pickableCountries = useMemo(() => countries.filter((c) => c.active), [countries]);
  // WORKSHOP COUNTRY OF ORIGIN (0414) — a SUGGESTION for a colourway with no country, never a pick.
  // «Made in» is legal text: the suggestion is shown on the ribbon and in the strip, but it only
  // becomes a staged write when a person confirms it.
  const { data: workshopData } = useWorkshopSettings();
  const workshopCountryCode = (workshopData?.settings?.countryOfOrigin ?? '').trim().toUpperCase();
  const workshopCountry = workshopCountryCode
    ? pickableCountries.find((c) => c.code === workshopCountryCode)
    : undefined;

  const othersWithout = cw
    ? colorways.filter(
        (c) => c.id !== cw.id && !c.countryCode && !picks.has(c.id) && !isUnavailable(c),
      ).length
    : 0;
  const pickCountry = (code: string, alsoOthers: boolean) => {
    if (!cw) return;
    setPicks((current) => {
      const next = new Map(current);
      next.set(cw.id, code);
      if (alsoOthers)
        for (const c of colorways)
          if (c.id !== cw.id && !c.countryCode && !next.has(c.id) && !isUnavailable(c))
            next.set(c.id, code);
      return next;
    });
  };

  // ── ленты выбранного варианта ────────────────────────────────────────────────────────────
  const sku = cw ? labelSku(cw, size) : '';
  const set = cw ? plan?.sets.get(cw.id) : undefined;
  const madeW = useMemo(() => {
    const country = cw?.countryName?.trim().toUpperCase();
    if (!country || !shaper) return null;
    try {
      return textWidth(shaper, `MADE IN ${country}`, 'en', L.PT);
    } catch {
      return null;
    }
  }, [shaper, cw?.countryName]);
  const address = addressLines(data);
  const caption = captionLines(data);
  const symbols = (data?.care.codes ?? []).filter(hasCareArtwork).length;

  const rows = useMemo<RowModel[]>(() => {
    if (!set || !size) return [];
    const out: RowModel[] = [];
    const { face, back } = previewASides(set, size.id);
    const a: SideModel[] = [];
    if (face)
      a.push({
        key: 'A-face',
        row: 'A',
        role: 'face',
        caption: 'A face',
        doc: face.side.doc,
        seam: face.side.report.seam,
        regions: aFaceRegions(face.side.report.seam, madeW, {
          proseLines: face.side.report.lines,
          symbols,
        }),
        text: [
          `${sku} / ${cw?.colourName.toUpperCase()} / [${size.label}]`,
          cw?.countryName ? `MADE IN ${cw.countryName.toUpperCase()}` : '',
        ]
          .filter(Boolean)
          .join(' · '),
      });
    if (back)
      a.push({
        key: 'A-back',
        row: 'A',
        role: 'back',
        caption: 'A back',
        doc: back.side.doc,
        seam: back.side.report.seam,
        // The vertical back wraps the address to its 26 mm column: the report counts the lines.
        regions: aBackRegions(
          back.side.report.seam,
          vertical ? back.side.report.lines : address.length,
        ),
        text: [...caption, ...address].join(' · '),
      });
    if (a.length) out.push({ label: 'A', sides: a });

    // Ленты состава: столько, сколько сверстал движок (B, B2 …), лицо и изнанка каждой.
    const byLabel = new Map<string, PlannedSide[]>();
    for (const p of set.sides.values()) {
      if (p.label === 'A') continue;
      byLabel.set(p.label, [...(byLabel.get(p.label) ?? []), p]);
    }
    const labels = [...byLabel.keys()].sort(
      (x, y) => Number(x.slice(1) || 1) - Number(y.slice(1) || 1),
    );
    const blankNote = vertical ? ' · blank' : ' · printed blank';
    for (const label of labels) {
      const sides = byLabel
        .get(label)!
        .sort((x, y) => (x.role === y.role ? 0 : x.role === 'face' ? -1 : 1))
        .map<SideModel>((p) => ({
          key: `${label}-${p.role}`,
          row: label,
          role: p.role,
          caption: `${label} ${p.role}${p.side.report.empty ? blankNote : ''}`,
          doc: p.side.doc,
          seam: p.side.report.seam,
          blank: p.side.report.empty,
          regions: bRegions(p.side.report),
          text: p.side.report.columns.map((c) => LABEL_PART_NAME[c.part]).join(' · '),
        }));
      out.push({ label, sides });
    }
    if (!labels.length) {
      const faceSeam = seamFor(set.mode, 'face', orientation);
      out.push({
        label: 'B',
        sides: [
          {
            key: 'B-face',
            row: 'B',
            role: 'face',
            caption: 'B face · empty',
            doc: null,
            seam: faceSeam,
            regions: bEmptyRegions(faceSeam),
          },
          {
            key: 'B-back',
            row: 'B',
            role: 'back',
            caption: `B back${blankNote}`,
            doc: null,
            seam: seamFor(set.mode, 'back', orientation),
            blank: true,
            regions: [],
          },
        ],
      });
    }
    return out;
    // sku / cw / address / caption read the same render's selection as `set`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    set,
    size,
    madeW,
    symbols,
    orientation,
    cw?.colourName,
    cw?.countryName,
    address.length,
    caption.join('|'),
  ]);
  const bLabels = rows.filter((r) => r.label !== 'A' && r.sides.some((s) => s.doc));
  const allSides = rows.flatMap((r) => r.sides);

  // ── ширина: стороны сжимаются до ширины блока ─────────────────────────────────────────────
  const workRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = workRef.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const twoUp = width >= TWO_UP_MIN;
  const pad = twoUp ? BENCH_PAD : NARROW_PAD;
  // Горизонтальная лента: пара рядом, на узком экране стороны одна под другой.
  const hZoom = Math.min(2, (twoUp ? (width - GAP - 2 * pad) / 2 : width - 2 * pad) / RIBBON_PX);
  // Вертикальная: все стороны одним рядом колонок; не влезли — переносятся рядами.
  const vAvail = width - 2 * pad;
  const vCols = Math.max(
    1,
    Math.min(allSides.length, Math.floor((vAvail + GAP) / (V_COL_MIN + GAP))),
  );
  const vColW = Math.min(V_COL_MAX, (vAvail - (vCols - 1) * GAP) / vCols);
  const vZoom = vColW / RIBBON_V_PX;

  const doors = useRef(new Map<string, HTMLButtonElement>());
  const refFor = (side: string) => (key: string) => (el: HTMLButtonElement | null) => {
    if (el) doors.current.set(`${side}|${key}`, el);
    else doors.current.delete(`${side}|${key}`);
  };
  const close = () => {
    const was = open;
    setOpen(null);
    if (was)
      requestAnimationFrame(() =>
        doors.current.get(`${was.side}|${was.key}`)?.focus({ preventScroll: true }),
      );
  };
  const bCountAtOpen = useRef(0);
  const openRegion = (side: string, key: string) => {
    if (open?.side === side && open.key === key) return close();
    if (key.startsWith('composition')) bCountAtOpen.current = bLabels.length;
    setOpen({ side, key });
  };
  // Открытая дверь исчезла: колонка ушла на другую сторону или ленту (правка состава поменяла
  // перелив), либо её часть удалили. Правка состава при этом остаётся открытой — у той же части,
  // где бы она теперь ни стояла, иначе у первой колонки состава; прочие полосы закрываются.
  const openSide = open ? allSides.find((s) => s.key === open.side) : undefined;
  const openRegionModel = open ? openSide?.regions.find((r) => r.key === open.key) : undefined;
  useEffect(() => {
    if (!open || !rows.length || openRegionModel) return;
    if (!open.key.startsWith('composition')) return setOpen(null);
    const same = allSides.find((sd) => sd.regions.some((r) => r.key === open.key));
    const any = allSides.find((sd) => sd.regions.some((r) => r.line === 'composition'));
    const key = same ? open.key : any?.regions.find((r) => r.line === 'composition')?.key;
    const side = same ?? any;
    setOpen(side && key ? { side: side.key, key } : null);
    // allSides is derived from rows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open?.key, open?.side, openRegionModel, rows]);

  // ── дыры → двери ──────────────────────────────────────────────────────────────────────────
  // Дыра состава без части садится на одну колонку, а не на все: «вторая лента» — на первую
  // колонку последней ленты (B2 …), прочие — на первую колонку состава.
  const compositionDoors = allSides.flatMap((sd) =>
    sd.regions.filter((r) => r.line === 'composition'),
  );
  const lastB = bLabels
    .at(-1)
    ?.sides.flatMap((sd) => sd.regions.filter((r) => r.line === 'composition'));
  const anchorOf = (h: Hole) =>
    (h.code === 'third-label' ? lastB?.[0] : undefined) ?? compositionDoors[0];
  const holesOf = (r: Region): Hole[] =>
    holes.filter((h) => {
      if (holeLine(h) !== r.line) return false;
      if (r.line !== 'composition') return true;
      if (h.ref.part && r.part) return h.ref.part === r.part;
      return anchorOf(h)?.key === r.key;
    });
  const levelOf = (hs: Hole[]): 'block' | 'warn' | null =>
    hs.some(isBlocking) ? 'block' : hs.length ? 'warn' : null;

  const cwOverride = careLabel?.colorways?.find((c) => c.colorwayId === cw?.id);
  const derivedParts = useMemo(() => {
    if (!cw || !readiness) return [];
    return readiness.colorways.find((r) => r.colorwayId === cw.id)?.composition.parts ?? [];
  }, [cw, readiness]);
  const qr = data?.label.qr ?? { qrPreset: 'storefront' as const, qrTemplate: '' };
  const qrExampleUrl = data && cw ? qrExample(data, cw, size) : '';
  const logoCustom = wireInt(careLabel?.logoMediaId) > 0;
  const g = getValues;
  const s = setValue;
  const edit = canEdit;
  const picked = cw ? picks.get(cw.id) : undefined;
  // По КОДУ, не по имени: код, которого нет в словаре, даёт пустое имя, но страна на этикетке задана —
  // предложение мастерской затёрло бы юридическое происхождение.
  const suggested = cw && !cw.countryCode && !picked ? workshopCountry : undefined;

  const overriddenOf = (line: LineKey): boolean => {
    switch (line) {
      case 'logo':
        return logoCustom;
      case 'product':
        return !!cw?.colourNameOverridden;
      case 'care-text':
        return !!data?.care.proseOverridden;
      case 'composition':
        return !!cw?.fiberOverride;
      case 'qr':
        return qr.qrPreset !== 'storefront';
      case 'caption':
        return (data?.label.caption.length ?? 0) > 0;
      case 'address':
        return (data?.label.address.length ?? 0) > 0;
      default:
        return false;
    }
  };

  const viewOf = (side: SideModel, r: Region): RegionView => {
    const hs = holesOf(r);
    const selected = open?.side === side.key && open.key === r.key;
    const base = { ...r, overridden: overriddenOf(r.line), hole: levelOf(hs), selected };
    const partName = r.part ? LABEL_PART_NAME[r.part] : '';
    const readOnly = !edit ? 'read only' : undefined;
    switch (r.line) {
      case 'logo':
        return {
          ...base,
          label: `logo: ${logoCustom ? 'your SVG' : 'the GRBPWR mark'}, click to change`,
          disabled: !edit,
          title: readOnly,
        };
      case 'product':
        return {
          ...base,
          label: `colour name: ${cw?.colourName || 'empty'}, click to change`,
          disabled: !edit || !cw,
          title: readOnly,
        };
      case 'care-text':
        return {
          ...base,
          label: `care text: ${(data?.care.prose ?? []).join(' ') || 'empty'}, click to change`,
          disabled: !edit,
          title: readOnly,
        };
      case 'care-symbols':
        return {
          ...base,
          label: 'care symbols, click to change',
          disabled: !edit,
          title: readOnly,
        };
      case 'made-in': {
        const unavailable = !!cw && isUnavailable(cw);
        const title = unavailable
          ? 'loading the colourway…'
          : !techCardId
            ? 'save the card first'
            : readOnly;
        return {
          ...base,
          label: cw?.countryName
            ? `made in ${cw.countryName}`
            : suggested
              ? `made in: country missing, the workshop suggests ${suggested.name}, click to confirm`
              : 'made in: country missing, click to set it',
          disabled: !edit || !techCardId || unavailable,
          title,
          placeholder: !cw?.countryName ? (
            <span
              className={`flex h-full items-center whitespace-nowrap px-1 text-nano uppercase leading-none text-error ${vertical ? 'justify-center' : 'justify-end'}`}
            >
              {suggested ? `! confirm ${suggested.code}` : '! set country'}
            </span>
          ) : null,
        };
      }
      case 'composition':
        return {
          ...base,
          label: partName
            ? `composition, ${partName}: click to change`
            : 'composition: click to write it',
          disabled: !edit || !cw,
          title: readOnly,
          placeholder: !r.part ? (
            <span className='flex h-full items-center justify-center text-center text-nano uppercase text-labelColor'>
              no composition
            </span>
          ) : null,
        };
      case 'qr':
        return {
          ...base,
          label: `QR link: ${qrExampleUrl || 'empty'}, click to change`,
          disabled: !edit,
          title: readOnly,
        };
      case 'caption':
        return {
          ...base,
          label: `back caption: ${caption.join(' / ')}, click to change`,
          disabled: !edit,
          title: readOnly,
        };
      case 'address':
        return {
          ...base,
          label: `address: ${address.join(', ')}, click to change`,
          disabled: !edit,
          title: readOnly,
        };
    }
  };

  // ── полоса правки открытой двери ──────────────────────────────────────────────────────────
  const editorFor = (side: SideModel, r: Region): ReactNode => {
    const common = {
      line: r.line,
      name: NAME[r.line],
      where: sideName(side.key),
      source: SOURCE[r.line],
      overridden: overriddenOf(r.line),
      holes: holesOf(r),
    };
    const key = `${cw?.id}|${side.key}|${r.key}`;
    switch (r.line) {
      case 'logo':
        return (
          <EditorStrip
            key={key}
            {...common}
            resetTitle='the GRBPWR mark'
            onReset={() => setCareLabel(g, s, { logoMediaId: 0 })}
          >
            <LogoEditor
              url={model.logoUrl}
              custom={logoCustom}
              disabled={!edit}
              onPick={(m: common_MediaFull) => {
                if (!m.id) return;
                setLogoHint(m.media?.fullSize?.mediaUrl || '');
                setCareLabel(g, s, { logoMediaId: m.id });
              }}
            />
          </EditorStrip>
        );
      case 'product':
        if (!cw) return null;
        return (
          <EditorStrip
            key={key}
            {...common}
            resetTitle={cw.colourNameDerived || 'the colourway name'}
            onReset={() => setCareLabelColorway(g, s, cw.id, { colourName: '' })}
          >
            <div className='flex flex-wrap items-center gap-x-3 gap-y-2 uppercase'>
              <span className='text-labelColor'>{sku || 'no SKU'}</span>
              <span className='text-labelColor'>/</span>
              <div className='w-60 max-w-full'>
                <DraftInput
                  ariaLabel='colour name on the label'
                  value={cw.colourName}
                  placeholder={cw.colourNameDerived || 'colour name'}
                  maxLength={64}
                  onCommit={(t) =>
                    setCareLabelColorway(g, s, cw.id, {
                      colourName: colourNameOverride(t, cw.colourNameDerived),
                    })
                  }
                  onClose={close}
                />
              </div>
              <span className='text-labelColor'>/ [{size?.label ?? <EmptyCell />}]</span>
            </div>
          </EditorStrip>
        );
      case 'care-symbols':
        return (
          <EditorStrip key={key} {...common}>
            <CareSymbolsEditor
              disabled={!edit || !canStyle}
              reason={!canStyle ? 'care is a style fact: needs products:write' : undefined}
            />
          </EditorStrip>
        );
      case 'care-text':
        return (
          <EditorStrip
            key={key}
            {...common}
            resetTitle='the dictionary prose'
            onReset={() => setCareLabel(g, s, { careProseLines: [] })}
          >
            <div className='max-w-xl'>
              <DraftLines
                ariaLabel='care text on the label'
                lines={data?.care.prose ?? []}
                rows={3}
                placeholder='care text'
                onCommit={(t) =>
                  setCareLabel(g, s, {
                    careProseLines: linesOverride(t, data?.care.derivedProse ?? []),
                  })
                }
                onClose={close}
              />
            </div>
          </EditorStrip>
        );
      case 'made-in':
        if (!cw) return null;
        return (
          <EditorStrip
            key={key}
            {...common}
            source={picked ? 'staged' : cw.countryName ? 'from colourway' : 'missing'}
          >
            <MadeInValue
              countryName={cw.countryName}
              pickedCode={picked}
              unavailable={isUnavailable(cw)}
              countries={pickableCountries}
              othersWithout={othersWithout}
              suggested={suggested}
              disabled={!edit || !techCardId}
              onPick={pickCountry}
            />
          </EditorStrip>
        );
      case 'composition': {
        if (!cw) return null;
        const now = bLabels.length;
        return (
          <EditorStrip
            key={`${cw.id}|composition`}
            {...common}
            resetTitle='the composition from the BOM'
            onReset={() => {
              setOpen(null);
              setCareLabelColorway(g, s, cw.id, { fibers: [] });
            }}
          >
            {now !== bCountAtOpen.current ? (
              <Text size='micro' variant='label' data-b-count-note=''>
                now {now} B {now === 1 ? 'label' : 'labels'}
              </Text>
            ) : null}
            <FocusPart part={r.part} />
            <div className='max-w-2xl'>
              <FibreEditor
                initial={
                  cwOverride?.fibers?.length
                    ? fibersFromForm(cwOverride.fibers)
                    : overrideRowsOf(derivedParts)
                }
                fibers={data?.fibers ?? new Map()}
                otherCount={colorways.length - 1}
                onChange={(next, all) =>
                  writeComposition(g, s, all ? colorways.map((c) => c.id) : [cw.id], next)
                }
                onDone={close}
              />
            </div>
          </EditorStrip>
        );
      }
      case 'qr':
        return (
          <EditorStrip
            key={key}
            {...common}
            resetTitle='the storefront link'
            onReset={() => setCareLabel(g, s, { qrPreset: '', qrTemplate: '' })}
          >
            <QrEditor
              preset={qr.qrPreset}
              template={careLabel?.qrTemplate ?? ''}
              example={qrExampleUrl}
              disabled={!edit}
              onChange={(p) => setCareLabel(g, s, p)}
              onDone={close}
            />
          </EditorStrip>
        );
      case 'caption':
        return (
          <EditorStrip
            key={key}
            {...common}
            resetTitle={QR_CAPTION.join(' / ')}
            onReset={() => setCareLabel(g, s, { backCaptionLines: [] })}
          >
            <div className='max-w-md'>
              <DraftLines
                ariaLabel='QR caption on the label back'
                lines={caption}
                rows={2}
                onCommit={(t) =>
                  setCareLabel(g, s, { backCaptionLines: linesOverride(t, QR_CAPTION) })
                }
                onClose={close}
              />
            </div>
          </EditorStrip>
        );
      case 'address':
        return (
          <EditorStrip
            key={key}
            {...common}
            resetTitle='the company address'
            onReset={() => setCareLabel(g, s, { addressLines: [] })}
          >
            <div className='max-w-md'>
              <DraftLines
                ariaLabel='address on the label back'
                lines={address}
                rows={3}
                onCommit={(t) =>
                  setCareLabel(g, s, { addressLines: linesOverride(t, COMPANY_ADDRESS) })
                }
                onClose={close}
              />
            </div>
          </EditorStrip>
        );
    }
  };

  // ── шапка просит открыть дверь: колорвей без страны, дыра, «fix text» печати ────────────────
  const goTo = (wanted: LineKey | null, wantedPart?: PrintedPart) => {
    const first = wanted ? undefined : holes.find((h) => holeLine(h));
    const line = wanted ?? (first ? holeLine(first) : null);
    const part = wanted ? wantedPart : first?.ref.part;
    if (!line) return;
    const match = (r: Region) => r.line === line && (!part || !r.part || r.part === part);
    const side = allSides.find((sd) => sd.regions.some(match));
    const region = side?.regions.find(match);
    if (!side || !region) return;
    if (!viewOf(side, region).disabled) {
      if (line === 'composition') bCountAtOpen.current = bLabels.length;
      setOpen({ side: side.key, key: region.key });
    }
    requestAnimationFrame(() => {
      const door = doors.current.get(`${side.key}|${region.key}`);
      door?.scrollIntoView({ block: 'center' });
      const field =
        line === 'made-in'
          ? workRef.current?.querySelector<HTMLElement>(
              '[data-region-editor] [role=combobox], [data-region-editor] input',
            )
          : null;
      (field ?? door)?.focus({ preventScroll: true });
    });
  };
  const handledJump = useRef(jump?.n ?? 0);
  useEffect(() => {
    if (!jump || jump.n === handledJump.current || !rows.length || !width) return;
    handledJump.current = jump.n;
    goTo(jump.line, jump.part);
    // goTo reads the same render's sides and holes; a new request or the first ribbons move it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jump?.n, rows, width]);

  // ── вёрстка ───────────────────────────────────────────────────────────────────────────────
  const onStripKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' && e.currentTarget.contains(e.target as Node)) {
      e.preventDefault();
      close();
    }
  };

  /**
   * Скамья: стороны сеткой на сером, под ней — полоса правки открытой стороны. `inColumn` —
   * полоса в колонке своей стороны (горизонтальная пара), иначе во всю ширину скамьи.
   */
  const bench = (
    key: string,
    row: string,
    sides: SideModel[],
    cols: number,
    zoom: number,
    colW: number,
    inColumn: boolean,
  ) => {
    const grid = {
      gridTemplateColumns: `repeat(${cols}, ${colW}px)`,
      columnGap: GAP,
      rowGap: GAP,
    };
    const openHere = sides.find((sd) => sd.key === open?.side);
    const region = openHere?.regions.find((r) => r.key === open?.key);
    return (
      <div key={key} className='flex min-w-0 flex-col' data-ribbon-row={row}>
        <div className='group/bench bg-pageBg' style={{ padding: pad }} data-bench={row}>
          <div className='grid' style={grid}>
            {sides.map((sd) => (
              <Ribbon
                key={sd.key}
                side={sd}
                zoom={zoom}
                orientation={orientation}
                regions={sd.regions.map((r) => viewOf(sd, r))}
                onOpen={(r) => openRegion(sd.key, r.key)}
                refFor={refFor(sd.key)}
              />
            ))}
          </div>
        </div>
        {openHere && region ? (
          inColumn ? (
            <div className='grid' style={{ ...grid, paddingLeft: pad }} onKeyDown={onStripKey}>
              <div className='min-w-0' style={{ gridColumn: sides.indexOf(openHere) + 1 }}>
                {editorFor(openHere, region)}
              </div>
            </div>
          ) : (
            <div
              className='min-w-0'
              style={{ paddingLeft: pad, paddingRight: pad }}
              onKeyDown={onStripKey}
            >
              {editorFor(openHere, region)}
            </div>
          )
        ) : null}
      </div>
    );
  };

  /** Горизонтальная лента: пара рядом, на узком экране каждая сторона своей скамьёй. */
  const pair = (row: RowModel) =>
    twoUp
      ? [bench(row.label, row.label, row.sides, row.sides.length, hZoom, RIBBON_PX * hZoom, true)]
      : row.sides.map((sd) => bench(sd.key, row.label, [sd], 1, hZoom, RIBBON_PX * hZoom, false));

  const aRow = rows.find((r) => r.label === 'A');
  const bRows = rows.filter((r) => r.label !== 'A');
  const bNames = bLabels.length > 1 ? ` · ${bLabels.map((r) => r.label).join(', ')}` : '';
  const vChunks: SideModel[][] = [];
  for (let i = 0; i < allSides.length; i += vCols) vChunks.push(allSides.slice(i, i + vCols));

  return (
    <div
      ref={workRef}
      className='flex min-w-0 flex-col gap-6 pb-1.5 pt-2'
      data-composition-editor=''
      data-composition-preview=''
    >
      {!cw ? (
        <Text size='micro' variant='label'>
          no colourways
        </Text>
      ) : model.shaperFailed ? (
        <Text size='micro' variant='errorLabel'>
          fonts failed · reload
        </Text>
      ) : rows.length === 0 || width === 0 ? (
        <Text size='micro' variant='label' className='animate-pulse'>
          typesetting…
        </Text>
      ) : vertical ? (
        <div className='flex flex-col'>
          <GroupLabel flush>
            <span data-b-count={bLabels.length}>
              ribbons A · B · main label + composition · 30 × 100 mm{bNames}
            </span>
          </GroupLabel>
          <div className='flex flex-col gap-4 pt-2'>
            {vChunks.map((chunk, i) => bench(`v${i}`, `v${i}`, chunk, vCols, vZoom, vColW, false))}
          </div>
        </div>
      ) : (
        <>
          {aRow ? (
            <div className='flex flex-col'>
              <GroupLabel flush>ribbon A · main label · 100 × 30 mm</GroupLabel>
              <div className='flex flex-col gap-4 pt-2'>{pair(aRow)}</div>
            </div>
          ) : null}
          <div className='flex flex-col'>
            <GroupLabel flush>
              <span data-b-count={bLabels.length}>
                ribbon B · composition · 100 × 30 mm{bNames}
              </span>
            </GroupLabel>
            <div className='flex flex-col gap-4 pt-2'>{bRows.flatMap(pair)}</div>
          </div>
        </>
      )}
    </div>
  );
}

/** Правка состава открывается с частью, по колонке которой щёлкнули, в фокусе. */
function FocusPart({ part }: { part?: string }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    if (!part) return;
    const strip = ref.current?.closest('[data-region-editor]');
    const t = requestAnimationFrame(() => {
      const box = strip?.querySelector<HTMLElement>(`[data-fibre-part='${part}']`);
      const target = box?.querySelector<HTMLElement>('button, input');
      box?.scrollIntoView({ block: 'nearest' });
      target?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(t);
  }, [part]);
  return <span ref={ref} hidden data-focus-part={part ?? ''} />;
}
