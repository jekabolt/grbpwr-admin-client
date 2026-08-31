// Точка входа пробы координаты выноски (находка 3, круг 4).
//
// Берётся НАСТОЯЩИЙ экспорт панели артефактов, а не копия его тела: копия — это второй исходник,
// который расходится с первым молча и даёт ровно ту зелень, ради которой пробу и заводили.
import { frameFraction } from 'components/managers/tech-card/components/design/artifacts-panel';

declare global {
  interface Window {
    __pos: (v: string | number | null | undefined) => number;
  }
}
window.__pos = frameFraction;
