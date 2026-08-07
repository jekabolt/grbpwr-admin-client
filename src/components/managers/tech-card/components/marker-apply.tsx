// «Из раскладки» — the marker → costing bridge (Ф4, design §3).
//
// Two surfaces, one write path:
// - MarkerApplyHint sits under a recipe usage's consumption editor and APPLIES a marker's
//   measured consumption into the draft via the usage's own onChange — i.e. through the
//   already-staged UpdateColorwayRecipe flow. No parallel write path exists.
// - MarkerConsumptionBand on the costing tab is DISPLAY-ONLY: the measured figure beside
//   what the recipes currently say, with a delta. Applying happens in the recipe editor,
//   where consumption is edited — the band says so.
//
// The two traps the design names are both honoured here:
// №1 usagePerGarmentQty ignores the scalar once size_consumptions is non-empty — so the
//    scalar mode explicitly CLEARS size_consumptions, and the per-size mode is enabled
//    only at FULL size coverage (a marker for every size of the card range).
// №2 wastage_percent grosses on top of measured consumption, which already includes
//    inter-piece waste — the dialog warns and names the number, but never rewrites it.
//
// Ф3 добавляет третье правило: НОРМА ВЕДЁТ. Из раскладок одной ткани человек назначает
// нормировочную (`is_norm`, отдельный RPC), и `betterMarker` ставит её ПЕРВЫМ ключом — решение
// бьёт эвристики «свой колорвей» и «свежесть». Отсюда же следует главное ограничение (§6.4):
// FK от рецепта к маркеру НЕ СУЩЕСТВУЕТ. Применение КОПИРУЕТ число в usage.consumption, поэтому
// переназначение нормы не пересчитывает ни одной строки рецепта и никогда не пересчитает. Оба
// экрана обязаны сказать это словами — полоса называет расхождение вслух («рецепты не
// пересчитаны»), диалог называет копирование — и ни один не пытается свести их сам: молчаливое
// авто-применение подменило бы решение человека числом, которого он не выбирал.
import type { common_TechCard, common_TechCardMarkerSummary } from 'api/proto-http/admin';
import { useMemo, useState } from 'react';
import { useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { Chip, ChipRow } from 'ui/components/chip';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { Pill } from 'ui/components/pill';
import Selector from 'ui/components/selector';
import Text from 'ui/components/text';
import { parseDecimalNumber } from 'utils/decimal';
import {
  compositionLabel,
  compositionOf,
  consumptionCm,
  decNum,
  betterMarker,
  isLegacyNorm,
  latestPerSize,
  markersForLine,
  markerWasteDecomposition,
  pieceSetChanged,
  scalarNormRefusal,
  toBomUnit,
} from './nesting/marker-io';
import type { TechCardFormData } from './schema';

// ── recipe-side apply ───────────────────────────────────────────────────────────────────

export function MarkerApplyHint({
  markers,
  colorwayId = 0,
  lineKey,
  unit,
  wastagePercent,
  articleWidth,
  sizeIds,
  sizeNameById,
  canEdit,
  onApply,
}: {
  markers: common_TechCardMarkerSummary[] | undefined;
  // Колорвей, чей рецепт редактируется. Список уже отфильтрован (свои + общие), но выбирать
  // ЛУЧШИЙ надо тоже с оглядкой на принадлежность, иначе свежий общий маркер перебьёт
  // собственный — см. betterMarker.
  colorwayId?: number;
  lineKey: string;
  unit: string;
  wastagePercent: string;
  // Effective article's CUTTING width in cm (roll − 2×кромка) — the same quantity a marker
  // records in fabricWidthCm, so the two are comparable. '' = unknown.
  articleWidth: string;
  sizeIds: number[];
  sizeNameById: Map<number, string>;
  canEdit: boolean;
  onApply: (patch: {
    consumption?: string;
    sizeConsumptions?: { sizeId: number; consumption: string }[];
    // Wastage provenance (0261) — always sent with the number so the two can never drift.
    consumptionSource?: string;
    wasteSelvedgePct?: string;
    wasteCutPct?: string;
  }) => void;
}) {
  const lineMarkers = markersForLine(markers, lineKey);
  const [open, setOpen] = useState(false);
  const [markerId, setMarkerId] = useState<number>(0);
  const [mode, setMode] = useState<'scalar' | 'perSize'>('scalar');

  // Порядок предпочтения — ОДИН на весь файл и живёт в betterMarker: НОРМА → свой колорвей →
  // свежесть (Ф3.4). Назначение нормы — решение человека, принадлежность и дата — эвристики, и
  // решение бьёт эвристику. Список показывается В ЭТОМ ЖЕ порядке (селектор ниже), чтобы «что
  // предложено» и «что первым в списке» не могли разойтись.
  const ranked = useMemo(
    () => [...lineMarkers].sort(betterMarker(colorwayId)),
    [lineMarkers, colorwayId],
  );
  // Лучший ПРИМЕНИМЫЙ маркер, а если применимых нет — просто лучший.
  //
  // С Ф2 у раскладки может не быть скалярной нормы вовсе (смешанный состав — среднее по составу,
  // в рецепт такое не пишется). Брать сюда просто первого по рангу значило бы: одна смешанная
  // раскладка гасит кнопку «применить» на строке, где рядом лежит совершенно годная однородная.
  // Применимость проверяется ПЕРВОЙ, потому что неприменимое число не лучше любого ранга. Но
  // подмену назначенной нормы применимой раскладкой нельзя делать МОЛЧА: о ней говорят пилюля
  // «норма не даёт расхода» на строке и колаут в диалоге (оба через notTheNorm/normRefusal).
  const preferred = useMemo(() => ranked.find((m) => !scalarNormRefusal(m)) ?? ranked[0], [ranked]);
  // The card's fit reference — a scalar norm taken from a non-base size deserves a callout.
  const baseSampleSizeId = (useWatch<TechCardFormData>({ name: 'baseSampleSizeId' }) ??
    0) as number;
  if (lineMarkers.length === 0 || !preferred) return null;

  const chosen = lineMarkers.find((m) => m.id === markerId) ?? preferred;
  // Назначенная норма линии — величина ОТДЕЛЬНАЯ от выбранного маркера, и путать их нельзя:
  // применяется не всегда она (норма может не выдавать скалярной нормы, а оператор — выбрать
  // другую раскладку руками), и тогда экран обязан назвать, ЧТО именно уйдёт в рецепт.
  const normMarker = lineMarkers.find((m) => m.isNorm === true);
  const normRefusal = normMarker ? scalarNormRefusal(normMarker) : '';
  // consumptionCm сам отказывает на смешанной — арифметики до отказа тут не случается.
  const normCons = normMarker ? consumptionCm(normMarker) : null;
  const normConv = normCons != null ? toBomUnit(normCons, unit) : null;
  const notTheNorm = normMarker != null && (chosen.id ?? 0) !== (normMarker.id ?? 0);
  // ОТКАЗ ИДЁТ ПЕРЕД АРИФМЕТИКОЙ. Смешанная раскладка не выдаёт расход на изделие: её длина —
  // средняя по составу, и записанная в рецепт она завышает мелкие размеры и занижает крупные —
  // ровно та ошибка, ради устранения которой Ф2 и заводилась. Дальше по коду `chosenCons === null`
  // означает «числа нет», и каждая ветка обязана это пережить, а не подставить ноль.
  const chosenRefusal = scalarNormRefusal(chosen);
  const chosenCons = consumptionCm(chosen);
  const conv = chosenCons != null ? toBomUnit(chosenCons, unit) : null;
  const bySize = latestPerSize(lineMarkers, colorwayId);
  const fullCoverage = sizeIds.length > 0 && sizeIds.every((id) => bySize.has(id));
  // Применимость «по размерам» = покрытие И конвертируемость КАЖДОЙ нормы в единицу линии.
  // Раньше кнопку в обоих режимах глушил общий `!conv`; после разделения режимов пер-размерная
  // ветка осталась без гейта единицы — на линии с «пог.м» кнопка жила, а клик молча не делал
  // ничего: apply() выходил на первом же неконвертируемом размере ДО закрытия диалога.
  const perSizeApplicable =
    fullCoverage &&
    sizeIds.every((id) => {
      const m = bySize.get(id);
      const cons = m ? consumptionCm(m) : null;
      return cons != null && toBomUnit(cons, unit) != null;
    });
  // Один предикат «применить возможно» на кнопку и на пояснения — чтобы заметки об отходах не
  // могли рассказывать про норму, которую тот же экран отказался выдавать.
  const applyPossible = mode === 'scalar' ? conv != null && !chosenRefusal : perSizeApplicable;
  const wastage = parseDecimalNumber(wastagePercent);

  const sizeName = (id?: number) => sizeNameById.get(id ?? 0) ?? `#${id}`;
  const compLabel = (m: common_TechCardMarkerSummary) =>
    compositionLabel(compositionOf(m), (id) => sizeName(id)) || 'состав не читается';
  // Label and number from the same marker — the CHOSEN one (the hint used to number by
  // `chosen` and label by the auto-picked marker, which diverged the moment the selector
  // was touched).
  const preview = conv
    ? `${conv.value} ${conv.unit}`
    : chosenCons != null
      ? `${chosenCons} см`
      : '—';

  // Width honesty (design §1): a marker computed for another width is a different norm. Both
  // sides are CUTTING widths — the article's roll minus its кромка, and the width the layout
  // actually ran on. Comparing the roll against the layout would flag every fabric that has a
  // кромка as a mismatch.
  const artW = parseDecimalNumber(articleWidth);
  const chosenW = decNum(chosen.fabricWidthCm);
  const widthMismatch =
    Number.isFinite(artW) && artW > 0 && chosenW > 0 && Math.abs(artW - chosenW) > 0.5;
  // The markers the per-size mode would actually apply — the card's sizes, not every size that
  // happens to carry a marker (a leftover marker for a size since dropped from the card must
  // not colour a warning, or an average, about what will be written).
  const appliedPerSize = sizeIds.map((id) => bySize.get(id)).filter((m) => m != null);
  const perSizeWidths = appliedPerSize.map((m) => decNum(m!.fabricWidthCm)).filter((w) => w > 0);
  const mixedWidths =
    perSizeWidths.length > 1 && Math.max(...perSizeWidths) - Math.min(...perSizeWidths) > 0.5;
  // Честность ширины И в «по размерам». mixedWidths сравнивает маркеры только МЕЖДУ СОБОЙ, и три
  // одинаково чужих (все на 140 см при артикуле 150) проходили молча — ровно та подмена, от
  // которой скалярный режим защищён widthMismatch'ем строкой выше.
  const perSizeWidthMismatch =
    Number.isFinite(artW) && artW > 0 && perSizeWidths.some((w) => Math.abs(artW - w) > 0.5);

  // Scalar-mode spread: a flat norm silently taken from one size understates/overstates the
  // run when sizes diverge — or when the chosen size is not the base sample size.
  const perSizeCons = appliedPerSize
    .map((m) => consumptionCm(m!))
    .filter((c): c is number => c != null && c > 0);
  const spreadPct =
    perSizeCons.length > 1
      ? ((Math.max(...perSizeCons) - Math.min(...perSizeCons)) / Math.min(...perSizeCons)) * 100
      : 0;
  // Размер, С КОТОРОГО снята единая норма, — из состава, а не из легаси-поля size_id (на маркере
  // с составом сервер шлёт там 0). Вопрос имеет смысл только для однородной раскладки: у
  // смешанной нормы нет одного размера, и она сюда не доходит — её гасит отказ.
  const chosenComp = compositionOf(chosen);
  const chosenSizeId = chosenComp.length === 1 ? chosenComp[0].sizeId : 0;
  const offBaseSize =
    baseSampleSizeId > 0 && chosenSizeId > 0 && chosenSizeId !== baseSampleSizeId;
  // Маркер размера, которого НЕТ в размерном ряду карточки (остался от снятого размера или
  // никогда в ряд не входил), — норма ниоткуда: spreadPct его не видит (он считается по размерам
  // ряда), а offBaseSize молчит, пока базовый размер не заполнен. Нарочно НЕ зависит от
  // baseSampleSizeId — это отдельный, более сильный факт.
  const offRunSize = chosenSizeId > 0 && sizeIds.length > 0 && !sizeIds.includes(chosenSizeId);

  // УСЛОВИЯ СЪЁМКИ на том маркере, который реально уйдёт в рецепт (Ф3). Ни одно из двух не
  // запрещает применение: «старая норма» — это раскладка, снятая до того, как условия стали
  // записываться (категория ПРОИЗВОДНАЯ, своего флага у неё нет), а «набор изменился» — сверка
  // отпечатка деталей. Оба — знание, которое есть у экрана и которого нет у оператора, и молчать
  // о нём значит выдать число уверенней, чем оно есть. НЕИЗВЕСТНОСТЬ отпечатка — НЕ изменение:
  // pieceSetChanged намеренно ложен на UNKNOWN, иначе бейджем покрылись бы все старые маркеры разом.
  const perSizeChanged = sizeIds
    .filter((id) => pieceSetChanged(bySize.get(id)))
    .map((id) => sizeName(id));
  const perSizeLegacy = sizeIds
    .filter((id) => bySize.get(id) != null && isLegacyNorm(bySize.get(id)))
    .map((id) => sizeName(id));

  // Provenance stamped with the number (0261): «marker» tells costing this figure ALREADY
  // contains the cutting waste, so the article's wastage_percent must not gross it up a second
  // time. The decomposition is display only. In per-size mode the applied norms come from
  // several markers, so the split is their plain mean — the components are near-identical
  // across a size run (same geometry, same cloth) and the number is never multiplied by
  // anything; a marker with no recorded efficiency contributes nothing and the split stays
  // blank rather than invented.
  const provenance = (used: common_TechCardMarkerSummary[]) => {
    const parts = used.map(markerWasteDecomposition).filter((d) => d != null);
    if (parts.length === 0) return { consumptionSource: 'marker', wasteSelvedgePct: '', wasteCutPct: '' };
    const mean = (pick: (d: { selvedgePct: number; cutPct: number }) => number) =>
      String(Math.round((parts.reduce((s, d) => s + pick(d!), 0) / parts.length) * 100) / 100);
    return {
      consumptionSource: 'marker',
      wasteSelvedgePct: mean((d) => d.selvedgePct),
      wasteCutPct: mean((d) => d.cutPct),
    };
  };

  const apply = () => {
    if (mode === 'scalar') {
      if (!conv || chosenRefusal) return;
      // The scalar mode CLEARS per-size grading (trap №1): a lone per-size row would make
      // the server ignore this very scalar.
      onApply({ consumption: String(conv.value), sizeConsumptions: [], ...provenance([chosen]) });
    } else {
      const rows: { sizeId: number; consumption: string }[] = [];
      const used: common_TechCardMarkerSummary[] = [];
      for (const id of sizeIds) {
        const m = bySize.get(id);
        // latestPerSize держит только ОДНОРОДНЫЕ раскладки, так что отказа здесь быть не может;
        // null всё равно проверяется — молча записать в рецепт ноль хуже, чем не записать ничего.
        const cons = m ? consumptionCm(m) : null;
        const c = cons != null ? toBomUnit(cons, unit) : null;
        if (!c || !m) return;
        rows.push({ sizeId: id, consumption: String(c.value) });
        used.push(m);
      }
      onApply({ sizeConsumptions: rows, ...provenance(used) });
    }
    setOpen(false);
  };

  return (
    <div className='flex flex-wrap items-center gap-1.5'>
      <Text size='nano' variant='label' component='span'>
        из раскладки: {chosenRefusal ? '—' : preview} · «{chosen.name}» ({compLabel(chosen)})
      </Text>
      {/* «Норма» — ПОДПИСЬ, а не порядок. Раньше назначенную раскладку можно было опознать только
          по тому, что её предложили первой, — то есть не отличить от «просто самой свежей». */}
      {chosen.isNorm === true && (
        <Pill tone='ink' title='назначенная нормировочная раскладка этой ткани на карточке'>
          норма
        </Pill>
      )}
      {pieceSetChanged(chosen) && (
        <Pill
          tone='attention'
          title='набор деталей карточки изменился после съёмки этой раскладки — длина измерена по прежнему набору'
        >
          набор изменился
        </Pill>
      )}
      {isLegacyNorm(chosen) && (
        <Pill
          tone='mut'
          title='условия съёмки (припуск, слои, переворот) не записаны — раскладка снята до того, как их стали записывать'
        >
          старая норма
        </Pill>
      )}
      {/* Норма назначена, а предлагается не она — на строке это видно только здесь: диалог с
          объяснением ещё надо открыть, а прочитать число можно и не открывая. */}
      {notTheNorm && normRefusal && (
        <Pill tone='warn' title={normRefusal}>
          норма не даёт расхода
        </Pill>
      )}
      {chosenRefusal && (
        <Pill tone='warn' title={chosenRefusal}>
          {compositionOf(chosen).length > 1 ? 'смешанный состав' : 'состав не читается'}
        </Pill>
      )}
      {canEdit && (
        <Button type='button' variant='secondary' size='xs' onClick={() => setOpen(true)}>
          применить…
        </Button>
      )}

      <ConfirmationModal
        open={open}
        onOpenChange={(o: boolean) => {
          setOpen(o);
          if (!o) {
            setMarkerId(0);
            setMode('scalar');
          }
        }}
        onConfirm={apply}
        onCancel={() => {
          setOpen(false);
          setMarkerId(0);
          setMode('scalar');
        }}
        title='применить расход из раскладки'
        confirmLabel='применить'
        confirmDisabled={
          (mode === 'scalar' && (!conv || !!chosenRefusal)) ||
          (mode === 'perSize' && !perSizeApplicable)
        }
        closeOnConfirm={false}
      >
        <div className='space-y-2'>
          {lineMarkers.length > 1 && mode === 'scalar' && (
            <Selector
              label='маркер'
              value={chosen.id ?? 0}
              // Список идёт ПО РАНГУ (норма → свой колорвей → свежесть), а не в порядке,
              // в котором строки приехали с сервера: первый пункт списка обязан совпадать с тем,
              // что экран предложил сам.
              options={ranked.map((m) => {
                const c = consumptionCm(m);
                return {
                  value: m.id ?? 0,
                  // Неприменимая раскладка остаётся В СПИСКЕ и подписана словом. Спрятать её
                  // значило бы ответить на «а где раскладка, которую я только что снял»
                  // молчанием; подписать «— смешанный состав» — назвать причину там, где её ищут.
                  // «набор изменился» стоит здесь же: это факт о ГОДНОСТИ числа, и узнать его надо
                  // до выбора, а не после. «Старая норма» намеренно осталась ниже, на выбранном
                  // маркере: до Ф3 её несёт КАЖДАЯ строка, и в списке это был бы шум, а не сигнал.
                  label: `${m.isNorm === true ? 'норма · ' : ''}«${m.name}» · ${compLabel(m)} · ${
                    c != null
                      ? `${c} см/ед`
                      : compositionOf(m).length > 1
                        ? 'нормы нет — смешанный состав'
                        : 'нормы нет — состав не читается'
                  }${pieceSetChanged(m) ? ' · набор изменился' : ''}`,
                };
              })}
              onChange={(v: string | number) => setMarkerId(Number(v))}
            />
          )}
          <ChipRow>
            <Chip selected={mode === 'scalar'} pressed={mode === 'scalar'} onClick={() => setMode('scalar')}>
              единой нормой
            </Chip>
            <Chip
              selected={mode === 'perSize'}
              pressed={mode === 'perSize'}
              disabled={!fullCoverage}
              title={
                fullCoverage
                  ? undefined
                  : 'нужна ОДНОРОДНАЯ раскладка на каждый размер карточки — иначе непокрытые размеры дадут ноль и занизят расход. Смешанная раскладка сюда не годится: её длина общая на весь настил, и поделить её по размерам нечем до пер-размерного расхода (Ф2.4)'
              }
              onClick={() => fullCoverage && setMode('perSize')}
            >
              по размерам
            </Chip>
          </ChipRow>

          {/* Отказ сервера, слово в слово. Он длинный намеренно: называет и правило, и что
              делать — применить однородную раскладку либо дождаться Ф2.4. Показывается ВМЕСТО
              «единица не поддерживает»: когда числа нет вовсе, единица уже не при чём. */}
          {mode === 'scalar' && chosenRefusal ? (
            <CalloutBox tone='error'>{chosenRefusal}</CalloutBox>
          ) : (
            mode === 'scalar' &&
            !conv && (
              <CalloutBox tone='error'>
                единица линии BOM ({unit || '—'}) не поддерживает раскладку — расход измерен в
                сантиметрах длины
              </CalloutBox>
            )
          )}
          {/* Тот же отказ по единице — и в «по размерам»: покрытие полное, а применить нечем.
              Без него кнопка гаснет молча, и объяснить это некому. */}
          {mode === 'perSize' && fullCoverage && !perSizeApplicable && (
            <CalloutBox tone='error'>
              единица линии BOM ({unit || '—'}) не поддерживает раскладку — расход измерен в
              сантиметрах длины
            </CalloutBox>
          )}
          {/* Применяется НЕ НОРМА — и это надо сказать до нажатия, а не объяснять потом. Два
              разных случая, и путать их нельзя: экран сам обошёл норму, потому что она не выдаёт
              расхода на изделие (тогда это предупреждение), либо оператор выбрал другую раскладку
              руками (тогда это констатация). Молчаливая подмена назначенной нормы «просто
              применимой» — ровно то, ради чего норма и заводилась. */}
          {mode === 'scalar' && notTheNorm && normMarker && (
            <CalloutBox tone={normRefusal ? 'warning' : 'note'}>
              {normRefusal
                ? `назначенная норма «${normMarker.name}» расхода на изделие не даёт (${
                    compositionOf(normMarker).length > 1
                      ? 'смешанный состав'
                      : 'состав не читается'
                  }) — применится «${chosen.name}», а не она`
                : `применится «${chosen.name}», а НЕ назначенная норма «${normMarker.name}»${
                    normConv ? ` (${normConv.value} ${normConv.unit})` : ''
                  }`}
            </CalloutBox>
          )}
          {mode === 'perSize' && (
            <Text size='nano' variant='label' component='p'>
              {sizeIds
                .map((id) => {
                  const m = bySize.get(id);
                  const cons = m ? consumptionCm(m) : null;
                  const c = cons != null ? toBomUnit(cons, unit) : null;
                  return `${sizeName(id)}: ${c ? `${c.value} ${c.unit}` : '—'}`;
                })
                .join(' · ')}
            </Text>
          )}
          {mode === 'scalar' && widthMismatch && (
            <CalloutBox tone='warning'>
              маркер «{chosen.name}» посчитан для полотна {chosenW} см, артикул слота — {artW} см:
              расход не переносится между ширинами без пересчёта
            </CalloutBox>
          )}
          {mode === 'perSize' && mixedWidths && (
            <CalloutBox tone='warning'>
              маркеры разных размеров посчитаны на разной ширине полотна (
              {Math.min(...perSizeWidths)}–{Math.max(...perSizeWidths)} см) — нормы смешивают
              разные ткани
            </CalloutBox>
          )}
          {mode === 'perSize' && perSizeWidthMismatch && (
            <CalloutBox tone='warning'>
              маркеры посчитаны для полотна {[...new Set(perSizeWidths)].join(' / ')} см, артикул
              слота — {artW} см: расход не переносится между ширинами без пересчёта
            </CalloutBox>
          )}
          {mode === 'scalar' && (offRunSize || offBaseSize || spreadPct > 5) && (
            <CalloutBox tone={offRunSize ? 'warning' : 'note'}>
              {[
                offRunSize
                  ? `единая норма взята с размера ${sizeName(chosenSizeId)}, которого НЕТ в размерном ряду карточки`
                  : offBaseSize
                    ? `единая норма взята с размера ${sizeName(chosenSizeId)}, а базовый размер карточки — ${sizeName(baseSampleSizeId)}`
                    : '',
                spreadPct > 5
                  ? `расход по размерам расходится на ${spreadPct.toFixed(0)}% — рассмотрите режим «по размерам»`
                  : '',
              ]
                .filter(Boolean)
                .join('; ')}
            </CalloutBox>
          )}
          {/* Условия съёмки (Ф3). Ни одно из двух не запрещает применение — и НЕ должно: гейт
              условий живёт в Ф6, а здесь их дело — не дать применить число молча увереннее, чем
              оно есть. */}
          {mode === 'scalar' && pieceSetChanged(chosen) && (
            <CalloutBox tone='warning'>
              набор деталей карточки изменился после съёмки «{chosen.name}»: длина измерена по
              ПРЕЖНЕМУ набору деталей. Применить можно, но число стоит подтвердить пересъёмкой
            </CalloutBox>
          )}
          {mode === 'perSize' && perSizeChanged.length > 0 && (
            <CalloutBox tone='warning'>
              набор деталей карточки изменился после съёмки раскладок размеров{' '}
              {perSizeChanged.join(', ')}: их длины измерены по ПРЕЖНЕМУ набору деталей
            </CalloutBox>
          )}
          {mode === 'scalar' && isLegacyNorm(chosen) && (
            <CalloutBox tone='note'>
              старая норма: у «{chosen.name}» не записаны условия съёмки — ни припуск, ни слои, ни
              политика переворота, а значит по чему именно она снята, сказать нечем. Применить
              можно; пересъёмка запишет условия
            </CalloutBox>
          )}
          {mode === 'perSize' && perSizeLegacy.length > 0 && (
            <CalloutBox tone='note'>
              старая норма у размеров {perSizeLegacy.join(', ')}: условия съёмки (припуск, слои,
              переворот) не записаны
            </CalloutBox>
          )}
          {/* Заметки об отходах — только когда применить ВОЗМОЖНО. Под отказом строка «в норме
              уже сидят отходы …» описывала бы норму, которой нет, прямо под колаутом об этом. */}
          {applyPossible && Number.isFinite(wastage) && wastage > 0 && (
            <CalloutBox tone='note'>
              у линии стоит {wastage}% отходов, но на применённой из раскладки норме костинг их
              НЕ начисляет: измеренная длина уже содержит и межлекальные выпады, и кромку. Процент
              снова начнёт работать, если норму перебить вручную
            </CalloutBox>
          )}
          {applyPossible && (() => {
            // Exactly the markers apply() would use — the preview and the value written must be
            // the same number.
            const used = mode === 'scalar' ? [chosen] : appliedPerSize;
            const parts = used.map((m) => markerWasteDecomposition(m!)).filter((d) => d != null);
            if (parts.length === 0) {
              return (
                <Text size='nano' variant='label' component='p'>
                  раскладка без записанной эффективности — отходы не разложить на кромку и выпады
                </Text>
              );
            }
            const avg = (pick: (d: { selvedgePct: number; cutPct: number }) => number) =>
              parts.reduce((s, d) => s + pick(d!), 0) / parts.length;
            const sv = avg((d) => d.selvedgePct);
            const cut = avg((d) => d.cutPct);
            return (
              <Text size='nano' variant='label' component='p'>
                в норме уже сидят отходы: кромка {sv.toFixed(1)}% + межлекальные выпады{' '}
                {cut.toFixed(1)}% (от площади деталей)
                {sv === 0 ? ' — кромка артикула не задана' : ''}
              </Text>
            );
          })()}
          {/* §6.4 сказанное там, где оно случается. Кнопка КОПИРУЕТ число: ссылки на раскладку в
              рецепте не остаётся, и никакое последующее событие — ни пересъёмка, ни назначение
              другой нормы — этот рецепт не тронет. */}
          <Text size='nano' variant='label' component='p'>
            запись уйдёт при сохранении карточки (рецепт колорвея staged-сейвом). Число
            КОПИРУЕТСЯ: связи рецепта с раскладкой нет — переназначат норму или переснимут
            раскладку, рецепт сам не пересчитается, применять придётся заново
          </Text>
        </div>
      </ConfirmationModal>
    </div>
  );
}

// ── costing-side display band ───────────────────────────────────────────────────────────

export function MarkerConsumptionBand({ techCard }: { techCard?: common_TechCard }) {
  const markers = techCard?.markers ?? [];
  const bomLines = techCard?.techCard?.bomItems ?? [];
  const colorways = techCard?.colorways ?? [];

  const rows = useMemo(() => {
    return bomLines
      .filter((b) => b.lineKey && markersForLine(markers, b.lineKey).length > 0)
      .map((b) => {
        const lineMarkers = markersForLine(markers, b.lineKey!);
        // ТОТ ЖЕ компаратор, что в подсказке рецепта: НОРМА → свежесть. Здесь стояла голая
        // сортировка по updatedAt, и это была не мелочь: полоса называла «самую свежую»
        // раскладку там, где рецепт применяли из назначенной нормы, — два экрана про одну ткань
        // показывали разные числа, и расхождение выглядело ошибкой рецепта. colorwayId = 0
        // намеренно: полоса КАРТОЧНАЯ, не колорвейная (см. markersOfColorway), и ключ
        // принадлежности здесь выключен — сравнивать колорвеи между собой она не должна.
        const ranked = [...lineMarkers].sort(betterMarker(0));
        // Смешанная раскладка не гасит собой применимую только потому, что стоит выше по рангу.
        const best = ranked.find((m) => !scalarNormRefusal(m)) ?? ranked[0];
        const refusal = scalarNormRefusal(best);
        const cons = consumptionCm(best);
        const conv = cons != null ? toBomUnit(cons, b.unit ?? '') : null;
        // Пропуск лучшего маркера — ФАКТ, а не служебная деталь: пропущенной может оказаться и
        // САМА НАЗНАЧЕННАЯ НОРМА (смешанный состав расхода на изделие не выдаёт), и тогда полоса
        // показывает число не с неё. В диалоге применения пропуск виден в селекторе с причиной;
        // у полосы селектора нет — значит, нужна пометка.
        const skipped = ranked.length > 0 && best !== ranked[0] ? ranked[0] : null;
        // What the recipes currently say for this slot: distinct non-empty scalars across
        // colourways (a per-size graded usage shows as «по размерам»). Кто внёс скаляр —
        // запоминается: дельта против чужого колорвея — ложная тревога (его артикул может быть
        // другой ширины, и «расхождение» — это расхождение тканей, а не рецепта с раскладкой).
        const scalars = new Set<string>();
        const scalarCws = new Set<number>();
        // Скаляры, ПРИМЕНЁННЫЕ ИЗ РАСКЛАДКИ, с колорвеем каждого — сырьё для §6.4 ниже. Ручные
        // числа сюда не попадают: рецепт, набранный руками, ничего про норму не обещал.
        const markerScalars: { cw: number; value: string }[] = [];
        let perSize = false;
        for (const cw of colorways) {
          const cwId = Number(cw.colorwayId ?? 0);
          for (const u of cw.usages ?? []) {
            if ((u.bomLineKey ?? '') !== b.lineKey) continue;
            if ((u.sizeConsumptions ?? []).length > 0) perSize = true;
            else if (u.consumption?.value) {
              scalars.add(u.consumption.value);
              scalarCws.add(cwId);
              if ((u.consumptionSource ?? '') === 'marker')
                markerScalars.push({ cw: cwId, value: u.consumption.value });
            }
          }
        }
        const current = perSize
          ? 'по размерам'
          : scalars.size === 0
            ? '—'
            : scalars.size === 1
              ? [...scalars][0]
              : `расходятся (${[...scalars].join(' / ')})`;
        const bestCw = Number(best.colorwayId ?? 0);
        const delta =
          conv &&
          !perSize &&
          scalars.size === 1 &&
          Number([...scalars][0]) > 0 &&
          (bestCw === 0 || scalarCws.has(bestCw))
            ? ((conv.value - Number([...scalars][0])) / Number([...scalars][0])) * 100
            : null;

        // §6.4 — ПЕРЕСЧЁТА НЕТ И НЕ БУДЕТ. FK от рецепта к маркеру не существует: применение
        // КОПИРУЕТ длину в tech_card_colorway_usage.consumption, и переназначение нормы не
        // трогает ни одной строки рецепта. Значит «в рецепте лежит применённое из раскладки
        // число, а норма сейчас даёт другое» — не порча данных и не рассинхрон, который что-то
        // когда-нибудь починит: это состояние, закрыть которое может только человек, применив
        // норму заново. Дельта рядом называет РАЗМЕР расхождения и молчит о его природе — тут
        // нужна причина, иначе расхождение читается как ошибка рецепта.
        //
        // Сравниваются ТОЛЬКО скаляры с провенансом 'marker'. Пер-размерная строка собрана из
        // нескольких раскладок, из каких — не записано нигде (тот же отсутствующий FK), и
        // объявить её разошедшейся значило бы гадать. Колорвейный скоуп соблюдается той же
        // проверкой, что у дельты: норма своего колорвея ничего не утверждает о чужом рецепте —
        // у того другой артикул, другая ширина, и «расхождение» было бы расхождением тканей.
        const normMarker = lineMarkers.find((m) => m.isNorm === true);
        const normCons = normMarker ? consumptionCm(normMarker) : null;
        const normConv = normCons != null ? toBomUnit(normCons, b.unit ?? '') : null;
        const normCw = Number(normMarker?.colorwayId ?? 0);
        // 0.0005 — шум представления: колонка DECIMAL(10,3), а число туда положил тот же apply
        // строкой из toBomUnit. Всё, что крупнее, — другое измерение, а не другая запись.
        const staleApplied = normConv
          ? [
              ...new Set(
                markerScalars
                  .filter((r) => normCw === 0 || r.cw === normCw)
                  .map((r) => r.value)
                  .filter((v) => Math.abs(Number(v) - normConv.value) > 0.0005),
              ),
            ]
          : [];
        const stale =
          normMarker && normConv && staleApplied.length > 0
            ? {
                name: normMarker.name ?? '',
                value: normConv.value,
                unit: normConv.unit,
                applied: staleApplied,
              }
            : null;
        return { line: b, best, conv, cons, refusal, current, delta, skipped, stale };
      });
  }, [bomLines, markers, colorways]);

  if (rows.length === 0) return null;

  return (
    <div className='space-y-1'>
      <Text size='nano' variant='label' component='p'>
        расход из раскладок (маркеров) — применяется в рецепте колорвея, вкладка colourways
      </Text>
      {rows.map(({ line, best, conv, cons, refusal, current, delta, skipped, stale }) => (
        <div key={line.lineKey} className='space-y-1'>
          <div className='flex flex-wrap items-center gap-1.5'>
            <Text size='micro' component='span' className='min-w-0 truncate'>
              {line.name?.trim() || 'ткань'}
            </Text>
            {refusal ? (
              <Pill tone='warn' title={refusal}>
                из раскладки: нормы нет —{' '}
                {compositionOf(best).length > 1 ? 'смешанный состав' : 'состав не читается'}
              </Pill>
            ) : (
              <Pill tone='mut'>
                из раскладки: {conv ? `${conv.value} ${conv.unit}` : `${cons} см`}
              </Pill>
            )}
            {/* Чьё это число: назначенной нормы или просто лучшей раскладки. Без подписи полоса
                называет цифру с одинаковой уверенностью в обоих случаях. */}
            {best.isNorm === true && (
              <Pill tone='ink' title='назначенная нормировочная раскладка этой ткани на карточке'>
                норма
              </Pill>
            )}
            {pieceSetChanged(best) && (
              <Pill
                tone='attention'
                title='набор деталей карточки изменился после съёмки этой раскладки — длина измерена по прежнему набору'
              >
                набор изменился
              </Pill>
            )}
            {isLegacyNorm(best) && (
              <Pill
                tone='mut'
                title='условия съёмки (припуск, слои, переворот) не записаны — раскладка снята до того, как их стали записывать'
              >
                старая норма
              </Pill>
            )}
            {skipped && (
              <Pill
                tone={skipped.isNorm === true ? 'warn' : 'mut'}
                title={scalarNormRefusal(skipped)}
              >
                {skipped.isNorm === true ? 'назначенная норма' : 'свежее измерение'} «{skipped.name}
                » расхода не даёт —{' '}
                {compositionOf(skipped).length > 1 ? 'смешанный состав' : 'состав не читается'}
              </Pill>
            )}
            <Text size='nano' variant='label' component='span'>
              в рецептах: {current}
            </Text>
            {delta != null && Math.abs(delta) > 5 && (
              <Pill tone='warn'>
                {delta > 0 ? `+${delta.toFixed(0)}%` : `${delta.toFixed(0)}%`}
              </Pill>
            )}
          </div>
          {stale && (
            <CalloutBox tone='warning'>
              рецепты не пересчитаны: применённое из раскладки {stale.applied.join(' / ')}{' '}
              {stale.unit} против нормы «{stale.name}» — {stale.value} {stale.unit}. Связи рецепта
              с раскладкой нет: переназначение нормы ничего не пересчитывает, и прежнее число будет
              стоять, пока норму не применят заново
            </CalloutBox>
          )}
        </div>
      ))}
    </div>
  );
}
