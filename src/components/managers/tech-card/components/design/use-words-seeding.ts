import type { GetDesignBandResponse } from 'api/proto-http/admin';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useEffect, useMemo, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { enhanceText } from 'ui/components/ai-enhance';

import type { TechCardFormData } from '../schema';
import { useTechCardAutosave } from './autosave-contract';
import { useMoodMinimumGate } from './chain-rail';
import { cardFactsContext, composeWords, wordsBriefSource } from './core/card-facts';
import { isBoardRow } from './core/mood-gate';
import { useFlatInput, wordsLocked } from './flat-input';
import { useCardFacts } from './head/card-facts-form';
import { benchSides } from './render/model';
import { WORDS_MAX } from './words-field';
import { briefPlan, requestBrief, useBrief, type BriefFetcher } from './words-brief';
import { followWords, lockWords, offerWords, useWordsSeed, wordsDecided } from './words-seed';

/**
 * ═══ WORDS: ФАКТЫ КАРТОЧКИ, ОДИН РАЗ ЗА СЕССИЮ И ТОЛЬКО В ПУСТОЕ ПОЛЕ (T24, D-20'') ═════════════
 *
 * ОДИН ЗАСЕВ НА ДВА ЭКРАНА (27.09, O-61 r2). Эффект стоял в секции FLAT (`references-section.tsx`),
 * и засев появлялся, только когда человек хоть раз открыл FLAT: карточка без сохранённых слов,
 * открытая прямо на FABRIC RENDER, показывала пустое IN WORDS, хотя по умолчанию там стоят те же
 * слова, что во WORDS флэта. Теперь засев — этот хук, и его зовут оба экрана С ОДНИМИ ВХОДАМИ
 * (карточка, полоса, «только чтение» экрана): WORDS флэта (`ReferencesSection`) и IN WORDS рендера
 * (`InWords`, `render/palette.tsx`). Второго засева не заводится: предложение одно, живёт в
 * `words-seed.ts`, и оба экрана его показывают. Экраны шагов студии взаимоисключающие, а сам засев
 * решает «о карточке» один раз (`wordsDecided`), так что второй зовущий ничего не удваивает.
 * Поведение флэта не изменилось ни на байт: тело эффекта, его входы и зависимости перенесены как есть.
 *
 * Владелец: «WORDS по умолчанию = вся информация из полей мудборда, редактируемо, с AI ENHANCE».
 * Здесь стояла дверь `from construction ▸`, приносившая посадку и аспекты по кнопке; теперь то,
 * что она приносила (и больше), стоит в поле с самого начала, а дверь снята.
 *
 * ОДИН ЧИТАТЕЛЬ, ОДИН КОМПОЗИТОР. Факты формы читает `useCardFacts` (тот же, что у кнопок `ai ✦`
 * DESCRIPTION, SILHOUETTE и FABRIC), строку собирает `composeWords` (`core/card-facts.ts`):
 * `garment:` (имя листа категории словами — «cargo pants», не путь, O-35) · посадка · описание ·
 * силуэт · ткань · аспекты · указания доски — в этом порядке, в потолок поля ЦЕЛЫМИ секциями;
 * сколько не влезло, говорится под полем. Материалов в WORDS нет (O-35): для рисунка флэта они
 * не нужны; в контексте `ai ✦` (`cardFactsContext`) они остаются.
 *
 * ⚠ T03 (03.10): описание, силуэт, ткань, аспекты и указания доски в WORDS больше не копируются —
 * они уходят в `EnhanceText` (PROMPT · WORDS) и возвращаются английским брифом (`words-brief.ts`);
 * строки словаря (`garment:`, посадка, возраст, для кого) стоят как были. Бриф в пути — засев ждёт;
 * отказ — засев без брифа, но и без сырого текста.
 *
 * ⚠ «ПУСТО ПРИ ЗАГРУЗКЕ = ОТСУТСТВУЕТ» (D-20'', заменяет D-20'). Прежнее «сеять только при
 * `undefined`» было мёртвым на любой настоящей карточке: сервер отдаёт NULL как `""` (dto
 * `pbStringFromNull`), схема держит `''` как `''`, и провод не отличает «никогда не писали» от
 * «стёрли». Поэтому засев применяется, когда ВСЁ сразу:
 *   · поле пусто после trim;
 *   · о карточке в этой сессии ещё не решено (`words-seed.ts`: засеяно, очищено CLEAR, стояло
 *     непустым или стёрто руками — тогда не засевается);
 *   · факты готовы (словарь приехал — иначе строки `garment:` не будет никогда) и строка непуста;
 *   · карточку можно писать, и автосейв не `off` (засев, который не сохранится, — неправда на
 *     экране: прогон читает СОХРАНЁННУЮ карточку);
 *   · минимум доски пройден (`useMoodMinimumGate`, D-31: категория И (картинка на доске ИЛИ
 *     непустое описание)): ранний визит не замораживает однострочник «garment: …» — засев дождётся
 *     доски и выйдет полным; ИЛИ флэт уже сделан (D-13'').
 * Принятое ограничение: очищенные и СОХРАНЁННЫЕ WORDS после перезагрузки засеются снова — сервер
 * хранит `''` как NULL (сказано владельцу; бэк этой волной не трогается).
 *
 * ⚠ ЗАСЕВ — ТОЛЬКО НА ЭКРАНЕ, И В ФОРМУ ОН НЕ ПИШЕТСЯ (D-20'''', заменяет D-20'''). D-20''' клал его в
 * форму без пометки «грязно» — но `isDirty` формы общий, а запись карточки шлёт все значения:
 * подъём стадии, тихая запись с сохранённым назначением и синхронизация R-4 уносили засев на сервер
 * записями, которых никто не делал (ревью раунда 3, M1). Теперь засев живёт в `words-seed.ts`, поле
 * показывает его, пока значение формы пусто, и в форму («грязным») его отдаёт ДЕЙСТВИЕ человека:
 * правка поля, ответ `ai ✦`, GENERATE (`materializeWords` перед `flush`, `flat-run-row.tsx`).
 * Карточка, которую открыли и посмотрели, не сохраняется, не спрашивает при уходе и не двигает
 * `lock_version` — и правка ЛЮБОГО другого поля засева тоже не несёт. Рендер
 * засева в форму не отдаёт вовсе: его первое действие отдаёт показанное в СВОЙ рецепт
 * (`render/drafts.ts`).
 *
 * ⚠ СЛОВАРЬ ОБЯЗАН ПРИЕХАТЬ, А НЕ ПРОСТО ПЕРЕСТАТЬ ГРУЗИТЬСЯ (ревью [5]): провал `GetDictionary`
 * тоже снимает `loading`, но словаря нет — засев вышел бы без пути категории и замкнулся на сессию.
 *
 * ⚠ ФОРМА ОБЯЗАТЕЛЬНА: оба экрана монтирует только `StudioTab`, а он зовёт `useFormContext` сам и
 * безусловно (довод целиком — у `threed-studio.tsx`, размер 3D). Живёт хук отдельным файлом, а не в
 * `words-seed.ts`, из-за циклов импорта: `words-seed.ts` читают модалки и `render/drafts.ts`, а
 * `chain-rail.tsx` (минимум доски) через доску тянет их же.
 *
 * Возвращает то, что нужно флэту рядом с полем: `wordsLive` — видно ли предложение (c) — и
 * контекст `ai ✦` из фактов карточки. Рендеру не нужно ни то ни другое: его слова читает черновик
 * (`useCardWords`), а контекст `ai ✦` у него свой — ткань и цвет прогона.
 */
