import {
  common_CompositionEntry,
  common_Material,
  common_MaterialClass,
  common_MaterialMovement,
  common_MediaFull,
  common_TechCardBomSection,
} from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { MediaPreviewWithSelector } from 'components/managers/media/components/media-preview-with-selector';
import { MediaSlot } from 'components/managers/media/components/media-slot';
import {
  FailNote,
  isRefusal,
  notifyFailure,
} from 'components/managers/production-runs/components/feedback';
import { PHONE_QUERY, useMediaQuery } from 'components/managers/tasks/hooks/useMediaQuery';
import { EXPENSE_CURRENCIES } from 'constants/constants';
import { techCardBomSectionOptions } from 'constants/filter';
import { SECTION } from 'constants/routes';
import { format } from 'date-fns';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { cn } from 'lib/utility';
import {
  Fragment,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MutableRefObject,
  type ReactNode,
} from 'react';
import { Button, ConfirmationModal, EmptyCell, GenericPopover, Input, Select, Text } from 'ui';
import { decimalToInput, inputToDecimal, parseDecimalNumber, sanitizeDecimal } from 'utils/decimal';
import { CompositionWizard, type CompRow } from './composition-wizard';
import { composeArticleFromMaterial } from './material-code';
import {
  classForSection,
  derivedSection,
  materialClassOptions,
  resolveMaterialClass,
  saveErrorMessage,
} from './material-modal';
import { mediaThumbUrl } from './material-thumb';
import {
  AdjustStockModal,
  IssueStockModal,
  ReceiveStockModal,
  type MovementTarget,
} from './movement-modals';
import { resolveMaterialPurpose } from './purpose-options';
import { useAddMaterialPrice, useArchiveMaterial, useSaveMaterial } from './useMaterials';
import { useMaterialMovements, useMaterialStock } from './useWarehouse';
import { movementDelta } from './warehouse-options';

// Runs proceed() at once when the card is clean, else asks «discard changes?» first.
export type ExpandGuard = (proceed: () => void) => void;

type Draft = {
  name: string;
  supplier: string;
  section: common_TechCardBomSection;
  materialClass: common_MaterialClass;
  width: string;
  weight: string;
  unit: string;
  price: string;
  currency: string;
  composition: CompRow[];
  imageId: number;
  // Preview only (never compared, never sent): the server resolves `image` from `imageId`.
  image?: common_MediaFull;
};

type TextKey = 'name' | 'supplier' | 'width' | 'weight' | 'price';
type Move = 'receive' | 'issue' | 'adjust';

const FABRIC: common_MaterialClass = 'MATERIAL_CLASS_FABRIC';
const HARDWARE: common_MaterialClass = 'MATERIAL_CLASS_HARDWARE';
const THREAD: common_MaterialClass = 'MATERIAL_CLASS_THREAD';
const PACKAGING: common_MaterialClass = 'MATERIAL_CLASS_PACKAGING';
const OTHER: common_MaterialClass = 'MATERIAL_CLASS_OTHER';

// Width and weight live in the typed attrs of the class; a class without one shows a dash.
// Hardware's width is its diameter (Ø); packaging's is the free-text dimensions.
type Measure = { unit: string; prefix?: string; text?: boolean };
const WIDTH: Partial<Record<common_MaterialClass, Measure>> = {
  [FABRIC]: { unit: 'cm' },
  [HARDWARE]: { unit: 'mm', prefix: 'Ø' },
  [PACKAGING]: { unit: '', text: true },
};
const WEIGHT: Partial<Record<common_MaterialClass, Measure>> = {
  [FABRIC]: { unit: 'g/m²' },
  [PACKAGING]: { unit: 'g/m²' },
  [HARDWARE]: { unit: 'g' },
};
const UNITS = ['m', 'pcs', 'kg'];
const MOVES: Move[] = ['receive', 'issue', 'adjust'];

// Legacy rows without typed attrs keep width/weight in the flat fields (same rule as the modal).
function widthOf(m: common_Material, cls: common_MaterialClass): string {
  switch (cls) {
    case FABRIC:
      return decimalToInput(m.fabricAttrs ? m.fabricAttrs.widthCm : m.fabricWidth);
    case HARDWARE:
      return decimalToInput(m.hardwareAttrs?.diameterMm);
    case PACKAGING:
      return m.packagingAttrs?.dimensions ?? '';
    default:
      return '';
  }
}

