import type { DesignQuizQuestion } from 'api/proto-http/admin';
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

export function usePictureAnchor(scope: RefObject<HTMLElement | null>, enabled: boolean) {
  const [anchored, setAnchored] = useState<number | null>(null);
  const live = enabled ? anchored : null;

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

  const onFocusPicture = useCallback(
    (id: number | null) => setAnchored(id && id > 0 ? id : null),
    [],
  );
  return { anchored: live, onFocusPicture };
}
