// НАСТРОЙКИ СОСТАВНИКОВ НА КАРТОЧКУ — localStorage `care-labels:v1:<techCardId>` (план §9.3).
//
// Что хранится: режим печати, пресет и шаблон QR, запас % и источник количеств. Сами КОЛИЧЕСТВА
// не хранятся — они либо от прогона, либо введены на один раз; вчерашние цифры, молча всплывшие в
// сегодняшнем архиве, — худшая из возможных ошибок этого экрана.
//
// Прецедент — `use-schematic-prefs.ts`, и правила оттуда же:
//  - ОДИН `buildStored`: запись собирает одна чистая функция, писатели дают ей только патч, поэтому
//    поле, о котором писатель не знает, не стирается его вызовом;
//  - формат `v: 1` НЕ ЛОМАЕТСЯ: новые поля — только необязательные, чтение back-compat (запись без
//    `overagePct` читается, запас берётся по умолчанию);
//  - хранилище правит кто угодно (чужая вкладка, ручная чистка) — из записи берётся только то, что
//    похоже на правду;
//  - ключ НЕСЁТ id карточки: без него пресет одной карточки утёк бы в другую.
import { useCallback, useEffect, useRef, useState } from 'react';
import { renderTemplate, STOREFRONT_QR_TEMPLATE, type QrTemplateVars } from './qr';

export type PrintMode = 'duplex' | 'simplex';

/**
 * `storefront` — страница колорвея на витрине (дефолт, §7); `custom` — свой шаблон с подстановками;
 * `fixed` — одна ссылка на все ленты, без подстановок.
 */
export type QrPreset = 'storefront' | 'custom' | 'fixed';

/** Источник сетки количеств: вручную или planned_qty прогона. */
export type QuantitySource = 'manual' | { runId: number };

export type CareLabelPrefs = {
  mode: PrintMode;
  qrPreset: QrPreset;
  /** Текст поля шаблона — общий для `custom` и `fixed`; у `storefront` не используется. */
  qrTemplate: string;
  /** Запас на брак ленты и перешив, %, на ячейку с округлением вверх. */
  overagePct: number;
  source: QuantitySource;
};

export const DEFAULT_OVERAGE_PCT = 5;

export const PREFS_DEFAULTS: CareLabelPrefs = {
  mode: 'duplex',
  qrPreset: 'storefront',
  qrTemplate: '',
  overagePct: DEFAULT_OVERAGE_PCT,
  source: 'manual',
};

/** Хранимая запись. Все поля, кроме версии, необязательны: отсутствие = дефолт. */
export type Stored = {
  v: 1;
  mode?: PrintMode;
  qrPreset?: QrPreset;
  qrTemplate?: string;
  overagePct?: number;
  source?: QuantitySource;
};

export const storageKey = (techCardId: number) => `care-labels:v1:${techCardId}`;

/**
 * ЕДИНСТВЕННОЕ место, где рождается хранимая запись. Поле, которого нет в патче, берётся из
 * текущего состояния; пустые поля в объект не кладутся.
 */
export function buildStored(cur: CareLabelPrefs, patch: Partial<CareLabelPrefs> = {}): Stored {
  const next = { ...cur, ...patch };
  return {
    v: 1,
    mode: next.mode,
    qrPreset: next.qrPreset,
    ...(next.qrTemplate ? { qrTemplate: next.qrTemplate } : {}),
    overagePct: next.overagePct,
    source: next.source,
  };
}

const MODES: readonly PrintMode[] = ['duplex', 'simplex'];
const PRESETS: readonly QrPreset[] = ['storefront', 'custom', 'fixed'];

/** Запас: целые 0..100; мусор — дефолт. */
export const clampOverage = (n: unknown): number | undefined =>
  typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n) : undefined;

/** Разбор строки хранилища в настройки с дефолтами. Функция от СТРОКИ — проверяется без браузера. */
export function parseStored(raw: string | null): CareLabelPrefs {
  if (!raw) return { ...PREFS_DEFAULTS };
  try {
    const p = JSON.parse(raw) as Partial<Stored> | null;
    if (!p || typeof p !== 'object') return { ...PREFS_DEFAULTS };
    const src = p.source;
    const source: QuantitySource =
      src && typeof src === 'object' && Number.isInteger(src.runId) && src.runId > 0
        ? { runId: src.runId }
        : 'manual';
    return {
      mode: MODES.includes(p.mode as PrintMode) ? (p.mode as PrintMode) : PREFS_DEFAULTS.mode,
      qrPreset: PRESETS.includes(p.qrPreset as QrPreset)
        ? (p.qrPreset as QrPreset)
        : PREFS_DEFAULTS.qrPreset,
      qrTemplate: typeof p.qrTemplate === 'string' ? p.qrTemplate : '',
      overagePct: clampOverage(p.overagePct) ?? DEFAULT_OVERAGE_PCT,
      source,
    };
  } catch {
    return { ...PREFS_DEFAULTS };
  }
}

function read(techCardId: number | undefined): CareLabelPrefs {
  if (techCardId === undefined) return { ...PREFS_DEFAULTS };
  try {
    return parseStored(localStorage.getItem(storageKey(techCardId)));
  } catch {
    // Хранилище запрещено политикой — работаем на дефолтах.
    return { ...PREFS_DEFAULTS };
  }
}

/** Шаблон, по которому строится ссылка QR при данном пресете. */
export function effectiveQrTemplate(p: Pick<CareLabelPrefs, 'qrPreset' | 'qrTemplate'>): string {
  return p.qrPreset === 'storefront' ? STOREFRONT_QR_TEMPLATE : p.qrTemplate.trim();
}

/**
 * Ссылка QR для одного варианта. `fixed` — одна ссылка как есть (подстановок нет по смыслу
 * пресета); остальные — `renderTemplate` (qr.ts: `{base_sku}` строчными, значения экранированы).
 */
export function qrLink(
  p: Pick<CareLabelPrefs, 'qrPreset' | 'qrTemplate'>,
  vars: QrTemplateVars,
): string {
  const tpl = effectiveQrTemplate(p);
  return p.qrPreset === 'fixed' ? tpl : renderTemplate(tpl, vars);
}

/** Настройки одной карточки; без id (не бывает на этом экране) — только память сессии. */
export function useCareLabelPrefs(techCardId: number | undefined) {
  const [prefs, setPrefs] = useState<CareLabelPrefs>(() => read(techCardId));
  const cur = useRef(prefs);

  // Карточка сменилась под тем же компонентом — перечитать.
  const loadedFor = useRef(techCardId);
  useEffect(() => {
    if (loadedFor.current === techCardId) return;
    loadedFor.current = techCardId;
    const next = read(techCardId);
    cur.current = next;
    setPrefs(next);
  }, [techCardId]);

  const update = useCallback(
    (patch: Partial<CareLabelPrefs>) => {
      const stored = buildStored(cur.current, patch);
      const next = parseStored(JSON.stringify(stored));
      cur.current = next;
      setPrefs(next);
      if (techCardId === undefined) return;
      try {
        localStorage.setItem(storageKey(techCardId), JSON.stringify(stored));
      } catch {
        // Квота / запрет: настройка не переживёт перезагрузку, но работать не мешает.
      }
    },
    [techCardId],
  );

  return { prefs, update };
}
