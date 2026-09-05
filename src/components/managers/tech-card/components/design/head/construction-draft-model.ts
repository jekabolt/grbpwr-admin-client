import { z } from 'zod';

import { bomPurposeLabel, UNSET_PURPOSE } from '../../bom-purpose-labels';
import { UNSET_KIND } from '../../bom-kind';
import { sectionShort } from '../../bom-line-picker';
import { detailAspects, detailKeyLabel } from '../../tech-card-options';
import { FIT_OPTIONS } from '../render/model';

/**
 * ЧЕРНОВИК CONSTRUCTION — РАЗБОР И СРАВНЕНИЕ, БЕЗ ЕДИНОЙ СТРОКИ ЭКРАНА.
 *
 * Файл чистый нарочно: всё, что здесь есть, — это ответ модели, значения формы и список строк, в
 * который они складываются. Ни `react`, ни `react-hook-form`, ни писателей формы здесь нет, поэтому
 * стенд `scripts/construction-draft-probe.mjs` считает эти правила НАСТОЯЩИМИ, а не их пересказом.
 *
 * ═══ ГЛАВНОЕ СВОЙСТВО: ОТСУТСТВИЕ ОСТАЁТСЯ ОТСУТСТВИЕМ ══════════════════════════════════════
 *
 * ⚠ У СХЕМЫ НИЖЕ НЕТ НИ ОДНОГО `.default()`, И ЭТО НЕ НЕДОСМОТР, А ВЕСЬ СМЫСЛ ФАЙЛА.
 * Репозиторий уже записал этот дефект (`techcard-draft-restore-wipes-absent-fields`): zod-дефолт,
 * подставленный вместо непришедшего поля, уезжает на сервер полной перезаписью, то есть КОМАНДОЙ
 * «очисти это». Ровно поэтому:
 *   · схема ответа — СВОЯ, ни одним ключом не пересекающаяся с `techCardObject`. Ни один объект
 *     модели никогда не становится значением формы, поэтому дефолт формы не вычисляется из него
 *     ни разу;
 *   · поле, которого модель не назвала, не порождает СТРОКИ. Нет строки — нет чипа, нет клика,
 *     нет записи. Молчание модели физически не выразимо как запись;
 *   · сравнение (`diffProposal`) считается ОТ ЖИВЫХ ЗНАЧЕНИЙ ФОРМЫ на каждом рендере, поэтому
 *     значение, которое уже стоит на карточке, приходит состоянием `same` — без чипов вовсе.
 * Кнопки «принять всё» нет и не будет: она вернула бы ровно ту связку «объект модели → строки
 * формы», от которой уходит вся эта фаза.
 */

/* ─── НОРМАЛИЗАТОРЫ ────────────────────────────────────────────────────────────────────────── */

