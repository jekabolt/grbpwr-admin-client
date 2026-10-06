import { useCallback, useEffect, useState, type RefObject } from 'react';

/**
 * ═══ ЯКОРЬ ВОПРОСА НА ДОСКЕ (96-PICTURE-QUESTIONS, Q24) ════════════════════════════════════════
 *
 * Вопрос квиза про конкретную картинку доски (`DesignQuizQuestion.mediaId`) поднимает её id сюда;
 * доска обводит эту плитку и приглушает остальные (`FocusedAnnotator.anchoredMediaId`) и докручивает
 * ленту до неё. Свёрнутая доска (`enabled = false`) не якорится вовсе: ни обводки, ни прокрутки.
 */

/** Что квиз знает о картинке вопроса: номер на доске, роль и адрес превью. */
export type QuizPicture = { n: number; role: string; url: string };

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
    // Лента — `snap-x snap-mandatory`, плитки `snap-start`: `inline: 'nearest'` у частично видной
    // плитки прокручивает к её краю, и снап откатывает ленту к соседке. Не видна целиком — к началу
    // плитки (это точка снапа; поле `scroll-mx` у якорной плитки оставляет место обводке).
    const strip = tile.parentElement;
    const a = tile.getBoundingClientRect();
    const b = strip?.getBoundingClientRect();
    const whole = !b || (a.left >= b.left && a.right <= b.right);
    tile.scrollIntoView({
      block: 'nearest',
      inline: whole ? 'nearest' : 'start',
      behavior: reducedMotion() ? 'auto' : 'smooth',
    });
  }, [live, scope]);

  const onFocusPicture = useCallback(
    (id: number | null) => setAnchored(id && id > 0 ? id : null),
    [],
  );
  return { anchored: live, onFocusPicture };
}
