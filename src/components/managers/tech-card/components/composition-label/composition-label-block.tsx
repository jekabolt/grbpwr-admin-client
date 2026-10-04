// COMPOSITION LABEL — отдельный, всегда присутствующий блок вкладки «labels & pkg» (R-01..R-04).
// Редизайн R-11 (tmp/plans/labels-rework/redesign/13-SYNTHESIS.md): «лента и есть форма». Каждая
// этикетка нарисована предметом в настоящих пропорциях (линия реза, пунктир сгиба, штриховка
// припуска 10 мм), лицо и изнанка рядом; напечатанное значение само есть дверь в свою правку, полоса
// правки открывается прямо под стороной, открыта всегда одна, сброс «↺ use derived» живёт только в
// ней. Дыра рисуется рамкой на том месте ленты, которое она касается. Составник, не влезший на одну
// ленту, показан всеми своими лентами (B, B2 …) — ровно столько, сколько уйдёт в ZIP.
// Единственная кнопка шапки — «print labels ⎙»: страница ZIP. Страна без колорвея ставится прямо
// здесь (в одно сохранение карточки, made-in.ts).
import { useQueryClient } from '@tanstack/react-query';
import type { common_MediaFull, common_TechCard } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { techCardKeys } from 'components/managers/tech-cards/components/useTechCardQuery';
import { SECTION } from 'constants/routes';
import { cn } from 'lib/utility';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { Button } from 'ui/components/button';
import { Chip, ChipRow } from 'ui/components/chip';
import { GroupLabel } from 'ui/components/group-label';
import { Pill } from 'ui/components/pill';
import { Section } from 'ui/components/section';
import SelectComponent from 'ui/components/select';
import Text from 'ui/components/text';
import { colorwayFullKey } from '../../care-labels/adapter';
import { overrideRowsOf } from '../../care-labels/composition-override';
import { isBlocking, type Hole } from '../../care-labels/holes';
import { LABEL_PART_NAME } from '../../care-labels/label-parts';
import { COMPANY_ADDRESS, L, QR_CAPTION, textWidth } from '../../care-labels/layout';
import { previewASides, type PlannedSide } from '../../care-labels/pages';
import { useLabelDictionary } from '../../care-labels/use-label-dictionary';
import { setCareLabel, setCareLabelColorway } from '../form-writers';
import type { FormCareLabel } from '../labels-schema';
import type { TechCardFormData } from '../schema';
import { useTechCardStaging } from '../useTechCardStaging';
import { wireInt } from '../wire-int';
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
import {
  aBackRegions,
  aFaceRegions,
  bEmptyRegions,
  bRegions,
  PX_PER_MM,
  type Region,
} from './regions';
import { Ribbon, type RegionView, type RibbonSide } from './ribbon';
import { useCompositionLabel, useShaper } from './use-composition-label';

const EMPTY_PICKS: ReadonlyMap<number, string> = new Map();

/** Ширина ленты 100 мм при зуме 1. */
const RIBBON_PX = L.W * PX_PER_MM;
/** Просвет между лицом и изнанкой, поля скамьи. */
const GAP = 24;
const BENCH_PAD = 16;
/** Уже этого сторона на двух колонках становится мельче натуральной величины — одна сторона за раз. */
const TWO_UP_MIN = 2 * RIBBON_PX + GAP + 2 * BENCH_PAD;

type SideModel = RibbonSide & { role: 'face' | 'back'; row: string; regions: Region[] };
type RowModel = { label: string; sides: SideModel[] };
type Open = { side: string; key: string } | null;

/** Имя, откуда значение, пока его не правили. */
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

