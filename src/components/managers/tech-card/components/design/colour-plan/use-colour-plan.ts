import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { GetDesignBandResponse } from 'api/proto-http/admin';
import { adminService } from 'api/api';
import { useSnackBarStore } from 'lib/stores/store';
import { useCallback, useMemo, useRef, useState } from 'react';

import { designKeys } from '../use-design-band';
import {
  PLAN_BYTES_MAX,
  PLAN_CLOTHS_MAX,
  PLAN_MAPS_MAX,
  type ColourPlanDoc,
  type PlanCloth,
  type PlanMap,
  readColourPlan,
  writeCloth,
  writeMap,
} from './model';

/**
 * ═══ ЗАПИСЬ ЦВЕТОВОГО ПЛАНА — ОДИН ГЛАГОЛ И ОДНА СВЕРКА РЕВИЗИИ ═══════════════════════════════
 *
 * ⚠ `DeleteDesignColourPlan` НЕТ, И ЭТО НЕ ЗАБЫВЧИВОСТЬ КОНТРАКТА. Он БЫЛ и снят ревью `5dbb3b5`
 * (находка 5): он нёс один `tech_card_id`, то есть не сверял ревизию и не мог отказать — вкладка,
 * открытая на rev 3, молча сносила двадцать минут чужой покраски, сохранённой на rev 5, и
 * осиротила её PNG. «Очистить» теперь — это СОХРАНЕНИЕ пустого документа под `expected_rev`:
 * ничего не теряется, второго глагола не заводится, и лестница ревизий не сбрасывается в ноль.
 *
 * ⚠ РЕВИЗИЯ БЕРЁТСЯ ИЗ ОТВЕТА СЕРВЕРА, А НЕ ИЗ ПОЛОСЫ. Полоса перечитывается инвалидацией, то есть
 * ПОЗЖЕ; сохранение, взявшее `rev` из ещё не обновлённого чтения, отказало бы само себе на втором
 * нажатии подряд. Ответ несёт весь план целиком именно для этого — контракт говорит об этом
 * дословно: «Returned in full rather than as a bare number so a screen never has to re-read the
 * band to know what it just wrote».
 */
export type ColourPlanWrites = {
  /** План этой карточки. `undefined` = сервер про план не говорит вовсе — см. `readColourPlan`. */
  plan: ColourPlanDoc | undefined;
  /** Сервер знает этот глагол. Ложь — дверь покраски закрыта, и причина говорится словами. */
  serves: boolean;
  saving: boolean;
  /** Записать документ целиком. Возвращает сохранённый план или `null`, если сервер отказал. */
  save: (next: { maps: PlanMap[]; cloths: PlanCloth[] }) => Promise<ColourPlanDoc | null>;
  /** URL только что загруженной карты — по её media id. Живёт до перезагрузки, см. довод ниже. */
  mapUrl: (mediaId: number) => string;
  rememberMapUrl: (mediaId: number, url: string) => void;
};

/**
 * ОТКАЗЫ ЭТОГО ГЛАГОЛА — СЛОВАМИ, ПО КОДУ, а не по тексту: коды и есть словарь. Тот же разбор, что
 * у слоя редактора (`layerRefusalText`), и по той же причине: не развёрнутый на сервере маршрут
 * отвечает 501/404, и «план не сохранился» над отсутствующим бинарником отправляет человека искать
 * ошибку в собственной покраске.
 */
export function planRefusalText(error: unknown): string {
  const status = (error as { status?: number } | null)?.status;
  const raw = error instanceof Error ? error.message : '';
  const has = (code: string) => raw.includes(code);

  if (status === 404 || status === 501 || has('Unimplemented'))
    return 'this server has no colour plan yet — the route is not deployed. Nothing was saved, and the painting on screen is still yours until you close the editor.';
  if (status === 409 || has('colour_plan_rev_mismatch'))
    return 'somebody changed this card’s colour plan while it was open. Nothing was written — reload the card to see their version, then paint on top of it. Retrying would overwrite their work without either of you seeing it.';
  if (has('foreign_media'))
    return 'that picture belongs to another tech card, so it cannot be this card’s colour map.';
  if (status === 400 || has('InvalidArgument'))
    return raw || 'the server refused the colour plan.';
  return raw || 'the colour plan did not go through';
}