function weightOf(m: common_Material, cls: common_MaterialClass): string {
  switch (cls) {
    case FABRIC:
      return decimalToInput(m.fabricAttrs ? m.fabricAttrs.weightGsm : m.fabricWeightGsm);
    case HARDWARE:
      return decimalToInput(m.hardwareAttrs?.weightG);
    case PACKAGING:
      return decimalToInput(m.packagingAttrs?.gsm);
    default:
      return '';
  }
}

function draftOf(m: common_Material): Draft {
  const cls = resolveMaterialClass(m);
  return {
    name: m.name ?? '',
    supplier: m.supplier ?? '',
    section: m.section ?? 'TECH_CARD_BOM_SECTION_FABRIC',
    materialClass: cls,
    width: widthOf(m, cls),
    weight: weightOf(m, cls),
    unit: m.unit ?? '',
    price: decimalToInput(m.latestPrice?.price),
    currency: m.latestPrice?.currency?.trim() || 'EUR',
    composition: (m.compositionEntries ?? []).map((e) => ({
      fiberCode: e.fiberCode ?? '',
      percent: decimalToInput(e.percent),
    })),
    imageId: m.imageId ?? 0,
    image: m.image,
  };
}

const filledRows = (rows: CompRow[]) => rows.filter((r) => r.fiberCode || r.percent.trim());

const sameComposition = (a: CompRow[], b: CompRow[]) =>
  a.length === b.length &&
  a.every((r, i) => r.fiberCode === b[i].fiberCode && r.percent === b[i].percent);

const materialChanged = (d: Draft, b: Draft) =>
  d.name !== b.name ||
  d.supplier !== b.supplier ||
  d.section !== b.section ||
  d.materialClass !== b.materialClass ||
  d.width !== b.width ||
  d.weight !== b.weight ||
  d.unit !== b.unit ||
  d.imageId !== b.imageId ||
  !sameComposition(d.composition, b.composition);

const priceChanged = (d: Draft, b: Draft) => d.price !== b.price || d.currency !== b.currency;

// Same checks as MaterialModal.submit, in short words.
function problemOf(d: Draft, priceDirty: boolean): string | null {
  if (!d.name.trim()) return 'name required';
  const rows = filledRows(d.composition);
  if (rows.length) {
    if (!rows.every((r) => r.fiberCode && parseDecimalNumber(r.percent) > 0)) {
      return 'fibre incomplete';
    }
    if (new Set(rows.map((r) => r.fiberCode)).size !== rows.length) return 'fibre listed twice';
    const total = rows.reduce((s, r) => {
      const n = parseDecimalNumber(r.percent);
      return s + (Number.isFinite(n) ? n : 0);
    }, 0);
    if (Math.abs(total - 100) > 0.01) return `composition ${Number(total.toFixed(2))}%`;
  }
  if (priceDirty && !(parseDecimalNumber(d.price) >= 0)) return 'price required';
  return null;
}