export function useWordsSeeding(
  techCardId: number,
  band: GetDesignBandResponse,
  readOnly: boolean,
): { wordsLive: boolean; factsContext: string } {
  const { control, getValues } = useFormContext<TechCardFormData>();
  const facts = useCardFacts(isBoardRow);
  /* T03: свободный текст мудборда в WORDS не копируется — он уходит английским брифом
     (`words-brief.ts`); пока текст набирается, вызова нет (дребезг `BRIEF_SETTLE_MS`). */
  const source = useMemo(() => wordsBriefSource(facts), [facts]);
  const settled = useSettled(source.text, BRIEF_SETTLE_MS);
  const brief = useBrief(settled);
  const plan = briefPlan(source.text, settled, brief);
  const planBrief = typeof plan === 'object' ? plan.brief : undefined;
  const planState = typeof plan === 'string' ? plan : 'ready';
  const composed = useMemo(() => composeWords(facts, WORDS_MAX, planBrief), [facts, planBrief]);
  const factsContext = useMemo(() => cardFactsContext(facts), [facts]);
  const { loading: dictionaryLoading, dictionary } = useDictionary();
  const factsReady = !dictionaryLoading && !!dictionary;
  const autosave = useTechCardAutosave();
  const moodMinimum = useMoodMinimumGate();
  // D-13'': сделанный шаг не запирается — у карточки с флэтами WORDS засевается и при неполном
  // минимуме мудборда. GENERATE минимум требует.
  // ⚠ КОПИЯ `stepDone('flat')` (core/chain.ts, ветка 'flat'), и копия НАМЕРЕННАЯ: общего `flatDone(band)`
  // там нет, а файл — зоны CL-B. Правило одно — сторона флэтового верстака с картинкой; меняется
  // там — меняется и здесь (в бэклог: экспортировать `flatDone` из chain.ts и звать его отсюда).
  const flatDone = useMemo(() => benchSides(band).some((s) => !!s.picture), [band]);
  const wordsNow = (useWatch({ control, name: 'garmentDescription' }) ?? '') as string;
  /* Замок входа флэта (прогон, CLEAR, рекол со словами) — модульный, по карточке: рендер читает тот
     же, что и флэт, и пока он стоит, засев не решается ни на одном экране. */
  const wordsBusy = wordsLocked(useFlatInput(techCardId));
  /* (c) Предложение видно только там, где его можно отдать: карточку можно писать, и она сохраняется
     (ревью раунда 4, MIN-4). */
  const wordsLive = !readOnly && autosave.status !== 'off';
  const seed = useWordsSeed(techCardId);
  /* Бриф нужен только полю, которое засев ещё может показать: WORDS пусто, предложение не снято,
     карточку можно писать и минимум доски пройден. Набранные руками WORDS вызова не стоят. */
  const wantsBrief =
    techCardId > 0 &&
    wordsLive &&
    factsReady &&
    wordsNow.trim() === '' &&
    seed !== null &&
    (moodMinimum.ok || flatDone);
  useEffect(() => {
    if (!wantsBrief || !settled || settled !== source.text) return;
    requestBrief(settled, source.context, fetchWordsBrief);
  }, [wantsBrief, settled, source]);
  useEffect(() => {
    if (techCardId <= 0) return;
    const blank = ((getValues('garmentDescription') ?? '') as string).trim() === '';
    if (!blank) {
      // Текст стоит (загружен, восстановлен, напечатан): в этой сессии поле больше не засевается.
      lockWords(techCardId);
      return;
    }
    if (!wordsLive || !factsReady || !composed.text) return;
    // Прогон, CLEAR или рекол со словами — слова сейчас не меняются; решим после.
    if (wordsBusy) return;
    // T03: бриф в пути или текст ещё набирается — засев ждёт, без шума.
    if (planState === 'wait') return;
    if (wordsDecided(techCardId)) {
      // Отказ брифа: стоящее предложение остаётся каким было.
      if (planState === 'keep') return;
      // (a) Предложение, уже стоящее на экране, ИДЁТ ЗА ФАКТАМИ (ревью раунда 4, MIN-4): новая
      // категория или описание — новый текст. Снятое (`null`) не возвращается.
      followWords(techCardId, composed.text, composed.omitted);
      return;
    }
    if (!moodMinimum.ok && !flatDone) return;
    // D-20'''': засев — ПРЕДЛОЖЕНИЕ НА ЭКРАНЕ, в значения формы он не пишется (см. `words-seed.ts`).
    offerWords(techCardId, composed.text, composed.omitted);
  }, [
    techCardId,
    wordsNow,
    wordsLive,
    factsReady,
    composed,
    planState,
    wordsBusy,
    moodMinimum.ok,
    flatDone,
    getValues,
  ]);
  return { wordsLive, factsContext };
}

/** Тишина набора перед вызовом брифа: на каждую букву модель не зовётся. */
const BRIEF_SETTLE_MS = 2500;
/** Ответ брифа короче поля: строки словаря встают перед ним. */
const BRIEF_MAX_RUNES = 1200;

const fetchWordsBrief: BriefFetcher = ({ text, context }) =>
  enhanceText({ text, context, mode: 'prompt', field: 'words', maxRunes: BRIEF_MAX_RUNES });

/** Значение, простоявшее `ms` без изменений. */
function useSettled(value: string, ms: number): string {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    if (settled === value) return;
    const t = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [value, settled, ms]);
  return settled;
}