export function CompositionLabelBlock({
  techCard,
  techCardId,
  canEdit,
}: {
  /** Сохранённая карточка (колорвеи, BOM); новая — undefined. */
  techCard: common_TechCard | undefined;
  /** Только у сохранённой карточки есть дверь печати и запись страны. */
  techCardId: number | undefined;
  canEdit: boolean;
}) {
  const { getValues, setValue, control } = useFormContext<TechCardFormData>();
  const careLabel = useWatch({ control, name: 'careLabel' }) as FormCareLabel | undefined;
  const { canWrite } = usePermissions();
  const canStyle = canWrite(SECTION.products);
  const { dictionary } = useLabelDictionary();
  const qc = useQueryClient();
  const staging = useTechCardStaging();
  const { shaper } = useShaper();

  // ── страна: выбор оператора до сохранения карточки ────────────────────────────────────────
  const [picks, setPicks] = useState<ReadonlyMap<number, string>>(EMPTY_PICKS);
  const [logoHint, setLogoHint] = useState<string>('');
  const model = useCompositionLabel({ techCard, countryPicks: picks, logoUrlHint: logoHint });
  const { data, plan, readiness } = model;

  // ── выбор колорвея / размера (только показ) ──────────────────────────────────────────────
  const [cwId, setCwId] = useState<number | null>(null);
  const [sizeId, setSizeId] = useState<number | null>(null);
  const colorways = data?.colorways ?? [];
  const sizes = data?.sizes ?? [];
  const cw = colorways.find((c) => c.id === cwId) ?? colorways[0];
  const size = sizes.find((s) => s.id === sizeId) ?? sizes[0];

  const countries = useMemo(
    () =>
      (dictionary?.countries ?? [])
        .filter((c) => !!c.code)
        .map((c) => ({
          code: c.code!.toUpperCase(),
          name: c.name || c.code!,
          active: c.active !== false,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [dictionary?.countries],
  );
  // The picker offers active countries only; a stored code still resolves to its name when inactive.
  const pickableCountries = useMemo(() => countries.filter((c) => c.active), [countries]);
  const countryName = (code: string) => countries.find((c) => c.code === code)?.name ?? code;
  const titleOf = (id: number) => {
    const c = colorways.find((x) => x.id === id);
    return c?.baseSku || c?.colourName || `#${id}`;
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
        setPicks((cur) => {
          if (!cur.has(id)) return cur;
          const next = new Map(cur);
          next.delete(id);
          return next;
        }),
    });
    // titleOf / countryName read the same render's data; the picks are what move the queue.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staging, picks, techCardId, lockVersion]);
  // Снятый блок не оставляет в очереди записей, которых никто не видит.
  useEffect(
    () => () => {
      for (const id of stagedRef.current) staging?.unstage(`colourway:${id}:country`);
    },
    [staging],
  );

  const isUnavailable = (c: { holes: readonly Hole[] }) =>
    c.holes.some((h) => h.code === 'colorway-unavailable');
  const othersWithout = cw
    ? colorways.filter(
        (c) => c.id !== cw.id && !c.countryCode && !picks.has(c.id) && !isUnavailable(c),
      ).length
    : 0;
  const pickCountry = (code: string, alsoOthers: boolean) => {
    if (!cw) return;
    setPicks((cur) => {
      const next = new Map(cur);
      next.set(cw.id, code);
      if (alsoOthers)
        for (const c of colorways)
          if (c.id !== cw.id && !c.countryCode && !next.has(c.id) && !isUnavailable(c))
            next.set(c.id, code);
      return next;
    });
  };

  // ── дыры выбранного колорвея: блокирующие первыми ─────────────────────────────────────────
  const holes = useMemo<Hole[]>(() => {
    if (!readiness) return [];
    const mine = cw ? readiness.colorways.find((r) => r.colorwayId === cw.id)?.holes ?? [] : [];
    const seen = new Set<string>();
    return [...readiness.global, ...mine]
      .filter((h) => h.level !== 'info')
      .filter((h) => (seen.has(h.message) ? false : (seen.add(h.message), true)))
      .sort((a, b) => Number(isBlocking(b)) - Number(isBlocking(a)));
  }, [readiness, cw]);
  const blockedCw = (id: number) =>
    !!readiness?.colorways.find((r) => r.colorwayId === id)?.blocked;
  const nBlock = holes.filter(isBlocking).length;
  const nWarn = holes.length - nBlock;

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
        regions: aFaceRegions(face.side.report.seam, madeW),
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
        regions: aBackRegions(back.side.report.seam, address.length),
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
    for (const label of labels) {
      const sides = byLabel
        .get(label)!
        .sort((x, y) => (x.role === y.role ? 0 : x.role === 'face' ? -1 : 1))
        .map<SideModel>((p) => ({
          key: `${label}-${p.role}`,
          row: label,
          role: p.role,
          caption: `${label} ${p.role}${p.side.report.empty ? ' · printed blank' : ''}`,
          doc: p.side.doc,
          seam: p.side.report.seam,
          blank: p.side.report.empty,
          regions: bRegions(p.side.report),
          text: p.side.report.columns.map((c) => LABEL_PART_NAME[c.part]).join(' · '),
        }));
      out.push({ label, sides });
    }
    if (!labels.length)
      out.push({
        label: 'B',
        sides: [
          {
            key: 'B-face',
            row: 'B',
            role: 'face',
            caption: 'B face · nothing to print yet',
            doc: null,
            seam: 'right',
            regions: bEmptyRegions('right'),
          },
          {
            key: 'B-back',
            row: 'B',
            role: 'back',
            caption: 'B back · printed blank',
            doc: null,
            seam: 'left',
            blank: true,
            regions: [],
          },
        ],
      });
    return out;
    // sku / cw / address / caption read the same render's selection as `set`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [set, size, madeW, cw?.colourName, cw?.countryName, address.length, caption.join('|')]);
  const bLabels = rows.filter((r) => r.label !== 'A' && r.sides.some((s) => s.doc));
  const allSides = rows.flatMap((r) => r.sides);

  // ── ширина: две стороны рядом или одна за раз ─────────────────────────────────────────────
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
  const pad = twoUp ? BENCH_PAD : 8;
  const sidePx = twoUp ? (width - GAP - 2 * pad) / 2 : width - 2 * pad;
  const zoom = Math.max(0.5, Math.min(2, sidePx / RIBBON_PX));
  const [shownSide, setShownSide] = useState('A-face');
  const shown = allSides.some((s) => s.key === shownSide) ? shownSide : allSides[0]?.key;

  // ── одна открытая правка ──────────────────────────────────────────────────────────────────
  const [open, setOpen] = useState<Open>(null);
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
  // Смена колорвея / размера / стороны закрывает полосу в ТОМ ЖЕ рендере: снимаясь, она пишет
  // недописанное в тот колорвей, в котором его начали.
  const switchTo = (fn: () => void) => {
    setOpen(null);
    fn();
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
            : 'made in: country missing, click to set it',
          disabled: !edit || !techCardId || unavailable,
          title,
          placeholder: !cw?.countryName ? (
            <span className='flex h-full items-center justify-end whitespace-nowrap px-1 text-nano uppercase leading-none text-error'>
              ! set country
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
            <span className='flex h-full items-center justify-center text-nano uppercase text-labelColor'>
              no composition yet · click to write it
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
  const editorFor = (side: SideModel, r: Region): React.ReactNode => {
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
            foot='SKU and size are facts of the colourway and the size list · Enter saves · Esc cancels'
          >
            <div className='flex flex-wrap items-center gap-x-3 gap-y-2 uppercase'>
              <span className='text-labelColor'>{sku || 'no SKU'}</span>
              <span className='text-labelColor'>/</span>
              <div className='w-[240px] max-w-full'>
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
              <span className='text-labelColor'>/ [{size?.label ?? '—'}]</span>
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
            foot='Esc cancels · leaving the field saves'
          >
            <div className='max-w-[560px]'>
              <DraftLines
                ariaLabel='care text on the label'
                lines={data?.care.prose ?? []}
                rows={3}
                placeholder='pick care symbols: the text follows them'
                hint='one sentence per line · printed in capitals, three lines at most'
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
            source={
              picked
                ? 'staged · saves with the card'
                : cw.countryName
                  ? 'from the colourway · a new pick saves with the card'
                  : 'missing · set it here'
            }
          >
            <MadeInValue
              countryName={cw.countryName}
              pickedCode={picked}
              unavailable={isUnavailable(cw)}
              countries={pickableCountries}
              othersWithout={othersWithout}
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
                now {now} composition {now === 1 ? 'label' : 'labels'} per garment
              </Text>
            ) : null}
            <FocusPart part={r.part} />
            <div className='max-w-[640px]'>
              <FibreEditor
                initial={
                  cwOverride?.fibers?.length
                    ? fibersFromForm(cwOverride.fibers)
                    : overrideRowsOf(derivedParts)
                }
                fibers={data?.fibers ?? new Map()}
                otherCount={colorways.length - 1}
                onChange={(rows, all) =>
                  writeComposition(g, s, all ? colorways.map((c) => c.id) : [cw.id], rows)
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
            foot='Esc cancels · leaving the field saves'
          >
            <div className='max-w-[420px]'>
              <DraftLines
                ariaLabel='QR caption on the label back'
                lines={caption}
                rows={2}
                hint='first line above the QR code, second line under it'
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
            foot='Esc cancels · leaving the field saves'
          >
            <div className='max-w-[420px]'>
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

  // ── список дыр (за счётчиком) ─────────────────────────────────────────────────────────────
  const [holesOpen, setHolesOpen] = useState(false);
  useEffect(() => setHolesOpen(false), [cw?.id]);
  const goToHole = (h: Hole) => {
    const line = holeLine(h);
    if (!line) return;
    const side = allSides.find((sd) =>
      sd.regions.some((r) => r.line === line && (!h.ref.part || !r.part || r.part === h.ref.part)),
    );
    const region = side?.regions.find(
      (r) => r.line === line && (!h.ref.part || !r.part || r.part === h.ref.part),
    );
    if (!side || !region) return;
    setShownSide(side.key);
    const view = viewOf(side, region);
    if (!view.disabled) setOpen({ side: side.key, key: region.key });
    requestAnimationFrame(() =>
      doors.current.get(`${side.key}|${region.key}`)?.focus({ preventScroll: false }),
    );
  };

  const printDoor = techCardId ? (
    <Button asChild variant='underline' size='xs' className='text-labelColor hover:text-textColor'>
      <Link
        to={`/tech-cards/${techCardId}/care-labels`}
        target='_blank'
        rel='noopener'
        data-composition-print=''
        title='open the print page: it builds the ZIP from the saved card'
      >
        print labels ⎙
      </Link>
    </Button>
  ) : (
    <Button
      type='button'
      variant='underline'
      size='xs'
      className='text-labelColor hover:text-textColor'
      disabled
      data-composition-print=''
      title='save the card first: the print page reads the saved card'
    >
      print labels ⎙
    </Button>
  );

  // ── вёрстка ───────────────────────────────────────────────────────────────────────────────
  const onStripKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' && e.currentTarget.contains(e.target as Node)) {
      e.preventDefault();
      close();
    }
  };

  /** Скамья одной ленты: стороны рядом (или одна), под ней — полоса правки её стороны. */
  const bench = (row: RowModel, only?: string) => {
    const sides = only ? row.sides.filter((sd) => sd.key === only) : row.sides;
    if (!sides.length) return null;
    const cols = only ? 1 : sides.length;
    const w = RIBBON_PX * zoom;
    const grid = { gridTemplateColumns: `repeat(${cols}, ${w}px)`, columnGap: GAP };
    const openHere = sides.find((sd) => sd.key === open?.side);
    const region = openHere?.regions.find((r) => r.key === open?.key);
    return (
      <div key={row.label} className='flex flex-col' data-ribbon-row={row.label}>
        <div className='group/bench bg-bgSecondary' style={{ padding: pad }} data-bench={row.label}>
          <div className='grid' style={grid}>
            {sides.map((sd) => (
              <Ribbon
                key={sd.key}
                side={sd}
                zoom={zoom}
                regions={sd.regions.map((r) => viewOf(sd, r))}
                onOpen={(r) => openRegion(sd.key, r.key)}
                refFor={refFor(sd.key)}
              />
            ))}
          </div>
        </div>
        {openHere && region ? (
          <div className='grid' style={{ ...grid, paddingLeft: pad }} onKeyDown={onStripKey}>
            <div
              style={{
                gridColumn: only ? '1 / -1' : sides.indexOf(openHere) + 1,
                minWidth: 0,
              }}
            >
              {editorFor(openHere, region)}
            </div>
          </div>
        ) : null}
      </div>
    );
  };

  const aRow = rows.find((r) => r.label === 'A');
  const bRows = rows.filter((r) => r.label !== 'A');
  const bCountText = bLabels.length
    ? `${bLabels.length} ${bLabels.length === 1 ? 'label' : 'labels'}${
        bLabels.length > 1 ? ` (${bLabels.map((r) => r.label).join(', ')})` : ''
      }`
    : 'nothing to print yet';
  const shownRow = rows.find((r) => r.sides.some((sd) => sd.key === shown));

  return (
    <Section
      title='composition label'
      question='— sewn into every garment; click a printed value to change it'
      action={printDoor}
      className='w-full'
    >
      <div className='flex flex-col gap-6' data-composition-label=''>
        {/* колорвей · размер · дыры */}
        {colorways.length > 0 && (
          <div className='flex flex-col gap-3'>
            <div className='flex flex-wrap items-center gap-x-8 gap-y-3'>
              <label className='flex items-center gap-3' data-colorway-select=''>
                <Text
                  size='micro'
                  variant='label'
                  component='span'
                  className='uppercase tracking-label'
                >
                  colourway
                </Text>
                <SelectComponent
                  name='composition-colourway'
                  className='min-w-[200px]'
                  value={String(cw?.id ?? '')}
                  items={colorways.map((c) => ({
                    value: String(c.id),
                    label: `${c.colourName || c.baseSku || `#${c.id}`}${blockedCw(c.id) ? ' · ! blocks' : ''}`,
                  }))}
                  onValueChange={(v: string) => switchTo(() => setCwId(Number(v)))}
                />
              </label>
              {sizes.length > 1 ? (
                <label className='flex items-center gap-3' data-size-select=''>
                  <Text
                    size='micro'
                    variant='label'
                    component='span'
                    className='uppercase tracking-label'
                  >
                    size
                  </Text>
                  <SelectComponent
                    name='composition-size'
                    className='min-w-[96px]'
                    value={String(size?.id ?? '')}
                    items={sizes.map((z) => ({ value: String(z.id), label: z.label }))}
                    onValueChange={(v: string) => switchTo(() => setSizeId(Number(v)))}
                  />
                </label>
              ) : size ? (
                <Text size='micro' variant='label' className='uppercase tracking-label'>
                  size {size.label}
                </Text>
              ) : null}
              <div className='ml-auto'>
                {!readiness ? (
                  <Text size='micro' variant='label' data-hole-count=''>
                    checking…
                  </Text>
                ) : holes.length === 0 ? (
                  <Text
                    size='micro'
                    variant='label'
                    className='uppercase tracking-label'
                    data-hole-count=''
                  >
                    no holes · prints as shown
                  </Text>
                ) : (
                  <button
                    type='button'
                    data-hole-count=''
                    aria-expanded={holesOpen}
                    onClick={() => setHolesOpen((v) => !v)}
                    className={cn(
                      'cursor-pointer text-micro uppercase tracking-label underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor',
                      nBlock ? 'text-error' : 'text-warning',
                    )}
                  >
                    {[
                      nBlock ? `! ${nBlock} blocking` : '',
                      nWarn ? `${nWarn} ${nWarn === 1 ? 'warning' : 'warnings'}` : '',
                    ]
                      .filter(Boolean)
                      .join(' · ')}{' '}
                    {holesOpen ? '▴' : '▾'}
                  </button>
                )}
              </div>
            </div>
            {holesOpen && holes.length > 0 ? (
              <ul className='flex flex-col gap-1.5' data-composition-holes=''>
                {holes.map((h) => {
                  const line = holeLine(h);
                  const body = (
                    <>
                      <Pill tone={isBlocking(h) ? 'warn' : 'attention'}>
                        {isBlocking(h) ? 'blocks' : 'warn'}
                      </Pill>
                      <Text size='micro' component='span' className='min-w-0'>
                        {h.message}
                      </Text>
                    </>
                  );
                  return (
                    <li key={`${h.code}|${h.message}`} data-hole={h.code}>
                      {line ? (
                        <button
                          type='button'
                          onClick={() => goToHole(h)}
                          className='flex cursor-pointer items-start gap-2 text-left hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-textColor'
                        >
                          {body}
                        </button>
                      ) : (
                        <span className='flex items-start gap-2'>{body}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        )}

        {/* ленты */}
        <div ref={workRef} className='flex min-w-0 flex-col gap-6' data-composition-preview=''>
          {!cw ? (
            <Text size='micro' variant='label'>
              {techCardId
                ? 'no colourways yet: the label draws once the style has one'
                : 'save the card and add a colourway: the label draws from them'}
            </Text>
          ) : model.shaperFailed ? (
            <Text size='micro' variant='errorLabel'>
              the label fonts did not load: reload the page
            </Text>
          ) : rows.length === 0 || width === 0 ? (
            <Text size='micro' variant='label' className='animate-pulse'>
              typesetting the label…
            </Text>
          ) : twoUp ? (
            <>
              {aRow ? (
                <div className='flex flex-col'>
                  <GroupLabel flush action={<LabelNote>duplex · flip on the short edge</LabelNote>}>
                    ribbon A · main label · 100 × 30 mm
                  </GroupLabel>
                  <div className='pt-2'>{bench(aRow)}</div>
                </div>
              ) : null}
              <div className='flex flex-col'>
                <GroupLabel
                  flush
                  action={
                    <LabelNote>
                      {bRows.some((r) => r.sides.some((sd) => sd.role === 'back' && !sd.blank))
                        ? 'runs on: face → back → next label'
                        : 'back prints blank'}
                    </LabelNote>
                  }
                >
                  <span data-b-count={bLabels.length}>ribbon B · composition · {bCountText}</span>
                </GroupLabel>
                <div className='flex flex-col gap-4 pt-2'>{bRows.map((r) => bench(r))}</div>
              </div>
            </>
          ) : (
            <div className='flex flex-col gap-3'>
              <ChipRow>
                {allSides.map((sd) => (
                  <Chip
                    key={sd.key}
                    nonForm
                    pressed={sd.key === shown}
                    selected={sd.key === shown}
                    data-side-chip={sd.key}
                    onClick={() => switchTo(() => setShownSide(sd.key))}
                  >
                    {sideName(sd.key)}
                  </Chip>
                ))}
              </ChipRow>
              <Text
                size='micro'
                variant='label'
                className='uppercase tracking-label'
                data-b-count={bLabels.length}
              >
                {shownRow?.label === 'A'
                  ? 'ribbon A · main label'
                  : `ribbon B · composition · ${bCountText}`}
              </Text>
              {shownRow && shown ? bench(shownRow, shown) : null}
            </div>
          )}
          {rows.length > 0 && width > 0 ? <Legend /> : null}
        </div>
      </div>
    </Section>
  );
}

function LabelNote({ children }: { children: React.ReactNode }) {
  return (
    <Text size='micro' variant='label' component='span' className='uppercase tracking-label'>
      {children}
    </Text>
  );
}

/** Одна тихая строка под лентами: что значат линии. */
function Legend() {
  const item = (glyph: React.ReactNode, text: string) => (
    <span className='flex items-center gap-2'>
      <svg aria-hidden width={18} height={10} className='shrink-0'>
        {glyph}
      </svg>
      <Text size='micro' variant='label' component='span' className='uppercase tracking-label'>
        {text}
      </Text>
    </span>
  );
  return (
    <div className='flex flex-wrap items-center gap-x-8 gap-y-2' data-composition-legend=''>
      {item(
        <rect x={0.5} y={0.5} width={17} height={9} fill='#fff' stroke='var(--color-labelColor)' />,
        'solid · cut edge',
      )}
      {item(
        <line x1={9} y1={0} x2={9} y2={10} stroke='#000' strokeDasharray='2 2' />,
        'dash · fold / sew',
      )}
      {item(
        <g stroke='var(--color-borderColor)'>
          {[0, 5, 10, 15, 20].map((x) => (
            <line key={x} x1={x - 6} y1={10} x2={x + 4} y2={0} />
          ))}
        </g>,
        'hatch · 10 mm seam, sewn in',
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