export function useColourPlan(techCardId: number, band: GetDesignBandResponse): ColourPlanWrites {
  const qc = useQueryClient();
  const { showMessage } = useSnackBarStore();
  const key = designKeys.band(techCardId);
  const fromBand = useMemo(() => readColourPlan(band), [band]);

  /**
   * ⚠ ЛОКАЛЬНЫЙ ПЛАН СТАРШЕ ПРОЧИТАННОГО, И ТОЛЬКО ПОКА ПОЛОСА НЕ ДОГНАЛА. Сохранение отвечает
   * новой ревизией мгновенно, а инвалидация полосы возвращается через сеть; между ними экран
   * показывал бы вчерашние ряды под уже записанной покраской и предлагал бы сохранять под старой
   * ревизией — то есть сам себе отказал бы CAS'ом.
   */
  const [echo, setEcho] = useState<ColourPlanDoc | null>(null);
  const plan = useMemo(() => {
    if (fromBand === undefined) return undefined;
    if (echo && echo.rev >= fromBand.rev) return echo;
    return fromBand;
  }, [fromBand, echo]);

  /**
   * АДРЕС ТОЛЬКО ЧТО ЗАГРУЖЕННОЙ КАРТЫ — В ПАМЯТИ ВКЛАДКИ, И ЭТО ЧЕСТНО НАЗВАННАЯ ДЫРА.
   *
   * ⚠ `DesignColourMap` НЕСЁТ ТОЛЬКО `media_id`: ни `MediaFull`, ни URL, а чтения медиа по
   * идентификатору у контракта нет намеренно. Значит после перезагрузки вкладки байтов карты взять
   * НЕГДЕ — её можно посчитать (палитра лежит в плане), но нельзя ни показать, ни открыть на
   * доработку. Пока вкладка жива, адрес помнит эта карта; перезагрузка возвращает состояние
   * «палитра есть, картинки нет», и `paint ▸` тогда открывает ЧИСТЫЙ флэт с той же палитрой в
   * кандидатах — ровно то же поведение, что у устаревшей карты, и по той же причине.
   * ЭТО ПОЧИНКА НА БЭКЕНДЕ (карте нужен свой `MediaFull` в ответе полосы), а не здесь.
   */
  const urls = useRef(new Map<number, string>());
  const rememberMapUrl = useCallback((mediaId: number, url: string) => {
    if (mediaId > 0 && url) urls.current.set(mediaId, url);
  }, []);
  const mapUrl = useCallback((mediaId: number) => urls.current.get(mediaId) ?? '', []);

  const serves = fromBand !== undefined;

  const mutation = useMutation({
    mutationFn: (input: { expectedRev: number; maps: PlanMap[]; cloths: PlanCloth[] }) =>
      adminService.SetDesignColourPlan({
        techCardId,
        expectedRev: input.expectedRev,
        maps: input.maps.map(writeMap),
        cloths: input.cloths.map(writeCloth),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
    },
  });

  const save = useCallback(
    async (next: { maps: PlanMap[]; cloths: PlanCloth[] }): Promise<ColourPlanDoc | null> => {
      if (!plan) {
        showMessage(
          'this server does not carry a colour plan yet — nothing was saved, and painting is closed until it does',
          'error',
        );
        return null;
      }
      /* ⚠ ПОТОЛКИ ПРОВЕРЯЮТСЯ ЗДЕСЬ, А НЕ ТОЛЬКО НА СЕРВЕРЕ. Отказ двери — это круг ожидания и
         снекбар посреди работы; и он же сообщает о потолке, о котором экран знал заранее. */
      if (next.maps.length > PLAN_MAPS_MAX) {
        showMessage(`a card carries at most ${PLAN_MAPS_MAX} colour maps`, 'error');
        return null;
      }
      if (next.cloths.length > PLAN_CLOTHS_MAX) {
        showMessage(`a colour plan carries at most ${PLAN_CLOTHS_MAX} assignments`, 'error');
        return null;
      }
      const payload = {
        maps: next.maps.map(writeMap),
        cloths: next.cloths.map(writeCloth),
      };
      const bytes = JSON.stringify(payload).length;
      if (bytes > PLAN_BYTES_MAX) {
        showMessage(
          `this colour plan is ${Math.round(bytes / 1024)} KB against a ceiling of ${PLAN_BYTES_MAX / 1024} KB — the plan is read on every read of this card, so an oversized one makes the card unreadable rather than merely large`,
          'error',
        );
        return null;
      }
      try {
        const res = await mutation.mutateAsync({
          expectedRev: plan.rev,
          maps: next.maps,
          cloths: next.cloths,
        });
        const stored = res.plan;
        const saved: ColourPlanDoc = {
          rev: stored?.rev ?? plan.rev + 1,
          maps: next.maps,
          cloths: next.cloths,
        };
        setEcho(saved);
        return saved;
      } catch (error) {
        showMessage(planRefusalText(error), 'error');
        return null;
      }
    },
    [mutation, plan, showMessage],
  );

  return {
    plan,
    serves,
    saving: mutation.isPending,
    save,
    mapUrl,
    rememberMapUrl,
  };
}