// The FULL material: the loaded row with only the edited fields replaced, mapped exactly like
// MaterialModal.submit (read-only fields cleared, attrs only for the current class).
function payloadOf(m: common_Material, d: Draft): common_Material {
  const cls = d.materialClass;
  const compositionEntries: common_CompositionEntry[] = filledRows(d.composition).map((r) => ({
    fiberCode: r.fiberCode,
    name: undefined,
    percent: inputToDecimal(r.percent),
    source: undefined,
  }));
  return {
    ...m,
    name: d.name.trim(),
    section: derivedSection(cls) ?? d.section,
    supplier: d.supplier.trim(),
    supplierRef: m.supplierRef ?? '',
    supplierId: m.supplierId ?? 0,
    leadTimeDays: m.leadTimeDays ?? 0,
    composition: m.composition ?? '',
    spec: m.spec ?? '',
    unit: d.unit.trim(),
    // Server-computed or history-backed: never written from here.
    unitCode: undefined,
    latestPrice: undefined,
    image: undefined,
    fabricWidth: undefined,
    fabricWeightGsm: undefined,
    // Three-state fields: absent on the wire = the server keeps the stored value.
    cuttingCoefficient: undefined,
    fabricThicknessMm: undefined,
    archived: m.archived ?? false,
    imageId: d.imageId,
    materialClass: cls,
    fabricAttrs:
      cls === FABRIC
        ? {
            ...(m.fabricAttrs ?? {
              widthCm: m.fabricWidth,
              weightGsm: m.fabricWeightGsm,
              fabricDirection: '',
              shrinkagePct: undefined,
              rollLengthM: undefined,
              selvedgeCm: undefined,
            }),
            widthCm: inputToDecimal(d.width),
            weightGsm: inputToDecimal(d.weight),
          }
        : undefined,
    hardwareAttrs:
      cls === HARDWARE
        ? {
            ...(m.hardwareAttrs ?? {
              diameterMm: undefined,
              dimensions: '',
              finish: '',
              baseMaterial: '',
              weightG: undefined,
            }),
            diameterMm: inputToDecimal(d.width),
            weightG: inputToDecimal(d.weight),
          }
        : undefined,
    threadAttrs:
      cls === THREAD
        ? m.threadAttrs ?? { ticketTex: '', lengthPerConeM: undefined, needleReco: '' }
        : undefined,
    packagingAttrs:
      cls === PACKAGING
        ? {
            ...(m.packagingAttrs ?? {
              substrate: '',
              dimensions: '',
              gsm: undefined,
              printMethod: '',
            }),
            dimensions: d.width.trim(),
            gsm: inputToDecimal(d.weight),
          }
        : undefined,
    otherAttrs: cls === OTHER ? (m.otherAttrs ?? '').trim() : '',
    lockVersion: m.lockVersion ?? 0,
    compositionEntries,
    purpose: resolveMaterialPurpose(m.purpose),
  };
}

// `+12 · 02.10` — signed with a true minus, like the movements ledger.
function lastMoveLabel(mv?: common_MaterialMovement): string {
  if (!mv) return '';
  const delta = (
    movementDelta(mv.onHandBefore?.value, mv.onHandAfter?.value) || decimalToInput(mv.quantity)
  ).replace(/^-/, '−');
  const at = mv.occurredAt ? new Date(mv.occurredAt) : null;
  const day = at && !Number.isNaN(at.getTime()) ? format(at, 'dd.MM') : '';
  return [delta, day].filter(Boolean).join(' · ');
}

const percentLabel = (raw: string) => {
  const n = parseDecimalNumber(raw);
  return Number.isFinite(n) ? String(Number(n.toFixed(2))) : raw;
};

function Cell({
  label,
  subLabel,
  phone,
  className,
  children,
}: {
  label: string;
  subLabel?: string;
  phone: boolean;
  className?: string;
  children: ReactNode;
}) {
  if (phone) {
    return (
      <div className='flex min-h-11 min-w-0 border-b border-hairline last:border-b-0'>
        <div className='flex h-11 w-24 shrink-0 flex-col justify-center px-2'>
          <Text component='span' size='micro' variant='label' className='block truncate'>
            {label}
          </Text>
          {subLabel ? (
            <Text
              component='span'
              size='nano'
              variant='label'
              className='block truncate tabular-nums'
            >
              {subLabel}
            </Text>
          ) : null}
        </div>
        <div className='flex h-11 min-w-0 flex-1'>{children}</div>
      </div>
    );
  }
  return (
    <div className={cn('flex min-w-0 flex-col gap-1', className)}>
      <div className='flex min-w-0 items-baseline gap-2'>
        <Text component='span' size='micro' variant='label' className='truncate'>
          {label}
        </Text>
        {subLabel ? (
          <Text component='span' size='nano' variant='label' className='truncate tabular-nums'>
            {subLabel}
          </Text>
        ) : null}
      </div>
      <div className='flex h-10 min-w-0'>{children}</div>
    </div>
  );
}

