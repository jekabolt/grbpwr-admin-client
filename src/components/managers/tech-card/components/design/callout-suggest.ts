import type { CalloutSuggestion } from 'api/proto-http/admin';
import { parseSpec, writeSpec } from 'ui/components/annotation/purpose';
import type { SurfaceCallout } from 'ui/components/annotation/surface';
import { annotationKindFromWire } from 'ui/components/annotation/wire';
import { decimalToInput } from 'utils/decimal';

/**
 * ═══ ПОДСКАЗКА УКАЗАНИЙ (T28, R36) — ЧИСТАЯ ЧАСТЬ ═══════════════════════════════════════════════
 *
 * Сервер (`SuggestCallouts`, контракт tmp/plans/callout-kinds/42-CONTRACT.md) отдаёт указания,
 * которых требуют данные СОХРАНЁННОЙ карточки, уже расставленные моделью по флэтам. Здесь — всё,
 * что про них решается без React: призрак для поверхности, строка формы для ✓, ссылка на операцию
 * и память отклонённого (✕) на этом компьютере.
 */

/** Отклонённые источники — на карточку, в этом браузере (владелец: «on this computer»). */
export const dismissedKey = (techCardId: number) =>
  `plm.techcard.${techCardId}.callout-suggest.dismissed`;

export function readDismissed(techCardId: number): string[] {
  try {
    const raw = localStorage.getItem(dismissedKey(techCardId));
    const v: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x) : [];
  } catch {
    return [];
  }
}

/** Дописывает и возвращает новый список. Хранилище недоступно — список живёт до перезагрузки. */
export function addDismissed(techCardId: number, sourceIds: string[]): string[] {
  const next = [...new Set([...readDismissed(techCardId), ...sourceIds.filter(Boolean)])];
  try {
    localStorage.setItem(dismissedKey(techCardId), JSON.stringify(next));
  } catch {
    /* приватное окно / квота: отклонение действует в этом сеансе через снятие строки */
  }
  return next;
}

const frac = (d: CalloutSuggestion['posX']) => {
  const n = Number(decimalToInput(d));
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.5;
};

const pointsOf = (s: CalloutSuggestion) =>
  (s.points ?? []).map((p) => ({ x: frac(p.x), y: frac(p.y) }));

/** Призрак на плите: ключ — id предложения (уникален в ответе). */
export function ghostOf(s: CalloutSuggestion): SurfaceCallout {
  const spec = parseSpec(s.spec);
  return {
    key: s.id ?? '',
    kind: annotationKindFromWire(s.kind),
    points: pointsOf(s),
    label: { x: frac(s.posX), y: frac(s.posY) },
    text: s.description ?? '',
    spec,
    caps: spec?.t === 'section' ? 'arrow' : undefined,
  };
}

/**
 * ✓ — то, что станет строкой `callouts`. Фигура, стиль назначения и `spec` — по тому же правилу,
 * что у постановки рукой (`placePurpose`): арт — пунктиром, разрез — со стрелками, зона — без
 * штриховки. `spec` — канонический объект (`writeSpec`), как пишет любая постановка.
 */
export type CalloutSeed = {
  mediaId: number;
  kind: string;
  points: { x: number; y: number }[];
  marker: { x: number; y: number };
  spec: string;
  description: string;
  parts: string[];
  dashed?: boolean;
  filled?: boolean;
  caps?: 'arrow';
};

export function seedOf(s: CalloutSuggestion): CalloutSeed {
  const spec = parseSpec(s.spec);
  const kind = annotationKindFromWire(s.kind);
  return {
    mediaId: s.mediaId ?? 0,
    kind,
    points: kind === 'pin' ? [] : pointsOf(s),
    marker: { x: frac(s.posX), y: frac(s.posY) },
    spec: writeSpec(spec),
    description: (s.description ?? '').trim(),
    parts: (s.parts ?? []).filter(Boolean),
    ...(spec?.t === 'artwork' ? { dashed: true } : {}),
    ...(kind === 'polygon' ? { filled: false } : {}),
    ...(spec?.t === 'section' ? { caps: 'arrow' as const } : {}),
  };
}

/**
 * ОПЕРАЦИЯ ЗА ПРЕДЛОЖЕНИЕМ — `op:<номер операции>`. Номер (`operationNumber`) сервер назначает
 * сам и держит, пока карточка не пересохранена с другим порядком; подсказка идёт по СОХРАНЁННОЙ
 * карточке (сначала сейв), поэтому номер в ответе и номер в форме — один.
 */
export function opNumberOf(sourceId: string | undefined): number | null {
  const m = /^op:(\d+)$/.exec((sourceId ?? '').trim());
  const n = m ? Number(m[1]) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Пробел данных на исходной строке — тихой меткой: `no spi`, `no allowance`. */
export const missingLabel = (m: string) => `no ${m.trim().toLowerCase()}`;
