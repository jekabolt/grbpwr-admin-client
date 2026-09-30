// COMPOSITION LABEL — отдельный, всегда присутствующий блок вкладки «labels & pkg» (R-01..R-04,
// дизайн §2.2). Слева — живое превью ленты в реальном размере ×2 (те же `typeset*`, что у ZIP),
// справа — строки ленты: имя · значение · откуда. Значение и есть дверь в его правку; у
// переопределённой строки — единственный свой контрол «↺ derived». Страна без колорвея ставится
// прямо здесь (в одно сохранение карточки). Единственная кнопка шапки — «print ⎙»: страница ZIP.
import { useQueryClient } from '@tanstack/react-query';
import type { common_MediaFull, common_TechCard } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { techCardKeys } from 'components/managers/tech-cards/components/useTechCardQuery';
import { SECTION } from 'constants/routes';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { cn } from 'lib/utility';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { Button } from 'ui/components/button';
import { Chip, ChipRow } from 'ui/components/chip';
import { Pill } from 'ui/components/pill';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';
import { colorwayFullKey } from '../../care-labels/adapter';
import { overrideRowsOf } from '../../care-labels/composition-override';
import { isBlocking, type Hole } from '../../care-labels/holes';
import { COMPANY_ADDRESS, QR_CAPTION } from '../../care-labels/layout';
import { previewASides } from '../../care-labels/pages';
import { SidesPreview, type PreviewSide } from '../../care-labels/sides-preview';
import { setCareLabel, setCareLabelColorway } from '../form-writers';
import type { FormCareLabel } from '../labels-schema';
import type { TechCardFormData } from '../schema';
import { useTechCardStaging } from '../useTechCardStaging';
import { wireInt } from '../wire-int';
import { CareSymbolsDoor, LogoDoor, QrDoor } from './doors';
import { EditableLines, EditableText, LineRow, ValueDoor } from './editable';
import { FibreEditor } from './fibre-editor';
import {
  colourNameOverride,
  fibersFromForm,
  holeLine,
  linesOverride,
  writeComposition,
  type LineKey,
} from './label-lines';
import { stageCountryWrites } from './made-in';
import { MadeInValue } from './made-in-value';
import {
  addressLines,
  captionLines,
  compositionPartTexts,
  labelSku,
  LINE_META,
  qrExample,
} from './label-summary';
import { useCompositionLabel } from './use-composition-label';

