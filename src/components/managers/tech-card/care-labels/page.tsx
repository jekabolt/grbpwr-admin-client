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
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button } from 'ui/components/button';
import CheckboxCommon from 'ui/components/checkbox';
import { Chip, ChipRow } from 'ui/components/chip';
import { GroupLabel } from 'ui/components/group-label';
import { Pill } from 'ui/components/pill';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';
import { useCareLabelSource, variantSku } from './adapter';
import { isBlocking } from './holes';
import { holeAddress, HolesPanel } from './holes-panel';
import { computeQuantities, emptyGrid, fromRun, type QtyGrid } from './quantities';
import { QuantitiesGrid } from './quantities-grid';
import { QrSettings } from './qr-settings';
import { collectReadiness } from './readiness';
import type { ManifestColorway } from './manifest';
import { planPrint, previewASides, type PrintSet } from './pages';
import { buildPrintJob, compositionsOf, planAll } from './print-job';
import { SidesPreview, type PreviewSide, type PreviewView } from './sides-preview';
import { createShaper, type Shaper } from './text-outline';
import {
  effectiveQrTemplate,
  qrLink,
  useCareLabelPrefs,
  type PrintMode,
} from './use-care-label-prefs';

/**
 * Подпись входов экрана: карточка ИЗ АДРЕСА. Роутер переиспользует страницу при смене `:id`, и без
 * подписи выбор колорвея/размера прошлой карточки пережил бы переход.
 */
export const docKey = (routeId: string | undefined) => `care-labels|${routeId ?? ''}`;

/**
 * Стороны превью выбранного варианта — из полного плана колорвея (настоящая раскладка E6, припуск
 * как в режиме). A — по ID размера (`previewASides`): подпись `XS [44]` бывает у двух размеров, и
 * превью показало бы лицо соседа с его SKU. A-изнанка общая на колорвей, если QR не по размеру.
 */
