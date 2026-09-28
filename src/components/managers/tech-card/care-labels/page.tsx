// СОСТАВНИКИ (care labels) → ZIP ДЛЯ ПЕЧАТИ ЛЕНТЫ — голый маршрут `/tech-cards/:id/care-labels`
// (план §9, дизайн §4). Каркас — как у схемы сборки (`assembly-print/page.tsx`): печатается
// СОХРАНЁННАЯ карточка (GetTechCard), не черновик редактора; кнопка ждёт гейт готовности печати;
// всё, что набрано по адресу, подписано `docKey`, чтобы при смене `:id` кнопка не отдала прошлую
// карточку.
//
// Зоны: слева колорвеи (чекбокс «в ZIP»), в центре четыре стороны выбранного колорвей × размер в
// реальном масштабе, справа настройки (печать, QR, количества), внизу дыры и `download zip`.
import { PrintDegradedNotice } from 'components/managers/print/degraded-notice';
import { usePrintReady } from 'components/managers/print/use-print-ready';
import { ROUTES } from 'constants/routes';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button } from 'ui/components/button';
import CheckboxCommon from 'ui/components/checkbox';
import { Chip, ChipRow } from 'ui/components/chip';
import { GroupLabel } from 'ui/components/group-label';
import { Pill } from 'ui/components/pill';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';
import { useCareLabelSource, variantSku, type CareLabelColorway } from './adapter';
import { isBlocking } from './holes';
import { holeAddress, HolesPanel } from './holes-panel';
import { QrSettings } from './qr-settings';
import { collectReadiness } from './readiness';
import { placeholderSide, SidesPreview, type PreviewSide, type PreviewView } from './sides-preview';
import { useCareLabelPrefs, type PrintMode } from './use-care-label-prefs';

/**
 * Подпись входов экрана: карточка ИЗ АДРЕСА. Роутер переиспользует страницу при смене `:id`, и без
 * подписи выбор колорвея/размера прошлой карточки пережил бы переход.
 */
export const docKey = (routeId: string | undefined) => `care-labels|${routeId ?? ''}`;

/** Стороны превью выбранного варианта. До раскладки E6 — заглушки с данными варианта. */
function previewSides(
  cw: CareLabelColorway | undefined,
  size: { label: string; skuOrd: number | null } | undefined,
  mode: PrintMode,
): PreviewSide[] {
  const sku =
    cw?.baseSku && size?.skuOrd != null ? variantSku(cw.baseSku, size.skuOrd) : cw?.baseSku || '—';
  const head = [
    `${sku} / ${(cw?.colourName || '—').toUpperCase()} / [${size?.label || '—'}]`,
    `MADE IN ${(cw?.countryName || '—').toUpperCase()}`,
  ];
  // В дуплексе изнанка сверстана припуском слева (переворот по короткой стороне); в симплексе обе
  // стороны — отдельные ленты с припуском справа (план §6.5).
  const backSeam = mode === 'duplex' ? 'left' : 'right';
  return [
    {
      key: 'A-face',
      title: 'A · face',
      back: false,
      doc: placeholderSide('A face', 'right', [...head, 'layout pending']),
    },
    {
      key: 'A-back',
      title: 'A · back',
      back: true,
      doc: placeholderSide('A back', backSeam, ['SCAN QR CODE', 'layout pending']),
    },
    {
      key: 'B-face',
      title: 'B · face (composition)',
      back: false,
      doc: placeholderSide('B face', 'right', ['composition', 'layout pending']),
    },
    {
      key: 'B-back',
      title: 'B · back (composition)',
      back: true,
      doc: placeholderSide('B back', backSeam, ['composition', 'layout pending']),
    },
  ];
}

