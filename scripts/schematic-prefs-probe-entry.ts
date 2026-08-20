// Точка входа пробы предпочтений схемы: наружу нужны только ЧИСТЫЕ половины модуля — builder
// записи, разбор хранимой строки и арифметика правок раскладки. Сам хук отсюда не экспортируется:
// он про React и localStorage, и проба монтирует его отдельным стендом в браузере, а не в ноде.
export {
  applyEdits,
  buildStored,
  inverseEdits,
  parseStored,
} from '../src/components/managers/tech-card/components/use-schematic-prefs';
