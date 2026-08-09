// С КАКОЙ КАРТОЧКИ читать норму для сравнения с фактом прогона: снапшот ревизии, по которой
// прогон СОЗДАН, или живая карточка.
//
// Прогон, привязанный к релизу, обязан мериться нормой того снапшота: живую карточку правят
// дальше, и исторический прогон иначе судил бы себя нормой, изменённой после его создания, —
// вплоть до ложного «единицы не сходятся». Порядок ПОВТОРЯЕТ печать (tech-card/print-page.tsx),
// а не изобретает свой:
//   1. релиз прогона (run.run.releaseId) читается через useTechCardRelease;
//   2. ПРИНАДЛЕЖНОСТЬ проверяется явно: release_id прогона и его tech_card_id — независимые
//      ссылки БЕЗ кросс-чека на записи, и чужой релиз дал бы норму другого стиля, правдоподобную
//      на вид;
//   3. snapshot ?? живая карточка — и «снапшот не прочитался» это ТРЕТЬЕ состояние, не «нет
//      релиза» и не «есть»: фолбэк на живую карту обязан говорить о себе вслух (NormCardBasis),
//      иначе живая карта выдаётся за замороженную ревизию.
//
// Пока релиз ЕЩЁ ЧИТАЕТСЯ, normCard не выдаётся вовсе (releasePending): отдать живую карточку
// «на минутку» значило бы мигнуть сравнением с не той ревизией и сменить вердикт на глазах.
import { common_ProductionRun, common_TechCard } from 'api/proto-http/admin';
import { wireInt } from 'components/managers/tech-card/components/schema';
import { useTechCardRelease } from 'components/managers/tech-card/components/useSamples';
import { useMemo } from 'react';
import type { NormCardBasis } from '../utils/cloth-per-unit';

export function useRunNormCard(
  run: common_ProductionRun,
  liveCard: common_TechCard | undefined,
): {
  /** Карточка, из которой берётся норма: снапшот ревизии прогона, иначе живая. */
  normCard?: common_TechCard;
  /** Что именно выдано — едет в подпись сравнения (normBasisText). */
  normBasis: NormCardBasis;
  /** Релиз прогона ещё читается — сравнение обязано молчать, а не мериться живой картой. */
  releasePending: boolean;
} {
  const techCardId = wireInt(run.run?.techCardId);
  const releaseId = wireInt(run.run?.releaseId);
  const { data: releaseData, isLoading } = useTechCardRelease(releaseId || undefined);

  return useMemo(() => {
    const releasePending = releaseId > 0 && isLoading;
    // Чужой релиз режется ЗДЕСЬ, как в print-page: снапшот есть, но принадлежит другой карте —
    // значит для ЭТОГО прогона его нет, и дальше он неотличим от нечитаемого.
    const releaseForeign =
      !!releaseData?.release && wireInt(releaseData.release.techCardId) !== techCardId;
    const snapshot = releaseForeign ? undefined : releaseData?.snapshot;
    const releaseNumber = wireInt(releaseData?.release?.releaseNumber);
    const normBasis: NormCardBasis = snapshot
      ? { kind: 'release', releaseNumber }
      : releaseId > 0 && !releasePending
        ? { kind: 'live-broken-snapshot', releaseNumber }
        : { kind: 'live' };
    return { normCard: snapshot ?? liveCard, normBasis, releasePending };
  }, [releaseId, techCardId, releaseData, isLoading, liveCard]);
}
