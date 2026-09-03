/**
 * ON MODEL — ТРЕТИЙ ГЕНЕРАТИВНЫЙ ЭКРАН ПОЛОСЫ DESIGN (K-17).
 *
 * Отдай `OnModelStudio` полосу — он нарисует вход (фотографии), меню (ткань: паттерн и/или цвет,
 * с ценой, названной ДО нажатия) и результаты. Органы под ним экспортируются потому, что композитор может
 * захотеть их порознь, а не потому, что экран полагается пересобирать руками.
 *
 * ЧТО ОН ЧИТАЕТ И ПИШЕТ. Одно чтение — `GetDesignBand`, переданное пропом (никогда второй вызов), —
 * и одна запись, `StartDesignRun` через общий `useStartDesignRun`. Пометка «chosen» на выводе идёт
 * через тот же замороженный шов полосы, что и у соседей (`useDesignWrites`). Ни одного своего
 * запроса этот экран не делает.
 *
 * ОПРОС ЖИВОГО ПРОГОНА ЭТОТ ЭКРАН НЕ ВЕДЁТ, и это осознанная зависимость: полосу перечитывает
 * `useRunPolling`, смонтированный внутри `GenerationHistory`. Композитор обязан ставить историю
 * рядом с этим экраном — ровно так же, как он делает это для FABRIC RENDER и 3D. Второй опрос
 * здесь означал бы два интервала на одну полосу.
 */
export { OnModelStudio } from './studio';
export { OnModelInputStrip } from './input-strip';
export { OnModelOutputs } from './outputs';
export { PriceBeforeThePress } from './price';
export { ClothRow } from './cloth-row';
export { useClothChoice, useRecolorSources, useTargetColourDraft } from './drafts';
export type { ClothChoiceDraft, RecolorSources } from './drafts';
export {
  RECOLOR_SOURCES_MAX,
  chosenCloth,
  clothChoices,
  lastRecolorCharge,
  recolorGate,
  recolorOutputs,
  recolorRuns,
  recolorShape,
  recolourWireColour,
  targetIsStated,
} from './model';
export type { ClothChoice, RecolorCharge } from './model';
