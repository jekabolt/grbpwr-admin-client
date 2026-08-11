import type {
  common_AdminColorwayRef,
  common_ProductionRun,
  common_TechCard,
} from 'api/proto-http/admin';
import { wireInt } from 'components/managers/tech-card/components/schema';

// СКОУП ПЕЧАТИ — «для кого и на что» напечатан этот лист.
//
// Тех-карта выдаётся не «вообще», а на конкретный производственный прогон конкретного колорвея:
// швея держит выкройку и assembly order ЭТОГО цвета, раскройщик кроит ЭТУ партию, ОТК меряет те
// размеры, что в тираже. До этого модуля печать скоупилась единственным параметром — id карты, и
// печатала всё сразу: все колорвеи, все размеры, живую карту и себестоимость, которая уезжала
// внешней фабрике.
//
// ГЛАВНОЕ ПРАВИЛО МОДУЛЯ: фильтрация живёт ЗДЕСЬ, в резолверах, и больше нигде. Лист не решает
// сам, что ему печатать, — он спрашивает скоуп. Фильтр, продублированный в каждом листе, разъедется
// на первом же новом листе, и разъедется молча: на бумаге окажется «cut pieces» одного цвета рядом
// с рецептом всех цветов, и никто этого не заметит до цеха.
//
// Модуль ЧИСТЫЙ: ни React, ни RPC. Скоуп собирается страницей печати и передаётся вниз пропом.

export type PrintProfile = 'factory' | 'internal' | 'release';

/** Тетради комплекта: самостоятельно печатаемые и выдаваемые наборы листов. */
export type BookletId = 'cover' | 'cut' | 'sew' | 'qc' | 'internal';
export const ALL_BOOKLETS: BookletId[] = ['cover', 'cut', 'sew', 'qc', 'internal'];

const isBooklet = (s: string): s is BookletId => (ALL_BOOKLETS as string[]).includes(s);
const isProfile = (s: string): s is PrintProfile =>
  s === 'factory' || s === 'internal' || s === 'release';

export type PrintQuery = {
  /** 0 — прогон не задан. */
  runId: number;
  /** 0 — колорвей не задан (печатаются все). */
  colorwayId: number;
  /** Пусто — размеры не заданы явно (берутся из прогона, иначе все размеры карты). */
  sizeIds: number[];
  /** 0 — релиз не задан. */
  releaseId: number;
  profile: PrintProfile;
  /** null — тетради не заданы: печатается весь документ, как раньше. */
  booklets: BookletId[] | null;
};

export const EMPTY_QUERY: PrintQuery = {
  runId: 0,
  colorwayId: 0,
  sizeIds: [],
  releaseId: 0,
  profile: 'internal',
  booklets: null,
};

const intParam = (sp: URLSearchParams, name: string): number => {
  const raw = sp.get(name);
  if (!raw) return 0;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

export function parsePrintQuery(sp: URLSearchParams): PrintQuery {
  const profileRaw = (sp.get('profile') ?? '').trim();
  const bookletsRaw = (sp.get('booklets') ?? '').trim();
  return {
    runId: intParam(sp, 'run'),
    colorwayId: intParam(sp, 'colorway'),
    sizeIds: (sp.get('sizes') ?? '')
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n) && n > 0),
    releaseId: intParam(sp, 'release'),
    profile: isProfile(profileRaw) ? profileRaw : 'internal',
    booklets: bookletsRaw
      ? bookletsRaw
          .split(',')
          .map((s) => s.trim())
          .filter(isBooklet)
      : null,
  };
}

