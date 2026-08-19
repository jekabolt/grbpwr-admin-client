// Точка входа пробы предпочтений схемы: наружу нужны только две ЧИСТЫЕ половины модуля — builder
// записи и разбор хранимой строки. Сам хук отсюда не экспортируется: он про React и localStorage,
// и проба монтирует его отдельным стендом в браузере, а не в ноде.
export {
  buildStored,
  parseStored,
} from '../src/components/managers/tech-card/components/use-schematic-prefs';