/** Отображаемый вид строки: края сняты, внутренние пробелы схлопнуты. Регистр НЕ трогается. */
export function normText(s?: string | null): string {
  return (s ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Свёртка для УЗНАВАНИЯ — сравнение значений и дедуп списков. Зеркало серверного `designFoldToken`:
 * «Sleeve / Cuff», «sleeve_cuff» и «sleeveCuff» обязаны быть одним ключом, а не тремя.
 */
export function foldToken(s?: string | null): string {
  return (s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/**
 * Посадка складывается на СЛОВАРЬ КАРТОЧКИ, и не сложившаяся не предлагается вовсе. `fit` — это
 * факт стиля (`UpdateStyle`), общий для всех его карточек; строка, которой нет в словаре, не
 * выбираема человеком в селекте рядом, и предложить её значило бы предложить состояние, из
 * которого нет пути назад руками.
 */
export function foldFit(s?: string | null): string {
  const f = foldToken(s);
  return (FIT_OPTIONS as readonly string[]).find((o) => foldToken(o) === f) ?? '';
}

/**
 * Словарь узнавания аспекта: КЛЮЧ И ЕГО ПОДПИСЬ ведут в один и тот же ключ.
 *
 * ⚠ ПОДПИСЬ ЗДЕСЬ НЕ ДЛЯ КРАСОТЫ, И ЭТО ЗАМЕРЕНО ПРОБОЙ. Серверная свёртка знает только КЛЮЧИ
 * (`collar`, `sleeveCuff`), а модель отвечает так, как аспект НАЗЫВАЕТСЯ на экране — «Collar /
 * Neckline», «Sleeve / Cuff». Без этой половины такой ответ проезжал бы САМОДЕЛЬНЫМ ключом и
 * вставал бы ВТОРОЙ карточкой рядом с настоящей: один и тот же аспект выглядел бы как два, и
 * принятое не было бы видно в строке, куда человек смотрит. Ровно этот дефект репозиторий уже
 * чинил у ключа `fabric` (круг 20, пункт 5).
 */
const ASPECT_BY_FOLD = new Map<string, string>();
for (const a of detailAspects) {
  ASPECT_BY_FOLD.set(foldToken(a.key), a.key);
  ASPECT_BY_FOLD.set(foldToken(a.label), a.key);
}

/**
 * Ключ аспекта: узнанный — стандартный, не узнанный — САМОДЕЛЬНЫЙ, а не выброшенный. Редактор
 * аспектов принимает самодельные ключи, и «cuff» или «vent» от модели законны ровно настолько же,
 * насколько законны они же от человека. Потолок 64 руны — серверный `maxVarchar64`, и считается он
 * в РУНАХ: `slice` по единицам UTF-16 разрубил бы суррогатную пару пополам.
 */
export function foldAspectKey(s?: string | null): string {
  const known = ASPECT_BY_FOLD.get(foldToken(s));
  if (known) return known;
  return Array.from(normText(s)).slice(0, 64).join('');
}

/**
 * ЧИСЛО `google.type.Decimal` СЛОВАМИ ФОРМЫ. Провод везёт `{value:'1.4'}`, форма держит СТРОКУ, и
 * различие «пусто» vs «нет ключа» у неё несущее (`estUsageOut` в `schema.ts`).
 *
 * ⚠ НЕРАЗБИРАЕМОЕ ЧИСЛО ОТДАЁТСЯ ПУСТОТОЙ, А НЕ НУЛЁМ. Ноль — это утверждение «расхода нет»,
 * подписываемое вместе с картой; «модель написала ерунду» обязано читаться как молчание.
 */
function decimalText(v: unknown): string {
  const raw =
    typeof v === 'object' && v !== null ? (v as { value?: string | null }).value : (v as unknown);
  const text = normText(raw == null ? '' : String(raw));
  if (!text) return '';
  return Number.isFinite(Number(text)) ? text : '';
}

/* ─── СХЕМА ОТВЕТА ────────────────────────────────────────────────────────────────────────── */

/**
 * `.nullish()`, А НЕ `.optional()`, И ЭТО ЗАМЕРЕННЫЙ УРОК (`wire-null-message-vs-zod`):
 * grpc-gateway маршалит с `EmitUnpopulated`, поэтому незаполненное поле приходит ЯВНЫМ `null`,
 * тогда как генерённый TS объявляет `| undefined`. Схема, принимающая только одно написание,
 * отвергает живой ответ целиком — и человек видит «модель не ответила» там, где она ответила.
 */
const wireString = z.string().nullish();

export const constructionDraftSchema = z.object({
  silhouette: wireString,
  fabric: wireString,
  fit: wireString,
  concept: wireString,
  aspects: z.array(z.object({ key: wireString, text: wireString })).nullish(),
  /**
   * ⚠ КЛЮЧ ЖИВ В СХЕМЕ, ХОТЯ ЭКРАН ЕГО БОЛЬШЕ НЕ ПОКАЗЫВАЕТ (B-13 круга 20).
   *
   * Владелец: «DRAFT OF THE CONSTRUCTION не должен добавлять коллауты все это можно добавить в
   * CONSTRUCTION аспектами». Промпт про указания больше НЕ СПРАШИВАЕТ, и `diffProposal` не рождает
   * из них ни одной строки. Но прогон, отвеченный ДО B-13, пересобирается на повторе из своего
   * сохранённого канонического JSON — и схема, разучившаяся читать этот ключ, отвергла бы такой
   * ответ ЦЕЛИКОМ, то есть потеряла бы вместе с указаниями и силуэт, и ткань, и аспекты.
   * Читаем и молчим: разобрать — не значит показать.
   */
  callouts: z
    .array(z.object({ feature: wireString, details: wireString, dimensions: wireString }))
    .nullish(),
  bom: z
    .array(
      z.object({
        section: wireString,
        purpose: wireString,
        kind: wireString,
        name: wireString,
        composition: wireString,
        colour: wireString,
        pantone: wireString,
        // int64 приезжает то числом, то строкой — та же ложь генерённого типа, что у `wireInt`.
        materialId: z.union([z.number(), z.string()]).nullish(),
        // ОЦЕНКА РАСХОДА (B-16) — `google.type.Decimal`, то есть ОБЪЕКТ `{value}`, а не число.
        // Читается снисходительно: строка, число и объект — три написания одного, и ни одно из
        // них не повод отвергнуть весь ответ.
        estUsage: z.union([z.object({ value: wireString }), z.number(), z.string()]).nullish(),
        unit: wireString,
      }),
    )
    .nullish(),
  missing: z.array(z.string()).nullish(),
  /**
   * ПРЕДЛОЖЕННЫЕ КОЛОРВЕИ (B-25). Владелец: «DRAFT OF THE CONSTRUCTION могло предложить мне
   * создать несколько колорвеев … и что бы если мы вконфирмили этот колорвей появлялся далее уже
   * во вкладке колорвей».
   *
   * ⚠ ЗДЕСЬ НЕТ НИ ОДНОЙ ПРОВЕРКИ, КОТОРУЮ УЖЕ СДЕЛАЛ СЕРВЕР, И ЭТО РЕШЕНИЕ. Код цвета уже сложен
   * на словарь (не сложившийся приходит пустым), дубли уже схлопнуты (первое предложение на код
   * побеждает, поздним код обнулён), hex уже проверен `^#[0-9a-fA-F]{6}$`, пустые предложения уже
   * выброшены, безымянные уже названы, потолки (4 × 15) уже применены. Вторая проверка тех же
   * правил на клиенте — это второе место, где они записаны, и расходятся такие пары молча.
   */
  colourways: z
    .array(
      z.object({
        name: wireString,
        colorCode: wireString,
        pantone: wireString,
        hex: wireString,
        slots: z
          .array(
            z.object({
              slot: wireString,
              pantone: wireString,
              hex: wireString,
              colour: wireString,
            }),
          )
          .nullish(),
      }),
    )
    .nullish(),
});

export type ConstructionDraft = z.infer<typeof constructionDraftSchema>;

/**
 * Разбор ответа. `null` — это «ответа в этой форме не было», и вызывающий обязан сказать это
 * словами, а не нарисовать пустой черновик: прогон ОПЛАЧЕН, и пустая рамка выглядит как «кнопка
 * не сработала».
 *
 * ⚠ ОБЪЕКТ БЕЗ ЕДИНОГО СОДЕРЖАТЕЛЬНОГО КЛЮЧА — ТОЖЕ `null`. Сервер отказывает такому ответу сам
 * (`invalid_output`), но на пути повтора клиент получает пересобранный объект, и «прошло валидацию»
 * там не значит «есть что предложить».
 */
export function parseConstructionDraft(input: unknown): ConstructionDraft | null {
  if (!input || typeof input !== 'object') return null;
  const parsed = constructionDraftSchema.safeParse(input);
  if (!parsed.success) return null;
  const d = parsed.data;
  const any =
    !!normText(d.silhouette) ||
    !!normText(d.fabric) ||
    !!normText(d.fit) ||
    !!normText(d.concept) ||
    (d.aspects?.length ?? 0) > 0 ||
    (d.callouts?.length ?? 0) > 0 ||
    (d.bom?.length ?? 0) > 0 ||
    (d.missing?.length ?? 0) > 0 ||
    (d.colourways?.length ?? 0) > 0;
  return any ? d : null;
}

/* ─── СРАВНЕНИЕ С ЖИВОЙ ФОРМОЙ ────────────────────────────────────────────────────────────── */

export type ProposalState = 'add' | 'replace' | 'same';

/**
 * ЧТО ИМЕННО БУДЕТ НАПИСАНО, если по строке нажмут. Не объект формы и не строка таблицы — ЗНАЧЕНИЯ
 * для писателя, который и так существует. Орган разбирает этот союз ровно на пять вызовов, и ни
 * один из них не умеет записать массив целиком.
 */
export type ProposalWrite =
  | { kind: 'detail'; key: string; text: string }
  | { kind: 'fit'; value: string }
  | { kind: 'concept'; text: string }
  | {
      kind: 'bom';
      line: {
        section?: string;
        purpose?: string;
        kind?: string;
        name: string;
        composition?: string;
        color?: string;
        pantone?: string;
        materialId?: number;
        estUsage?: string;
        unit?: string;
      };
    };

export type ProposalRow = {
  /**
   * Личность строки ВНУТРИ ОДНОГО ПРЕДЛОЖЕНИЯ, и она выведена из СОДЕРЖИМОГО, а не из позиции.
   * Сравнение пересчитывается на каждом рендере (правило D5), поэтому индексный ключ переехал бы
   * на соседа, как только принятая строка ушла в `same`, — и квитанция «added» встала бы не на ту.
   */
  id: string;
  group: 'general' | 'aspects' | 'bom';
  /** Нано-подпись, называющая поле-адресат: `silhouette`, `collar / neckline`, `fabric · main`. */
  label: string;
  /** Предложенное значение — чернилами. */
  value: string;
  /** Что стоит на карточке сейчас. Печатается приглушённо и только при `replace`. */
  current: string;
  state: ProposalState;
  write: ProposalWrite;
};

/** Живые значения формы — ровно те поля, против которых считается сравнение. */
export type FormSnapshot = {
  fit?: string;
  concept?: string;
  details?: Array<{ key?: string; text?: string }>;
  /**
   * ⚠ `lineKey` ЧИТАЕТСЯ НЕ РАДИ ДЕДУПА, А РАДИ ЖИВОСТИ ЗАПИСИ (B-14). Дедуп слотов стоит на
   * СВЁРНУТОМ ИМЕНИ и стоял на нём всегда; ключ строки нужен журналу заполнений, чтобы ответить
   * «рождённая черновиком строка ещё на карточке?» — вопрос, на который имя ответить не может:
   * человек имя переименовывает, а строка при этом остаётся той же самой.
   */
  bomItems?: Array<{ name?: string; lineKey?: string }>;
};

function detailText(form: FormSnapshot, key: string): string {
  return normText((form.details ?? []).find((d) => d.key === key)?.text);
}

/** Скаляр: равно — `same`, пусто — `add`, иначе — `replace`. Третьего состояния у скаляра нет. */
function scalarState(proposed: string, current: string): ProposalState {
  if (!current) return 'add';
  return foldToken(proposed) === foldToken(current) ? 'same' : 'replace';
}

/**
 * `diffProposal` — ОДНО МЕСТО, ГДЕ РЕШАЕТСЯ, ЧТО ЧЕЛОВЕКУ ПРЕДЛОЖЕНО.
 *
 * ПРАВИЛА, ПО ГРУППАМ:
 *   · скаляры (силуэт, ткань, посадка) — сравниваются с карточкой; `replace` — это РЕШЕНИЕ
 *     ЧЕЛОВЕКА и никогда не бывает побочным действием соседней строки (B-14 не изменил этого:
 *     сам собой пишется только ПУСТОЙ адресат, см. `draft-fills.ts`);
 *   · концепт — предлагается ТОЛЬКО когда собственный концепт карточки пуст. Слова дизайнера
 *     старше слов модели, и предложение, спорящее с ними, заставляло бы человека защищать то, что
 *     он уже написал. Непустой концепт ⇒ строки нет ВОВСЕ (не `same`: спорить не с чем);
 *   · аспекты — тот же скалярный разбор, но по ключу строки `details[]`;
 *   · спецификация (слоты материалов) — ТОЛЬКО ДОБАВЛЕНИЕ. Совпавшая по свёрнутому имени строка
 *     приходит `same`; ни одна строка списка никогда не переписывается и не удаляется, поэтому
 *     набранное руками не может исчезнуть ни от клика, ни от само-заполнения.
 *
 * ⚠ ГРУППЫ `callouts` ЗДЕСЬ БОЛЬШЕ НЕТ (B-13 круга 20). Владелец: «DRAFT OF THE CONSTRUCTION не
 * должен добавлять коллауты все это можно добавить в CONSTRUCTION аспектами». Ключ `callouts`
 * ЖИВ В СХЕМЕ (сохранённый прогон обязан разбираться), но строки из него не рождаются: разобрать
 * — не значит показать, и уж тем более не значит записать. Блок CALLOUTS с этого круга снесён
 * (B-11), так что строка «указание» вела бы предложение в поле, которого на экране нет вовсе.
 */
export function diffProposal(
  draft: ConstructionDraft | null,
  form: FormSnapshot,
): { rows: ProposalRow[]; missing: string[] } {
  if (!draft) return { rows: [], missing: [] };
  const rows: ProposalRow[] = [];

  /* ── общие сведения ── */
  const silhouette = normText(draft.silhouette);
  if (silhouette) {
    const current = detailText(form, 'silhouette');
    rows.push({
      id: 'general:silhouette',
      group: 'general',
      label: 'silhouette',
      value: silhouette,
      current,
      state: scalarState(silhouette, current),
      write: { kind: 'detail', key: 'silhouette', text: silhouette },
    });
  }

  const fabric = normText(draft.fabric);
  if (fabric) {
    const current = detailText(form, 'fabric');
    rows.push({
      id: 'general:fabric',
      group: 'general',
      label: 'fabric',
      value: fabric,
      current,
      state: scalarState(fabric, current),
      write: { kind: 'detail', key: 'fabric', text: fabric },
    });
  }

  const fit = foldFit(draft.fit);
  if (fit) {
    const current = normText(form.fit);
    rows.push({
      id: 'general:fit',
      group: 'general',
      label: 'fit',
      value: fit,
      current,
      state: scalarState(fit, current),
      write: { kind: 'fit', value: fit },
    });
  }

  const concept = normText(draft.concept);
  if (concept && !normText(form.concept)) {
    rows.push({
      id: 'general:concept',
      group: 'general',
      label: 'concept',
      value: concept,
      current: '',
      state: 'add',
      write: { kind: 'concept', text: concept },
    });
  }

  /* ── аспекты ── */
  const seenAspect = new Set<string>();
  for (const a of draft.aspects ?? []) {
    const key = foldAspectKey(a.key);
    const text = normText(a.text);
    if (!key || !text) continue;
    // Два предложения на один ключ — это одно предложение, сказанное дважды: второе тихо
    // переписывало бы первое ещё до того, как человек нажал хоть раз.
    if (seenAspect.has(key)) continue;
    seenAspect.add(key);
    // Силуэт и ткань — тоже строки `details[]`, и они УЖЕ предложены выше своими строками общих
    // сведений. Без этого гейта один и тот же аспект стоял бы на экране дважды, в двух группах.
    if (key === 'silhouette' || key === 'fabric') continue;
    const current = detailText(form, key);
    rows.push({
      id: `aspect:${key}`,
      group: 'aspects',
      label: detailKeyLabel(key),
      value: text,
      current,
      state: scalarState(text, current),
      write: { kind: 'detail', key, text },
    });
  }

  /* ── спецификация ── */
  const knownBom = new Set((form.bomItems ?? []).map((b) => foldToken(b.name)).filter(Boolean));
  const seenBom = new Set<string>();
  for (const b of draft.bom ?? []) {
    const name = normText(b.name);
    if (!name) continue;
    const key = foldToken(name);
    if (seenBom.has(key)) continue;
    seenBom.add(key);
    const section = normText(b.section);
    const purpose = normText(b.purpose);
    const kind = normText(b.kind);
    const composition = normText(b.composition);
    const colour = normText(b.colour);
    const pantone = normText(b.pantone);
    const materialId = Number(b.materialId ?? 0) || 0;
    // ОЦЕНКА РАСХОДА И ЕЁ ЕДИНИЦА (B-16) — они приезжают ТЕМ ЖЕ платным прогоном, и не взять их
    // значило бы выбросить оплаченный ответ. Обе — по правилу отсутствия ниже: ключа нет, когда
    // модель промолчала; у `estUsage` это различие видит маппер записи, и подставленная здесь
    // пустая строка приехала бы на сервер числом.
    const estUsage = decimalText(b.estUsage);
    const unit = normText(b.unit);
    const labelParts = [
      section ? sectionShort(section) : '',
      purpose && purpose !== UNSET_PURPOSE ? bomPurposeLabel(purpose) : '',
    ].filter(Boolean);
    rows.push({
      id: `bom:${key}`,
      group: 'bom',
      label: labelParts.join(' · ') || 'component',
      value: [name, composition, [colour, pantone].filter(Boolean).join(' ')]
        .filter(Boolean)
        .join(' · '),
      current: '',
      state: knownBom.has(key) ? 'same' : 'add',
      write: {
        kind: 'bom',
        line: {
          // ⚠ КЛЮЧ ОТСУТСТВУЕТ, КОГДА МОДЕЛЬ ПРО НЕГО МОЛЧАЛА. Конструктор строки подставит СВОЁ
          // умолчание (`emptyBomItem`), а не пустую строку: пустой токен енума на проводе — это
          // не «не сказано», а невалидное значение.
          ...(section ? { section } : {}),
          ...(purpose && purpose !== UNSET_PURPOSE ? { purpose } : {}),
          ...(kind && kind !== UNSET_KIND ? { kind } : {}),
          name,
          ...(composition ? { composition } : {}),
          ...(colour ? { color: colour } : {}),
          ...(pantone ? { pantone } : {}),
          ...(materialId ? { materialId } : {}),
          ...(estUsage ? { estUsage } : {}),
          ...(unit ? { unit } : {}),
        },
      },
    });
  }

  const missing = (draft.missing ?? []).map((m) => normText(m)).filter(Boolean);
  return { rows, missing };
}

/**
 * ⚠ `PROPOSAL_GROUPS` СНЯТ ВМЕСТЕ СО СВОИМ ЭКРАНОМ (B-14 круга 20), А НЕ ЗАБЫТ.
 *
 * Он задавал порядок ЧЕТЫРЁХ ГРУПП ПРИНЯТЫХ СТРОК на органе. С B-14 принятого списка нет вовсе:
 * написанное видно там, где живёт, а на органе остаётся только спорное («to decide») — плоский
 * список, у которого нет двух групп, чтобы их упорядочивать. Оставленный экспорт без читателя
 * протух бы молча: он всё ещё называл бы группу `callouts`-соседкой, которой уже нет (B-13).
 *
 * ЗНАНИЕ ИЗ НЕГО НЕ ПРОПАЛО. Заголовок группы спецификации звучал «material slots», а не «bill of
 * materials», по слову владельца (B-20: «как то его нормально назвать»), — и это слово теперь
 * стоит там, где ему и место: на самой секции (`design/material-slots.tsx`). Ключи групп живы в
 * `ProposalRow['group']` и по-прежнему различают строки.
 */
