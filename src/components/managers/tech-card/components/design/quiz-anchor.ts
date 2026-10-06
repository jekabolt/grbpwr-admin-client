import type { DesignQuizQuestion, DesignQuizSpot } from 'api/proto-http/admin';
import { useCallback, useEffect, useState, type RefObject } from 'react';

import type { PictureTileMenu } from './picture-tile';

/**
 * ═══ ЯКОРЬ ВОПРОСА НА ДОСКЕ (96-PICTURE-QUESTIONS, Q24) ════════════════════════════════════════
 *
 * Вопрос квиза про конкретную картинку доски (`DesignQuizQuestion.mediaId`) поднимает её id сюда;
 * доска обводит эту плитку и приглушает остальные (`FocusedAnnotator.anchoredMediaId`) и докручивает
 * ленту до неё. Свёрнутая доска (`enabled = false`) не якорится вовсе: ни обводки, ни прокрутки.
 */

/** Что квиз знает о картинке вопроса: номер на доске, роль и адрес превью. */
export type QuizPicture = { n: number; role: string; url: string };

/**
 * РОЛЬ КАРТИНКИ ДОСКИ (E3, 64-DEFERRED) — список живёт здесь, доска его переэкспортирует: квизу роли
 * нужны без импорта доски (доска сама монтирует квиз).
 */
export const MOOD_ROLES = ['target', 'detail', 'material', 'mood'] as const;

/** 97-ROLE-FIRST: подсказка роли — `title` чипа, не текст на экране. */
export const ROLE_HINT: Record<(typeof MOOD_ROLES)[number], string> = {
  target: 'the garment we sew',
  detail: 'a detail to take',
  material: 'fabric, colour, texture',
  mood: 'atmosphere only',
};

/**
 * Q27: угол-меню роли плитки доски — одно описание на доску и на стенд. В покое слово угла — сама
 * роль (`material ▾`), без роли — `role ▾`; ярлык номера (`2 · material`) рисует `tileBadge`.
 */
export function roleMenu(
  mediaId: number,
  n: number,
  role: string,
  onPick: (role: string) => void,
): PictureTileMenu {
  return {
    label: role || 'role',
    ariaLabel: `role of moodboard picture ${n}`,
    items: [
      ...MOOD_ROLES.map((r) => ({ value: r, label: r, current: role === r, title: ROLE_HINT[r] })),
      ...(role ? [{ value: '', label: 'none' }] : []),
    ],
    onPick,
    'data-menu': `role:${mediaId}`,
  };
}

const ROLE_PREFIX = 'role:';

/**
 * 97-ROLE-FIRST (Q25): вопрос «что это за картинка?» — собирается на клиенте из строки доски, без
 * вызова модели. Вопрос про картинку (`mediaId`), поэтому якорь доски тот же, что у Q24. Ответ —
 * роль на самой картинке, в ответы квиза он не пишется.
 */
export function roleQuestion(mediaId: number): DesignQuizQuestion {
  return {
    id: `${ROLE_PREFIX}${mediaId}`,
    category: 'role',
    part: 'whole',
    family: '',
    view: '',
    kind: 'single',
    question: 'What is this picture?',
    options: [...MOOD_ROLES],
    contradicts: MOOD_ROLES.map(() => false),
    visualEvidence: '',
    clarifyQuestion: '',
    clarifyOptions: [],
    decisionKey: '',
    mediaId,
  };
}

export const isRoleQuestion = (q: DesignQuizQuestion | undefined) =>
  !!q?.id?.startsWith(ROLE_PREFIX);

const reducedMotion = () =>
  typeof window !== 'undefined' &&
  !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * ═══ МЕСТА НА КАРТИНКЕ (99-SPOTS, Q29) ═══════════════════════════════════════════════════════════
 *
 * Вопрос про картинку несёт 1–3 места `{label, x, y, scale}` (x,y — 0..1000 по кадру картинки).
 * Квиз поднимает их вместе с id: доска рисует на якорной плитке кольца с номерами (номер = индекс + 1).
 * 102-QUICKWIN C1: номера живут только на кольцах — в тексте вопроса ни индексов, ни легенды, ни
 * переключателя «hide spots»; места приходят только у вопросов про DETAIL-картинку (сервер, B3).
 */
export type QuizAnchor = { mediaId: number; spots: DesignQuizSpot[] };

/** 99 §1.4: шкала мест `detail` — переключатель по итогам оценки; `false` — рисуем только `zone`. */
export const SPOT_DETAIL = false;

/** Чистые места вопроса: в кадре, с подписью, ≤3; `detail` — только при `SPOT_DETAIL`. */
export function spotsOf(q: DesignQuizQuestion | undefined): DesignQuizSpot[] {
  if (!q?.mediaId || isRoleQuestion(q)) return [];
  const ok = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1000;
  return (q.spots ?? [])
    .filter((s) => ok(s.x) && ok(s.y) && (s.label ?? '').trim() !== '')
    .filter((s) => SPOT_DETAIL || s.scale !== 'detail')
    .slice(0, 3);
}

export function usePictureAnchor(scope: RefObject<HTMLElement | null>, enabled: boolean) {
  const [anchor, setAnchor] = useState<QuizAnchor | null>(null);
  // 99 §2: место под курсором — номер кольца на доске (его коробка встаёт в чернила).
  const [hotSpot, setHotSpot] = useState<number | null>(null);
  const liveAnchor = enabled ? anchor : null;
  const live = liveAnchor?.mediaId ?? null;

  useEffect(() => {
    if (live == null) return;
    const tile = scope.current?.querySelector<HTMLElement>(`[data-rail-view="${live}"]`);
    if (!tile) return;
    // Q26 (владелец): якорная картинка встаёт в ЦЕНТР ленты. Плитка в якоре щёлкает `snap-center`
    // (focused-annotator), поэтому снап не откатывает ленту к началу плитки. Края ленты — как выйдет:
    // первую плитку дальше начала не сдвинуть.
    tile.scrollIntoView({
      block: 'nearest',
      inline: 'center',
      behavior: reducedMotion() ? 'auto' : 'smooth',
    });
  }, [live, scope]);

  const onFocusPicture = useCallback((a: QuizAnchor | null) => {
    setAnchor(a && a.mediaId > 0 ? a : null);
    setHotSpot(null);
  }, []);
  return {
    anchored: live,
    spots: liveAnchor?.spots ?? [],
    hotSpot,
    onHotSpot: setHotSpot,
    onFocusPicture,
  };
}