function previewSides(
  set: PrintSet | undefined,
  sizeId: number | undefined,
  said: { aFace: string; aBack: string },
): PreviewSide[] {
  if (!set || sizeId == null) return [];
  const all = [...set.sides.values()];
  const out: PreviewSide[] = [];
  const { face: faceA, back: backA } = previewASides(set, sizeId);
  if (faceA)
    out.push({
      key: 'A-face',
      title: 'A · face',
      back: false,
      doc: faceA.side.doc,
      text: said.aFace,
    });
  if (backA)
    out.push({
      key: 'A-back',
      title: 'A · back (QR)',
      back: true,
      doc: backA.side.doc,
      text: said.aBack,
    });
  for (const p of all) {
    if (p.label === 'A') continue;
    out.push({
      key: `${p.label}-${p.role}`,
      title: `${p.label} · ${p.role} (composition)`,
      back: p.role === 'back',
      doc: p.side.doc,
      text: p.side.report.columns.map((c) => c.part).join(' · ') || undefined,
    });
  }
  return out;
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
    /** Ручная сетка количеств — НЕ хранится (§9.3): введена на один раз. */
    manual: QtyGrid;
  }>({ key, colorwayId: null, sizeId: null, excluded: [], manual: {} });
  const current =
    pick.key === key ? pick : { key, colorwayId: null, sizeId: null, excluded: [], manual: {} };
  // Режим, QR, запас и источник количеств — на карточку, в localStorage (`care-labels:v1:<id>`).
  const { prefs, update: updatePrefs } = useCareLabelPrefs(techCardId);
  const mode = prefs.mode;
  const setMode = (m: PrintMode) => updatePrefs({ mode: m });
  const [view, setView] = useState<PreviewView>('ribbon');
  // «После переворота» есть только в дуплексе: в симплексе переворота нет (обе стороны — ленты).
  const shownView: PreviewView = mode === 'duplex' ? view : 'ribbon';
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

  // Шейпер (три шрифта ленты) — один на вкладку; не загрузился — общий блок `fonts-failed`.
  const [shaper, setShaper] = useState<Shaper | null>(null);
  const [fontsFailed, setFontsFailed] = useState(false);
  useEffect(() => {
    let live = true;
    createShaper().then(
      (sh) => live && setShaper(sh),
      () => live && setFontsFailed(true),
    );
    return () => {
      live = false;
    };
  }, []);

  // Полный план (каждый колорвей × размер по копии): стороны превью и дыры раскладки. Шаблон QR
  // печатается в поле посимвольно — вёрстка всех колорвеев идёт за отложенным значением.
  const qrPrefs = useDeferredValue(
    useMemo(
      () => ({ qrPreset: prefs.qrPreset, qrTemplate: prefs.qrTemplate }),
      [prefs.qrPreset, prefs.qrTemplate],
    ),
  );
  const compositions = useMemo(() => (data ? compositionsOf(data) : null), [data]);
  const fullPlan = useMemo(
    () =>
      shaper && data && compositions ? planAll(shaper, data, compositions, mode, qrPrefs) : null,
    [shaper, data, compositions, mode, qrPrefs],
  );

  const sides = useMemo(() => {
    if (!selectedCw || !selectedSize) return [];
    const sku =
      selectedCw.baseSku && selectedSize.skuOrd != null
        ? variantSku(selectedCw.baseSku, selectedSize.skuOrd)
        : selectedCw.baseSku;
    const qrUrl = qrExample ? qrLink(qrPrefs, qrExample.vars) : '';
    return previewSides(fullPlan?.sets.get(selectedCw.id), selectedSize.id, {
      aFace: [
        `${sku} / ${selectedCw.colourName.toUpperCase()} / [${selectedSize.label}]`,
        selectedCw.countryName ? `MADE IN ${selectedCw.countryName.toUpperCase()}` : '',
      ]
        .filter(Boolean)
        .join(' · '),
      aBack: `QR ${qrUrl}`,
    });
  }, [fullPlan, qrExample, qrPrefs, selectedCw, selectedSize]);

  // Дыры со всех источников и гейт кнопки (readiness.ts): блок колорвея держит только его,
  // общий — весь архив. Раскладка (E6) приходит из полного плана по колорвею.
  // Количества (§9.4): сетка из прогона или ручная, запас на ячейку, итоги A/B.
  const qtyColorways = useMemo(
    () => colorways.map((c) => ({ id: c.id, label: c.baseSku || c.colourName || `#${c.id}` })),
    [colorways],
  );
  const selectedRun =
    typeof prefs.source === 'object'
      ? (data?.runs ?? []).find((r) => r.id === (prefs.source as { runId: number }).runId) ?? null
      : null;
  const qtyBase = useMemo<QtyGrid>(() => {
    const cwIds = colorways.map((c) => c.id);
    const sizeIds = sizes.map((s) => s.id);
    if (selectedRun) return fromRun(selectedRun, cwIds, sizeIds);
    // Выбранного прогона нет среди прогонов карточки — пустая сетка, а не чужие цифры.
    if (typeof prefs.source === 'object') return emptyGrid(cwIds, sizeIds);
    return current.manual;
  }, [colorways, sizes, selectedRun, prefs.source, current.manual]);
  const quantities = useMemo(
    () =>
      computeQuantities({
        base: qtyBase,
        colorways: qtyColorways,
        sizeIds: sizes.map((s) => s.id),
        overagePct: prefs.overagePct,
        mode: prefs.mode,
        excluded: current.excluded,
        run: selectedRun,
        // Итоги лент — по файлам полного плана (B2 перелива, пустая изнанка B в simplex), как README.
        plans: fullPlan?.sets ?? null,
      }),
    [
      qtyBase,
      qtyColorways,
      sizes,
      prefs.overagePct,
      prefs.mode,
      current.excluded,
      selectedRun,
      fullPlan,
    ],
  );

  const readiness = useMemo(
    () =>
      data
        ? collectReadiness({
            data,
            excluded: current.excluded,
            prefs: { qrPreset: prefs.qrPreset, qrTemplate: prefs.qrTemplate },
            quantityHoles: quantities.holes,
            zeroColorways: quantities.zeroColorways,
            layoutHoles: fullPlan?.layoutHoles,
            fontsFailed,
          })
        : null,
    [data, current.excluded, prefs.qrPreset, prefs.qrTemplate, quantities, fullPlan, fontsFailed],
  );
  const blocking = readiness?.blockers ?? [];
  // Архив верстается шейпером: пока шрифты едут, кнопка ждёт (упали — блок `fonts-failed`).
  const layoutReady =
    !!fullPlan && qrPrefs.qrTemplate === prefs.qrTemplate && qrPrefs.qrPreset === prefs.qrPreset;
  const canExport = ready && layoutReady && !!readiness?.canExport;
  const showMessage = useSnackBarStore((st) => st.showMessage);
  const [building, setBuilding] = useState(false);

  // ZIP (план §9.6): только колорвеи в архиве (чекбокс + ненулевая строка), настоящие копии с
  // запасом; ячейка 0 файла не даёт. Вёрстка заново — полный план по копии нужен лишь превью.
  const downloadZip = async () => {
    if (!data || !shaper || !compositions || !readiness || !readiness.canExport) return;
    setBuilding(true);
    try {
      const colorwayIds = readiness.colorways.filter((r) => r.included).map((r) => r.colorwayId);
      const job = buildPrintJob({
        data,
        compositions,
        mode,
        qr: prefs,
        colorwayIds,
        copies: (cw, size) => quantities.cells[cw]?.[size] ?? 0,
      });
      const set = planPrint(shaper, job);
      const block = set.holes.find(isBlocking);
      if (block) throw new Error(block.message);
      if (set.files.length === 0) throw new Error('nothing to put into the zip');
      const manifestCws = new Map<number, ManifestColorway>(
        data.colorways.map((c) => [c.id, { baseSku: c.baseSku, colour: c.colourName }]),
      );
      const { buildCareLabelZip, saveBlob } = await import('./zip');
      const zip = await buildCareLabelZip({
        shaper,
        set,
        style: data.styleNumber,
        styleName: data.styleName,
        colorways: manifestCws,
        qrTemplate: effectiveQrTemplate(prefs),
        adminUrl: `${window.location.origin}/tech-cards/${data.techCardId || techCardId || ''}`,
        warnings: [...readiness.warnings, ...set.holes.filter((h) => h.level === 'warn')].filter(
          (h, i, all) => all.findIndex((x) => x.message === h.message) === i,
        ),
      });
      saveBlob(zip.bytes, zip.name);
      showMessage(
        `${zip.name}: ${zip.counts.labelsA} A + ${zip.counts.labelsB} B labels`,
        'success',
      );
    } catch (e) {
      showMessage(`zip failed: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setBuilding(false);
    }
  };

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
            data-care-building={building ? '' : undefined}
            disabled={!canExport || building}
            title={
              !ready
                ? 'waiting for the data'
                : !layoutReady && !fontsFailed
                  ? 'typesetting the labels…'
                  : blocking.length > 0
                    ? `blocked: ${[holeAddress(blocking[0], colorways), blocking[0].message].filter(Boolean).join(' — ')}`
                    : 'build the zip for the ticked colourways'
            }
            onClick={() => void downloadZip()}
          >
            {building ? 'building…' : 'download zip'}
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
                        pressed={shownView === 'ribbon'}
                        selected={shownView === 'ribbon'}
                        onClick={() => setView('ribbon')}
                        title='each side as it is printed on the ribbon'
                      >
                        as printed
                      </Chip>
                      <Chip
                        nonForm
                        pressed={shownView === 'flipped'}
                        selected={shownView === 'flipped'}
                        disabled={mode !== 'duplex'}
                        onClick={() => setView('flipped')}
                        title={
                          mode === 'duplex'
                            ? 'backs mirrored, as they lie after the flip — the seam allowances must coincide'
                            : 'simplex has no flip: face and back are separate labels, both with the allowance on the right'
                        }
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
                {!selectedCw ? (
                  <Text size='micro' variant='label'>
                    nothing to preview — the card has no colourways
                  </Text>
                ) : fontsFailed ? (
                  <Text size='micro' variant='errorLabel'>
                    the label fonts did not load — reload the page
                  </Text>
                ) : sides.length === 0 ? (
                  <Text
                    size='micro'
                    variant='label'
                    className='animate-pulse'
                    data-care-preview-pending=''
                  >
                    typesetting the labels…
                  </Text>
                ) : (
                  <SidesPreview sides={sides} view={shownView} zoom={zoom} />
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
                <QuantitiesGrid
                  colorways={qtyColorways}
                  sizes={sizes}
                  runs={data.runs}
                  prefs={prefs}
                  onPrefs={updatePrefs}
                  base={qtyBase}
                  onBase={(manual) => setChoice({ manual })}
                  quantities={quantities}
                />
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