const EMPTY_PICKS: ReadonlyMap<number, string> = new Map();

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
  const { dictionary } = useDictionary();
  const qc = useQueryClient();
  const staging = useTechCardStaging();

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
        .map((c) => ({ code: c.code!.toUpperCase(), name: c.name || c.code! }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [dictionary?.countries],
  );
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

  const pickCountry = (code: string, alsoOthers: boolean) => {
    if (!cw) return;
    setPicks((cur) => {
      const next = new Map(cur);
      next.set(cw.id, code);
      if (alsoOthers)
        for (const c of colorways)
          if (
            c.id !== cw.id &&
            !c.countryCode &&
            !next.has(c.id) &&
            !c.holes.some((h) => h.code === 'colorway-unavailable')
          )
            next.set(c.id, code);
      return next;
    });
  };

  // ── превью выбранного варианта ────────────────────────────────────────────────────────────
  const sku = cw ? labelSku(cw, size) : '';
  const set = cw ? plan?.sets.get(cw.id) : undefined;
  const sides = useMemo<PreviewSide[]>(() => {
    if (!set || !size) return [];
    const out: PreviewSide[] = [];
    const { face, back } = previewASides(set, size.id);
    if (face)
      out.push({
        key: 'A-face',
        title: 'A · face',
        back: false,
        doc: face.side.doc,
        text: [
          `${sku} / ${cw?.colourName.toUpperCase()} / [${size.label}]`,
          cw?.countryName ? `MADE IN ${cw.countryName.toUpperCase()}` : '',
        ]
          .filter(Boolean)
          .join(' · '),
      });
    if (back) out.push({ key: 'A-back', title: 'A · back', back: true, doc: back.side.doc });
    for (const p of set.sides.values()) {
      // Пустая изнанка B печатается чистой — строкой под превью, а не белым прямоугольником.
      if (p.label === 'A' || p.side.report.empty) continue;
      out.push({
        key: `${p.label}-${p.role}`,
        title: `${p.label} · ${p.role}`,
        back: p.role === 'back',
        doc: p.side.doc,
      });
    }
    return out;
    // sku / cw read the same render's selection as `set`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [set, size, cw?.colourName, cw?.countryName]);

  const blankSides = useMemo(
    () =>
      set
        ? [...set.sides.values()]
            .filter((p) => p.label !== 'A' && p.side.report.empty)
            .map((p) => `${p.label} · ${p.role}`)
        : [],
    [set],
  );

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
  const [focusLine, setFocusLine] = useState<LineKey | null>(null);
  const linesRef = useRef<HTMLDivElement | null>(null);
  const goTo = (line: LineKey) => {
    setFocusLine(line);
    const el = linesRef.current?.querySelector<HTMLElement>(`[data-line='${line}']`);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    el?.querySelector<HTMLElement>('button, input')?.focus({ preventScroll: true });
  };
  useEffect(() => {
    if (!focusLine) return;
    const t = window.setTimeout(() => setFocusLine(null), 1600);
    return () => window.clearTimeout(t);
  }, [focusLine]);

  // ── строки ────────────────────────────────────────────────────────────────────────────────
  const [compositionOpen, setCompositionOpen] = useState(false);
  useEffect(() => setCompositionOpen(false), [cw?.id]);
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

  const printDoor = techCardId ? (
    <Button asChild variant='secondary' size='sm'>
      <Link
        to={`/tech-cards/${techCardId}/care-labels`}
        target='_blank'
        rel='noopener'
        data-composition-print=''
        title='open the print page — builds the ZIP from the saved card'
      >
        print ⎙
      </Link>
    </Button>
  ) : (
    <Button
      type='button'
      variant='secondary'
      size='sm'
      disabled
      title='save the card first — the print page reads the saved card'
    >
      print ⎙
    </Button>
  );

  return (
    <Section
      title='composition label'
      question='— sewn into every garment; click a value to change it'
      action={printDoor}
      className='w-full'
    >
      <div className='flex flex-col gap-8' data-composition-label=''>
        {/* выбор варианта */}
        {colorways.length > 0 && (
          <div className='flex flex-wrap items-center gap-x-10 gap-y-3'>
            <div className='flex flex-wrap items-center gap-3'>
              <Text size='micro' variant='label' className='uppercase tracking-label'>
                colourway
              </Text>
              <ChipRow>
                {colorways.map((c) => (
                  <Chip
                    key={c.id}
                    nonForm
                    pressed={c.id === cw?.id}
                    selected={c.id === cw?.id}
                    tone={blockedCw(c.id) ? 'error' : 'default'}
                    onClick={() => setCwId(c.id)}
                    title={
                      blockedCw(c.id)
                        ? 'has blocking holes — see the list under the label'
                        : undefined
                    }
                    data-colorway-chip={c.id}
                  >
                    {c.colourName || c.baseSku || `#${c.id}`}
                    {blockedCw(c.id) ? ' !' : ''}
                  </Chip>
                ))}
              </ChipRow>
            </div>
            {sizes.length > 0 && (
              <div className='flex flex-wrap items-center gap-3'>
                <Text size='micro' variant='label' className='uppercase tracking-label'>
                  size
                </Text>
                <ChipRow>
                  {sizes.map((z) => (
                    <Chip
                      key={z.id}
                      nonForm
                      pressed={z.id === size?.id}
                      selected={z.id === size?.id}
                      onClick={() => setSizeId(z.id)}
                    >
                      {z.label}
                    </Chip>
                  ))}
                </ChipRow>
              </div>
            )}
          </div>
        )}

        <div className='grid grid-cols-1 items-start gap-x-12 gap-y-8 2xl:grid-cols-[max-content_minmax(0,1fr)]'>
          {/* превью */}
          <div className='min-w-0' data-composition-preview=''>
            {!cw ? (
              <Text size='micro' variant='label'>
                {techCardId
                  ? 'no colourways yet — the preview draws once the style has one'
                  : 'save the card and add a colourway — the preview draws from them'}
              </Text>
            ) : model.shaperFailed ? (
              <Text size='micro' variant='errorLabel'>
                the label fonts did not load — reload the page
              </Text>
            ) : sides.length === 0 ? (
              <Text size='micro' variant='label' className='animate-pulse'>
                typesetting the label…
              </Text>
            ) : (
              <div className='flex flex-col gap-3'>
                <SidesPreview sides={sides} view='ribbon' zoom={2} />
                {blankSides.length > 0 && (
                  <Text size='micro' variant='label' className='uppercase tracking-label'>
                    {blankSides.join(', ')} · printed blank
                  </Text>
                )}
              </div>
            )}
          </div>

          {/* строки ленты */}
          <div ref={linesRef} className='flex min-w-0 flex-col'>
            <LineRow
              line='logo'
              name={LINE_META['logo'].name}
              source={LINE_META['logo'].source}
              overridden={logoCustom}
              resetLabel='the GRBPWR mark'
              onReset={edit ? () => setCareLabel(g, s, { logoMediaId: 0 }) : undefined}
              highlight={focusLine === 'logo'}
            >
              <LogoDoor
                url={model.logoUrl}
                custom={logoCustom}
                disabled={!edit}
                onPick={(m: common_MediaFull) => {
                  if (!m.id) return;
                  setLogoHint(m.media?.fullSize?.mediaUrl || '');
                  setCareLabel(g, s, { logoMediaId: m.id });
                }}
              />
            </LineRow>

            <LineRow
              line='product'
              name={LINE_META['product'].name}
              source={LINE_META['product'].source}
              overridden={!!cw?.colourNameOverridden}
              resetLabel={cw?.colourNameDerived || 'the colourway name'}
              onReset={
                edit && cw ? () => setCareLabelColorway(g, s, cw.id, { colourName: '' }) : undefined
              }
              highlight={focusLine === 'product'}
            >
              {cw ? (
                <div className='flex flex-wrap items-baseline gap-x-2 uppercase'>
                  <span className='text-labelColor'>{sku || 'no SKU'}</span>
                  <span className='text-labelColor'>/</span>
                  <span>
                    <EditableText
                      ariaLabel='colour name on the label'
                      value={cw.colourName}
                      placeholder={cw.colourNameDerived || 'colour name'}
                      disabled={!edit}
                      maxLength={64}
                      onCommit={(t) =>
                        setCareLabelColorway(g, s, cw.id, {
                          colourName: colourNameOverride(t, cw.colourNameDerived),
                        })
                      }
                    />
                  </span>
                  <span className='text-labelColor'>/ [{size?.label ?? '—'}]</span>
                </div>
              ) : (
                <Text size='micro' variant='label'>
                  —
                </Text>
              )}
            </LineRow>

            <LineRow
              line='care-symbols'
              name={LINE_META['care-symbols'].name}
              source={LINE_META['care-symbols'].source}
              highlight={focusLine === 'care-symbols'}
            >
              <CareSymbolsDoor
                disabled={!edit || !canStyle}
                reason={!canStyle ? 'care is a style fact — needs products:write' : undefined}
              />
            </LineRow>

            <LineRow
              line='care-text'
              name={LINE_META['care-text'].name}
              source={LINE_META['care-text'].source}
              overridden={!!data?.care.proseOverridden}
              resetLabel='the dictionary prose'
              onReset={edit ? () => setCareLabel(g, s, { careProseLines: [] }) : undefined}
              highlight={focusLine === 'care-text'}
            >
              <EditableLines
                ariaLabel='care text on the label'
                lines={data?.care.prose ?? []}
                placeholder='pick care symbols — the text follows them'
                disabled={!edit}
                hint='one sentence per line · printed in capitals, three lines at most'
                onCommit={(t) =>
                  setCareLabel(g, s, {
                    careProseLines: linesOverride(t, data?.care.derivedProse ?? []),
                  })
                }
              />
            </LineRow>

            <LineRow
              line='made-in'
              name={LINE_META['made-in'].name}
              source={picks.has(cw?.id ?? 0) ? 'staged' : LINE_META['made-in'].source}
              highlight={focusLine === 'made-in'}
            >
              {cw ? (
                <MadeInValue
                  countryName={cw.countryName}
                  pickedCode={picks.get(cw.id)}
                  unavailable={cw.holes.some((h) => h.code === 'colorway-unavailable')}
                  countries={countries}
                  othersWithout={
                    colorways.filter(
                      (c) =>
                        c.id !== cw.id &&
                        !c.countryCode &&
                        !picks.has(c.id) &&
                        !c.holes.some((h) => h.code === 'colorway-unavailable'),
                    ).length
                  }
                  disabled={!edit || !techCardId}
                  onPick={pickCountry}
                />
              ) : (
                <Text size='micro' variant='label'>
                  —
                </Text>
              )}
            </LineRow>

            <LineRow
              line='composition'
              name={LINE_META['composition'].name}
              source={LINE_META['composition'].source}
              overridden={!!cw?.fiberOverride}
              resetLabel='the composition from the BOM'
              onReset={
                edit && cw
                  ? () => {
                      setCompositionOpen(false);
                      setCareLabelColorway(g, s, cw.id, { fibers: [] });
                    }
                  : undefined
              }
              highlight={focusLine === 'composition'}
            >
              {cw && compositionOpen ? (
                <FibreEditor
                  key={cw.id}
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
                  onDone={() => setCompositionOpen(false)}
                />
              ) : (
                <ValueDoor
                  disabled={!edit || !cw}
                  onOpen={() => setCompositionOpen(true)}
                  aria-label='composition — click to change'
                >
                  {derivedParts.length ? (
                    <span className='flex flex-col gap-0.5 uppercase' data-composition-parts=''>
                      {compositionPartTexts(derivedParts, data?.fibers ?? new Map()).map((p) => (
                        <span key={p.part}>
                          <span className='text-labelColor'>{p.name}</span> {p.text}
                        </span>
                      ))}
                    </span>
                  ) : (
                    <span className='text-labelColor'>
                      {cw ? 'no composition on the BOM yet — click to write it here' : '—'}
                    </span>
                  )}
                </ValueDoor>
              )}
            </LineRow>

            <LineRow
              line='qr'
              name={LINE_META['qr'].name}
              source={LINE_META['qr'].source}
              overridden={qr.qrPreset !== 'storefront'}
              resetLabel='the storefront link'
              onReset={
                edit ? () => setCareLabel(g, s, { qrPreset: '', qrTemplate: '' }) : undefined
              }
              highlight={focusLine === 'qr'}
            >
              <QrDoor
                preset={qr.qrPreset}
                template={careLabel?.qrTemplate ?? ''}
                example={qrExampleUrl}
                disabled={!edit}
                onChange={(p) => setCareLabel(g, s, p)}
              />
            </LineRow>

            <LineRow
              line='caption'
              name={LINE_META['caption'].name}
              source={LINE_META['caption'].source}
              overridden={(data?.label.caption.length ?? 0) > 0}
              resetLabel={QR_CAPTION.join(' / ')}
              onReset={edit ? () => setCareLabel(g, s, { backCaptionLines: [] }) : undefined}
              highlight={focusLine === 'caption'}
            >
              <EditableLines
                ariaLabel='QR caption on the label back'
                lines={captionLines(data)}
                disabled={!edit}
                hint='first line above the QR code, second line under it'
                onCommit={(t) =>
                  setCareLabel(g, s, { backCaptionLines: linesOverride(t, QR_CAPTION) })
                }
              />
            </LineRow>

            <LineRow
              line='address'
              name={LINE_META['address'].name}
              source={LINE_META['address'].source}
              overridden={(data?.label.address.length ?? 0) > 0}
              resetLabel='the company address'
              onReset={edit ? () => setCareLabel(g, s, { addressLines: [] }) : undefined}
              highlight={focusLine === 'address'}
            >
              <EditableLines
                ariaLabel='address on the label back'
                lines={addressLines(data)}
                disabled={!edit}
                onCommit={(t) =>
                  setCareLabel(g, s, { addressLines: linesOverride(t, COMPANY_ADDRESS) })
                }
              />
            </LineRow>
          </div>
        </div>

        {/* дыры */}
        <div
          className='flex flex-col gap-2 border-t border-hairline pt-4'
          data-composition-holes=''
        >
          <Text size='micro' variant='label' className='uppercase tracking-label'>
            holes{cw ? ` · ${cw.colourName || cw.baseSku || `#${cw.id}`}` : ''}
          </Text>
          {holes.length === 0 ? (
            <Text size='micro' variant='label'>
              {readiness ? 'none — this colourway prints as shown' : 'checking…'}
            </Text>
          ) : (
            <ul className='flex flex-col gap-1.5'>
              {holes.map((h) => {
                const line = holeLine(h);
                const body = (
                  <>
                    <Pill tone={isBlocking(h) ? 'warn' : 'attention'}>
                      {isBlocking(h) ? 'blocks' : 'warn'}
                    </Pill>
                    <Text size='micro' className='min-w-0'>
                      {h.message}
                    </Text>
                  </>
                );
                return (
                  <li key={`${h.code}|${h.message}`} data-hole={h.code}>
                    {line ? (
                      <button
                        type='button'
                        onClick={() => goTo(line)}
                        className={cn(
                          'flex cursor-pointer items-start gap-2 text-left hover:underline focus-visible:outline focus-visible:outline-1 focus-visible:outline-textColor',
                        )}
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
          )}
        </div>
      </div>
    </Section>
  );
}