export function MaterialExpand({
  material,
  onClose,
  guardRef,
}: {
  material: common_Material;
  onClose: () => void;
  guardRef: MutableRefObject<ExpandGuard | null>;
}) {
  const phone = useMediaQuery(PHONE_QUERY);
  const { canWrite, canReadCosting, canWriteCosting } = usePermissions();
  const canEdit = canWrite(SECTION.techCards);
  const canEditPrice = canEdit && canReadCosting && canWriteCosting;
  const { dictionary } = useDictionary();

  const saveMaterial = useSaveMaterial();
  const addPrice = useAddMaterialPrice();
  const archive = useArchiveMaterial();
  const busy = saveMaterial.isPending || addPrice.isPending;

  const base = useMemo(() => draftOf(material), [material]);
  // null = pristine: the card follows the loaded material (and its refetches) as is.
  const [draft, setDraft] = useState<Draft | null>(null);
  const [fail, setFail] = useState<string | null>(null);
  const [pending, setPending] = useState<(() => void) | null>(null);
  const [compOpen, setCompOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [move, setMove] = useState<Move | null>(null);

  const [shownId, setShownId] = useState(material.id);
  if (shownId !== material.id) {
    setShownId(material.id);
    setDraft(null);
    setFail(null);
  }

  const d = draft ?? base;
  const cls = d.materialClass;
  const materialDirty = materialChanged(d, base);
  const priceDirty = canEditPrice && priceChanged(d, base);
  const dirty = draft !== null && (materialDirty || priceDirty);

  const patch = (p: Partial<Draft>) => setDraft((cur) => ({ ...(cur ?? base), ...p }));
  const reset = () => {
    setDraft(null);
    setFail(null);
  };

  // Mirrors MaterialModal.changeClass: 1:1 classes derive the section; fabric/other keep it when it
  // belongs to the family, else fall back. Width/weight follow the stored attrs of the new class.
  const changeClass = (next: common_MaterialClass) => {
    const derived = derivedSection(next);
    const section =
      derived ??
      (classForSection(d.section) === next
        ? d.section
        : next === FABRIC
          ? 'TECH_CARD_BOM_SECTION_FABRIC'
          : 'TECH_CARD_BOM_SECTION_TRIM');
    patch({
      materialClass: next,
      section,
      width: widthOf(material, next),
      weight: weightOf(material, next),
    });
  };

  const pristineOf = (key: TextKey) =>
    key === 'width'
      ? widthOf(material, cls)
      : key === 'weight'
        ? weightOf(material, cls)
        : base[key];

  const subject = (d.name.trim() || material.name || `MATERIAL ${material.id}`).toUpperCase();

  const save = () => {
    if (!canEdit || busy || !dirty) return;
    const problem = problemOf(d, priceDirty);
    if (problem) {
      setFail(problem);
      return;
    }
    setFail(null);
    const snapshot = d;
    const postPrice = () => {
      if (!priceDirty) {
        setDraft(null);
        return;
      }
      // Price is a history: a new NET (ex-VAT) entry from today, like the prices modal adds.
      addPrice.mutate(
        {
          materialId: material.id ?? 0,
          price: inputToDecimal(snapshot.price),
          currency: snapshot.currency,
          validFrom: new Date().toISOString(),
          source: 'manual',
          note: '',
        },
        {
          onSuccess: () => setDraft(null),
          // No retry from the toast: a lost answer may still have added the price.
          onError: (e) =>
            isRefusal(e)
              ? setFail(e instanceof Error ? e.message : 'price not accepted')
              : notifyFailure(`PRICE · ${subject}`, 'not added', e),
        },
      );
    };
    if (!materialDirty) {
      postPrice();
      return;
    }
    saveMaterial.mutate(payloadOf(material, snapshot), {
      onSuccess: postPrice,
      onError: (e) =>
        isRefusal(e)
          ? setFail(saveErrorMessage(e))
          : notifyFailure(subject, 'not saved', e, saveErrorMessage(e), save),
    });
  };

  const toggleArchived = () => {
    const restoring = !!material.archived;
    archive.mutate(
      { id: material.id ?? 0, archived: !restoring },
      {
        onError: (e) =>
          notifyFailure(
            subject,
            restoring ? 'not restored' : 'not archived',
            e,
            undefined,
            toggleArchived,
          ),
      },
    );
  };

  // Registered for the catalog: it asks before switching tiles or closing. Returns true so a
  // caller written as `guardRef.current?.(fn) ?? fn()` never runs fn twice.
  useEffect(() => {
    const guard: ExpandGuard = (proceed) => {
      if (dirty) setPending(() => proceed);
      else proceed();
      return true;
    };
    guardRef.current = guard;
    return () => {
      if (guardRef.current === guard) guardRef.current = null;
    };
  });

  // Esc closes (through the guard), Cmd/Ctrl+S saves. Keys inside a dialog, popover or open list
  // belong to it.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('[role="dialog"],[role="alertdialog"],[role="listbox"],[role="menu"]')) {
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        save();
        return;
      }
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      if (dirty) setPending(() => onClose);
      else onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  const discard = () => {
    const proceed = pending;
    setPending(null);
    reset();
    proceed?.();
  };

  // ---- stock ----------------------------------------------------------------------------------
  // Same cache entry as the catalog tiles (`useMaterialStock({})`), so no extra request.
  const stock = useMaterialStock({});
  const stockRow = stock.data?.rows?.find((r) => Number(r.material?.id) === Number(material.id));
  const onHand = stockRow ? decimalToInput(stockRow.onHand) || '0' : '';
  const outOfStock = !!stockRow && !(parseDecimalNumber(onHand) > 0);
  const movements = useMaterialMovements({ materialId: Number(material.id) || 0 }, 1);
  const lastMove = lastMoveLabel(movements.data?.pages[0]?.movements[0]);
  const target: MovementTarget = {
    materialId: Number(material.id) || 0,
    materialLabel: `${material.code ? `${material.code} · ` : ''}${material.name ?? `#${material.id}`}`,
    unit: material.unit ?? '',
    onHand: onHand || '0',
  };
  const closeMove = (open: boolean) => {
    if (!open) setMove(null);
  };

  // ---- composition ----------------------------------------------------------------------------
  const fibreName = (code: string) =>
    (dictionary?.fibers?.find((f) => f.code === code)?.name || code).toLowerCase();
  const compositionText = filledRows(d.composition)
    .map((r) => `${percentLabel(r.percent)}% ${fibreName(r.fiberCode)}`)
    .join(' · ');

  // ---- photo ----------------------------------------------------------------------------------
  const imageUrl = mediaThumbUrl(d.image);
  const setImage = (media: common_MediaFull[]) => {
    const m = media[0];
    if (!m) return;
    patch({ imageId: m.id ?? 0, image: m });
  };
  const clearImage = () => patch({ imageId: 0, image: undefined });

  // ---- options --------------------------------------------------------------------------------
  const unitItems = (d.unit && !UNITS.includes(d.unit) ? [d.unit, ...UNITS] : UNITS).map((u) => ({
    value: u,
    label: u,
  }));
  const currencyItems = EXPENSE_CURRENCIES.map((c) => c.value);
  if (d.currency && !currencyItems.includes(d.currency)) currencyItems.unshift(d.currency);

  // ---- controls -------------------------------------------------------------------------------
  const frame = cn(
    'flex h-full w-full min-w-0 items-center',
    phone ? 'border-0' : 'border border-borderColor focus-within:border-textColor',
  );
  const control = phone
    ? 'h-11 w-full min-w-0 border-0 px-2 focus:border-b focus:border-textColor'
    : 'h-10 w-full min-w-0';
  const inner = cn(
    'h-full min-w-0 flex-1 border-0',
    phone && 'focus:border-b focus:border-textColor',
  );
  const lower = '[&_p]:normal-case';
  // The media slot's empty label and change/remove are kit buttons that uppercase.
  const lowerSlot = '[&_button]:normal-case';
  const sideAction = phone
    ? 'flex h-11 shrink-0 items-center px-3 text-micro tracking-label text-labelColor hover:text-textColor hover:underline'
    : 'flex h-full shrink-0 items-center border-l border-borderColor px-2.5 text-micro tracking-label hover:bg-textColor hover:text-bgColor';

  const revertOnEscape = (key: TextKey) => (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Escape' || d[key] === pristineOf(key)) return;
    event.preventDefault();
    event.stopPropagation();
    patch({ [key]: pristineOf(key) });
  };

  const textInput = (key: 'name' | 'supplier') => (
    <Input
      name={`${key}-${material.id}`}
      aria-label={key}
      value={d[key]}
      readOnly={!canEdit}
      placeholder={phone ? '—' : undefined}
      className={control}
      onChange={(e: ChangeEvent<HTMLInputElement>) => patch({ [key]: e.target.value })}
      onKeyDown={revertOnEscape(key)}
    />
  );

  // A class without the attribute shows a read-only dash, never a greyed-out field.
  const measure = (key: 'width' | 'weight', spec: Measure | undefined) =>
    spec ? (
      <div className={frame}>
        {spec.prefix ? (
          <Text component='span' className={cn('shrink-0 pl-2', !d[key] && 'text-labelColor')}>
            {spec.prefix}
          </Text>
        ) : null}
        <Input
          name={`${key}-${material.id}`}
          aria-label={key}
          inputMode={spec.text ? undefined : 'decimal'}
          value={d[key]}
          readOnly={!canEdit}
          placeholder={phone ? '—' : undefined}
          className={cn(
            inner,
            !spec.text && 'tabular-nums',
            (phone || spec.prefix) && 'px-2',
            spec.prefix && 'pl-0.5',
          )}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            patch({ [key]: spec.text ? e.target.value : sanitizeDecimal(e.target.value) })
          }
          onKeyDown={revertOnEscape(key)}
        />
        {spec.unit ? (
          <Text component='span' size='micro' variant='label' className='shrink-0 px-2'>
            {spec.unit}
          </Text>
        ) : null}
      </div>
    ) : (
      <div className={frame}>
        <span className='px-2'>
          <EmptyCell />
        </span>
      </div>
    );

  const stockCell = (
    <Cell
      label='stock'
      subLabel={lastMove || undefined}
      phone={phone}
      className={canReadCosting ? 'col-span-2' : 'col-span-3'}
    >
      <div className={frame}>
        <Text
          component='span'
          className={cn(
            'min-w-0 flex-1 truncate px-2 font-bold tabular-nums',
            outOfStock && 'text-error',
          )}
        >
          {onHand ? `${onHand}${material.unit ? ` ${material.unit}` : ''}` : <EmptyCell />}
        </Text>
        {canEdit ? (
          <GenericPopover
            noTail
            open={menuOpen}
            onOpenChange={setMenuOpen}
            openElement='update stock'
            triggerProps={{ className: sideAction }}
            contentProps={{ align: 'end', sideOffset: 4 }}
            className='w-40'
          >
            {MOVES.map((k) => (
              <Button
                key={k}
                variant='default'
                className='flex h-10 w-full items-center px-1 text-left hover:underline'
                onClick={() => {
                  setMenuOpen(false);
                  setMove(k);
                }}
              >
                {k}
              </Button>
            ))}
          </GenericPopover>
        ) : null}
      </div>
    </Cell>
  );

  const priceCell = canReadCosting ? (
    <Cell label='price' phone={phone}>
      <div className={frame}>
        <Input
          name={`price-${material.id}`}
          aria-label='net price'
          title='net, ex-VAT'
          inputMode='decimal'
          value={d.price}
          readOnly={!canEditPrice}
          placeholder={phone ? '—' : '0.00'}
          className={cn(inner, 'tabular-nums', phone && 'px-2')}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            patch({ price: sanitizeDecimal(e.target.value, 4) })
          }
          onKeyDown={revertOnEscape('price')}
        />
        <Select
          name={`currency-${material.id}`}
          items={currencyItems.map((c) => ({ value: c, label: c.toLowerCase() }))}
          value={d.currency}
          placeholder='currency'
          readOnly={!canEditPrice}
          className={cn('h-full w-auto shrink-0 gap-1 border-0', lower, phone && 'h-11')}
          itemClassName={lower}
          customWidth={90}
          onValueChange={(v: string) => patch({ currency: v })}
        />
      </div>
    </Cell>
  ) : null;

  const unitCell = (
    <Cell label='unit' phone={phone}>
      <Select
        name={`unit-${material.id}`}
        items={unitItems}
        value={d.unit}
        placeholder={phone ? '—' : 'unit'}
        readOnly={!canEdit}
        className={cn(control, lower)}
        itemClassName={lower}
        fullWidth
        onValueChange={(v: string) => patch({ unit: v })}
      />
    </Cell>
  );

  const sectionCell = (
    <Cell label='section' phone={phone}>
      <Select
        name={`section-${material.id}`}
        items={techCardBomSectionOptions}
        value={derivedSection(cls) ?? d.section}
        placeholder={phone ? '—' : 'section'}
        readOnly={!canEdit || !!derivedSection(cls)}
        className={cn(control, lower)}
        itemClassName={lower}
        fullWidth
        onValueChange={(v: string) => patch({ section: v as common_TechCardBomSection })}
      />
    </Cell>
  );

  const classCell = (
    <Cell label='class' phone={phone}>
      <Select
        name={`class-${material.id}`}
        items={materialClassOptions}
        value={cls}
        placeholder={phone ? '—' : 'class'}
        readOnly={!canEdit}
        className={cn(control, lower)}
        itemClassName={lower}
        fullWidth
        onValueChange={(v: string) => changeClass(v as common_MaterialClass)}
      />
    </Cell>
  );

  const compositionCell = (
    <Cell label='composition' phone={phone} className='col-span-2'>
      <div className={frame}>
        {canEdit ? (
          <>
            <Button
              variant='default'
              aria-label='composition'
              className='flex h-full min-w-0 flex-1 items-center px-2 text-left'
              onClick={() => setCompOpen(true)}
            >
              <span className='block min-w-0 truncate'>{compositionText || <EmptyCell />}</span>
            </Button>
            <Button variant='default' className={sideAction} onClick={() => setCompOpen(true)}>
              edit
            </Button>
          </>
        ) : (
          <Text component='span' className='min-w-0 flex-1 truncate px-2'>
            {compositionText || <EmptyCell />}
          </Text>
        )}
      </div>
    </Cell>
  );

  const cells = [
    stockCell,
    priceCell,
    unitCell,
    <Cell key='name' label='name' phone={phone}>
      {textInput('name')}
    </Cell>,
    <Cell key='supplier' label='supplier' phone={phone}>
      {textInput('supplier')}
    </Cell>,
    sectionCell,
    classCell,
    <Cell key='width' label='width' phone={phone}>
      {measure('width', WIDTH[cls])}
    </Cell>,
    <Cell key='weight' label='weight' phone={phone}>
      {measure('weight', WEIGHT[cls])}
    </Cell>,
    compositionCell,
  ];

  const code = composeArticleFromMaterial(material, true) || material.code || `#${material.id}`;
  // Phone: the code on its own line and the name wrapping to two, so the thumb never truncates it.
  const title = (
    <span
      className={cn(
        'flex min-w-0 flex-1',
        phone ? 'flex-col justify-center gap-0.5 py-1' : 'h-full items-center gap-1.5',
      )}
    >
      <Text component='span' className={cn('font-bold', phone ? 'truncate' : 'shrink-0')}>
        {code}
      </Text>
      <Text
        component='span'
        className={cn('min-w-0', phone ? 'line-clamp-2 break-words leading-tight' : 'truncate')}
      >
        {d.name}
      </Text>
    </span>
  );
  const archiveAction = canEdit ? (
    <Button
      variant='default'
      disabled={archive.isPending}
      className={cn(
        'flex h-full items-center pl-2 text-labelColor hover:text-textColor hover:underline',
        phone && 'min-w-11 justify-end',
      )}
      onClick={toggleArchived}
    >
      {material.archived ? 'restore' : 'archive'}
    </Button>
  ) : null;
  const saveLabel = busy ? 'saving…' : 'save';

  return (
    <div
      className='min-w-0 border border-borderColor bg-bgColor p-3'
      onKeyDown={(event) => {
        // React bubbles events out of portals: Enter inside a modal opened from here is not ours.
        const el = event.target as HTMLElement;
        if (!event.currentTarget.contains(el)) return;
        if (event.key === 'Enter' && el.tagName === 'INPUT' && dirty) {
          event.preventDefault();
          save();
        }
      }}
    >
      <div className={cn('mb-3 flex min-w-0 items-center gap-2', phone ? 'min-h-14' : 'h-8')}>
        {phone ? (
          <MediaSlot
            mediaUrl={imageUrl}
            alt={d.name || 'material image'}
            aspectRatio={['1:1', 'Custom']}
            frameAspect='1/1'
            heightPx={56}
            label='+'
            hint={null}
            purpose='material image'
            showVideos={false}
            editMode={canEdit}
            toolbar={false}
            compact
            className='shrink-0'
            onOpenViewer={canEdit && imageUrl ? () => setPhotoOpen(true) : undefined}
            onSelect={setImage}
            onClear={d.imageId ? clearImage : undefined}
          />
        ) : null}
        {title}
        <span className={cn('flex shrink-0 items-center gap-1', phone ? 'self-stretch' : 'h-full')}>
          {dirty && !phone ? (
            <>
              <Button variant='main' className='h-8 px-3' disabled={busy} onClick={save}>
                {saveLabel}
              </Button>
              <Button variant='secondary' className='h-8 px-3' disabled={busy} onClick={reset}>
                cancel
              </Button>
            </>
          ) : null}
          {archiveAction}
        </span>
      </div>

      <div className={cn('flex min-w-0', phone ? 'flex-col' : 'items-start gap-6')}>
        {!phone ? (
          <div className={cn('w-48 shrink-0', lowerSlot)}>
            <MediaPreviewWithSelector
              mediaUrl={imageUrl}
              aspectRatio={['1:1', 'Custom']}
              allowMultiple={false}
              showVideos={false}
              label='+ photo'
              purpose='material image'
              alt={d.name || 'material image'}
              editMode={canEdit}
              onSaveMedia={setImage}
              onClear={d.imageId ? clearImage : undefined}
            />
          </div>
        ) : null}
        <div
          className={cn(
            'min-w-0 flex-1',
            phone ? 'border border-borderColor bg-bgColor' : 'grid grid-cols-4 gap-2',
            // The dirty bar is sticky over the viewport bottom: focus and scroll-into-view stop above it.
            phone && dirty && '**:scroll-mb-20',
          )}
        >
          {cells.map((cell, i) => (cell ? <Fragment key={i}>{cell}</Fragment> : null))}
        </div>
      </div>

      <FailNote verb='not saved' text={fail} className='mt-3' />

      {dirty && phone ? (
        <div className='sticky bottom-0 z-20 -mx-3 -mb-3 mt-3 flex gap-2 border-t border-borderColor bg-bgColor p-2.5'>
          <Button variant='main' className='h-11 flex-1' disabled={busy} onClick={save}>
            {saveLabel}
          </Button>
          <Button variant='secondary' className='h-11 flex-1' disabled={busy} onClick={reset}>
            cancel
          </Button>
        </div>
      ) : null}

      <CompositionWizard
        open={compOpen}
        onOpenChange={setCompOpen}
        initialEntries={d.composition}
        onSave={(entries) => patch({ composition: entries.map((r) => ({ ...r })) })}
      />

      {phone ? (
        <ConfirmationModal
          open={photoOpen}
          onOpenChange={setPhotoOpen}
          onConfirm={() => setPhotoOpen(false)}
          title='photo'
          width='sm'
          hideActions
        >
          <div className={lowerSlot}>
            <MediaPreviewWithSelector
              mediaUrl={imageUrl}
              aspectRatio={['1:1', 'Custom']}
              allowMultiple={false}
              showVideos={false}
              label='+ photo'
              purpose='material image'
              alt={d.name || 'material image'}
              editMode={canEdit}
              onSaveMedia={setImage}
              onClear={
                d.imageId
                  ? () => {
                      clearImage();
                      setPhotoOpen(false);
                    }
                  : undefined
              }
            />
          </div>
        </ConfirmationModal>
      ) : null}

      {move === 'receive' ? (
        <ReceiveStockModal open onOpenChange={closeMove} target={target} />
      ) : null}
      {move === 'issue' ? <IssueStockModal open onOpenChange={closeMove} target={target} /> : null}
      {move === 'adjust' ? (
        <AdjustStockModal open onOpenChange={closeMove} target={target} />
      ) : null}

      <ConfirmationModal
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        onConfirm={discard}
        title='discard changes?'
        confirmLabel='discard'
        cancelLabel='keep'
        width='sm'
      >
        {null}
      </ConfirmationModal>
    </div>
  );
}
