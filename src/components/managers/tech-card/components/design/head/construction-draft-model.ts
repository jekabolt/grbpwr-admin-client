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
      }),
    )
    .nullish(),
  missing: z.array(z.string()).nullish(),
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
    (d.missing?.length ?? 0) > 0;
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
  | { kind: 'callout'; part: string; description: string; dimensions: string }
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
      };
    };

export type ProposalRow = {
  /**
   * Личность строки ВНУТРИ ОДНОГО ПРЕДЛОЖЕНИЯ, и она выведена из СОДЕРЖИМОГО, а не из позиции.
   * Сравнение пересчитывается на каждом рендере (правило D5), поэтому индексный ключ переехал бы
   * на соседа, как только принятая строка ушла в `same`, — и квитанция «added» встала бы не на ту.
   */
  id: string;
  group: 'general' | 'aspects' | 'callouts' | 'bom';
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
  callouts?: Array<{ part?: string }>;
  bomItems?: Array<{ name?: string }>;
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
 *   · скаляры (силуэт, ткань, посадка) — сравниваются с карточкой; `replace` требует СВОЕГО клика
 *     по СВОЕЙ строке и не бывает побочным действием соседней;
 *   · концепт — предлагается ТОЛЬКО когда собственный концепт карточки пуст. Слова дизайнера
 *     старше слов модели, и предложение, спорящее с ними, заставляло бы человека защищать то, что
 *     он уже написал. Непустой концепт ⇒ строки нет ВОВСЕ (не `same`: спорить не с чем);
 *   · аспекты — тот же скалярный разбор, но по ключу строки `details[]`;
 *   · списки (указания, спецификация) — ТОЛЬКО ДОБАВЛЕНИЕ. Совпавшая по имени строка приходит
 *     `same`; ни одна строка списка никогда не переписывается и не удаляется, поэтому набранное
 *     руками не может исчезнуть от чужого клика.
 *
 * ⚠ ДЕДУП УКАЗАНИЙ ИДЁТ ПО ВСЕМ `callouts` КАРТОЧКИ, А НЕ ТОЛЬКО ПО КОНСТРУКЦИОННЫМ. Связь
 * «деталь кроя ↔ указание» стоит на ИМЕНИ, значит два указания с одинаковым именем — это
 * настоящее столкновение, где бы второе ни было приколото.
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

  /* ── указания ── */
  const knownCallouts = new Set(
    (form.callouts ?? []).map((c) => foldToken(c.part)).filter(Boolean),
  );
  const seenCallout = new Set<string>();
  for (const c of draft.callouts ?? []) {
    const part = normText(c.feature);
    const description = normText(c.details);
    const dimensions = normText(c.dimensions);
    if (!part && !description) continue;
    const key = foldToken(part) || foldToken(description);
    if (seenCallout.has(key)) continue;
    seenCallout.add(key);
    const value = [part, description].filter(Boolean).join(' — ') + (dimensions ? ` (${dimensions})` : '');
    rows.push({
      id: `callout:${key}`,
      group: 'callouts',
      label: 'callout',
      value,
      current: '',
      state: knownCallouts.has(foldToken(part)) && !!part ? 'same' : 'add',
      write: { kind: 'callout', part, description, dimensions },
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
        },
      },
    });
  }

  const missing = (draft.missing ?? []).map((m) => normText(m)).filter(Boolean);
  return { rows, missing };
}

/** Порядок групп на экране — тот же, каким CONSTRUCTION рисует свои четыре блока. */
export const PROPOSAL_GROUPS: Array<{ key: ProposalRow['group']; title: string }> = [
  { key: 'general', title: 'general information' },
  { key: 'aspects', title: 'aspects' },
  { key: 'callouts', title: 'callouts' },
  { key: 'bom', title: 'bill of materials' },
];
