/**
 * ШАПКА СТУДИИ И НЕДОСТАЮЩИЕ ЭТАЖИ ARTIFACTS — одна дверь на шесть органов.
 *
 * Каждый из них — ЧИСТЫЙ орган: он читает форму и полосу, рисует себя и не знает, кто и в каком
 * порядке его смонтирует. Композиция — не здесь: этот бочонок не собирает страницу, чтобы не стать
 * вторым местом, где записан порядок органов студии (первое и единственное — `design/studio-tab.tsx`).
 */
export { AnnotationStrip, ANNOTATION_CHIPS_H } from './annotation-strip';
export { ArtifactsChecklist } from './artifacts-checklist';
export { ArtifactsDraft } from './artifacts-draft';
export { MoodDraft } from './mood-draft';
/* `StudioHead` и `RepsStrip` УДАЛЕНЫ, и это решение, а не недоделка.
   `StudioHead` был вторым набором контролов для тех же имён формы: карточная шапка уже стоит
   первым рядом СТУДИИ (`index.tsx`, `topRowHtml` прототипа). Два редактора одного поля — не
   удвоение труда, а тихая потеря: `brand`, `collection`, `season`, `target gender` и `fit`
   пишутся НЕ через `UpdateTechCard`, а `StyleFactsField`-ом отдельной командой, и копия показывала
   бы «сохранено», молча возвращая старое значение после перезагрузки.
   `RepsStrip` был строкой делегирования в `KindsStrip` — она и есть полоса представлений
   (`repsStripHtml`). Знание из него не пропало: замороженный счётчик указаний, на который он
   указывал, починен в самом `kinds-strip.tsx`. */
export { draftIdeaRefusal, useDraftDesignIdea } from './use-draft-idea';