/** Обратная сборка: модалка опций печати собирает query из выбора. */
export function buildPrintQuery(q: Partial<PrintQuery>): string {
  const sp = new URLSearchParams();
  if (q.runId) sp.set('run', String(q.runId));
  if (q.colorwayId) sp.set('colorway', String(q.colorwayId));
  if (q.sizeIds?.length) sp.set('sizes', q.sizeIds.join(','));
  if (q.releaseId) sp.set('release', String(q.releaseId));
  if (q.profile && q.profile !== 'internal') sp.set('profile', q.profile);
  if (q.booklets?.length) sp.set('booklets', q.booklets.join(','));
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export type PrintScope = {
  techCard: common_TechCard;
  query: PrintQuery;
  profile: PrintProfile;
  /** Прогон, если печать скоупнута на партию. */
  run?: common_ProductionRun;
  /** Токен публичного наряда (живёт на ОТВЕТЕ чтения прогона, не на самом прогоне). */
  runPackToken?: string;
  /** Резолвленный колорвей карты. undefined — не задан ИЛИ не найден (см. colorwayMissing). */
  colorway?: common_AdminColorwayRef;
  /** Колорвей запрошен, но на карте его нет. Это надо ПЕЧАТАТЬ, а не глотать. */
  colorwayMissing: boolean;
  /** Прогон запрошен, но не приехал/не найден. */
  runMissing: boolean;
  /** Итоговые размеры документа, в порядке градации карты. */
  sizeIds: number[];
  revision: { source: 'live' | 'release'; number?: number };
};

export function buildPrintScope(args: {
  techCard: common_TechCard;
  query: PrintQuery;
  run?: common_ProductionRun;
  runPackToken?: string;
  revision?: { source: 'live' | 'release'; number?: number };
}): PrintScope {
  const { techCard, query, run, runPackToken } = args;
  const tc = techCard.techCard;

  const colorway = query.colorwayId
    ? (techCard.colorways ?? []).find((cw) => wireInt(cw.colorwayId) === query.colorwayId)
    : undefined;

  // Градация карты — эталонный порядок. Все множества размеров ниже приводятся к числам через
  // wireInt: сравнение строки с числом молчит, а разъехавшийся порядок колонок на бумаге читается
  // как ошибка раскладки, а не как ошибка сравнения.
  const grade = (tc?.sizeIds ?? []).map(wireInt).filter((n) => n > 0);

  // Размеры прогона: колорвей = product (R1) на основной карте, outputVariantId — только на линиях
  // aux-карт. Читаем оба поля, иначе фильтр по колорвею на основной карте окажется пустым.
  const runSizeIds = new Set<number>();
  if (run) {
    for (const l of run.run?.lines ?? []) {
      if (query.colorwayId) {
        const lineColorway = wireInt(l.productId) || wireInt(l.outputVariantId);
        if (lineColorway !== query.colorwayId) continue;
      }
      const sizeId = wireInt(l.sizeId);
      if (sizeId > 0) runSizeIds.add(sizeId);
    }
  }

  const requested = new Set(query.sizeIds);
  const pick = (id: number): boolean => {
    if (requested.size > 0) return requested.has(id);
    if (runSizeIds.size > 0) return runSizeIds.has(id);
    return true;
  };

  const sizeIds = grade.filter(pick);

  return {
    techCard,
    query,
    profile: query.profile,
    run,
    runPackToken,
    colorway,
    colorwayMissing: query.colorwayId > 0 && !colorway,
    runMissing: query.runId > 0 && !run,
    // Если ни один размер градации не подошёл — печатаем градацию целиком, а не пустоту: пустая
    // размерная ось означала бы «в этом прогоне нет размеров», чего не бывает.
    sizeIds: sizeIds.length > 0 ? sizeIds : grade,
    revision: args.revision ?? { source: 'live' },
  };
}

/** Скоуп «пустой», когда печатается прежний внутренний документ обо всём сразу. */
export function isScoped(scope: PrintScope): boolean {
  return !!scope.run || !!scope.colorway || scope.query.profile !== 'internal';
}

/** Колорвеи, которые документ имеет право печатать. */
export function scopedColorways(scope: PrintScope): common_AdminColorwayRef[] {
  if (scope.colorway) return [scope.colorway];
  return scope.techCard.colorways ?? [];
}

export function scopedSizeIds(scope: PrintScope): number[] {
  return scope.sizeIds;
}

/**
 * Можно ли печатать деньги. `factory` — бумага уезжает внешнему подрядчику, и себестоимость,
 * цены артикулов и поставщики ему не адресованы.
 *
 * ЭТО UX-ФИЛЬТР, А НЕ ГРАНИЦА БЕЗОПАСНОСТИ. Настоящая отсечка серверная: тех-карта и прогон
 * срезают денежные поля аккаунту без costing:read. Здесь мы лишь не печатаем то, что аккаунт
 * ВПРАВЕ видеть, но чему не место на этом листе. Не принимать за защиту.
 */
export function moneyAllowed(scope: PrintScope): boolean {
  return scope.profile !== 'factory';
}

/** Внутреннее (концепт, мудборд, dev-коды, история) — не для цеха. */
export function internalAllowed(scope: PrintScope): boolean {
  return scope.profile !== 'factory';
}

export function bookletOn(scope: PrintScope, id: BookletId): boolean {
  const b = scope.query.booklets;
  if (b === null) return true;
  return b.includes(id);
}