export function TechCardCareLabels() {
  const { id } = useParams<{ id: string }>();
  const numId = id ? parseInt(id, 10) : undefined;
  const techCardId = numId && Number.isFinite(numId) && numId > 0 ? numId : undefined;
  const key = docKey(id);

  const { data, deps, isLoading, isError } = useCareLabelSource(techCardId);
  const { ready, degraded } = usePrintReady(deps);

  // Выбор оператора на экране — под подписью карточки: чужой выбор после смены `:id` сбрасывается.
  const [pick, setPick] = useState<{
    key: string;
    colorwayId: number | null;
    sizeId: number | null;
    excluded: number[];
  }>({ key, colorwayId: null, sizeId: null, excluded: [] });
  const current = pick.key === key ? pick : { key, colorwayId: null, sizeId: null, excluded: [] };
  // Режим, QR, запас и источник количеств — на карточку, в localStorage (`care-labels:v1:<id>`).
  const { prefs, update: updatePrefs } = useCareLabelPrefs(techCardId);
  const mode = prefs.mode;
  const setMode = (m: PrintMode) => updatePrefs({ mode: m });
  const [view, setView] = useState<PreviewView>('ribbon');
  const [zoom, setZoom] = useState<1 | 2>(1);

  const colorways = data?.colorways ?? [];
  const sizes = data?.sizes ?? [];
  const selectedCw = colorways.find((c) => c.id === current.colorwayId) ?? colorways[0];
  const selectedSize = sizes.find((s) => s.id === current.sizeId) ?? sizes[0];
  const included = (cwId: number) => !current.excluded.includes(cwId);

  const setChoice = (next: Partial<Omit<typeof current, 'key'>>) =>
    setPick({ ...current, ...next, key });

  useEffect(() => {
    const title = data?.styleNumber ? `${data.styleNumber} — care labels` : 'care labels';
    document.title = title;
  }, [data?.styleNumber]);

  // Живой пример ссылки QR — для варианта, выбранного в превью.
  const qrExample = useMemo(() => {
    if (!selectedCw || !selectedSize) return null;
    const sku =
      selectedCw.baseSku && selectedSize.skuOrd != null
        ? variantSku(selectedCw.baseSku, selectedSize.skuOrd)
        : '';
    return {
      label: `${sku || selectedCw.baseSku || `colourway #${selectedCw.id}`} · ${selectedSize.label}`,
      vars: {
        base_sku: selectedCw.baseSku,
        sku,
        size: selectedSize.name,
        colorway_id: selectedCw.id,
        style: data?.styleNumber ?? '',
      },
    };
  }, [selectedCw, selectedSize, data?.styleNumber]);

  const sides = useMemo(
    () => previewSides(selectedCw, selectedSize, mode),
    [selectedCw, selectedSize, mode],
  );

  // Дыры со всех источников и гейт кнопки (readiness.ts): блок колорвея держит только его,
  // общий — весь архив. Раскладка (E6) добавит свои дыры по колорвею.
  const readiness = useMemo(
    () =>
      data
        ? collectReadiness({
            data,
            excluded: current.excluded,
            prefs: { qrPreset: prefs.qrPreset, qrTemplate: prefs.qrTemplate },
          })
        : null,
    [data, current.excluded, prefs.qrPreset, prefs.qrTemplate],
  );
  const blocking = readiness?.blockers ?? [];
  const canExport = ready && !!readiness?.canExport;
  const showMessage = useSnackBarStore((st) => st.showMessage);

  return (
    <div className='flex min-h-screen flex-col bg-pageBg' data-care-labels-page={key}>
      <div className='sticky top-0 z-10 flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-borderColor bg-bgColor px-4 py-3'>
        <div className='flex items-center gap-3'>
          <Button asChild variant='secondary' size='lg'>
            <Link to={id ? `/tech-cards/${id}` : ROUTES.techCards}>← back</Link>
          </Button>
          <Text variant='uppercase' size='large'>
            care labels — print
          </Text>
          {data?.styleNumber && (
            <Text variant='label' size='small'>
              {data.styleNumber} · {data.styleName}
            </Text>
          )}
        </div>
        <div className='ml-auto flex items-center gap-3'>
          {blocking.length > 0 && (
            <Text variant='errorLabel' size='small'>
              {blocking.length} blocking {blocking.length === 1 ? 'hole' : 'holes'}
            </Text>
          )}
          <Button
            variant='main'
            size='lg'
            className='uppercase'
            data-care-download=''
            data-care-gate={canExport ? 'open' : 'blocked'}
            // Гейт: данные доехали и ни один блок не держит архив. Адрес первого блока — в подсказке.
            disabled={!canExport}
            title={
              !ready
                ? 'waiting for the data'
                : blocking.length > 0
                  ? `blocked: ${[holeAddress(blocking[0], colorways), blocking[0].message].filter(Boolean).join(' — ')}`
                  : 'build the zip for the ticked colourways'
            }
            // Сборка архива — S5; до неё кнопка только честно говорит, что гейт открыт.
            onClick={() => showMessage('the zip export is not built yet', 'error')}
          >
            download zip
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className='flex justify-center py-20'>
          <Text variant='inactive' className='animate-pulse'>
            loading tech card…
          </Text>
        </div>
      ) : isError || !data ? (
        <div className='flex flex-col items-center gap-4 py-20'>
          <Text variant='inactive' className='uppercase'>
            tech card not found
          </Text>
          <Button asChild variant='main' size='lg' className='uppercase'>
            <Link to={ROUTES.techCards}>← back to tech cards</Link>
          </Button>
        </div>
      ) : (
        <div className='flex flex-col gap-gutter p-gutter'>
          <PrintDegradedNotice items={degraded} />
          <div className='grid grid-cols-1 items-start gap-gutter lg:grid-cols-[minmax(240px,300px)_minmax(0,1fr)_minmax(280px,360px)]'>
            {/* 1. КОЛОРВЕИ */}
            <Section title='colourways' question='— which colourways go into the zip'>
              <div className='flex flex-col' data-care-zone='colorways'>
                {colorways.length === 0 ? (
                  <Text size='micro' variant='label'>
                    this card has no colourways
                  </Text>
                ) : (
                  colorways.map((c) => {
                    const blocks = (
                      readiness?.colorways.find((r) => r.colorwayId === c.id)?.holes ?? c.holes
                    ).filter(isBlocking).length;
                    const selected = c.id === selectedCw?.id;
                    return (
                      <div
                        key={c.id}
                        data-colorway={c.id}
                        className={`flex items-start gap-2 border-b border-hairline py-2 last:border-b-0 ${selected ? 'bg-hairline' : ''}`}
                      >
                        <CheckboxCommon
                          name={`care-cw-${c.id}`}
                          checked={included(c.id)}
                          aria-label={`include ${c.baseSku || c.colourName} in the zip`}
                          className='mt-0.5'
                          onChange={(on: boolean) =>
                            setChoice({
                              excluded: on
                                ? current.excluded.filter((x) => x !== c.id)
                                : [...current.excluded, c.id],
                            })
                          }
                        />
                        <button
                          type='button'
                          className='flex min-w-0 flex-1 cursor-pointer flex-col items-start gap-0.5 text-left'
                          data-colorway-pick=''
                          aria-pressed={selected}
                          onClick={() => setChoice({ colorwayId: c.id })}
                        >
                          <Text size='control' className='uppercase'>
                            {c.baseSku || 'no SKU'}
                          </Text>
                          <Text size='micro' variant='label'>
                            {c.colourName || 'no colour name'} · {c.countryName || 'no country'}
                          </Text>
                        </button>
                        {blocks > 0 ? (
                          <Pill tone='warn'>{blocks} holes</Pill>
                        ) : (
                          <Pill tone={c.active ? 'ok' : 'mut'}>{c.active ? 'ready' : 'draft'}</Pill>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </Section>

            {/* 2. ПРЕВЬЮ */}
            <Section title='preview' question='— the four sides at real size' className='min-w-0'>
              <div className='flex flex-col gap-3' data-care-zone='preview'>
                <div className='flex flex-wrap items-center gap-x-6 gap-y-2'>
                  <div className='flex items-center gap-2'>
                    <Text variant='label' size='small'>
                      size
                    </Text>
                    <ChipRow>
                      {sizes.map((s) => (
                        <Chip
                          key={s.id}
                          nonForm
                          pressed={s.id === selectedSize?.id}
                          selected={s.id === selectedSize?.id}
                          onClick={() => setChoice({ sizeId: s.id })}
                        >
                          {s.label}
                        </Chip>
                      ))}
                    </ChipRow>
                  </div>
                  <div className='flex items-center gap-2'>
                    <Text variant='label' size='small'>
                      view
                    </Text>
                    <ChipRow>
                      <Chip
                        nonForm
                        pressed={view === 'ribbon'}
                        selected={view === 'ribbon'}
                        onClick={() => setView('ribbon')}
                        title='each side as it is printed on the ribbon'
                      >
                        as printed
                      </Chip>
                      <Chip
                        nonForm
                        pressed={view === 'flipped'}
                        selected={view === 'flipped'}
                        onClick={() => setView('flipped')}
                        title='backs mirrored, as they lie after the flip — the seam allowances must coincide'
                      >
                        after the flip
                      </Chip>
                    </ChipRow>
                  </div>
                  <div className='flex items-center gap-2'>
                    <Text variant='label' size='small'>
                      zoom
                    </Text>
                    <ChipRow>
                      <Chip
                        nonForm
                        pressed={zoom === 1}
                        selected={zoom === 1}
                        onClick={() => setZoom(1)}
                      >
                        ×1
                      </Chip>
                      <Chip
                        nonForm
                        pressed={zoom === 2}
                        selected={zoom === 2}
                        onClick={() => setZoom(2)}
                      >
                        ×2
                      </Chip>
                    </ChipRow>
                  </div>
                </div>
                {selectedCw ? (
                  <SidesPreview sides={sides} view={view} zoom={zoom} />
                ) : (
                  <Text size='micro' variant='label'>
                    nothing to preview — the card has no colourways
                  </Text>
                )}
              </div>
            </Section>

            {/* 3. НАСТРОЙКИ */}
            <Section title='settings' question='— how the zip is printed'>
              <div
                className='flex flex-col'
                data-care-zone='settings'
                // Снимок настроек для проб экрана (back-compat записи, ключ на карточку).
                data-care-prefs={JSON.stringify(prefs)}
              >
                <GroupLabel flush>print</GroupLabel>
                <ChipRow>
                  <Chip
                    nonForm
                    pressed={mode === 'duplex'}
                    selected={mode === 'duplex'}
                    onClick={() => setMode('duplex')}
                    title='face and back on one ribbon: pages go face, back, face, back… — flip on the SHORT edge'
                  >
                    duplex
                  </Chip>
                  <Chip
                    nonForm
                    pressed={mode === 'simplex'}
                    selected={mode === 'simplex'}
                    onClick={() => setMode('simplex')}
                    title='face and back are two separate labels, stacked and sewn by the same edge — twice the labels'
                  >
                    simplex
                  </Chip>
                </ChipRow>
                <GroupLabel>qr code</GroupLabel>
                <QrSettings prefs={prefs} onChange={updatePrefs} example={qrExample} />
                <GroupLabel>quantities</GroupLabel>
                <Text size='micro' variant='label' data-care-zone='quantities'>
                  colourway × size grid — coming next
                </Text>
              </div>
            </Section>
          </div>

          {/* 4. ДЫРЫ */}
          <Section title='holes' question='— what blocks the zip and what goes into the README'>
            {readiness && data ? (
              <HolesPanel
                readiness={readiness}
                colorways={colorways}
                techCardId={data.techCardId || techCardId || 0}
              />
            ) : null}
          </Section>
        </div>
      )}
    </div>
  );
}
