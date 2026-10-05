import type { CalloutSuggestion } from 'api/proto-http/admin';
import { parseSpec, writeSpec } from 'ui/components/annotation/purpose';
import type { SurfaceCallout } from 'ui/components/annotation/surface';
import { kindDef } from 'ui/components/annotation/kinds';
import { annotationKindFromWire, annotationKindToWire } from 'ui/components/annotation/wire';
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

const unit = (d: unknown): number | null => {
  const v = d && typeof d === 'object' ? (d as { value?: unknown }).value : undefined;
  const raw = typeof v === 'string' ? v.trim() : '';
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : null;
};
const dec = (n: number) => ({ value: String(n) });

/**
 * ОТВЕТ СЕРВЕРА — ДАННЫЕ, А НЕ ОБЕЩАНИЕ. До экрана доходят только предложения с id (первое из
 * повторов), на живом карточном флэте, с известным видом, координатами в 0..1 и числом якорей по
 * правилу вида (`kindDef.points`; у пина якорей нет — точка живёт в позиции плашки).
 */
export function normalizeSuggestions(
  list: readonly CalloutSuggestion[] | null | undefined,
  liveMediaIds: readonly number[],
): CalloutSuggestion[] {
  const live = new Set(liveMediaIds);
  const seen = new Set<string>();
  const out: CalloutSuggestion[] = [];
  for (const s of Array.isArray(list) ? list : []) {
    if (!s || typeof s !== 'object') continue;
    const id = typeof s.id === 'string' ? s.id.trim() : '';
    if (!id || seen.has(id)) continue;
    if (!live.has(Number(s.mediaId) || 0)) continue;
    const kind = annotationKindFromWire(s.kind);
    if (annotationKindToWire(kind) !== s.kind) continue;
    const posX = unit(s.posX);
    const posY = unit(s.posY);
    if (posX == null || posY == null) continue;
    const raw: Partial<NonNullable<CalloutSuggestion['points']>[number]>[] = Array.isArray(s.points)
      ? s.points
      : [];
    const pts: (number | null)[][] = raw.map((p) =>
      p && typeof p === 'object' ? [unit(p.x), unit(p.y)] : [null, null],
    );
    if (pts.some(([x, y]) => x == null || y == null)) continue;
    const [lo, hi] = kindDef(kind).points;
    if (kind !== 'pin' && (pts.length < lo || pts.length > hi)) continue;
    seen.add(id);
    out.push({
      ...s,
      id,
      posX: dec(posX),
      posY: dec(posY),
      points: kind === 'pin' ? [] : pts.map(([x, y]) => ({ x: dec(x!), y: dec(y!) })),
      parts: ((Array.isArray(s.parts) ? s.parts : []) as unknown[]).filter(
        (x): x is string => typeof x === 'string' && !!x,
      ),
      missing: ((Array.isArray(s.missing) ? s.missing : []) as unknown[]).filter(
        (x): x is string => typeof x === 'string' && !!x,
      ),
      sourceId: typeof s.sourceId === 'string' ? s.sourceId : '',
      sourceLabel: typeof s.sourceLabel === 'string' ? s.sourceLabel : '',
      description: typeof s.description === 'string' ? s.description : '',
      spec: typeof s.spec === 'string' ? s.spec : '',
    });
  }
  return out;
}

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
